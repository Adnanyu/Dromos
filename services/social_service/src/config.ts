export type Config = {
  port: number;
  databaseUrl: string;
  notificationServiceUrl: string;
};

export const config: Config = {
  port: Number(process.env.SOCIAL_SERVICE_PORT ?? 8085),
  databaseUrl: process.env.SOCIAL_DATABASE_URL ?? "postgres://stride:stride@127.0.0.1:5436/stride_social",
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL ?? "http://127.0.0.1:8086"
};
