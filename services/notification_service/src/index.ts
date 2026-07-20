import express from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { config } from "./config.js";
import { connectAndMigrate, notificationSettings, notifications } from "./db.js";

const createNotificationSchema = z.object({
  user_id: z.string().uuid(),
  type: z.string().min(1),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  actor_id: z.string().uuid().optional(),
  route_id: z.string().uuid().optional(),
  activity_id: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).default({})
});

const settingsSchema = z.object({
  push_enabled: z.boolean().optional(),
  email_enabled: z.boolean().optional(),
  in_app_enabled: z.boolean().optional(),
  weekly_digest: z.boolean().optional()
});

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "notification-service" });
});

app.get("/notifications", async (req, res, next) => {
  try {
    const userId = requireUserContext(req, res);
    if (!userId) return;
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const rows = await notifications
      .find({ user_id: userId })
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

app.patch("/notifications/:id/read", async (req, res, next) => {
  try {
    const userId = requireUserContext(req, res);
    if (!userId) return;
    const result = await notifications.findOneAndUpdate(
      { _id: new ObjectId(req.params.id), user_id: userId },
      { $set: { read_at: new Date() } },
      { returnDocument: "after" }
    );
    if (!result) {
      res.status(404).json({ error: { message: "notification not found" } });
      return;
    }
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

app.patch("/notifications/read-all", async (req, res, next) => {
  try {
    const userId = requireUserContext(req, res);
    if (!userId) return;
    const result = await notifications.updateMany(
      { user_id: userId, read_at: null },
      { $set: { read_at: new Date() } }
    );
    res.json({ data: { modified_count: result.modifiedCount } });
  } catch (error) {
    next(error);
  }
});

app.get("/notifications/settings", async (req, res, next) => {
  try {
    const userId = requireUserContext(req, res);
    if (!userId) return;
    const settings = await getOrCreateSettings(userId);
    res.json({ data: settings });
  } catch (error) {
    next(error);
  }
});

app.patch("/notifications/settings", async (req, res, next) => {
  try {
    const userId = requireUserContext(req, res);
    if (!userId) return;
    const input = settingsSchema.parse(req.body);
    const result = await notificationSettings.findOneAndUpdate(
      { user_id: userId },
      { $set: { ...input, updated_at: new Date() }, $setOnInsert: { created_at: new Date() } },
      { upsert: true, returnDocument: "after" }
    );
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

app.post("/internal/notifications", async (req, res, next) => {
  try {
    const serviceName = req.header("X-Service-Name");
    if (!["auth-service", "activity-service", "analytics-service"].includes(String(serviceName))) {
      res.status(403).json({ error: { message: "forbidden" } });
      return;
    }
    const input = createNotificationSchema.parse(req.body);
    const settings = await getOrCreateSettings(input.user_id);
    if (!settings.in_app_enabled || isTypeDisabled(settings, input.type)) {
      res.status(202).json({ data: { skipped: true } });
      return;
    }
    const document = {
      ...input,
      service_name: serviceName,
      read_at: null,
      delivery: {
        in_app: "stored",
        push: settings.push_enabled ? "queued" : "disabled",
        email: settings.email_enabled ? "queued" : "disabled"
      },
      created_at: new Date()
    };
    const result = await notifications.insertOne(document);
    res.status(201).json({ data: { id: result.insertedId, ...document } });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "unknown error";
  res.status(400).json({ error: { message } });
});

async function getOrCreateSettings(userId: string) {
  const defaults = {
    user_id: userId,
    push_enabled: true,
    email_enabled: false,
    in_app_enabled: true,
    weekly_digest: true,
    created_at: new Date(),
    updated_at: new Date()
  };

  const result = await notificationSettings.findOneAndUpdate(
    { user_id: userId },
    { $setOnInsert: defaults },
    { upsert: true, returnDocument: "after" }
  );

  if (!result) {
    throw new Error("failed to create notification settings");
  }

  return result;
}

function isTypeDisabled(settings: Record<string, unknown>, type: string): boolean {
  const keyByType: Record<string, string> = {
    "user.registered": "in_app_enabled"
  };
  const key = keyByType[type];
  return key ? settings[key] === false : false;
}

function requireUserContext(req: express.Request, res: express.Response): string | null {
  const userId = req.header("X-User-Id");
  if (!userId) {
    res.status(401).json({ error: { message: "expected X-User-Id from authenticated API gateway" } });
    return null;
  }
  return userId;
}

await connectAndMigrate();
app.listen(config.port, () => {
  console.log(`notification-service listening on :${config.port}`);
});

