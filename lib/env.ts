import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/errors";

const booleanFromEnvironment = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  if (value.toLowerCase() === "true") {
    return true;
  }

  if (value.toLowerCase() === "false") {
    return false;
  }

  return value;
}, z.boolean());

const optionalEnvironmentString = (schema: z.ZodString) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    schema.trim().min(1).optional(),
  );

const durationFromEnvironment = (fallback: number) =>
  z.coerce.number().int().nonnegative().max(86_400_000).default(fallback);

const serverEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: optionalEnvironmentString(z.string().url()),
    MASSIVE_API_KEY: optionalEnvironmentString(z.string()),
    MASSIVE_API_BASE_URL: z
      .string()
      .trim()
      .url()
      .default("https://api.massive.com"),
    MASSIVE_REQUEST_TIMEOUT_MS: durationFromEnvironment(10_000),
    MASSIVE_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    MASSIVE_RETRY_BASE_DELAY_MS: durationFromEnvironment(250),
    USE_MOCK_DATA: booleanFromEnvironment.default(false),
    CACHE_TTL_QUOTE_MS: durationFromEnvironment(5_000),
    CACHE_TTL_INTRADAY_MS: durationFromEnvironment(15_000),
    CACHE_TTL_OPTIONS_MS: durationFromEnvironment(30_000),
    CACHE_TTL_NEWS_MS: durationFromEnvironment(30_000),
    CACHE_TTL_EVENTS_MS: durationFromEnvironment(900_000),
    CACHE_TTL_REFERENCE_MS: durationFromEnvironment(86_400_000),
    CACHE_TTL_FINANCIALS_MS: durationFromEnvironment(21_600_000),
    CACHE_TTL_HISTORICAL_MS: durationFromEnvironment(86_400_000),
    CACHE_STALE_IF_ERROR_MS: durationFromEnvironment(300_000),
    MEMORY_CACHE_MAX_ENTRIES: z.coerce
      .number()
      .int()
      .positive()
      .max(100_000)
      .default(2_000),
  })
  .superRefine((environment, context) => {
    if (!environment.USE_MOCK_DATA && !environment.MASSIVE_API_KEY) {
      context.addIssue({
        code: "custom",
        message: "MASSIVE_API_KEY is required when USE_MOCK_DATA is false.",
        path: ["MASSIVE_API_KEY"],
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnvironment: ServerEnv | undefined;

export function parseServerEnv(
  source: Readonly<Record<string, string | undefined>>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(source);

  if (!result.success) {
    if (result.error.issues.some((issue) => issue.path.join(".") === "MASSIVE_API_KEY")) {
      throw new AppError(
        "API_KEY_MISSING",
        "The Massive API key is missing from the server environment.",
      );
    }
    throw new AppError(
      "CONFIGURATION_ERROR",
      "Server environment configuration is invalid.",
      {
        details: {
          fields: result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
    );
  }

  return result.data;
}

/** Lazily validates secrets so importing a module never exposes or logs them. */
export function getServerEnv(): ServerEnv {
  cachedEnvironment ??= parseServerEnv(process.env);
  return cachedEnvironment;
}

export function requireDatabaseUrl(environment = getServerEnv()): string {
  if (!environment.DATABASE_URL) {
    throw new AppError(
      "CONFIGURATION_ERROR",
      "DATABASE_URL is required for database access.",
      { details: { fields: ["DATABASE_URL"] } },
    );
  }

  return environment.DATABASE_URL;
}
