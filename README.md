# AI Knowledge Inbox

A small web app for saving notes and web links, then asking questions across them. Answers are generated with retrieval-augmented generation (RAG) and cite the saved sources they came from.

- **Backend:** Node.js 20+, Express 5, TypeScript, SQLite (`better-sqlite3`), OpenAI API
- **Frontend:** React 19, Vite, TypeScript (plain CSS, no UI library)

## Quick start

You need Node.js 20 or newer and an OpenAI API key.

```bash
npm run install:all
cp server/.env.example server/.env
# Edit server/.env and set OPENAI_API_KEY
npm run dev
```

Then open http://localhost:5173. The API runs on http://localhost:3001, and the frontend proxies `/ingest`, `/items` and `/query` to it.

To run the tests (no OpenAI key needed; they use a fake AI provider):

```bash
npm test
```

## Configuration

All settings live in `server/.env`. See `server/.env.example` for the full list.

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | (required) | Used for embeddings and answers |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | Model that writes the answer |
| `DB_PATH` | `./data/inbox.db` | SQLite file (created on first run) |
| `RETRIEVAL_TOP_K` | `5` | Chunks passed to the model per question |
| `MIN_SIMILARITY` | `0.25` | Chunks scoring below this are ignored |
| `CHUNK_MAX_CHARS` | `1500` | Maximum chunk size |
| `CHUNK_OVERLAP_CHARS` | `200` | Overlap carried into the next chunk |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` |

## API

All errors share one envelope: `{ "error": { "code", "message", "details?" } }`.

### `POST /ingest`: save a note or URL

Processing (fetching, chunking, embedding) happens in the background, so this returns immediately.

```bash
curl -X POST localhost:3001/ingest -H 'content-type: application/json' \
  -d '{"type":"note","text":"Retrieval augmented generation grounds answers in saved sources."}'

curl -X POST localhost:3001/ingest -H 'content-type: application/json' \
  -d '{"type":"url","url":"https://example.com/article"}'
```

- `202 Accepted`: `{ "id", "type", "status": "pending" }`
- `400`: invalid body, an empty note, or a URL that is malformed, not http(s), or contains credentials

Fetch failures (unreachable page, no readable text, private address) happen after the response. They appear on the item as `status: "failed"` with an `error` message in `GET /items`.

### `GET /items`: list saved items

Returns metadata only, newest first. Raw content is not included.

```json
{
  "items": [
    {
      "id": "…", "type": "url", "title": "Article title",
      "sourceUrl": "https://example.com/article", "status": "ready",
      "error": null, "createdAt": "2026-11-17T10:00:00.000Z", "chunkCount": 7
    }
  ]
}
```

### `POST /query`: ask a question

```bash
curl -X POST localhost:3001/query -H 'content-type: application/json' \
  -d '{"question":"What grounds answers in RAG?"}'
```

```json
{
  "answer": "RAG grounds answers in the saved sources [1].",
  "sources": [
    {
      "index": 1, "itemId": "…", "title": "Note title", "sourceUrl": null,
      "chunkIndex": 0, "snippet": "…", "score": 0.61, "citedInAnswer": true
    }
  ]
}
```

- If nothing is similar enough, the response is a fixed "couldn't find anything relevant" answer with `sources: []`. The model is not called.
- `502` means OpenAI failed. The message says which operation failed.

## How it works

1. **Ingest.** A note's text is stored as-is. For a URL, the server fetches the page, extracts the main article text with Mozilla Readability, and stores that text.
2. **Chunk.** Text is split on paragraph boundaries and packed into chunks of up to `CHUNK_MAX_CHARS`. Each new chunk starts with the last `CHUNK_OVERLAP_CHARS` of the previous one, so a sentence that spans a boundary is still retrievable.
3. **Embed.** Chunks are embedded in batches of 100 with `text-embedding-3-small`. Vectors are stored as `Float32` blobs in SQLite.
4. **Retrieve.** A question is embedded the same way. Every chunk from a ready item is scored by cosine similarity, filtered by `MIN_SIMILARITY`, and the top `RETRIEVAL_TOP_K` are kept.
5. **Answer.** The chunks are passed to the chat model as numbered sources, with instructions to answer only from them and cite them as `[n]`. The response maps the cited numbers back to the sources and marks which ones were used.

## Design decisions and tradeoffs

### Chunking
Paragraphs are the natural unit of meaning in notes and articles, so chunks respect paragraph boundaries and only split inside a paragraph when it is too long. The default size of about 1,500 characters (roughly 350 tokens) is a balance: smaller chunks match more precisely but lose surrounding context, and larger chunks dilute the embedding with unrelated text. The 200-character overlap protects answers that span a boundary. The cost is some duplicated text in the index, which is small for this data.

### Vector store: SQLite with an exhaustive scan
Embeddings are stored in the same SQLite file as the items, and every query scores all chunks in memory. This is the simplest thing that works. It needs no extra service, the data stays transactionally consistent with the items table, and for a personal inbox with thousands of chunks the scan takes milliseconds. The tradeoff is that the scan cost grows linearly, and each query loads every embedding into memory. See "What breaks at scale" below.

### Asynchronous ingestion
Fetching a page and calling the embedding API can take seconds, so `POST /ingest` returns `202` and the work runs on a background queue. The queue is in-process and processes one item at a time, which keeps OpenAI usage and memory predictable. Failures are recorded on the item instead of thrown back to the caller, which lets the frontend show exactly what went wrong. Pending items are re-queued on startup, so a restart does not leave them stuck. The tradeoff is that a crash mid-item can lose in-flight work, and the queue does not survive a multi-instance deployment.

### Security: fetching arbitrary URLs
Fetching user-supplied URLs server-side is a classic SSRF risk, so `UrlFetcher` does the following:
- accepts only `http` and `https`, and rejects embedded credentials;
- resolves the hostname before each request and refuses private, loopback, link-local and similar addresses, including IPv4-mapped IPv6;
- follows redirects manually, with a limit of 3, re-running the same checks at every hop;
- applies a 10-second timeout and a 2 MB size limit;
- runs no page scripts (jsdom's script execution is off).

A DNS-rebinding attack could still change the address between the check and the connection. Closing that gap fully needs a connect-time address check, which I've noted as a production change.

### Prompt design and prompt injection
Fetched pages are untrusted. The system prompt tells the model that source text is data and that instructions inside it should be ignored, and answers are restricted to the provided sources. This reduces the risk but does not remove it, so the model's citations should still be read as claims about the sources, not as verified facts.

### Errors and status codes
Every error uses one envelope. Client errors are `400` with field-level `details` from Zod. Malformed JSON is a `400`, not a `500`. Upstream OpenAI failures are `502`. Anything unexpected is logged with a stack trace and returned as a generic `500`, so internals never leak to clients. Logs are structured JSON from `pino` with a request id per HTTP call.

### Code structure
- `routes/` only parse input and map HTTP to services.
- `services/` (`IngestService`, `AnswerService`) hold the logic and depend on interfaces.
- `store/` holds SQL and nothing else.
- `ai/` is the only code that knows about OpenAI. Services depend on the `AiProvider` interface, so tests use a fake.
- `index.ts` is the single composition root that wires everything together.

## What breaks at scale

- **Query latency.** Each query loads and scores every chunk. At around 100k chunks (a few hundred MB of embeddings) latency becomes noticeable, and at a million chunks it is not usable.
- **Memory.** Embeddings are loaded per query. Caching them in memory, or moving them to a vector index, removes this.
- **Single process.** The job queue, the SQLite file and the server all run in one process. Scaling out needs a shared queue and a shared database.
- **Re-embedding.** Changing `OPENAI_EMBEDDING_MODEL` makes existing vectors incompatible. Nothing currently detects this, so stored vectors would need a manual re-ingest.
- **Cost.** Every question costs one embedding call and one chat call. Nothing caches repeated questions.
- **Write contention.** SQLite allows one writer at a time. That is fine for one user but would limit concurrent ingestion.

## Production changes (not implemented)

- **Storage:** Postgres with `pgvector` (or a dedicated vector DB) with an ANN index such as HNSW, replacing the full scan.
- **Queue:** a durable job queue (for example BullMQ on Redis) with retries, backoff and dead-letter handling, replacing the in-process queue.
- **Ingestion:** a connect-time address check to close the DNS-rebinding gap, plus a per-host rate limit and robots.txt handling.
- **Retrieval quality:** hybrid search (keyword and vector, combined with reciprocal rank fusion), a reranker over the top candidates, and a stored embedding model version per chunk.
- **Answers:** streaming responses, and caching of embeddings and of answers to repeated questions.
- **Evaluation:** a small labelled question set, measuring retrieval recall and whether answers are faithful to their citations, run in CI.
- **Auth and multi-tenancy:** per-user scoping of items and queries. Deliberately out of scope here, as the brief asks.
- **Observability:** metrics for ingest duration, failure rate, embedding and chat latency and token usage.
- **Query caching:** keep chunk vectors in memory and update the cache when an item becomes ready, instead of reloading every embedding per question. Skipped here because it adds invalidation logic that the assignment's scope doesn't need.
- **Top-k selection:** use a bounded heap (or the vector index's own top-k) instead of sorting every score and slicing.
- **Item list query:** replace the per-row chunk-count subquery with a single join and aggregate.
- **Pagination:** add `limit` and `cursor` parameters to `GET /items`, so the client's polling doesn't return every item on every request.

## Project layout

```
server/src/
  index.ts              composition root (wires services together)
  config.ts             typed, validated environment config
  logger.ts, errors.ts  structured logging and error types
  ai/                   OpenAI provider behind an AiProvider interface
  ingest/               chunker, URL fetcher (SSRF guard), ingest service and queue
  search/               cosine similarity, answer service (retrieve + answer)
  store/                SQLite schema and repositories
  http/                 Express app, routes, validation, error handling
client/src/
  api/client.ts         typed API client
  hooks/                useItems (polls while processing), useAskQuestion
  components/           AddItemForm, ItemList, AskPanel
```

## Known limitations

- The frontend is intentionally minimal. There is no delete or edit for saved items.
- Only `text/html` pages are supported. PDFs and other formats are rejected.
- URL content is stored as extracted text, not the raw HTML.
- The app is single-user with no authentication.
- Vite is pinned to version 6 because newer versions need a newer Node runtime than the 20.17 this project was built against.
