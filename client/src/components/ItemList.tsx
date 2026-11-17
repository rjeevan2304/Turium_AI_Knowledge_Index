import type { Item, ItemStatus } from '../api/client';

interface ItemListProps {
  items: Item[];
  loading: boolean;
  error: string | null;
}

const STATUS_LABELS: Record<ItemStatus, string> = {
  pending: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
};

export function ItemList({ items, loading, error }: ItemListProps) {
  return (
    <section className="panel" aria-labelledby="items-heading">
      <h2 id="items-heading">Saved items</h2>

      {loading && <p className="muted">Loading…</p>}
      {error && (
        <p className="status-error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="muted">Nothing saved yet. Add a note or a URL to get started.</p>
      )}

      <ul className="item-list">
        {items.map((item) => (
          <li key={item.id} className="item">
            <div className="item-header">
              <span className="badge">{item.type === 'note' ? 'Note' : 'URL'}</span>
              <span className={`status status-${item.status}`}>{STATUS_LABELS[item.status]}</span>
            </div>
            <strong className="item-title">{item.title}</strong>
            {item.preview && item.preview !== item.title && <p className="item-preview">{item.preview}</p>}
            {item.sourceUrl && (
              <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="item-url">
                {item.sourceUrl}
              </a>
            )}
            {item.status === 'ready' && (
              <span className="muted">
                {item.chunkCount} {item.chunkCount === 1 ? 'chunk' : 'chunks'} indexed
              </span>
            )}
            {item.status === 'failed' && item.error && <span className="status-error">{item.error}</span>}
            <span className="muted small">{new Date(item.createdAt).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
