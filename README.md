# STRIDE

Fitness route planning and activity tracking platform.

This workspace starts from the architecture spec in `/Users/adnan/Downloads/stride-architecture.html` and implements the first backend services from the spec.

## Current Scope

- Auth is now implemented locally as `services/auth_service`; downstream services still treat auth decisions as gateway-owned.
- `services/auth_service` owns email/password auth, JWT access tokens, refresh-token rotation, and token introspection.
- `services/user_service` owns profiles, preferences, public profile lookup, search, and denormalized activity stats.
- `services/api_gateway` validates bearer tokens through Auth Service and injects trusted `X-User-Id` context into downstream services.
- Downstream services trust gateway-injected user context via `X-User-Id`.
- `services/route_service` covers route generation, Postgres/PostGIS-backed route persistence, route lookup, and nearby route search.
- `services/activity_service` covers activity lifecycle, live GPS WebSocket ingestion, TimescaleDB GPS storage, and Redis-backed live session stats.
- `services/social_service` covers follows, feed, route likes/comments/shares, and activity kudos.
- `services/notification_service` covers in-app notification history, read/unread state, and notification preferences.
- Route generation is deterministic and local by default, so the project can run before GraphHopper, Redis, and Kafka are wired in.
- Route persistence uses PostgreSQL 16 + PostGIS, matching the architecture spec.
- Set `GRAPHHOPPER_URL=http://127.0.0.1:8989` to use a GraphHopper routing engine. Without it, route generation uses the deterministic local fallback.

## Run

Install Python dependencies:

```sh
python3 -m pip install -r requirements.txt
```

Start Postgres/PostGIS:

```sh
docker compose up -d route-db
```

Start the whole local service graph:

```sh
docker compose up --build api-gateway
```

Or start the route service and database together:

```sh
docker compose up --build route-service
```

Start the activity service, TimescaleDB/PostGIS, and Redis:

```sh
docker compose up --build activity-service
```

```sh
.venv/bin/python services/route_service/app.py
```

The service listens on `http://127.0.0.1:8081`.
FastAPI docs are available at `http://127.0.0.1:8081/docs`.
The activity service listens on `http://127.0.0.1:8082`.
The social service listens on `http://127.0.0.1:8085`.
The notification service listens on `http://127.0.0.1:8086`.
The local gateway listens on `http://127.0.0.1:8080`.

The default database URL is `postgresql://stride:stride@127.0.0.1:5432/stride_routes`. Override it with `ROUTE_SERVICE_DATABASE_URL`.

To use GraphHopper for route generation:

```sh
GRAPHHOPPER_URL=http://127.0.0.1:8989 .venv/bin/python services/route_service/app.py
```

```sh
curl -s http://127.0.0.1:8081/health
```

Register through the gateway:

```sh
curl -s -X POST http://127.0.0.1:8080/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"runner@example.com","username":"runner","password":"change-me-123"}'
```

Authenticated requests should go through the gateway with `Authorization: Bearer <access_token>`. The gateway validates the token with Auth Service and forwards `X-User-Id` to User, Route, and Activity services.

Generate a route:

```sh
curl -s -X POST http://127.0.0.1:8081/routes/generate \
  -H 'Content-Type: application/json' \
  -H 'X-User-Id: 00000000-0000-0000-0000-000000000001' \
  -d '{"activity_type":"running","distance_m":2000,"lat":38.90025,"lng":-77.05025,"is_loop":true}'
```

Save a route:

```sh
curl -s -X POST http://127.0.0.1:8081/routes \
  -H 'Content-Type: application/json' \
  -H 'X-User-Id: d04b0196-fa52-4a14-a8a0-dc2c2870cd80' \
  -d '{"name":"Morning loop","activity_type":"running","distance_m":2000,"lat":40.7128,"lng":-74.0060,"is_loop":true}'
```

Start an activity:

```sh
curl -s -X POST http://127.0.0.1:8082/activities \
  -H 'Content-Type: application/json' \
  -H 'X-User-Id: 00000000-0000-0000-0000-000000000001' \
  -d '{"activity_type":"running","planned_distance_m":5000}'
```

Via the gateway, the same request uses the bearer token instead of `X-User-Id`:

```sh
curl -s -X POST http://127.0.0.1:8080/activities \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <access_token>' \
  -d '{"activity_type":"running","planned_distance_m":5000}'
```

Follow a user and view the social feed through the gateway:

```sh
curl -s -X POST http://127.0.0.1:8080/follows/<user_id> \
  -H 'Authorization: Bearer <access_token>'

curl -s http://127.0.0.1:8080/feed \
  -H 'Authorization: Bearer <access_token>'
```

Like, comment, share, or kudos:

```sh
curl -s -X POST http://127.0.0.1:8080/routes/<route_id>/like \
  -H 'Authorization: Bearer <access_token>'

curl -s -X POST http://127.0.0.1:8080/routes/<route_id>/comment \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <access_token>' \
  -d '{"content":"Great city loop."}'

curl -s -X POST http://127.0.0.1:8080/activities/<activity_id>/kudos \
  -H 'Authorization: Bearer <access_token>'
```

Read notifications:

```sh
curl -s http://127.0.0.1:8080/notifications \
  -H 'Authorization: Bearer <access_token>'

curl -s -X PATCH http://127.0.0.1:8080/notifications/read-all \
  -H 'Authorization: Bearer <access_token>'
```

Live GPS ingestion uses `WS /activities/live/{activity_id}` with messages shaped like:

```json
{"type":"gps_batch","points":[{"lat":40.7128,"lng":-74.0060,"elevation_m":12.4,"timestamp":"2026-05-20T14:00:00Z"}]}
```

## Test

```sh
python3 -m unittest discover services/route_service/tests
```

The unit tests use a fake repository for engine behavior. The running service uses Postgres/PostGIS through [route_repository.py](/Users/adnan/Documents/Codex/2026-05-20/files-mentioned-by-the-user-stride/services/route_service/route_repository.py).

GraphHopper request mapping is covered by unit tests in [test_routing_client.py](/Users/adnan/Documents/Codex/2026-05-20/files-mentioned-by-the-user-stride/services/route_service/tests/test_routing_client.py).

The Activity Service has the TimescaleDB/PostGIS schema in [001_init.sql](/Users/adnan/Documents/Codex/2026-05-20/files-mentioned-by-the-user-stride/services/activity_service/sql/001_init.sql), mirrored into the Go package for embedded migrations.
Auth and User schemas live in [auth sql](/Users/adnan/Documents/Codex/2026-05-20/files-mentioned-by-the-user-stride/services/auth_service/sql/001_init.sql) and [user sql](/Users/adnan/Documents/Codex/2026-05-20/files-mentioned-by-the-user-stride/services/user_service/sql/001_init.sql).
Social schema lives in [social sql](/Users/adnan/Documents/Codex/2026-05-20/files-mentioned-by-the-user-stride/services/social_service/sql/001_init.sql).
Notification Service stores MongoDB collections and indexes in [db.ts](/Users/adnan/Documents/Codex/2026-05-20/files-mentioned-by-the-user-stride/services/notification_service/src/db.ts).

Direct service hooks currently stand in for Kafka:
- Auth Service creates a welcome notification after registration.
- Route Service publishes `route.created` to Social Service after saving a route.
- Activity Service publishes `activity.completed` to User, Social, and Notification services.
- Social Service creates notifications for follows, route shares, route likes when route ownership is known, and activity kudos when activity ownership is known.

## Auth Boundary

The route, user, social, notification, and activity services do not issue, validate, rotate, blacklist, or refresh tokens. They expect the API gateway/auth layer to validate the bearer token and forward a trusted `X-User-Id` header.
