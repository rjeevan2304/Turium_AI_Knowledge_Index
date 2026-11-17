import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { OpenAIProvider } from './ai/openaiProvider.js';
import { createApp } from './http/app.js';
import { IngestService } from './ingest/ingestService.js';
import { UrlFetcher } from './ingest/urlFetcher.js';
import { AnswerService } from './search/answerService.js';
import { openDatabase } from './store/database.js';
import { ChunkRepository } from './store/chunkRepository.js';
import { ItemRepository } from './store/itemRepository.js';

/**
 * Composition root: the only place where concrete implementations are wired together.
 * Everything else depends on the interfaces and repositories it is given.
 */
function main(): void {
  const config = loadConfig();

  const db = openDatabase(config.DB_PATH);
  const items = new ItemRepository(db);
  const chunks = new ChunkRepository(db);

  const ai = new OpenAIProvider({
    apiKey: config.OPENAI_API_KEY,
    embeddingModel: config.OPENAI_EMBEDDING_MODEL,
    chatModel: config.OPENAI_CHAT_MODEL,
    logger,
  });

  const ingest = new IngestService({
    items,
    chunks,
    ai,
    fetcher: new UrlFetcher(),
    logger,
    chunking: { maxChars: config.CHUNK_MAX_CHARS, overlapChars: config.CHUNK_OVERLAP_CHARS },
  });
  ingest.recoverPending();

  const answers = new AnswerService({
    ai,
    chunks,
    topK: config.RETRIEVAL_TOP_K,
    minSimilarity: config.MIN_SIMILARITY,
  });

  const app = createApp({ logger, ingest, answers, items });
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, db: config.DB_PATH }, 'Knowledge Inbox API listening');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

try {
  main();
} catch (error) {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
}
