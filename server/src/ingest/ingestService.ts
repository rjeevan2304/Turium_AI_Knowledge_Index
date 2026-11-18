import { randomUUID } from 'node:crypto';
import type { AiProvider } from '../ai/aiProvider.js';
import type { Logger } from '../logger.js';
import type { ChunkRepository } from '../store/chunkRepository.js';
import type { ItemRepository, ItemRecord, NewItem } from '../store/itemRepository.js';
import { chunkText } from './chunker.js';
import { buildEmbeddingText } from './embeddingText.js';
import type { UrlFetcher } from './urlFetcher.js';

export interface IngestServiceDeps {
  items: ItemRepository;
  chunks: ChunkRepository;
  ai: AiProvider;
  fetcher: UrlFetcher;
  logger: Logger;
  chunking: { maxChars: number; overlapChars: number };
}

const EMBEDDING_BATCH_SIZE = 100;
const NOTE_TITLE_LENGTH = 60;

/**
 * Accepts notes and URLs, stores them as `pending`, and processes them in the background
 * (fetch, chunk, embed, store). Processing is sequential, which keeps OpenAI usage and
 * memory predictable. The queue is in-process, so pending items are re-queued on startup.
 */
export class IngestService {
  private readonly queue: string[] = [];
  private draining = false;

  constructor(private readonly deps: IngestServiceDeps) {}

  createNote(text: string): NewItem {
    const item: NewItem = {
      id: randomUUID(),
      type: 'note',
      title: deriveNoteTitle(text),
      sourceUrl: null,
      rawContent: text,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.deps.items.insert(item);
    this.enqueue(item.id);
    return item;
  }

  createUrl(url: string): NewItem {
    const item: NewItem = {
      id: randomUUID(),
      type: 'url',
      title: new URL(url).hostname,
      sourceUrl: url,
      rawContent: '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.deps.items.insert(item);
    this.enqueue(item.id);
    return item;
  }

  /** Re-queues items that were still pending when the server last stopped. */
  recoverPending(): void {
    for (const item of this.deps.items.findPending()) {
      this.enqueue(item.id);
    }
  }

  private enqueue(itemId: string): void {
    this.queue.push(itemId);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const itemId = this.queue.shift() as string;
        try {
          await this.processItem(itemId);
        } catch (error) {
          // processItem records failures itself; this only catches a failure to record one.
          this.deps.logger.error({ err: error, itemId }, 'Could not update item after processing');
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async processItem(itemId: string): Promise<void> {
    const log = this.deps.logger.child({ itemId });
    const item = this.deps.items.findById(itemId);
    if (!item || item.status !== 'pending') return;

    const startedAt = Date.now();
    try {
      const { title, text } = await this.loadContent(item);
      const pieces = chunkText(text, this.deps.chunking);
      if (pieces.length === 0) throw new Error('No text to index');

      const embeddingInputs = pieces.map((piece) =>
        buildEmbeddingText({ title, sourceType: item.type, sourceUrl: item.sourceUrl }, piece),
      );
      const embeddings = await this.embedInBatches(embeddingInputs);
      this.deps.chunks.saveChunksForItem(
        itemId,
        pieces.map((chunkTextValue, chunkIndex) => ({
          chunkIndex,
          text: chunkTextValue,
          embedding: embeddings[chunkIndex],
        })),
      );
      this.deps.items.markReady(itemId, title, text);
      log.info({ chunks: pieces.length, durationMs: Date.now() - startedAt }, 'Item ingested');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ingestion failed';
      this.deps.items.markFailed(itemId, message);
      log.warn({ err: error, durationMs: Date.now() - startedAt }, 'Item ingestion failed');
    }
  }

  private async loadContent(item: ItemRecord): Promise<{ title: string; text: string }> {
    if (item.type === 'note') {
      return { title: item.title, text: item.rawContent ?? '' };
    }
    const article = await this.deps.fetcher.fetchArticle(item.sourceUrl ?? '');
    return { title: article.title, text: article.text };
  }

  private async embedInBatches(pieces: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    for (let start = 0; start < pieces.length; start += EMBEDDING_BATCH_SIZE) {
      const batch = pieces.slice(start, start + EMBEDDING_BATCH_SIZE);
      embeddings.push(...(await this.deps.ai.embed(batch)));
    }
    return embeddings;
  }
}

function deriveNoteTitle(text: string): string {
  const firstLine = text.split('\n').find((line) => line.trim().length > 0)?.trim() ?? 'Untitled note';
  return firstLine.length > NOTE_TITLE_LENGTH ? `${firstLine.slice(0, NOTE_TITLE_LENGTH - 1)}…` : firstLine;
}
