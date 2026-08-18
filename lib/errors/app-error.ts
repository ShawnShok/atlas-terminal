export type AppErrorCode =
  | "CONFIGURATION_ERROR"
  | "API_KEY_MISSING"
  | "INVALID_API_KEY"
  | "ENTITLEMENT_REQUIRED"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_RESPONSE_INVALID"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "CACHE_ERROR"
  | "UNKNOWN_ERROR";

export interface AppErrorOptions {
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly retryable?: boolean;
  readonly statusCode?: number;
}

const DEFAULT_STATUS_CODES: Readonly<Record<AppErrorCode, number>> = {
  CONFIGURATION_ERROR: 500,
  API_KEY_MISSING: 500,
  INVALID_API_KEY: 502,
  ENTITLEMENT_REQUIRED: 403,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 503,
  UPSTREAM_RESPONSE_INVALID: 502,
  TIMEOUT: 504,
  NETWORK_ERROR: 503,
  CACHE_ERROR: 500,
  UNKNOWN_ERROR: 500,
};

/** A serializable application error whose public fields are safe for clients. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly retryable: boolean;
  readonly statusCode: number;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.statusCode = options.statusCode ?? DEFAULT_STATUS_CODES[code];
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }

  toJSON(): Readonly<Record<string, unknown>> {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      statusCode: this.statusCode,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export interface ProviderErrorOptions extends AppErrorOptions {
  readonly endpoint?: string;
  readonly provider: string;
  readonly requestId?: string;
  readonly upstreamStatus?: number;
}

/** A provider failure with sanitized diagnostics and no request credentials. */
export class ProviderError extends AppError {
  readonly endpoint?: string;
  readonly provider: string;
  readonly requestId?: string;
  readonly upstreamStatus?: number;

  constructor(
    code: AppErrorCode,
    message: string,
    options: ProviderErrorOptions,
  ) {
    super(code, message, options);
    this.name = "ProviderError";
    this.provider = options.provider;
    this.endpoint = options.endpoint;
    this.requestId = options.requestId;
    this.upstreamStatus = options.upstreamStatus;
  }

  override toJSON(): Readonly<Record<string, unknown>> {
    return {
      ...super.toJSON(),
      provider: this.provider,
      ...(this.endpoint ? { endpoint: this.endpoint } : {}),
      ...(this.requestId ? { requestId: this.requestId } : {}),
      ...(this.upstreamStatus
        ? { upstreamStatus: this.upstreamStatus }
        : {}),
    };
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function normalizeError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError("UNKNOWN_ERROR", "An unexpected error occurred.", {
      cause: error,
    });
  }

  return new AppError("UNKNOWN_ERROR", "An unexpected error occurred.");
}
