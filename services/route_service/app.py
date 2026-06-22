from __future__ import annotations

import os
from typing import Any, Literal

from fastapi import FastAPI, Header, HTTPException, Query, status
from pydantic import BaseModel, Field, model_validator

from route_engine import ValidationError, generate_route, get_route, nearby_routes, save_route, serialize_route, update_route


ActivityType = Literal["running", "cycling", "hiking"]
SurfaceType = Literal["road", "trail", "mixed"]

app = FastAPI(
    title="STRIDE Route Service",
    version="0.2.0",
    description="PostGIS-backed route generation and route discovery service. Auth is delegated to the API gateway.",
)


class GenerateRouteRequest(BaseModel):
    activity_type: ActivityType = "running"
    distance_m: float = Field(ge=500, le=100_000)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    end_lat: float | None = Field(default=None, ge=-90, le=90)
    end_lng: float | None = Field(default=None, ge=-180, le=180)
    is_loop: bool = True
    surface_pref: SurfaceType | None = None
    seed: float | None = None


class SaveRouteRequest(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    is_public: bool = True
    activity_type: ActivityType = "running"
    distance_m: float | None = Field(default=None, ge=500, le=100_000)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    end_lat: float | None = Field(default=None, ge=-90, le=90)
    end_lng: float | None = Field(default=None, ge=-180, le=180)
    is_loop: bool = True
    surface_pref: SurfaceType | None = None
    generated_route: dict[str, Any] | None = None

    @model_validator(mode="after")
    def has_generation_input(self) -> "SaveRouteRequest":
        if self.generated_route is None and (self.distance_m is None or self.lat is None or self.lng is None):
            raise ValueError("Either generated_route or distance_m, lat, and lng are required.")
        return self


class UpdateRouteRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    is_public: bool | None = None


class DataResponse(BaseModel):
    data: Any


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "route-service"}


@app.post("/routes/generate", response_model=DataResponse)
def generate_route_endpoint(
    payload: GenerateRouteRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> dict[str, Any]:
    require_user_context(x_user_id)
    try:
        return {"data": generate_route(payload.model_dump(exclude_none=True))}
    except ValidationError as exc:
        raise bad_request("invalid_route_request", str(exc)) from exc


@app.post("/routes", response_model=DataResponse, status_code=status.HTTP_201_CREATED)
def save_route_endpoint(
    payload: SaveRouteRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> dict[str, Any]:
    user_id = require_user_context(x_user_id)
    try:
        route = save_route(user_id=user_id, payload=payload.model_dump(exclude_none=True))
    except ValidationError as exc:
        raise bad_request("invalid_route", str(exc)) from exc
    return {"data": serialize_route(route)}


@app.get("/routes/nearby", response_model=DataResponse)
def nearby_routes_endpoint(
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    radius_m: float = Query(default=5000, gt=0, le=100_000),
) -> dict[str, Any]:
    routes = nearby_routes(lat=lat, lng=lng, radius_m=radius_m)
    return {"data": [serialize_route(route) for route in routes]}


@app.get("/routes/{route_id}", response_model=DataResponse)
def get_route_endpoint(route_id: str) -> dict[str, Any]:
    route = get_route(route_id)
    if route is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "route_not_found", "message": "Route was not found."},
        )
    return {"data": serialize_route(route)}


@app.patch("/routes/{route_id}", response_model=DataResponse)
def update_route_endpoint(
    route_id: str,
    payload: UpdateRouteRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> dict[str, Any]:
    user_id = require_user_context(x_user_id)
    try:
        route = update_route(route_id=route_id, user_id=user_id, payload=payload.model_dump(exclude_unset=True))
    except ValidationError as exc:
        raise bad_request("invalid_route_update", str(exc)) from exc
    if route is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "route_not_found", "message": "Route was not found."},
        )
    return {"data": serialize_route(route)}


def require_user_context(user_id: str | None) -> str:
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "missing_user_context",
                "message": "Expected X-User-Id from the authenticated API gateway.",
            },
        )
    return user_id


def bad_request(code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": code, "message": message})


def main() -> None:
    import uvicorn

    host = os.getenv("ROUTE_SERVICE_HOST", "127.0.0.1")
    port = int(os.getenv("ROUTE_SERVICE_PORT", "8081"))
    uvicorn.run("app:app", host=host, port=port, reload=os.getenv("ROUTE_SERVICE_RELOAD") == "1")


if __name__ == "__main__":
    main()
