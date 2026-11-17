import { Router } from 'express';
import type { ItemRepository } from '../../store/itemRepository.js';

export function createItemRouter(items: ItemRepository): Router {
  const router = Router();

  // GET /items: list saved items (metadata only, no full content).
  router.get('/', (_req, res) => {
    res.json({ items: items.listSummaries() });
  });

  return router;
}
