// Plan 16.3: everyone signs in to the stockroom with Google and the Team list gives the role, so a book carries no
// author password (the sample book used to).
import { describe, expect, it } from 'vitest';
import { SAMPLE_BOOK, sampleCatalog } from '../src/lib/test-profile.js';

describe('Google sign-in only', () => {
  it('the sample book carries no author password', () => {
    expect(SAMPLE_BOOK).not.toHaveProperty('authorPassword');
    for (const book of Object.values(sampleCatalog())) expect(book).not.toHaveProperty('authorPassword');
  });
});
