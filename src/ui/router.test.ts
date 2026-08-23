import { describe, it, expect } from 'vitest';
import { parseHash, ROUTES, DEFAULT_ROUTE } from './router.ts';

describe('parseHash', () => {
  it('parses a known hash into its route', () => {
    expect(parseHash('#/results')).toBe(ROUTES.results);
    expect(parseHash('#/settings')).toBe(ROUTES.settings);
  });

  it('adds the leading slash when missing', () => {
    expect(parseHash('#home')).toBe(ROUTES.home);
  });

  it('falls back to the default route for empty or unknown hashes', () => {
    expect(parseHash('')).toBe(DEFAULT_ROUTE);
    expect(parseHash('#/nope')).toBe(DEFAULT_ROUTE);
  });
});
