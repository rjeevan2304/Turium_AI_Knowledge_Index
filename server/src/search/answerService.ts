import type { AiProvider, AnswerSource } from '../ai/aiProvider.js';
import type { ChunkRepository, StoredChunk } from '../store/chunkRepository.js';
import { cosineSimilarity } from './vectorMath.js';

export interface QuerySource {
  index: number;
  itemId: string;
  title: string;
  sourceUrl: string | null;
  chunkIndex: number;
  snippet: string;
  score: number;
  citedInAnswer: boolean;
}

export interface QueryResult {
  answer: string;
  sources: QuerySource[];
}

export interface AnswerServiceOptions {
  ai: AiProvider;
  chunks: ChunkRepository;
  topK: number;
  minSimilarity: number;
}

export const NO_RELEVANT_CONTENT_ANSWER =
  "I couldn't find anything relevant in your saved items to answer that.";

const SNIPPET_LENGTH = 300;

/** Retrieval-augmented answering: embed the question, find the closest chunks, ask the model. */
export class AnswerService {
  constructor(private readonly options: AnswerServiceOptions) {}

  async ask(question: string): Promise<QueryResult> {
    const [questionVector] = await this.options.ai.embed([question]);
    const retrieved = this.retrieve(questionVector);

    if (retrieved.length === 0) {
      return { answer: NO_RELEVANT_CONTENT_ANSWER, sources: [] };
    }

    const answerSources: AnswerSource[] = retrieved.map((hit, position) => ({
      index: position + 1,
      title: hit.chunk.itemTitle,
      sourceUrl: hit.chunk.sourceUrl,
      text: hit.chunk.text,
    }));
    const answer = await this.options.ai.answer(question, answerSources);
    const citedIndices = parseCitedIndices(answer);

    const sources: QuerySource[] = retrieved.map((hit, position) => ({
      index: position + 1,
      itemId: hit.chunk.itemId,
      title: hit.chunk.itemTitle,
      sourceUrl: hit.chunk.sourceUrl,
      chunkIndex: hit.chunk.chunkIndex,
      snippet: toSnippet(hit.chunk.text),
      score: Number(hit.score.toFixed(4)),
      citedInAnswer: citedIndices.has(position + 1),
    }));
    return { answer, sources };
  }

  /**
   * Scores every stored chunk against the question. The corpus is small enough for an
   * exhaustive scan; see the README for when an index becomes necessary.
   */
  private retrieve(questionVector: number[]): Array<{ chunk: StoredChunk; score: number }> {
    const { chunks, topK, minSimilarity } = this.options;
    return chunks
      .findAllReadyChunks()
      .map((chunk) => ({ chunk, score: cosineSimilarity(questionVector, chunk.embedding) }))
      .filter((hit) => hit.score >= minSimilarity)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

function parseCitedIndices(answer: string): Set<number> {
  const indices = new Set<number>();
  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    indices.add(Number(match[1]));
  }
  return indices;
}

function toSnippet(text: string): string {
  return text.length <= SNIPPET_LENGTH ? text : `${text.slice(0, SNIPPET_LENGTH).trimEnd()}…`;
}
