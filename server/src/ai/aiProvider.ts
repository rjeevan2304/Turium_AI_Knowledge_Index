/** A source passed to the answer model. `index` is the number the model cites, e.g. [1]. */
export interface AnswerSource {
  index: number;
  title: string;
  sourceUrl: string | null;
  text: string;
}

/**
 * The AI capabilities the app needs. Services depend on this interface, not on the
 * OpenAI SDK, so tests can substitute a fake implementation.
 */
export interface AiProvider {
  embed(texts: string[]): Promise<number[][]>;
  answer(question: string, sources: AnswerSource[]): Promise<string>;
}
