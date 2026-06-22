import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { config } from "./config.js";
import { migrate, pool } from "./db.js";
import { createNotification } from "./notificationClient.js";

const commentSchema = z.object({
  content: z.string().min(1).max(1000)
});

const shareSchema = z.object({
  shared_to: z.string().uuid().optional(),
  expires_at: z.string().datetime().optional()
});

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "social-service" });
});

app.post("/follows/:userId", async (req, res, next) => {
  try {
    const userId = requireUserContext(req, res);
    if (!userId) return;
    await pool.query(
      `INSERT INTO follows (follower_id, following_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, req.params.userId]
    );
    await addFeedItem(userId, req.params.userId, "user.followed", {});
    await createNotification({
      userId: req.params.userId,
      type: "user.followed",
      title: "New follower",
      body: "Someone followed you on STRIDE.",
      actorId: userId
    });
    res.status(201).json({ data: { follower_id: userId, following_id: req.params.userId } });
  } catch (error) {
    next(error);
  }
});

app.delete("/follows/:userId", async (req, res, next) => {
  try {
    const userId = requireUserContext(req, res);
    if (!userId) return;
    await pool.query("DELETE FROM follows WHERE follower_id = $1 AND following_id = $2", [userId, req.params.userId]);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get("/feed", async (req, res, next) => {
  try {
    const userId = requireUserContext(req, res);
    if (!userId) return;
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const result = await pool.query(
      `SELECT fi.*
         FROM feed_items fi
        WHERE fi.actor_id = $1
           OR fi.actor_id IN (SELECT following_id FROM follows WHERE follower_id = $1)
           OR fi.target_user_id = $1
        ORDER BY fi.created_at DESC
        LIMIT $2`,
      [userId, limit]
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/routes/:id/like", async (req, res, next) => {
  try {
    const userId = requireUserContext(req, res);
    if (!userId) return;
    await pool.query(
      `INSERT INTO route_likes (user_id, route_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, req.params.id]
    );
    await addFeedItem(userId, null, "route.liked", { route_id: req.params.id });
    await notifyRouteOwner(req.params.id, userId, "route.liked", "Route liked", "Someone liked your route.");
    res.status(201).json({ data: { user_id: userId, route_id: req.params.id } });
  } catch (error) {
    next(error);
  }
});

app.delete("/routes/:id/like", async (req, res, next) => {
  try {
    const userId = requireUserContext(req, res);
    if (!userId) return;
    await pool.query("DELETE FROM route_likes WHERE user_id = $1 AND route_id = $2", [userId, req.params.id]);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/routes/:id/comment", async (req, res, next) => {
  try {
    const userId = requireUserContext(req, res);
    if (!userId) return;
    const input = commentSchema.parse(req.body);
    const result = await pool.query(
      `INSERT INTO route_comments (user_id, route_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, req.params.id, input.content]
    );
    await addFeedItem(userId, null, "route.commented", { route_id: req.params.id, comment_id: result.rows[0].id });
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.get("/routes/:id/comments", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT *
         FROM route_comments
        WHERE route_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [req.params.id]
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post("/routes/:id/share", async (req, res, next) => {
  try {
    const userId = requireUserContext(req, res);
    if (!userId) return;
    const input = shareSchema.parse(req.body);
    const token = crypto.randomBytes(18).toString("base64url");
    const result = await pool.query(
      `INSERT INTO route_shares (route_id, shared_by, shared_to, share_token, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.params.id, userId, input.shared_to ?? null, token, input.expires_at ?? null]
    );
    await addFeedItem(userId, input.shared_to ?? null, "route.shared", { route_id: req.params.id, share_id: result.rows[0].id });
    if (input.shared_to) {
      await createNotification({
        userId: input.shared_to,
        type: "route.shared",
        title: "Route shared with you",
        body: "Someone shared a route with you.",
        actorId: userId,
        routeId: req.params.id
      });
    }
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.get("/shares/:token", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT *
         FROM route_shares
        WHERE share_token = $1
          AND (expires_at IS NULL OR expires_at > now())`,
      [req.params.token]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: { message: "share not found" } });
      return;
    }
    res.json({ data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.post("/activities/:id/kudos", async (req, res, next) => {
  try {
    const userId = requireUserContext(req, res);
    if (!userId) return;
    await pool.query(
      `INSERT INTO activity_kudos (user_id, activity_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, req.params.id]
    );
    await addFeedItem(userId, null, "activity.kudos", { activity_id: req.params.id });
    await notifyActivityOwner(req.params.id, userId, "activity.kudos", "New kudos", "Someone gave kudos to your activity.");
    res.status(201).json({ data: { user_id: userId, activity_id: req.params.id } });
  } catch (error) {
    next(error);
  }
});

app.post("/internal/feed/activity-completed", async (req, res, next) => {
  try {
    if (req.header("X-Service-Name") !== "activity-service") {
      res.status(403).json({ error: { message: "forbidden" } });
      return;
    }
    const schema = z.object({
      user_id: z.string().uuid(),
      activity_id: z.string().uuid(),
      distance_m: z.number().optional()
    });
    const input = schema.parse(req.body);
    await pool.query(
      `INSERT INTO activity_owners (activity_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (activity_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
      [input.activity_id, input.user_id]
    );
    await addFeedItem(input.user_id, null, "activity.completed", {
      activity_id: input.activity_id,
      distance_m: input.distance_m ?? 0
    });
    res.status(201).json({ data: { created: true } });
  } catch (error) {
    next(error);
  }
});

app.post("/internal/feed/route-created", async (req, res, next) => {
  try {
    if (req.header("X-Service-Name") !== "route-service") {
      res.status(403).json({ error: { message: "forbidden" } });
      return;
    }
    const schema = z.object({
      user_id: z.string().uuid(),
      route_id: z.string().uuid(),
      name: z.string().optional(),
      distance_m: z.number().optional()
    });
    const input = schema.parse(req.body);
    await pool.query(
      `INSERT INTO route_owners (route_id, creator_id)
       VALUES ($1, $2)
       ON CONFLICT (route_id) DO UPDATE SET creator_id = EXCLUDED.creator_id`,
      [input.route_id, input.user_id]
    );
    await addFeedItem(input.user_id, null, "route.created", {
      route_id: input.route_id,
      creator_id: input.user_id,
      name: input.name,
      distance_m: input.distance_m ?? 0
    });
    res.status(201).json({ data: { created: true } });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "unknown error";
  const status = message.includes("invalid input syntax") ? 400 : 400;
  res.status(status).json({ error: { message } });
});

async function addFeedItem(actorId: string, targetUserId: string | null, itemType: string, metadata: Record<string, unknown>): Promise<void> {
  await pool.query(
    `INSERT INTO feed_items (actor_id, target_user_id, item_type, route_id, activity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      actorId,
      targetUserId,
      itemType,
      typeof metadata.route_id === "string" ? metadata.route_id : null,
      typeof metadata.activity_id === "string" ? metadata.activity_id : null,
      JSON.stringify(metadata)
    ]
  );
}

async function notifyRouteOwner(routeId: string, actorId: string, type: string, title: string, body: string): Promise<void> {
  const result = await pool.query(
    `SELECT creator_id::text
       FROM route_owners
      WHERE route_id = $1`,
    [routeId]
  );
  const ownerId = result.rows[0]?.creator_id;
  if (!ownerId || ownerId === actorId) {
    return;
  }
  await createNotification({ userId: ownerId, type, title, body, actorId, routeId });
}

async function notifyActivityOwner(activityId: string, actorId: string, type: string, title: string, body: string): Promise<void> {
  const result = await pool.query(
    `SELECT user_id::text
       FROM activity_owners
      WHERE activity_id = $1`,
    [activityId]
  );
  const ownerId = result.rows[0]?.user_id;
  if (!ownerId || ownerId === actorId) {
    return;
  }
  await createNotification({ userId: ownerId, type, title, body, actorId, activityId });
}

function requireUserContext(req: express.Request, res: express.Response): string | null {
  const userId = req.header("X-User-Id");
  if (!userId) {
    res.status(401).json({ error: { message: "expected X-User-Id from authenticated API gateway" } });
    return null;
  }
  return userId;
}

await migrate();
app.listen(config.port, () => {
  console.log(`social-service listening on :${config.port}`);
});
