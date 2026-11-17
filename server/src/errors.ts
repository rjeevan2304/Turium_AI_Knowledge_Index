/**
 * Errors that are safe to show to API clients. Anything else is treated as an
 * internal error and reported with a generic message.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'VALIDATION_ERROR', message, details);

export const notFound = (message: string) => new AppError(404, 'NOT_FOUND', message);

export const upstreamFailure = (message: string) => new AppError(502, 'UPSTREAM_ERROR', message);
