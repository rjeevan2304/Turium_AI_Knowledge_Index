import { useState } from 'react';
import { api, type QueryResponse } from '../api/client';

/** Owns the question form state and the most recent answer. */
export function useAskQuestion() {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    const trimmed = question.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      setResult(await api.query(trimmed));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return { question, setQuestion, result, submitting, error, ask };
}
