import { z } from "zod";

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

export const env = envSchema.parse(process.env);
