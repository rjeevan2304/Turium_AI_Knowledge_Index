import { Router } from 'express';
import type { AnswerService } from '../../search/answerService.js';
import { queryBodySchema } from '../schemas.js';
import { parseOrThrow } from '../validation.js';

export function createQueryRouter(answers: AnswerService): Router {
  const router = Router();

  // POST /query: answer a question from saved items, with cited sources.
  router.post('/', async (req, res) => {
    const body = parseOrThrow(queryBodySchema, req.body);
    const result = await answers.ask(body.question);
    res.json(result);
  });

  return router;
}
