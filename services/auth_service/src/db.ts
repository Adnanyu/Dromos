import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

export const pool = new Pool({ connectionString: config.databaseUrl });

export async function migrate(): Promise<void> {
  const sql = readFileSync(join(__dirname, "../sql/001_init.sql"), "utf8");
  await pool.query(sql);
}

