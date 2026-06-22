import { MongoClient } from "mongodb";
import { config } from "./config.js";

export const client = new MongoClient(config.mongoUrl);
export const db = client.db(config.databaseName);

export const notifications = db.collection("notifications");
export const notificationSettings = db.collection("notification_settings");

export async function connectAndMigrate(): Promise<void> {
  await client.connect();
  await notifications.createIndex({ user_id: 1, created_at: -1 });
  await notifications.createIndex({ user_id: 1, read_at: 1 });
  await notificationSettings.createIndex({ user_id: 1 }, { unique: true });
}

