import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from route_engine import Route, ValidationError, generate_route, nearby_routes, save_route, set_repository, set_routing_client, update_route
from route_engine import haversine_m
from routing_client import LocalRoutingClient


class FakeRouteRepository:
    def __init__(self):
        self.routes = {}

    def save(self, route: Route) -> Route:
        self.routes[route.id] = route
        return route

    def get(self, route_id: str) -> Route | None:
        return self.routes.get(route_id)

    def update_metadata(self, route: Route) -> Route:
        self.routes[route.id] = route
        return route

    def nearby(self, lat: float, lng: float, radius_m: float) -> list[Route]:
        return [
            route
            for route in self.routes.values()
            if route.is_public and haversine_m(lat, lng, route.start_point["lat"], route.start_point["lng"]) <= radius_m
        ]


class RouteEngineTest(unittest.TestCase):
    def setUp(self):
        set_repository(FakeRouteRepository())
        set_routing_client(LocalRoutingClient())

    def test_generate_loop_route_returns_geojson_and_stats(self):
        route = generate_route(
            {
                "activity_type": "running",
                "distance_m": 5000,
                "lat": 40.7128,
                "lng": -74.006,
                "is_loop": True,
            }
        )

        self.assertEqual(route["geometry"]["type"], "LineString")
        self.assertEqual(route["geometry"]["coordinates"][0], route["geometry"]["coordinates"][-1])
        self.assertEqual(route["difficulty"], "easy")
        self.assertGreater(route["estimated_duration_s"], 0)
        self.assertGreater(len(route["elevation_profile"]), 3)

    def test_invalid_distance_is_rejected(self):
        with self.assertRaises(ValidationError):
            generate_route({"distance_m": 100, "lat": 40.0, "lng": -73.0})

    def test_save_and_nearby_search(self):
        route = save_route(
            "00000000-0000-0000-0000-000000000001",
            {
                "activity_type": "cycling",
                "distance_m": 12000,
                "lat": 40.7128,
                "lng": -74.006,
                "is_loop": True,
            },
        )

        found = nearby_routes(lat=40.7128, lng=-74.006, radius_m=3000)
        self.assertEqual([route.id], [item.id for item in found])

    def test_only_owner_can_update_route(self):
        route = save_route(
            "00000000-0000-0000-0000-000000000001",
            {
                "activity_type": "running",
                "distance_m": 5000,
                "lat": 40.7128,
                "lng": -74.006,
                "is_loop": True,
            },
        )

        with self.assertRaises(ValidationError):
            update_route(route.id, "00000000-0000-0000-0000-000000000002", {"name": "Nope"})

        updated = update_route(route.id, "00000000-0000-0000-0000-000000000001", {"name": "Morning miles", "is_public": False})
        self.assertEqual(updated.name, "Morning miles")
        self.assertFalse(updated.is_public)


if __name__ == "__main__":
    unittest.main()
