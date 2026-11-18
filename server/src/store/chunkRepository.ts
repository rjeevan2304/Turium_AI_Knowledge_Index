import type { AppDatabase } from './database.js';

export interface ChunkToStore {
  chunkIndex: number;
  text: string;
  embedding: number[];
}

export interface StoredChunk {
  itemId: string;
  itemTitle: string;
  sourceUrl: string | null;
  chunkIndex: number;
  text: string;
  embedding: Float32Array;
}

interface StoredChunkRow {
  item_id: string;
  item_title: string;
  source_url: string | null;
  chunk_index: number;
  text: string;
  embedding: Buffer;
}

export class ChunkRepository {
  constructor(private readonly db: AppDatabase) {}

  /** Replaces all chunks for an item in one transaction. The caller marks the item ready. */
  saveChunksForItem(itemId: string, chunks: ChunkToStore[]): void {
    const insert = this.db.prepare(
      'INSERT INTO chunks (item_id, chunk_index, text, embedding) VALUES (?, ?, ?, ?)',
    );
    const write = this.db.transaction((rows: ChunkToStore[]) => {
      this.db.prepare('DELETE FROM chunks WHERE item_id = ?').run(itemId);
      for (const chunk of rows) {
        insert.run(itemId, chunk.chunkIndex, chunk.text, toBlob(chunk.embedding));
      }
    });
    write(chunks);
  }

  /** Loads every chunk belonging to items that finished ingestion successfully. */
  findAllReadyChunks(): StoredChunk[] {
    const rows = this.db
      .prepare(
        `SELECT c.item_id, i.title AS item_title, i.source_url, c.chunk_index, c.text, c.embedding
         FROM chunks c
         JOIN items i ON i.id = c.item_id
         WHERE i.status = 'ready'`,
      )
      .all() as StoredChunkRow[];
    return rows.map((row) => ({
      itemId: row.item_id,
      itemTitle: row.item_title,
      sourceUrl: row.source_url,
      chunkIndex: row.chunk_index,
      text: row.text,
      embedding: fromBlob(row.embedding),
    }));
  }
}

function toBlob(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer);
}

function fromBlob(blob: Buffer): Float32Array {
  // Copy into an aligned buffer; Node Buffers may share a pool with an unaligned offset.
  const copy = new Uint8Array(blob.length);
  copy.set(blob);
  return new Float32Array(copy.buffer);
}
