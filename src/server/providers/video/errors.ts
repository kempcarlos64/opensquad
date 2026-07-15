export class VideoProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      code: string;
      retryable?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "VideoProviderError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;
  }
}

export class VideoProviderHttpError extends VideoProviderError {
  readonly statusCode: number;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    options: {
      statusCode: number;
      providerCode: string | null;
      retryAfterSeconds: number | null;
    },
  ) {
    const retryable =
      options.statusCode === 408 ||
      options.statusCode === 409 ||
      options.statusCode === 429 ||
      options.statusCode >= 500;

    super(message, {
      code: options.providerCode ?? `http_${options.statusCode}`,
      retryable,
    });
    this.name = "VideoProviderHttpError";
    this.statusCode = options.statusCode;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}
