from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from route_engine import Route


def publish_route_created(route: Route) -> None:
    base_url = os.getenv("SOCIAL_SERVICE_URL")
    if not base_url:
        return

    body = json.dumps(
        {
            "user_id": route.creator_id,
            "route_id": route.id,
            "name": route.name,
            "distance_m": route.distance_m,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/internal/feed/route-created",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Service-Name": "route-service",
        },
    )
    try:
        urllib.request.urlopen(request, timeout=2).close()
    except (urllib.error.URLError, TimeoutError):
        # Route persistence is the source of truth; social feed publication can be retried once Kafka exists.
        return
