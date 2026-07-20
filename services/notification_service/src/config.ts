export type Config = {
  port: number;
  mongoUrl: string;
  databaseName: string;
};

export const config: Config = {
  port: Number(process.env.NOTIFICATION_SERVICE_PORT ?? 8086),
  mongoUrl: process.env.NOTIFICATION_MONGO_URL ?? "mongodb://127.0.0.1:27017",
  databaseName: process.env.NOTIFICATION_DATABASE ?? "dromos_notifications"
};

