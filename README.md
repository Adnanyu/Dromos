# DROMOS

Fitness route planning and activity tracking platform. Dromos generates running/cycling/hiking routes and produces health and activity reports from live GPS tracking.

## Architecture

- `services/api_gateway` validates bearer tokens through the Auth Service and injects trusted `X-User-Id` context into downstream services.
- `services/auth_service` owns email/password auth, JWT access tokens, refresh-token rotation, and token introspection.
- `services/user_service` owns profiles, preferences, public profile lookup, search, and denormalized activity stats.
- `services/route_service` covers route generation, Postgres/PostGIS-backed route persistence, route lookup, nearby route search, and route share links.
- `services/activity_service` covers activity lifecycle, live GPS WebSocket ingestion, TimescaleDB GPS storage, and Redis-backed live session stats.
- `services/notification_service` covers in-app notification history, read/unread state, and notification preferences.
- Route generation is deterministic and local by default; set `GRAPHHOPPER_URL` to use a GraphHopper routing engine instead.
- `frontend/` is the Dromos mobile app (Expo SDK 55 / React Native).

## Run

Install Python dependencies:

```sh
python3 -m pip install -r requirements.txt
```

Start the whole local service graph:

```sh
docker compose up --build api-gateway
```

Or start individual services with their databases:

```sh
docker compose up --build route-service
docker compose up --build activity-service
```

Ports:

- API gateway: `http://127.0.0.1:8080`
- Route service: `http://127.0.0.1:8081` (FastAPI docs at `/docs`)
- Activity service: `http://127.0.0.1:8082`
- Auth service: `http://127.0.0.1:8083`
- User service: `http://127.0.0.1:8084`
- Notification service: `http://127.0.0.1:8086`

The default route database URL is `postgresql://dromos:dromos@127.0.0.1:5432/dromos_routes`. Override it with `ROUTE_SERVICE_DATABASE_URL`.

Register through the gateway:

```sh
curl -s -X POST http://127.0.0.1:8080/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"runner@example.com","username":"runner","password":"change-me-123"}'
```

Authenticated requests go through the gateway with `Authorization: Bearer <access_token>`. The gateway validates the token with the Auth Service and forwards `X-User-Id` to downstream services.

Generate a route:

```sh
curl -s -X POST http://127.0.0.1:8080/routes/generate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <access_token>' \
  -d '{"activity_type":"running","distance_m":2000,"lat":38.90025,"lng":-77.05025,"is_loop":true}'
```

Save a route:

```sh
curl -s -X POST http://127.0.0.1:8080/routes \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <access_token>' \
  -d '{"name":"Morning loop","activity_type":"running","distance_m":2000,"lat":40.7128,"lng":-74.0060,"is_loop":true}'
```

Share a route (returns a share token resolvable at `GET /shares/<token>` without auth):

```sh
curl -s -X POST http://127.0.0.1:8080/routes/<route_id>/share \
  -H 'Authorization: Bearer <access_token>'
```

Start an activity:

```sh
curl -s -X POST http://127.0.0.1:8080/activities \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <access_token>' \
  -d '{"activity_type":"running","planned_distance_m":5000}'
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

The route engine unit tests use a fake repository; the running service uses Postgres/PostGIS through `services/route_service/route_repository.py`. GraphHopper request mapping is covered by `services/route_service/tests/test_routing_client.py`.

The Activity Service schema lives in `services/activity_service/sql/001_init.sql`, mirrored into the Go package for embedded migrations. Auth and User schemas live in `services/auth_service/sql/001_init.sql` and `services/user_service/sql/001_init.sql`. The Notification Service creates its MongoDB collections and indexes in `services/notification_service/src/db.ts`.

Direct service hooks currently stand in for Kafka:

- Auth Service creates a welcome notification after registration.
- Activity Service publishes `activity.completed` to the User and Notification services.

## Auth Boundary

The route, user, notification, and activity services do not issue, validate, rotate, blacklist, or refresh tokens. They expect the API gateway/auth layer to validate the bearer token and forward a trusted `X-User-Id` header.
