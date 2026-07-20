import bcrypt from "bcryptjs";
import express from "express";
import { z } from "zod";
import { config } from "./config.js";
import { migrate, pool } from "./db.js";
import { createUserProfile } from "./userClient.js";
import { createNotification } from "./notificationClient.js";
import { issueTokenPair, revokeRefreshToken, rotateRefreshToken, verifyAccessToken } from "./tokens.js";

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30),
  password: z.string().min(8)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1)
});

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "auth-service" });
});

app.post("/auth/register", async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const result = await pool.query(
      `INSERT INTO users_auth (email, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id::text, email, username`,
      [input.email.toLowerCase(), input.username, passwordHash]
    );
    const user = result.rows[0];
    await createUserProfile({ userId: user.id, email: user.email, username: user.username });
    await createNotification({
      userId: user.id,
      type: "user.registered",
      title: "Welcome to Dromos",
      body: "Your Dromos account is ready.",
      metadata: { username: user.username }
    });
    const tokens = await issueTokenPair({ sub: user.id, email: user.email, username: user.username });
    res.status(201).json({ data: { user, ...tokens } });
  } catch (error) {
    next(error);
  }
});

app.post("/auth/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await pool.query(
      `SELECT id::text, email, username, password_hash, status
         FROM users_auth
        WHERE lower(email) = lower($1)`,
      [input.email]
    );
    const user = result.rows[0];
    if (!user || user.status !== "active" || !(await bcrypt.compare(input.password, user.password_hash))) {
      res.status(401).json({ error: { message: "invalid credentials" } });
      return;
    }
    const tokens = await issueTokenPair({ sub: user.id, email: user.email, username: user.username });
    res.json({ data: { user: { id: user.id, email: user.email, username: user.username }, ...tokens } });
  } catch (error) {
    next(error);
  }
});

app.post("/auth/refresh", async (req, res, next) => {
  try {
    const input = refreshSchema.parse(req.body);
    res.json({ data: await rotateRefreshToken(input.refresh_token) });
  } catch (error) {
    next(error);
  }
});

app.post("/auth/logout", async (req, res, next) => {
  try {
    const input = refreshSchema.parse(req.body);
    await revokeRefreshToken(input.refresh_token);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/auth/introspect", (req, res) => {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!token) {
    res.status(401).json({ error: { message: "missing bearer token" } });
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    res.json({ data: { active: true, user_id: payload.sub, email: payload.email, username: payload.username } });
  } catch {
    res.status(401).json({ data: { active: false } });
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "unknown error";
  const status = message.includes("duplicate key") ? 409 : 400;
  res.status(status).json({ error: { message } });
});

await migrate();
app.listen(config.port, () => {
  console.log(`auth-service listening on :${config.port}`);
});
