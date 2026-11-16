import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Load server/.env first; a root .env remains a fallback. Existing env wins.
loadEnv({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
loadEnv();

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().min(1).default("127.0.0.1"),
  APP_ORIGIN: z.string().url().default("http://127.0.0.1:5173"),
  MOCK_AI: z.enum(["0", "1"]).optional(),
  PDF_AI_DATA_DIR: z.string().min(1).optional(),
  AI_BASE_URL: z.string().min(1).default("https://api.deepseek.com"),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().min(1).default("deepseek-flash"),
  AI_MODEL_ALLOW: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  console.error(`[config] 环境变量不合法：${details}`);
  process.exit(1);
}

const env = parsed.data;

export const config = {
  port: env.PORT,
  host: env.HOST,
  appOrigin: env.APP_ORIGIN,
  mockAi: env.MOCK_AI === "1",
  dataDir: env.PDF_AI_DATA_DIR ?? fileURLToPath(new URL("../data", import.meta.url)),
  ai: {
    baseUrl: env.AI_BASE_URL,
    apiKey: env.AI_API_KEY ?? "",
    model: env.AI_MODEL,
    modelAllow: env.AI_MODEL_ALLOW ?? "",
  },
} as const;
