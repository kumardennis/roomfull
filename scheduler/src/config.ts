import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { hostname } from "node:os";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "..");

for (const envPath of [
  resolve(packageRoot, ".env"),
  resolve(repoRoot, ".env"),
]) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, quiet: true });
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  supabaseUrl: required("SUPABASE_URL"),
  supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
  workerId:
    process.env.SCHEDULER_WORKER_ID?.trim() ||
    `scheduler-${hostname()}-${process.pid}`,
};
