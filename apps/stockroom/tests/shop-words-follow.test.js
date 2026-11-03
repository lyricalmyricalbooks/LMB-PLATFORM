import { afterEach, describe, expect, it } from 'vitest';
import { SELLS_KEY, currentAnswer, noteSellsAnswer } from '../src/lib/shop-words.js';

afterEach(() => localStorage.clear());

describe('the stockroom follows what the shop sells', () => {
  it('uses the profile until the owner changes it', () => {
    expect(currentAnswer({ sells: 'clothing' }, null)).toBe('clothing');
    expect(currentAnswer({ sells: 'clothing' }, 'books')).toBe('books');
    expect(currentAnswer({ sells: 'clothing' }, 'nonsense')).toBe('clothing');
  });
  it('asks for a fresh start only when the words change between books and goods', () => {
    expect(noteSellsAnswer('clothing', { sells: 'books' })).toBe(true);
    expect(localStorage.getItem(SELLS_KEY)).toBe('clothing');
    expect(noteSellsAnswer('clothing', { sells: 'books' })).toBe(false);
  });
  it('does not restart for a move inside the same words, an unknown answer or no answer', () => {
    expect(noteSellsAnswer('zines', { sells: 'books' })).toBe(false);
    localStorage.clear();
    expect(noteSellsAnswer('shoes', { sells: 'clothing' })).toBe(false);
    expect(noteSellsAnswer('banana', { sells: 'books' })).toBe(false);
    expect(noteSellsAnswer(null, { sells: 'books' })).toBe(false);
  });
});

import { ACK_KEY, wordsReported, wordsToReport } from '../src/lib/shop-words.js';

describe('telling the shop which words the stockroom shows', () => {
  it('has nothing to say until the owner changed the answer', () => {
    expect(wordsToReport({ sells: 'books' })).toBeNull();
  });
  it('reports a changed answer once the page shows it, and only once', () => {
    localStorage.setItem(SELLS_KEY, 'clothing');
    expect(wordsToReport({ sells: 'books' })).toBe('clothing');
    wordsReported('clothing');
    expect(localStorage.getItem(ACK_KEY)).toBe('clothing');
    expect(wordsToReport({ sells: 'books' })).toBeNull();
  });
});
