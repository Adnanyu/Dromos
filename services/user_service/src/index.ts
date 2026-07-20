import express from "express";
import { z } from "zod";
import { config } from "./config.js";
import { migrate, pool } from "./db.js";

const internalCreateProfileSchema = z.object({
  user_id: z.string().uuid(),
  email: z.string().email(),
  username: z.string().min(3).max(30)
});

const updateProfileSchema = z.object({
  first_name: z.string().max(80).optional(),
  last_name: z.string().max(80).optional(),
  avatar_url: z.string().url().optional(),
  preferred_activities: z.array(z.enum(["running", "cycling", "hiking"])).optional(),
  units: z.enum(["metric", "imperial"]).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  location: z.string().max(120).optional()
});

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "user-service" });
});

app.post("/internal/users", async (req, res, next) => {
  try {
    if (req.header("X-Service-Name") !== "auth-service") {
      res.status(403).json({ error: { message: "forbidden" } });
      return;
    }
    const input = internalCreateProfileSchema.parse(req.body);
    const result = await pool.query(
      `INSERT INTO profiles (user_id, email, username)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING *`,
      [input.user_id, input.email.toLowerCase(), input.username]
    );
    if (result.rowCount === 0) {
      res.status(409).json({ error: { message: "profile already exists" } });
      return;
    }
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.get("/users/search", async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      res.json({ data: [] });
      return;
    }
    const result = await pool.query(
      `SELECT public_profile(p) AS profile
         FROM profiles p
        WHERE to_tsvector('simple', coalesce(username, '') || ' ' || coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
              @@ plainto_tsquery('simple', $1)
           OR username ILIKE $2
        ORDER BY username ASC
        LIMIT 20`,
      [q, `%${q}%`]
    );
    res.json({ data: result.rows.map((row) => row.profile) });
  } catch (error) {
    next(error);
  }
});

app.get("/users/me", async (req, res, next) => {
  try {
    const userId = requireUserContext(req, res);
    if (!userId) return;
    const profile = await getProfile(userId);
    if (!profile) {
      res.status(404).json({ error: { message: "profile not found" } });
      return;
    }
    res.json({ data: profile });
  } catch (error) {
    next(error);
  }
});

app.patch("/users/me", async (req, res, next) => {
  try {
    const userId = requireUserContext(req, res);
    if (!userId) return;
    const input = updateProfileSchema.parse(req.body);
    const result = await pool.query(
      `UPDATE profiles
          SET first_name = COALESCE($2, first_name),
              last_name = COALESCE($3, last_name),
              avatar_url = COALESCE($4, avatar_url),
              preferred_activities = COALESCE($5::text[], preferred_activities),
              units = COALESCE($6::distance_units, units),
              visibility = COALESCE($7::profile_visibility, visibility),
              location = COALESCE($8, location),
              updated_at = now()
        WHERE user_id = $1
        RETURNING *`,
      [
        userId,
        input.first_name,
        input.last_name,
        input.avatar_url,
        input.preferred_activities,
        input.units,
        input.visibility,
        input.location
      ]
    );
    const profile = result.rows[0];
    if (!profile) {
      res.status(404).json({ error: { message: "profile not found" } });
      return;
    }
    res.json({ data: profile });
  } catch (error) {
    next(error);
  }
});

app.get("/users/:id", async (req, res, next) => {
  try {
    const profile = await getPublicProfile(req.params.id);
    if (!profile) {
      res.status(404).json({ error: { message: "profile not found" } });
      return;
    }
    res.json({ data: profile });
  } catch (error) {
    next(error);
  }
});

app.get("/users/:id/stats", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT user_id::text, total_distance_m, total_activities
         FROM profiles
        WHERE user_id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: { message: "profile not found" } });
      return;
    }
    res.json({ data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.post("/internal/users/:id/stats/activity-completed", async (req, res, next) => {
  try {
    if (req.header("X-Service-Name") !== "activity-service") {
      res.status(403).json({ error: { message: "forbidden" } });
      return;
    }
    const distanceM = Number(req.body.distance_m ?? 0);
    const result = await pool.query(
      `UPDATE profiles
          SET total_distance_m = total_distance_m + $2,
              total_activities = total_activities + 1,
              updated_at = now()
        WHERE user_id = $1
        RETURNING user_id::text, total_distance_m, total_activities`,
      [req.params.id, distanceM]
    );
    res.json({ data: result.rows[0] ?? null });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "unknown error";
  const status = message.includes("duplicate key") ? 409 : 400;
  res.status(status).json({ error: { message } });
});

async function getProfile(userId: string) {
  const result = await pool.query("SELECT * FROM profiles WHERE user_id = $1", [userId]);
  return result.rows[0] ?? null;
}

async function getPublicProfile(userId: string) {
  const result = await pool.query("SELECT public_profile(p) AS profile FROM profiles p WHERE user_id = $1", [userId]);
  return result.rows[0]?.profile ?? null;
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
  console.log(`user-service listening on :${config.port}`);
});
