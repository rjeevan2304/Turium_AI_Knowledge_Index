import type { z } from 'zod';
import { badRequest } from '../errors.js';

/** Parses a value with a Zod schema, throwing a 400 AppError with field-level details on failure. */
export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
    throw badRequest('Request validation failed', details);
  }
  return result.data;
}
