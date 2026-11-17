import type { FormEvent } from 'react';
import type { QueryResponse, QuerySource } from '../api/client';

interface AskPanelProps {
  question: string;
  onQuestionChange: (value: string) => void;
  onAsk: () => void;
  submitting: boolean;
  error: string | null;
  result: QueryResponse | null;
}

export function AskPanel({ question, onQuestionChange, onAsk, submitting, error, result }: AskPanelProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onAsk();
  };

  return (
    <section className="panel" aria-labelledby="ask-heading">
      <h2 id="ask-heading">Ask your inbox</h2>

      <form onSubmit={submit} className="ask-form">
        <input
          aria-label="Question"
          placeholder="What do my notes say about…?"
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
        />
        <button type="submit" disabled={submitting || !question.trim()}>
          {submitting ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      {error && (
        <p className="status-error" role="alert">
          {error}
        </p>
      )}

      {result && <AnswerView result={result} />}
    </section>
  );
}

function AnswerView({ result }: { result: QueryResponse }) {
  return (
    <div className="answer">
      <h3>Answer</h3>
      <p className="answer-text">{result.answer}</p>

      {result.sources.length > 0 && (
        <>
          <h3>Sources</h3>
          <ol className="source-list">
            {result.sources.map((source) => (
              <SourceCard key={`${source.itemId}-${source.chunkIndex}`} source={source} />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function SourceCard({ source }: { source: QuerySource }) {
  return (
    <li className={source.citedInAnswer ? 'source cited' : 'source'}>
      <div className="source-header">
        <span className="badge">[{source.index}]</span>
        <strong>{source.title}</strong>
        {source.citedInAnswer && <span className="muted small">cited</span>}
      </div>
      <p className="snippet">{source.snippet}</p>
      <span className="muted small">
        Relevance {(source.score * 100).toFixed(0)}%
        {source.sourceUrl && (
          <>
            {' · '}
            <a href={source.sourceUrl} target="_blank" rel="noreferrer">
              open page
            </a>
          </>
        )}
      </span>
    </li>
  );
}
