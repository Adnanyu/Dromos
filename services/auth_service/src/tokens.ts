import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { Redis } from "ioredis";
import { config } from "./config.js";

export type AuthTokenPayload = {
  sub: string;
  email: string;
  username: string;
};

const accessTtlSeconds = 15 * 60;
const refreshTtlSeconds = 30 * 24 * 60 * 60;

export const redis = new Redis(config.redisUrl);

export async function issueTokenPair(payload: AuthTokenPayload): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const accessToken = jwt.sign(payload, config.jwtSecret, { expiresIn: accessTtlSeconds, issuer: "dromos-auth" });
  const refreshToken = crypto.randomBytes(48).toString("base64url");
  await redis.set(refreshKey(refreshToken), JSON.stringify(payload), "EX", refreshTtlSeconds);
  return { access_token: accessToken, refresh_token: refreshToken, expires_in: accessTtlSeconds };
}

export async function rotateRefreshToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const key = refreshKey(refreshToken);
  const raw = await redis.get(key);
  if (!raw) {
    throw new Error("invalid refresh token");
  }
  await redis.del(key);
  return issueTokenPair(JSON.parse(raw) as AuthTokenPayload);
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await redis.del(refreshKey(refreshToken));
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, config.jwtSecret, { issuer: "dromos-auth" }) as AuthTokenPayload;
}

function refreshKey(token: string): string {
  return `auth:refresh:${token}`;
}

