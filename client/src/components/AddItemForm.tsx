import { useState, type FormEvent } from 'react';
import { api, ApiError, type ItemType } from '../api/client';

interface AddItemFormProps {
  onAdded: () => void;
}

export function AddItemForm({ onAdded }: AddItemFormProps) {
  const [type, setType] = useState<ItemType>('note');
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const input = type === 'note' ? { type, text: trimmed } : { type, url: trimmed };
      await api.ingest(input);
      setValue('');
      setMessage(type === 'note' ? 'Note saved. Processing…' : 'URL added. Fetching the page…');
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this item');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit} aria-labelledby="add-heading">
      <h2 id="add-heading">Add to your inbox</h2>

      <div className="segmented" role="radiogroup" aria-label="Item type">
        {(['note', 'url'] as const).map((option) => (
          <label key={option} className={type === option ? 'segment selected' : 'segment'}>
            <input
              type="radio"
              name="type"
              value={option}
              checked={type === option}
              onChange={() => setType(option)}
            />
            {option === 'note' ? 'Text note' : 'URL'}
          </label>
        ))}
      </div>

      {type === 'note' ? (
        <textarea
          aria-label="Note text"
          placeholder="Paste or type a note…"
          rows={5}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      ) : (
        <input
          aria-label="Page URL"
          type="url"
          placeholder="https://example.com/article"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      )}

      <div className="form-footer">
        <button type="submit" disabled={submitting || !value.trim()}>
          {submitting ? 'Saving…' : 'Save'}
        </button>
        {message && <span className="status-ok">{message}</span>}
        {error && (
          <span className="status-error" role="alert">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
