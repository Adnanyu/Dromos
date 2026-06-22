from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from typing import Any, Protocol


class RoutingClient(Protocol):
    def route(self, request: dict[str, Any]) -> dict[str, Any]:
        ...


class LocalRoutingClient:
    def route(self, request: dict[str, Any]) -> dict[str, Any]:
        from route_engine import build_local_route

        return build_local_route(request)


class GraphHopperRoutingClient:
    def __init__(self, base_url: str | None = None, api_key: str | None = None, timeout_s: float = 3.0):
        self.base_url = (base_url or os.getenv("GRAPHHOPPER_URL", "http://127.0.0.1:8989")).rstrip("/")
        self.api_key = api_key or os.getenv("GRAPHHOPPER_API_KEY")
        self.timeout_s = timeout_s

    def route(self, request: dict[str, Any]) -> dict[str, Any]:
        params = self.build_params(request)
        url = f"{self.base_url}/route?{urllib.parse.urlencode(params, doseq=True)}"
        http_request = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(http_request, timeout=self.timeout_s) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return self.normalize_response(request, payload)

    def build_params(self, request: dict[str, Any]) -> list[tuple[str, str | int | float | bool]]:
        profile = "bicycle" if request["activity_type"] == "cycling" else "foot"
        # seed = request["seed"] if request.get("seed") is not None else stable_seed(request)
        seed = request["seed"] if request.get("seed") is not None else 42
        params: list[tuple[str, str | int | float | bool]] = [
            ("point", f"{request['lat']},{request['lng']}"),
            ("profile", profile),
            # ("algorithm", "alternative_route"),
            # ("alternative_route.max_paths", 3),
            # ("round_trip.seed", request.get("seed", 42)),
            ("points_encoded", "false"),
            ("elevation", "true"),
            ("instructions", "false"),
            ("calc_points", "true"),
            ("details", "road_class"),
            ("details", "surface"),
        ]
        if request["is_loop"]:
            params.extend(
                [
                    ("algorithm", "round_trip"),
                    ("round_trip.distance", int(request["distance_m"])),
                    ("round_trip.seed", seed),
                ]
            )
        elif request.get("end_lat") is not None and request.get("end_lng") is not None:
            params.append(("point", f"{request['end_lat']},{request['end_lng']}"))
        if self.api_key:
            params.append(("key", self.api_key))
        return params

    def normalize_response(self, request: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        paths = payload.get("paths") or []
        if not paths:
            raise RuntimeError("GraphHopper returned no route paths.")

        path = paths[0]
        coordinates = path.get("points", {}).get("coordinates") or []
        points = [{"lng": point[0], "lat": point[1], "elevation_m": point[2] if len(point) > 2 else 0} for point in coordinates]
        if not points:
            raise RuntimeError("GraphHopper route path did not include coordinates.")

        elevation_profile = self.build_elevation_profile(points)
        elevation_gain_m = self.total_elevation_gain(elevation_profile)

        return {
            "activity_type": request["activity_type"],
            "distance_m": round(float(path.get("distance", request["distance_m"])), 1),
            "elevation_gain_m": round(elevation_gain_m, 1),
            "is_loop": request["is_loop"],
            "surface_type": request.get("surface_pref") or "mixed",
            "geometry": {"type": "LineString", "coordinates": [[point["lng"], point["lat"]] for point in points]},
            "start_point": {"lat": points[0]["lat"], "lng": points[0]["lng"]},
            "end_point": {"lat": points[-1]["lat"], "lng": points[-1]["lng"]},
            "elevation_profile": elevation_profile,
            "routing_engine": "graphhopper",
        }

    def build_elevation_profile(self, points: list[dict[str, float]]) -> list[dict[str, float]]:
        from route_engine import haversine_m

        profile = []
        distance_so_far = 0.0
        previous = points[0]
        for index, point in enumerate(points):
            if index:
                distance_so_far += haversine_m(previous["lat"], previous["lng"], point["lat"], point["lng"])
            profile.append({"distance_m": round(distance_so_far, 1), "elevation_m": round(point["elevation_m"], 1)})
            previous = point
        return profile

    def total_elevation_gain(self, profile: list[dict[str, float]]) -> float:
        gain = 0.0
        for previous, current in zip(profile, profile[1:]):
            delta = current["elevation_m"] - previous["elevation_m"]
            if delta > 0:
                gain += delta
        return gain


def default_routing_client() -> RoutingClient:
    if os.getenv("GRAPHHOPPER_URL"):
        return GraphHopperRoutingClient()
    return LocalRoutingClient()

