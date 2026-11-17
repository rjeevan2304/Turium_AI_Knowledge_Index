import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4o-mini'),
  PORT: z.coerce.number().int().positive().default(3001),
  DB_PATH: z.string().default('./data/inbox.db'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  RETRIEVAL_TOP_K: z.coerce.number().int().positive().default(5),
  MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.25),
  CHUNK_MAX_CHARS: z.coerce.number().int().positive().default(1500),
  CHUNK_OVERLAP_CHARS: z.coerce.number().int().nonnegative().default(200),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid configuration:\n${details.join('\n')}`);
  }
  if (parsed.data.CHUNK_OVERLAP_CHARS >= parsed.data.CHUNK_MAX_CHARS) {
    throw new Error('CHUNK_OVERLAP_CHARS must be smaller than CHUNK_MAX_CHARS');
  }
  return parsed.data;
}
