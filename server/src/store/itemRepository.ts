import type { AppDatabase } from './database.js';

export type ItemType = 'note' | 'url';
export type ItemStatus = 'pending' | 'ready' | 'failed';

export interface ItemRecord {
  id: string;
  type: ItemType;
  title: string;
  sourceUrl: string | null;
  rawContent: string | null;
  status: ItemStatus;
  error: string | null;
  createdAt: string;
}

export interface ItemSummary extends Omit<ItemRecord, 'rawContent'> {
  chunkCount: number;
  /** First part of the content, whitespace collapsed, for display in lists. */
  preview: string;
}

const PREVIEW_LENGTH = 200;

export interface NewItem {
  id: string;
  type: ItemType;
  title: string;
  sourceUrl: string | null;
  rawContent: string;
  status: ItemStatus;
  createdAt: string;
}

interface ItemRow {
  id: string;
  type: ItemType;
  title: string;
  source_url: string | null;
  raw_content: string | null;
  status: ItemStatus;
  error: string | null;
  created_at: string;
}

interface SummaryRow extends Omit<ItemRow, 'raw_content'> {
  chunk_count: number;
  preview: string | null;
}

const toRecord = (row: ItemRow): ItemRecord => ({
  id: row.id,
  type: row.type,
  title: row.title,
  sourceUrl: row.source_url,
  rawContent: row.raw_content,
  status: row.status,
  error: row.error,
  createdAt: row.created_at,
});

export class ItemRepository {
  constructor(private readonly db: AppDatabase) {}

  insert(item: NewItem): void {
    this.db
      .prepare(
        `INSERT INTO items (id, type, title, source_url, raw_content, status, created_at)
         VALUES (@id, @type, @title, @sourceUrl, @rawContent, @status, @createdAt)`,
      )
      .run(item);
  }

  findById(id: string): ItemRecord | undefined {
    const row = this.db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined;
    return row ? toRecord(row) : undefined;
  }

  findPending(): ItemRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM items WHERE status = 'pending' ORDER BY created_at")
      .all() as ItemRow[];
    return rows.map(toRecord);
  }

  listSummaries(): ItemSummary[] {
    const rows = this.db
      .prepare(
        `SELECT i.id, i.type, i.title, i.source_url, i.status, i.error, i.created_at,
                (SELECT COUNT(*) FROM chunks c WHERE c.item_id = i.id) AS chunk_count,
                substr(COALESCE(i.raw_content, ''), 1, ${PREVIEW_LENGTH}) AS preview
         FROM items i
         ORDER BY i.created_at DESC`,
      )
      .all() as SummaryRow[];
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      sourceUrl: row.source_url,
      status: row.status,
      error: row.error,
      createdAt: row.created_at,
      chunkCount: row.chunk_count,
      preview: (row.preview ?? '').replace(/\s+/g, ' ').trim(),
    }));
  }

  markReady(id: string, title: string, rawContent: string): void {
    this.db
      .prepare("UPDATE items SET status = 'ready', title = ?, raw_content = ?, error = NULL WHERE id = ?")
      .run(title, rawContent, id);
  }

  markFailed(id: string, error: string): void {
    this.db.prepare("UPDATE items SET status = 'failed', error = ? WHERE id = ?").run(error, id);
  }
}
