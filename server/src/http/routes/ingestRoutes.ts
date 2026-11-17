import { Router } from 'express';
import { badRequest } from '../../errors.js';
import type { IngestService } from '../../ingest/ingestService.js';
import { parsePublicHttpUrl } from '../../ingest/urlFetcher.js';
import { ingestBodySchema } from '../schemas.js';
import { parseOrThrow } from '../validation.js';

export function createIngestRouter(ingest: IngestService): Router {
  const router = Router();

  // POST /ingest: accept a note or URL and process it in the background.
  // Returns 202 because fetching and embedding happen after the response is sent.
  router.post('/', (req, res) => {
    const body = parseOrThrow(ingestBodySchema, req.body);

    if (body.type === 'note') {
      const item = ingest.createNote(body.text);
      res.status(202).json({ id: item.id, type: item.type, status: item.status });
      return;
    }

    try {
      parsePublicHttpUrl(body.url);
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : 'URL is not valid');
    }
    const item = ingest.createUrl(body.url);
    res.status(202).json({ id: item.id, type: item.type, status: item.status });
  });

  return router;
}
