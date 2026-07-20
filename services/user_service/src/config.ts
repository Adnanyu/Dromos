export type Config = {
  port: number;
  databaseUrl: string;
};

export const config: Config = {
  port: Number(process.env.USER_SERVICE_PORT ?? 8084),
  databaseUrl: process.env.USER_DATABASE_URL ?? "postgres://dromos:dromos@127.0.0.1:5435/dromos_users"
};

