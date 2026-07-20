# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Dromos is a fitness route-planning and activity-tracking platform: a polyglot microservices backend plus an Expo (React Native) mobile app in `frontend/`. The product focus is route generation and health/activity reports — there are deliberately **no social features** (feed/likes/follows were removed); the only social-adjacent feature is route share links, which live in the route service.

## Commands

### Backend

```sh
docker compose up --build api-gateway     # full local stack (gateway + all services + DBs)
docker compose up --build route-service   # one service + its DB

# Go activity service
cd services/activity_service && go build ./... && go test ./...

# Python route service (unit tests use a fake repository, no DB needed)
python3 -m unittest discover services/route_service/tests
python3 -m unittest services.route_service.tests.test_route_engine   # single module

# TypeScript services (api_gateway, auth_service, user_service, notification_service)
cd services/<svc> && npm install && npx tsc --noEmit   # typecheck
cd services/<svc> && npm run dev                        # tsx watch, needs its DB up
```

Ports: gateway 8080, route 8081, activity 8082, auth 8083, user 8084, notification 8086. Databases are per-service (PostGIS for routes, TimescaleDB for activities, Postgres for auth/users, MongoDB for notifications, Redis for sessions/live stats), all named `dromos_*` with `dromos:dromos` credentials in compose.

### Frontend (`frontend/`)

```sh
npx tsc --noEmit                          # typecheck
npx expo prebuild -p ios --clean          # ALWAYS use --clean (see below), then:
cd ios && pod install
npx expo run:ios --device                 # dev build on iPhone
npx expo-doctor                           # config/dependency validation
```

**Always run prebuild with `--clean`.** A non-clean prebuild crashes in `@bacons/apple-targets` ("Cannot read properties of undefined (reading 'removeFromProject')") when updating the existing `workout` widget target. `ios/` and `android/` are gitignored and fully regenerable.

Per `frontend/AGENTS.md`: check Expo APIs against https://docs.expo.dev/versions/v55.0.0/ before writing frontend code (SDK 55, React Native 0.83, React 19).

## Architecture

### Auth boundary (the most important backend invariant)

Only the **API gateway** (`services/api_gateway/src/index.ts`) validates bearer tokens — it calls `POST /auth/introspect` on the auth service, then injects trusted `X-User-Id` / `X-Username` / `X-User-Email` headers downstream. Every other service blindly trusts `X-User-Id` and never touches JWTs. The JWT issuer is `dromos-auth` (`services/auth_service/src/tokens.ts`). Internal service-to-service calls (e.g. creating notifications) are gated by an `X-Service-Name` allowlist instead (`notification_service/src/index.ts`).

Gateway routing gotchas:
- Proxy registration **order matters**: regex routes (`/users/:id/routes` → route service, `/routes/:id/share` → route service) must be registered before the general `/users` and `/routes` prefixes.
- WebSocket upgrades are dispatched manually in `wireUpgrades()` — proxies are created with `ws: false` so `/activities/live/:id` reaches the activity service deterministically. Don't re-enable per-proxy `ws`.

### Cross-service event flow

There is no message broker; direct HTTP "internal hooks" stand in for Kafka:
- auth service → notification service (welcome notification on register)
- activity service → user service (denormalized stats) and → notification service (`activity.completed`), wired as sinks in `cmd/activity-service/main.go`

### Response envelope

Every backend response is wrapped as `{ "data": ... }`. The frontend unwraps this **once**, in the axios response interceptor in `frontend/src/api/client.ts` — API modules receive the inner object directly. The same file holds the silent-refresh-on-401 queue and the SecureStore token keys (`dromos_access_token` / `dromos_refresh_token`).

### Frontend structure

- Entry is expo-router (`app/index.tsx`) but navigation is **React Navigation** mounted inside it. `RootNavigator` intentionally has no `NavigationContainer` (expo-router provides one). `RootNavigator` also hosts the opt-in Face ID gate (flag `dromos_biometric_enabled` in SecureStore; tokens are deliberately NOT biometric-bound because the refresh interceptor reads them in the background).
- State: Zustand for auth/activity session state, TanStack Query for server state. `auth.store.ts` normalises `user.id` vs `user_id` (auth ID vs profile PK) — always read `user.id` after the store.
- `notifications` API normalises raw Mongo documents (`_id`, `title`/`body`, `read_at`, dotted types) into the app's `Notification` shape in `src/api/notifications.ts` — keep that mapping in sync with backend document changes.
- Formatters in `src/utils/format.ts` accept `null`/`undefined`/`NaN` and render placeholders (`--:--/km`) — route new measurement displays through them.

### Live tracking pipeline (read before touching the activity screen)

GPS filtering, distance accumulation, and windowed pace live in the **module-level singleton** `frontend/src/tracking/tracker.ts` (`workoutTracker`), fed by two sources that may both be active: the foreground `watchPositionAsync` callback in `ActiveActivityScreen` and the background task in `src/tasks/backgroundLocation.ts` (imported for side effect at the top of `app/index.tsx`; duplicate fixes are deduped by timestamp). Rules that exist for hard-won reasons:
- The GPS watcher effect is **mount-once** (`[]` deps). Adding deps restarts `watchPositionAsync` and drops the GPS lock for seconds (the historical "laggy tracking" bug). Pause state is read from the tracker, not from React state.
- The screen never subscribes to `current_position`/`heading` — only the isolated `LiveTrackingMap` child does, via Zustand selectors. Distance/pace display refreshes at 1 Hz from the timer tick, which is also what makes pace decay to `--:--` when the runner stops.
- Heading smoothing must use shortest-arc interpolation (see `shortestAngleDelta`) — naive averaging spins the arrow the long way at the 0°/360° boundary.

### Lock screen / Live Activity

`src/tracking/liveSurface.ts` picks the best surface per device: ActivityKit Live Activity (iOS 16.2+, Dynamic Island or lock-screen card automatically), Android foreground-service notification (created by `startLocationUpdatesAsync` itself), or a static local notification. The native pieces:
- `frontend/modules/expo-workout-activity/` — local Expo module bridging ActivityKit (autolinked via its podspec).
- `frontend/targets/workout/` — the widget extension (`@bacons/apple-targets`), regenerated into the Xcode project on every clean prebuild.
- **`WorkoutAttributes` is intentionally duplicated** in both places and must stay byte-identical — ActivityKit matches app↔widget by the struct's Codable shape, and drift makes updates silently no-op.
- `frontend/plugins/withoutPushEntitlement.js` strips the `aps-environment` entitlement that expo-notifications injects. Do not remove it: the app only uses local notifications, and the push entitlement breaks device signing on personal development teams.
