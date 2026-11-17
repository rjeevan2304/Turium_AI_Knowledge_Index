import express, { type ErrorRequestHandler, type Express } from 'express';
import { pinoHttp } from 'pino-http';
import { AppError } from '../errors.js';
import type { Logger } from '../logger.js';
import type { IngestService } from '../ingest/ingestService.js';
import type { AnswerService } from '../search/answerService.js';
import type { ItemRepository } from '../store/itemRepository.js';
import { createIngestRouter } from './routes/ingestRoutes.js';
import { createItemRouter } from './routes/itemRoutes.js';
import { createQueryRouter } from './routes/queryRoutes.js';

export interface AppDependencies {
  logger: Logger;
  ingest: IngestService;
  answers: AnswerService;
  items: ItemRepository;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(pinoHttp({ logger: deps.logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/ingest', createIngestRouter(deps.ingest));
  app.use('/items', createItemRouter(deps.items));
  app.use('/query', createQueryRouter(deps.answers));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.use(errorHandler(deps.logger));
  return app;
}

/** Converts every thrown error into the { error: { code, message, details? } } envelope. */
function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (err instanceof AppError) {
      if (err.status >= 500) logger.error({ err }, 'Request failed');
      res.status(err.status).json({
        error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
      });
      return;
    }

    // Malformed JSON from the client is a client error, not a server error.
    if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } });
      return;
    }

    logger.error({ err, method: req.method, url: req.url }, 'Unhandled error');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server' } });
  };
}
