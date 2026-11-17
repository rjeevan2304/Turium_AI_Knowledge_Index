import { z } from 'zod';

export const MAX_NOTE_CHARS = 50_000;
export const MAX_QUESTION_CHARS = 1_000;
export const MAX_URL_CHARS = 2_048;

export const ingestBodySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('note'),
    text: z
      .string({ error: 'text is required for notes' })
      .trim()
      .min(1, 'Note text cannot be empty')
      .max(MAX_NOTE_CHARS, `Note text must be at most ${MAX_NOTE_CHARS} characters`),
  }),
  z.object({
    type: z.literal('url'),
    url: z
      .string({ error: 'url is required for URLs' })
      .trim()
      .min(1, 'URL cannot be empty')
      .max(MAX_URL_CHARS, `URL must be at most ${MAX_URL_CHARS} characters`),
  }),
], { error: "type must be either 'note' or 'url'" });

export const queryBodySchema = z.object({
  question: z
    .string({ error: 'question is required' })
    .trim()
    .min(1, 'Question cannot be empty')
    .max(MAX_QUESTION_CHARS, `Question must be at most ${MAX_QUESTION_CHARS} characters`),
});
