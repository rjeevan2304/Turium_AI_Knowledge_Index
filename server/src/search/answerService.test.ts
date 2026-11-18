import { describe, expect, it } from 'vitest';
import { parseCitedIndices } from './answerService.js';

describe('parseCitedIndices', () => {
  it('reads single and adjacent citations', () => {
    expect([...parseCitedIndices('A [1] and B [2][3].')]).toEqual([1, 2, 3]);
  });

  it('reads comma-separated citations', () => {
    expect([...parseCitedIndices('Both say so [1, 4].')]).toEqual([1, 4]);
  });

  it('ignores text in brackets that is not a citation', () => {
    expect(parseCitedIndices('See [note] and [a, b].').size).toBe(0);
  });
});
