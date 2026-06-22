import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from routing_client import GraphHopperRoutingClient


class GraphHopperRoutingClientTest(unittest.TestCase):
    def test_loop_route_uses_round_trip_algorithm(self):
        client = GraphHopperRoutingClient(base_url="http://graphhopper.test", api_key=None)

        params = client.build_params(
            {
                "activity_type": "running",
                "distance_m": 5000,
                "lat": 40.7128,
                "lng": -74.006,
                "is_loop": True,
            }
        )

        self.assertIn(("profile", "foot"), params)
        self.assertIn(("algorithm", "round_trip"), params)
        self.assertIn(("round_trip.distance", 5000), params)
        self.assertIn(("elevation", "true"), params)
        self.assertIn(("points_encoded", "false"), params)

    def test_cycling_a_to_b_uses_bicycle_profile_and_two_points(self):
        client = GraphHopperRoutingClient(base_url="http://graphhopper.test", api_key=None)

        params = client.build_params(
            {
                "activity_type": "cycling",
                "distance_m": 12000,
                "lat": 40.7128,
                "lng": -74.006,
                "end_lat": 40.7527,
                "end_lng": -73.9772,
                "is_loop": False,
            }
        )

        points = [value for key, value in params if key == "point"]
        self.assertEqual("bicycle", dict(params)["profile"])
        self.assertEqual(["40.7128,-74.006", "40.7527,-73.9772"], points)
        self.assertNotIn(("algorithm", "round_trip"), params)

    def test_graphhopper_response_is_normalized(self):
        client = GraphHopperRoutingClient(base_url="http://graphhopper.test", api_key=None)

        normalized = client.normalize_response(
            {"activity_type": "running", "distance_m": 1000, "is_loop": False},
            {
                "paths": [
                    {
                        "distance": 1000.5,
                        "points": {
                            "coordinates": [
                                [-74.006, 40.7128, 10],
                                [-74.002, 40.714, 16],
                                [-73.999, 40.715, 14],
                            ]
                        },
                    }
                ]
            },
        )

        self.assertEqual("graphhopper", normalized["routing_engine"])
        self.assertEqual("LineString", normalized["geometry"]["type"])
        self.assertEqual(6.0, normalized["elevation_gain_m"])
        self.assertEqual({"lat": 40.7128, "lng": -74.006}, normalized["start_point"])


if __name__ == "__main__":
    unittest.main()

