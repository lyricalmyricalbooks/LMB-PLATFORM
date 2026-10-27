import { describe, it, expect } from 'vitest';
import { slugify } from './storeMenu';

describe('slugify', () => {
  it('should lowercase normal string and replace spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('should replace special characters with hyphens', () => {
    expect(slugify('This & That!')).toBe('this-that');
  });

  it('should remove leading and trailing non-alphanumerics/hyphens', () => {
    expect(slugify(' -Hello- ')).toBe('hello');
  });

  it('should return empty string for empty string input', () => {
    expect(slugify('')).toBe('');
  });

  it('should handle falsy/undefined inputs gracefully', () => {
    // Need to cast to any to test the fallback behavior of the JS function when compiled
    expect(slugify(undefined as any)).toBe('');
    expect(slugify(null as any)).toBe('');
  });

  it('should leave already slugified strings unchanged', () => {
    expect(slugify('my-cool-slug')).toBe('my-cool-slug');
  });

  it('should handle strings with consecutive non-alphanumerics correctly', () => {
    expect(slugify('A!!!B...C')).toBe('a-b-c');
  });
});
