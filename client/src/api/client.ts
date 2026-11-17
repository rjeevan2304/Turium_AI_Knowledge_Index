/** Shapes returned by the Knowledge Inbox API. Kept in sync with server/src by hand. */
export type ItemType = 'note' | 'url';
export type ItemStatus = 'pending' | 'ready' | 'failed';

export interface Item {
  id: string;
  type: ItemType;
  title: string;
  sourceUrl: string | null;
  status: ItemStatus;
  error: string | null;
  createdAt: string;
  chunkCount: number;
}

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

export interface QueryResponse {
  answer: string;
  sources: QuerySource[];
}

export type IngestInput = { type: 'note'; text: string } | { type: 'url'; url: string };

/** Error thrown for any non-2xx response, carrying the server's message. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError('Could not reach the server. Is the API running?', 0);
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message: string = body?.error?.message ?? `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export const api = {
  listItems: () => request<{ items: Item[] }>('/items'),

  ingest: (input: IngestInput) =>
    request<{ id: string; type: ItemType; status: ItemStatus }>('/ingest', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  query: (question: string) =>
    request<QueryResponse>('/query', {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),
};
