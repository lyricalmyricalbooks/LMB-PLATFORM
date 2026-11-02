import { describe, expect, it } from 'vitest';
import { compare, lowered, describe as say, budgetFor } from './speedBudget.mjs';

const baseline = { 'press-riso home': { nodes: 800, images: 10 } };

describe('speed budget', () => {
  it('passes the stored numbers and small ordinary change', () => {
    expect(compare({ 'press-riso home': { nodes: 800, images: 10 } }, baseline).over).toEqual([]);
    expect(compare({ 'press-riso home': { nodes: 900, images: 11 } }, baseline).over).toEqual([]);
  });

  it('fails a planted slowdown and says which page and what', () => {
    const { over } = compare({ 'press-riso home': { nodes: 800, images: 40 } }, baseline);
    expect(over).toHaveLength(1);
    expect(over[0].measure).toBe('images');
    expect(say(over[0])).toMatch(/press-riso home now has 40 pictures it asks for/);
  });

  it('flags a page with no stored number, and never raises the stored numbers', () => {
    expect(compare({ 'new home': { nodes: 1, images: 1 } }, baseline).missing).toEqual(['new home']);
    expect(lowered({ 'press-riso home': { nodes: 700, images: 10 } }, baseline)['press-riso home']).toEqual({ nodes: 700, images: 10 });
  });

  it('always leaves some room', () => {
    expect(budgetFor('images', 0)).toBe(1);
    expect(budgetFor('nodes', 1000)).toBe(1150);
  });
});
