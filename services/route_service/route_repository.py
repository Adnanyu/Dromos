from __future__ import annotations

import json
import os
from typing import Any

from route_engine import Route


DEFAULT_DSN = "postgresql://stride:stride@127.0.0.1:5432/stride_routes"


class PostgresRouteRepository:
    def __init__(self, dsn: str | None = None):
        self.dsn = dsn or os.getenv("ROUTE_SERVICE_DATABASE_URL", DEFAULT_DSN)
        self.migrate()

    def connect(self):
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as exc:
            raise RuntimeError("Install route service dependencies with `python3 -m pip install -r requirements.txt`.") from exc

        return psycopg.connect(self.dsn, row_factory=dict_row)

    def migrate(self) -> None:
        schema_path = os.path.join(os.path.dirname(__file__), "sql", "001_init.sql")
        with open(schema_path, "r", encoding="utf-8") as schema:
            sql = schema.read()
        with self.connect() as conn:
            conn.execute(sql)

    def save(self, route: Route) -> Route:
        from psycopg.types.json import Jsonb
        print("route is: ", route)
        try:
            with self.connect() as conn:
                with conn.transaction():
                    conn.execute(
                        """
                        INSERT INTO routes (
                        id, creator_id, name, activity_type, distance_m, elevation_gain_m,
                        difficulty, is_loop, is_public, surface_type, geometry, start_point,
                        end_point, elevation_profile, estimated_duration_s, created_at, updated_at
                        ) VALUES (
                        %s::uuid, %s::uuid, %s, %s::activity_type, %s, %s,
                        %s::route_difficulty, %s, %s, %s::surface_type,
                        ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326),
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                        %s, %s, to_timestamp(%s), to_timestamp(%s)
                        )
                        """,
                        (
                            route.id,
                            route.creator_id,
                            route.name,
                            route.activity_type,
                            route.distance_m,
                            route.elevation_gain_m,
                            route.difficulty,
                            route.is_loop,
                            route.is_public,
                            route.surface_type,
                            json.dumps(route.geometry, separators=(",", ":"), sort_keys=True),
                            route.start_point["lng"],
                            route.start_point["lat"],
                            route.end_point["lng"],
                            route.end_point["lat"],
                            Jsonb(route.elevation_profile),
                            route.estimated_duration_s,
                            route.created_at,
                            route.updated_at,
                        ),
                    )
                    self.replace_waypoints(conn, route)
            return route
        except Exception as e:
            print("DATABASE ERROR:", repr(e))
            raise

    def get(self, route_id: str) -> Route | None:
        with self.connect() as conn:
            row = conn.execute(self.select_route_sql("WHERE r.id = %s::uuid"), (route_id,)).fetchone()
            if row is None:
                return None
            waypoints = self.fetch_waypoints(conn, route_id)
        return self.from_row(row, waypoints)

    def update_metadata(self, route: Route) -> Route:
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE routes
                SET name = %s, is_public = %s, updated_at = to_timestamp(%s)
                WHERE id = %s::uuid
                """,
                (route.name, route.is_public, route.updated_at, route.id),
            )
        return route

    def nearby(self, lat: float, lng: float, radius_m: float) -> list[Route]:
        with self.connect() as conn:
            rows = conn.execute(
                self.select_route_sql(
                    """
                    WHERE r.is_public = true
                      AND ST_DWithin(
                        r.start_point::geography,
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                        %s
                      )
                    ORDER BY r.created_at DESC
                    """
                ),
                (lng, lat, radius_m),
            ).fetchall()
            route_ids = [str(row["id"]) for row in rows]
            waypoints_by_route = self.fetch_waypoints_for_routes(conn, route_ids)
        return [self.from_row(row, waypoints_by_route.get(str(row["id"]), [])) for row in rows]

    def replace_waypoints(self, conn: Any, route: Route) -> None:
        try:
            with conn.cursor() as cur:

                cur.execute(
                    "DELETE FROM route_waypoints WHERE route_id = %s::uuid",
                    (route.id,),
                )

                cur.executemany(
                    """
                    INSERT INTO route_waypoints (
                        route_id,
                        sequence_order,
                        lat,
                        lng,
                        type,
                        label
                    )
                    VALUES (
                        %s::uuid,
                        %s,
                        %s,
                        %s,
                        %s::waypoint_type,
                        %s
                    )
                    """,
                    [
                        (
                            route.id,
                            waypoint["sequence_order"],
                            waypoint["lat"],
                            waypoint["lng"],
                            waypoint["type"],
                            waypoint.get("label"),
                        )
                        for waypoint in route.waypoints
                    ],
                )
        except Exception as e:
            print("DATABASE ERROR:", repr(e))
            raise
        # conn.executemany(
        #     """
        #     INSERT INTO route_waypoints (route_id, sequence_order, lat, lng, type, label)
        #     VALUES (%s::uuid, %s, %s, %s, %s::waypoint_type, %s)
        #     """,
        #     [
        #         (
        #             route.id,
        #             waypoint["sequence_order"],
        #             waypoint["lat"],
        #             waypoint["lng"],
        #             waypoint["type"],
        #             waypoint.get("label"),
        #         )
        #         for waypoint in route.waypoints
        #     ],
        # )
        

    def fetch_waypoints(self, conn: Any, route_id: str) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT sequence_order, lat, lng, type::text AS type, label
            FROM route_waypoints
            WHERE route_id = %s::uuid
            ORDER BY sequence_order ASC
            """,
            (route_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def fetch_waypoints_for_routes(self, conn: Any, route_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
        if not route_ids:
            return {}
        rows = conn.execute(
            """
            SELECT route_id::text AS route_id, sequence_order, lat, lng, type::text AS type, label
            FROM route_waypoints
            WHERE route_id = ANY(%s::uuid[])
            ORDER BY route_id, sequence_order ASC
            """,
            (route_ids,),
        ).fetchall()
        waypoints: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            route_id = row.pop("route_id")
            waypoints.setdefault(route_id, []).append(dict(row))
        return waypoints

    def select_route_sql(self, where_clause: str) -> str:
        return f"""
            SELECT
              r.id::text AS id,
              r.creator_id::text AS creator_id,
              r.name,
              r.activity_type::text AS activity_type,
              r.distance_m,
              r.elevation_gain_m,
              r.difficulty::text AS difficulty,
              r.is_loop,
              r.is_public,
              r.surface_type::text AS surface_type,
              ST_AsGeoJSON(r.geometry)::json AS geometry,
              ST_Y(r.start_point) AS start_lat,
              ST_X(r.start_point) AS start_lng,
              ST_Y(r.end_point) AS end_lat,
              ST_X(r.end_point) AS end_lng,
              r.elevation_profile,
              r.estimated_duration_s,
              EXTRACT(EPOCH FROM r.created_at) AS created_at,
              EXTRACT(EPOCH FROM r.updated_at) AS updated_at
            FROM routes r
            {where_clause}
        """

    def from_row(self, row: dict[str, Any], waypoints: list[dict[str, Any]]) -> Route:
        return Route(
            id=row["id"],
            creator_id=row["creator_id"],
            name=row["name"],
            activity_type=row["activity_type"],
            distance_m=float(row["distance_m"]),
            elevation_gain_m=float(row["elevation_gain_m"]),
            difficulty=row["difficulty"],
            is_loop=bool(row["is_loop"]),
            is_public=bool(row["is_public"]),
            surface_type=row["surface_type"],
            geometry=row["geometry"],
            start_point={"lat": float(row["start_lat"]), "lng": float(row["start_lng"])},
            end_point={"lat": float(row["end_lat"]), "lng": float(row["end_lng"])},
            waypoints=waypoints,
            elevation_profile=list(row["elevation_profile"]),
            estimated_duration_s=int(row["estimated_duration_s"]),
            created_at=float(row["created_at"]),
            updated_at=float(row["updated_at"]),
        )

