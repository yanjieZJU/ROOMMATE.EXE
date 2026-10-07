import type { ApiError } from "../shared/schemas";

export type ApiErrorCode = ApiError["error"]["code"];

export class AppError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AppError";
  }

  toJSON(): ApiError {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
        ...(this.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: this.retryAfterSeconds }),
      },
    };
  }
}
