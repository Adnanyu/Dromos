from __future__ import annotations

import hashlib
import math
import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Literal, Protocol


ActivityType = Literal["running", "cycling", "hiking"]
Difficulty = Literal["easy", "moderate", "hard", "extreme"]
SurfaceType = Literal["road", "trail", "mixed"]

EARTH_RADIUS_M = 6_371_000
_REPOSITORY: RouteRepository | None = None
_ROUTING_CLIENT: RoutingClient | None = None


class ValidationError(ValueError):
    pass


class RouteRepository(Protocol):
    def save(self, route: "Route") -> "Route":
        ...

    def get(self, route_id: str) -> "Route | None":
        ...

    def update_metadata(self, route: "Route") -> "Route":
        ...

    def nearby(self, lat: float, lng: float, radius_m: float) -> list["Route"]:
        ...


class RoutingClient(Protocol):
    def route(self, request: dict[str, Any]) -> dict[str, Any]:
        ...


@dataclass
class Route:
    id: str
    creator_id: str
    name: str
    activity_type: ActivityType
    distance_m: float
    elevation_gain_m: float
    difficulty: Difficulty
    is_loop: bool
    is_public: bool
    surface_type: SurfaceType
    geometry: dict[str, Any]
    start_point: dict[str, float]
    end_point: dict[str, float]
    waypoints: list[dict[str, Any]]
    elevation_profile: list[dict[str, float]]
    estimated_duration_s: int
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


def generate_route(payload: dict[str, Any]) -> dict[str, Any]:
    request = validate_generate_request(payload)
    generated = get_routing_client().route(request)
    elevation_gain_m = float(generated["elevation_gain_m"])
    surface_type = pick_surface(request["activity_type"], generated.get("surface_type"))
    difficulty = score_difficulty(
        distance_m=float(generated["distance_m"]),
        elevation_gain_m=elevation_gain_m,
        surface_type=surface_type,
    )
    generated["difficulty"] = difficulty
    generated["surface_type"] = surface_type
    generated["waypoints"] = generated.get("waypoints") or build_waypoints(
        [{"lat": point[1], "lng": point[0]} for point in generated["geometry"]["coordinates"]]
    )
    generated["estimated_duration_s"] = estimate_duration(
        distance_m=float(generated["distance_m"]),
        activity_type=request["activity_type"],
        difficulty=difficulty,
    )
    return generated


def build_local_route(request: dict[str, Any]) -> dict[str, Any]:
    
    seed = request["seed"] if request.get("seed") is not None else stable_seed(request)
    
    points = build_mock_geometry(
        lat=request["lat"],
        lng=request["lng"],
        distance_m=request["distance_m"],
        end_lat=request.get("end_lat"),
        end_lng=request.get("end_lng"),
        is_loop=request["is_loop"],
        seed=seed,
    )
    elevation_profile = build_elevation_profile(points)
    elevation_gain_m = total_elevation_gain(elevation_profile)
    surface_type = pick_surface(request["activity_type"], request.get("surface_pref"))
    difficulty = score_difficulty(
        distance_m=request["distance_m"],
        elevation_gain_m=elevation_gain_m,
        surface_type=surface_type,
    )
    estimated_duration_s = estimate_duration(
        distance_m=request["distance_m"],
        activity_type=request["activity_type"],
        difficulty=difficulty,
    )

    return {
        "activity_type": request["activity_type"],
        "distance_m": round(request["distance_m"], 1),
        "elevation_gain_m": round(elevation_gain_m, 1),
        "difficulty": difficulty,
        "is_loop": request["is_loop"],
        "surface_type": surface_type,
        "geometry": {"type": "LineString", "coordinates": [[p["lng"], p["lat"]] for p in points]},
        "start_point": {"lat": points[0]["lat"], "lng": points[0]["lng"]},
        "end_point": {"lat": points[-1]["lat"], "lng": points[-1]["lng"]},
        "waypoints": build_waypoints(points),
        "elevation_profile": elevation_profile,
        "estimated_duration_s": estimated_duration_s,
        "routing_engine": "local-deterministic",
    }


def save_route(user_id: str, payload: dict[str, Any]) -> Route:
    generated = payload.get("generated_route")
    if generated is None:
        generated = generate_route(payload)
    if not isinstance(generated, dict):
        raise ValidationError("generated_route must be an object when provided.")
    print("USER ID:", user_id, type(user_id))
    name = str(payload.get("name") or default_route_name(generated))
    route_id = str(uuid.uuid4())
    route = Route(
        id=route_id,
        creator_id=user_id,
        name=name[:100],
        activity_type=generated["activity_type"],
        distance_m=float(generated["distance_m"]),
        elevation_gain_m=float(generated["elevation_gain_m"]),
        difficulty=generated["difficulty"],
        is_loop=bool(generated["is_loop"]),
        is_public=bool(payload.get("is_public", True)),
        surface_type=generated["surface_type"],
        geometry=generated["geometry"],
        start_point=generated["start_point"],
        end_point=generated["end_point"],
        waypoints=list(generated.get("waypoints", [])),
        elevation_profile=list(generated.get("elevation_profile", [])),
        estimated_duration_s=int(generated["estimated_duration_s"]),
    )
    saved = get_repository().save(route)
    publish_route_created(saved)
    return saved


def get_route(route_id: str) -> Route | None:
    return get_repository().get(route_id)


def update_route(route_id: str, user_id: str, payload: dict[str, Any]) -> Route | None:
    route = get_repository().get(route_id)
    if route is None:
        return None
    if route.creator_id != user_id:
        raise ValidationError("Only the route owner can update this route.")
    if "name" in payload:
        name = str(payload["name"]).strip()
        if not name:
            raise ValidationError("Route name cannot be empty.")
        route.name = name[:100]
    if "is_public" in payload:
        route.is_public = bool(payload["is_public"])
    route.updated_at = time.time()
    return get_repository().update_metadata(route)


def nearby_routes(lat: float, lng: float, radius_m: float) -> list[Route]:
    return get_repository().nearby(lat=lat, lng=lng, radius_m=radius_m)


def get_repository() -> RouteRepository:
    global _REPOSITORY
    if _REPOSITORY is None:
        from route_repository import PostgresRouteRepository

        _REPOSITORY = PostgresRouteRepository()
    return _REPOSITORY


def set_repository(repository: RouteRepository) -> None:
    global _REPOSITORY
    _REPOSITORY = repository


def get_routing_client() -> RoutingClient:
    global _ROUTING_CLIENT
    if _ROUTING_CLIENT is None:
        from routing_client import default_routing_client

        _ROUTING_CLIENT = default_routing_client()
    return _ROUTING_CLIENT


def set_routing_client(routing_client: RoutingClient) -> None:
    global _ROUTING_CLIENT
    _ROUTING_CLIENT = routing_client


def publish_route_created(route: Route) -> None:
    try:
        from social_client import publish_route_created as publish

        publish(route)
    except Exception:
        return


def serialize_route(route: Route) -> dict[str, Any]:
    data = asdict(route)
    data["created_at"] = int(route.created_at)
    data["updated_at"] = int(route.updated_at)
    return data


def validate_generate_request(payload: dict[str, Any]) -> dict[str, Any]:
    activity_type = payload.get("activity_type", "running")
    if activity_type not in {"running", "cycling", "hiking"}:
        raise ValidationError("activity_type must be running, cycling, or hiking.")

    try:
        distance_m = float(payload["distance_m"])
        lat = float(payload["lat"])
        lng = float(payload["lng"])
    except KeyError as exc:
        raise ValidationError(f"Missing required field: {exc.args[0]}") from exc
    except (TypeError, ValueError) as exc:
        raise ValidationError("distance_m, lat, and lng must be numbers.") from exc

    if not 500 <= distance_m <= 100_000:
        raise ValidationError("distance_m must be between 500 and 100000.")
    if not -90 <= lat <= 90 or not -180 <= lng <= 180:
        raise ValidationError("lat/lng are out of range.")

    end_lat = optional_float(payload.get("end_lat"), "end_lat")
    end_lng = optional_float(payload.get("end_lng"), "end_lng")
    if end_lat is not None and not -90 <= end_lat <= 90:
        raise ValidationError("end_lat is out of range.")
    if end_lng is not None and not -180 <= end_lng <= 180:
        raise ValidationError("end_lng is out of range.")
    if not bool(payload.get("is_loop", True)) and ((end_lat is None) != (end_lng is None)):
        raise ValidationError("end_lat and end_lng must be provided together for A-to-B routes.")

    return {
        "activity_type": activity_type,
        "distance_m": distance_m,
        "lat": lat,
        "lng": lng,
        "end_lat": end_lat,
        "end_lng": end_lng,
        "is_loop": bool(payload.get("is_loop", True)),
        "surface_pref": payload.get("surface_pref"),
        "seed": int(payload["seed"]) if payload.get("seed") is not None else None,
    }


def optional_float(value: Any, field_name: str) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{field_name} must be a number when provided.") from exc


def build_mock_geometry(
    lat: float,
    lng: float,
    distance_m: float,
    end_lat: float | None,
    end_lng: float | None,
    is_loop: bool,
    seed: int,
) -> list[dict[str, float]]:
    radius_m = max(distance_m / (2 * math.pi), 120)
    point_count = 24 if is_loop else 12
    wobble = 0.14 + (seed % 11) / 100
    points = []

    for index in range(point_count + (1 if is_loop else 0)):
        t = index / point_count
        if is_loop:
            angle = 2 * math.pi * t
            local_radius = radius_m * (1 + wobble * math.sin(angle * 3 + seed))
            north_m = local_radius * math.sin(angle)
            east_m = local_radius * math.cos(angle)
            points.append(offset_point(lat, lng, north_m, east_m))
        elif end_lat is not None and end_lng is not None:
            bend = math.sin(t * math.pi) * radius_m * 0.18
            interp_lat = lat + (end_lat - lat) * t
            interp_lng = lng + (end_lng - lng) * t
            points.append(offset_point(interp_lat, interp_lng, 0, bend))
        else:
            north_m = distance_m * (t - 0.5)
            east_m = math.sin(t * math.pi) * radius_m * 0.35
            points.append(offset_point(lat, lng, north_m, east_m))

    if is_loop:
        points[-1] = points[0]
    return points


def build_waypoints(points: list[dict[str, float]]) -> list[dict[str, Any]]:
    midpoint = points[len(points) // 2]
    return [
        {"sequence_order": 0, "type": "start", "label": "Start", **points[0]},
        {"sequence_order": 1, "type": "via", "label": "Midpoint", **midpoint},
        {"sequence_order": 2, "type": "end", "label": "Finish", **points[-1]},
    ]


def build_elevation_profile(points: list[dict[str, float]]) -> list[dict[str, float]]:
    profile = []
    distance_so_far = 0.0
    previous = points[0]

    for index, point in enumerate(points):
        if index:
            distance_so_far += haversine_m(previous["lat"], previous["lng"], point["lat"], point["lng"])
        elevation = 35 + 18 * math.sin(index / 3.0) + 7 * math.cos(index / 5.0)
        profile.append({"distance_m": round(distance_so_far, 1), "elevation_m": round(elevation, 1)})
        previous = point
    return profile


def total_elevation_gain(profile: list[dict[str, float]]) -> float:
    gain = 0.0
    for previous, current in zip(profile, profile[1:]):
        delta = current["elevation_m"] - previous["elevation_m"]
        if delta > 0:
            gain += delta
    return gain


def pick_surface(activity_type: ActivityType, surface_pref: Any) -> SurfaceType:
    if surface_pref in {"road", "trail", "mixed"}:
        return surface_pref
    if activity_type == "cycling":
        return "road"
    if activity_type == "hiking":
        return "trail"
    return "mixed"


def score_difficulty(distance_m: float, elevation_gain_m: float, surface_type: SurfaceType) -> Difficulty:
    surface_factor = {"road": 1.0, "mixed": 1.12, "trail": 1.25}[surface_type]
    score = (distance_m / 1000) * surface_factor + elevation_gain_m / 80
    if score < 7:
        return "easy"
    if score < 16:
        return "moderate"
    if score < 32:
        return "hard"
    return "extreme"


def estimate_duration(distance_m: float, activity_type: ActivityType, difficulty: Difficulty) -> int:
    pace_s_per_km = {"running": 360, "cycling": 210, "hiking": 780}[activity_type]
    difficulty_factor = {"easy": 1.0, "moderate": 1.1, "hard": 1.25, "extreme": 1.45}[difficulty]
    return round((distance_m / 1000) * pace_s_per_km * difficulty_factor)


def default_route_name(generated: dict[str, Any]) -> str:
    distance_km = float(generated["distance_m"]) / 1000
    activity = str(generated["activity_type"]).title()
    route_type = "Loop" if generated["is_loop"] else "Route"
    return f"{activity} {route_type} {distance_km:.1f} km"


def stable_seed(request: dict[str, Any]) -> int:
    raw = f"{request['activity_type']}:{request['distance_m']}:{request['lat']}:{request['lng']}:{request['is_loop']}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return int(digest[:8], 16)


def offset_point(lat: float, lng: float, north_m: float, east_m: float) -> dict[str, float]:
    lat_offset = north_m / EARTH_RADIUS_M
    lng_offset = east_m / (EARTH_RADIUS_M * math.cos(math.radians(lat)))
    return {
        "lat": round(lat + math.degrees(lat_offset), 6),
        "lng": round(lng + math.degrees(lng_offset), 6),
    }


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.atan2(math.sqrt(a), math.sqrt(1 - a))
