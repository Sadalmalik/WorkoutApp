import { describe, it, expect } from 'vitest';
import { parseHash, parseCatalogRoute, ROUTES, DEFAULT_ROUTE } from './router.ts';

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

describe('parseCatalogRoute', () => {
  it('parses the list hash', () => {
    expect(parseCatalogRoute('#/exercises')).toEqual({ kind: 'list' });
  });

  it('parses an editor hash with an id', () => {
    expect(parseCatalogRoute('#/exercises/abc-123')).toEqual({ kind: 'editor', id: 'abc-123' });
    expect(parseCatalogRoute('#/exercises/new')).toEqual({ kind: 'editor', id: 'new' });
  });

  it('returns null for non-catalog hashes', () => {
    expect(parseCatalogRoute('#/home')).toBeNull();
    expect(parseCatalogRoute('#/settings')).toBeNull();
    expect(parseCatalogRoute('')).toBeNull();
    // Trailing slash with no id is not an editor route.
    expect(parseCatalogRoute('#/exercises/')).toBeNull();
  });
});
