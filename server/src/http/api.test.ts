import request from 'supertest';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AiProvider, AnswerSource } from '../ai/aiProvider.js';
import { IngestService } from '../ingest/ingestService.js';
import { UrlFetcher } from '../ingest/urlFetcher.js';
import { AnswerService } from '../search/answerService.js';
import { openDatabase, type AppDatabase } from '../store/database.js';
import { ChunkRepository } from '../store/chunkRepository.js';
import { ItemRepository } from '../store/itemRepository.js';
import { createApp } from './app.js';

const silentLogger = pino({ level: 'silent' });

/** Deterministic fake: vectors reflect two topics, so retrieval is predictable. */
class FakeAi implements AiProvider {
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const lower = text.toLowerCase();
      return [lower.includes('cat') ? 1 : 0, lower.includes('stock') ? 1 : 0, 0.01];
    });
  }

  async answer(_question: string, sources: AnswerSource[]): Promise<string> {
    return `The notes say the cat sleeps a lot [${sources[0].index}].`;
  }
}

function buildApp(db: AppDatabase, minSimilarity = 0.25) {
  const items = new ItemRepository(db);
  const chunks = new ChunkRepository(db);
  const ai = new FakeAi();
  const ingest = new IngestService({
    items,
    chunks,
    ai,
    fetcher: new UrlFetcher(),
    logger: silentLogger,
    chunking: { maxChars: 500, overlapChars: 50 },
  });
  const answers = new AnswerService({ ai, chunks, topK: 5, minSimilarity });
  return createApp({ logger: silentLogger, ingest, answers, items });
}

async function waitForStatus(app: ReturnType<typeof buildApp>, id: string, status: string) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const res = await request(app).get('/items');
    const item = res.body.items.find((candidate: { id: string }) => candidate.id === id);
    if (item?.status === status) return item;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Item ${id} never reached status ${status}`);
}

describe('Knowledge Inbox API', () => {
  let db: AppDatabase;
  beforeEach(() => {
    db = openDatabase(':memory:');
  });
  afterEach(() => {
    db.close();
  });

  describe('POST /ingest', () => {
    it('accepts a note with 202 and processes it in the background', async () => {
      const app = buildApp(db);
      const res = await request(app).post('/ingest').send({ type: 'note', text: 'My cat sleeps a lot.' });

      expect(res.status).toBe(202);
      expect(res.body).toEqual({ id: expect.any(String), type: 'note', status: 'pending' });
      const item = await waitForStatus(app, res.body.id, 'ready');
      expect(item.title).toBe('My cat sleeps a lot.');
      expect(item.chunkCount).toBe(1);
    });

    it('returns 400 with field details for an empty note', async () => {
      const res = await request(buildApp(db)).post('/ingest').send({ type: 'note', text: '   ' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details[0].path).toBe('text');
    });

    it('returns 400 for an unknown ingest type', async () => {
      const res = await request(buildApp(db)).post('/ingest').send({ type: 'video', url: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for a URL with an unsupported scheme', async () => {
      const res = await request(buildApp(db)).post('/ingest').send({ type: 'url', url: 'ftp://example.com/file' });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/Only http and https/);
    });

    it('returns 400 for malformed JSON', async () => {
      const res = await request(buildApp(db))
        .post('/ingest')
        .set('Content-Type', 'application/json')
        .send('{"type": "note"');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_JSON');
    });

    it('marks a URL that points at a private address as failed, without fetching it', async () => {
      const app = buildApp(db);
      const res = await request(app).post('/ingest').send({ type: 'url', url: 'http://127.0.0.1/admin' });
      expect(res.status).toBe(202);

      const item = await waitForStatus(app, res.body.id, 'failed');
      expect(item.error).toMatch(/private or local network/);
    });
  });

  describe('GET /items', () => {
    it('lists saved items newest first without raw content', async () => {
      const app = buildApp(db);
      await request(app).post('/ingest').send({ type: 'note', text: 'First note about cats.' });
      const second = await request(app).post('/ingest').send({ type: 'note', text: 'Second note.' });
      await waitForStatus(app, second.body.id, 'ready');

      const res = await request(app).get('/items');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].title).toBe('Second note.');
      expect(res.body.items[0]).not.toHaveProperty('rawContent');
    });
  });

  describe('POST /query', () => {
    it('answers from the most relevant note and marks the cited source', async () => {
      const app = buildApp(db);
      const ingested = await request(app).post('/ingest').send({ type: 'note', text: 'My cat sleeps a lot.' });
      await waitForStatus(app, ingested.body.id, 'ready');

      const res = await request(app).post('/query').send({ question: 'How does my cat behave?' });
      expect(res.status).toBe(200);
      expect(res.body.answer).toContain('[1]');
      expect(res.body.sources).toHaveLength(1);
      expect(res.body.sources[0]).toMatchObject({
        itemId: ingested.body.id,
        title: 'My cat sleeps a lot.',
        citedInAnswer: true,
      });
    });

    it('returns a clear "nothing relevant" answer when no saved content matches', async () => {
      const res = await request(buildApp(db, 0.9)).post('/query').send({ question: 'anything at all' });
      expect(res.status).toBe(200);
      expect(res.body.sources).toEqual([]);
      expect(res.body.answer).toMatch(/couldn't find anything relevant/);
    });

    it('returns 400 for an empty question', async () => {
      const res = await request(buildApp(db)).post('/query').send({ question: '' });
      expect(res.status).toBe(400);
    });
  });

  it('returns the error envelope for unknown routes', async () => {
    const res = await request(buildApp(db)).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
