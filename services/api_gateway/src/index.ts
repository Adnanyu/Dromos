import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import type { Server } from "http";
import type { Socket } from "net";

type GatewayRequest = express.Request & {
  userId?: string;
  username?: string;
  email?: string;
};

const port = Number(process.env.API_GATEWAY_PORT ?? 8080);
const authServiceUrl = process.env.AUTH_SERVICE_URL ?? "http://127.0.0.1:8083";
const userServiceUrl = process.env.USER_SERVICE_URL ?? "http://127.0.0.1:8084";
const routeServiceUrl = process.env.ROUTE_SERVICE_URL ?? "http://127.0.0.1:8081";
const activityServiceUrl = process.env.ACTIVITY_SERVICE_URL ?? "http://127.0.0.1:8082";
const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL ?? "http://127.0.0.1:8086";

const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api-gateway" });
});

// Each entry pairs a path matcher with the proxy responsible for it, in the
// same precedence order as the Express routes below. We use this list to
// explicitly dispatch HTTP `upgrade` events ourselves (see wireUpgrades),
// because letting every ws:true proxy auto-subscribe to the same server's
// 'upgrade' event creates a race: http-proxy-middleware does NOT await
// matching, so with several instances attached, whichever one resolves
// its (async) path match first wins — independent of Express route order.
// That's why /activities/live/:id was intermittently/always landing on
// route-service (mounted earlier on /routes) instead of activity-service.
const upgradeRoutes: { matches: (path: string) => boolean; proxy: ReturnType<typeof proxy> }[] = [];

function registerProxy(
  pathMatcher: string | RegExp,
  target: string,
  ...middlewares: express.RequestHandler[]
) {
  const proxyMiddleware = proxy(target);

  if (typeof pathMatcher === "string") {
    app.use(pathMatcher, ...middlewares, proxyMiddleware);
    upgradeRoutes.push({
      matches: (path) => path === pathMatcher || path.startsWith(pathMatcher + "/"),
      proxy: proxyMiddleware,
    });
  } else {
    app.use(pathMatcher, ...middlewares, proxyMiddleware);
    upgradeRoutes.push({
      matches: (path) => pathMatcher.test(path),
      proxy: proxyMiddleware,
    });
  }

  return proxyMiddleware;
}

registerProxy("/auth", authServiceUrl);
// Route listings by user live in the route service — must be registered
// before the general /users prefix, which goes to the user service.
registerProxy(/^\/users\/[^/]+\/routes$/, routeServiceUrl, requireAuth);
registerProxy("/users", userServiceUrl, requireAuth);
registerProxy(/^\/routes\/[^/]+\/share$/, routeServiceUrl, requireAuth);
registerProxy("/routes", routeServiceUrl, requireAuth);
registerProxy("/activities", activityServiceUrl, requireAuth);
registerProxy("/shares", routeServiceUrl);
registerProxy("/notifications", notificationServiceUrl, requireAuth);

async function requireAuth(req: GatewayRequest, res: express.Response, next: express.NextFunction): Promise<void> {
  try {
    const auth = req.header("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      res.status(401).json({ error: { message: "missing bearer token" } });
      return;
    }
    const response = await fetch(`${authServiceUrl}/auth/introspect`, {
      method: "POST",
      headers: { Authorization: auth }
    });
    if (!response.ok) {
      res.status(401).json({ error: { message: "invalid bearer token" } });
      return;
    }
    const body = (await response.json()) as { data?: { active?: boolean; user_id?: string; username?: string; email?: string } };
    if (!body.data?.active || !body.data.user_id) {
      res.status(401).json({ error: { message: "invalid bearer token" } });
      return;
    }
    req.userId = body.data.user_id;
    req.username = body.data.username;
    req.email = body.data.email;
    next();
  } catch (error) {
    next(error);
  }
}

function proxy(target: string) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: false,   // do NOT auto-subscribe upgrade listeners — wireUpgrades() handles all WS routing explicitly
    pathRewrite: (_path, req) => (req as express.Request).originalUrl,
    on: {
      proxyReq: (proxyReq, req) => {
        const gatewayReq = req as GatewayRequest;
        if (gatewayReq.userId) {
          proxyReq.setHeader("X-User-Id", gatewayReq.userId);
        }
        if (gatewayReq.username) {
          proxyReq.setHeader("X-Username", gatewayReq.username);
        }
        if (gatewayReq.email) {
          proxyReq.setHeader("X-User-Email", gatewayReq.email);
        }
      }
    }
  });
}

// Explicitly dispatch upgrade events to exactly one proxy, chosen by the
// same precedence order the Express routes were registered in. This
// replaces relying on each ws:true proxy's auto-subscribed listener,
// which is what caused the race/mismatch above.
function wireUpgrades(server: Server) {
  server.on("upgrade", (req, socket: Socket, head: Buffer) => {
    const url = req.url ?? "/";
    const path = url.split("?")[0];
    const route = upgradeRoutes.find((r) => r.matches(path));
    if (!route) {
      socket.destroy();
      return;
    }
    route.proxy.upgrade(req, socket, head);
  });
}

const server = app.listen(port, () => {
  console.log(`api-gateway listening on :${port}`);
});

wireUpgrades(server);
