import { z } from "zod";
import path from "node:path";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  AUTOMATION_SERVICE_TOKEN: z.string().optional(),
  CRED_ENCRYPTION_KEY: z.string().optional(),
  BACKUP_ROOT_DIR: z.string().optional(),
  PORT: z.string().optional(),
  HOST: z.string().optional(),
  ERROR_ALERT_WEBHOOK_URL: z.string().optional(),
});

const parsed = envSchema.parse(process.env);
const resolved = { ...parsed };
if (resolved.NODE_ENV === "development" && !resolved.AUTOMATION_SERVICE_TOKEN) {
  resolved.AUTOMATION_SERVICE_TOKEN = "local-dev-token";
}
if (resolved.NODE_ENV === "development" && !resolved.BACKUP_ROOT_DIR) {
  resolved.BACKUP_ROOT_DIR = path.resolve(process.cwd(), "..", "backups");
}

export const env = resolved;
