export type Config = {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
  userServiceUrl: string;
  notificationServiceUrl: string;
};

export const config: Config = {
  port: Number(process.env.AUTH_SERVICE_PORT ?? 8083),
  databaseUrl: process.env.AUTH_DATABASE_URL ?? "postgres://stride:stride@127.0.0.1:5434/stride_auth",
  redisUrl: process.env.AUTH_REDIS_URL ?? "redis://127.0.0.1:6379",
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-me",
  userServiceUrl: process.env.USER_SERVICE_URL ?? "http://127.0.0.1:8084",
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL ?? "http://127.0.0.1:8086"
};
