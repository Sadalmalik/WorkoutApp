import { useEffect, useState } from 'react';

/**
 * Minimal hash router (no dependencies). Routes are the hash path, e.g. `#/results` → `/results`.
 * Because navigation goes through `window.location.hash`, the browser Back/Forward buttons work
 * for free (each change pushes a history entry and emits `hashchange`).
 */

/** The five top-level routes of the shell. */
export const ROUTES = {
  home: '/home',
  results: '/results',
  settings: '/settings',
  bodyweight: '/bodyweight',
  adhoc: '/adhoc',
} as const;

export type Route = (typeof ROUTES)[keyof typeof ROUTES];

/** Route used when the hash is empty or unrecognised. */
export const DEFAULT_ROUTE: Route = ROUTES.home;

const KNOWN: readonly string[] = Object.values(ROUTES);

/** Normalise a raw `location.hash` into a known route, falling back to {@link DEFAULT_ROUTE}. */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return (KNOWN.includes(normalized) ? normalized : DEFAULT_ROUTE) as Route;
}

/** The current route derived from `window.location.hash`. */
export function currentRoute(): Route {
  return parseHash(window.location.hash);
}

/** Navigate to a route by setting the hash; this pushes a history entry. */
export function navigate(route: Route): void {
  if (currentRoute() === route && window.location.hash !== '') return;
  window.location.hash = route;
}

/** Subscribe to route changes; returns an unsubscribe function. */
export function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

/**
 * Exercise-catalog sub-routes, layered on top of the five top-level nav routes without
 * enlarging the {@link Route} enum. `#/exercises` is the list; `#/exercises/<id>` is the editor,
 * where the sentinel id {@link EXERCISE_NEW} means "create a new exercise".
 */
export type CatalogRoute = { kind: 'list' } | { kind: 'editor'; id: string };

/** Hash base for the catalog area. */
export const CATALOG_PATH = '/exercises';

/** Editor id sentinel meaning "new exercise". */
export const EXERCISE_NEW = 'new';

/** Parse a raw `location.hash` into a {@link CatalogRoute}, or `null` if it is not a catalog hash. */
export function parseCatalogRoute(hash: string): CatalogRoute | null {
  const path = hash.replace(/^#/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === CATALOG_PATH) return { kind: 'list' };
  if (normalized.startsWith(`${CATALOG_PATH}/`)) {
    const id = normalized.slice(CATALOG_PATH.length + 1);
    if (id !== '') return { kind: 'editor', id };
  }
  return null;
}

/** Navigate to the exercise list. */
export function navigateToCatalog(): void {
  window.location.hash = CATALOG_PATH;
}

/** Navigate to the editor for `id` (or {@link EXERCISE_NEW} to create). */
export function navigateToExercise(id: string): void {
  window.location.hash = `${CATALOG_PATH}/${id}`;
}

/**
 * Program-editor sub-routes, layered on the top-level nav routes just like the catalog area.
 * `#/programs` is the list; `#/programs/<id>` is the editor, where the sentinel id
 * {@link PROGRAM_NEW} means "create a new program".
 */
export type ProgramRoute = { kind: 'list' } | { kind: 'editor'; id: string };

/** Hash base for the program area. */
export const PROGRAMS_PATH = '/programs';

/** Editor id sentinel meaning "new program". */
export const PROGRAM_NEW = 'new';

/** Parse a raw `location.hash` into a {@link ProgramRoute}, or `null` if it is not a program hash. */
export function parseProgramRoute(hash: string): ProgramRoute | null {
  const path = hash.replace(/^#/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === PROGRAMS_PATH) return { kind: 'list' };
  if (normalized.startsWith(`${PROGRAMS_PATH}/`)) {
    const id = normalized.slice(PROGRAMS_PATH.length + 1);
    if (id !== '') return { kind: 'editor', id };
  }
  return null;
}

/** Navigate to the program list. */
export function navigateToPrograms(): void {
  window.location.hash = PROGRAMS_PATH;
}

/** Navigate to the editor for `id` (or {@link PROGRAM_NEW} to create). */
export function navigateToProgram(id: string): void {
  window.location.hash = `${PROGRAMS_PATH}/${id}`;
}

/** React hook: the raw `location.hash`, re-read on Back/Forward or any navigation. */
export function useHash(): string {
  const [hash, setHash] = useState<string>(() => window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    update();
    return subscribe(update);
  }, []);
  return hash;
}

/** React hook: returns the current route and re-renders on Back/Forward or `navigate`. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(currentRoute);

  useEffect(() => {
    const update = () => setRoute(currentRoute());
    // Ensure the hash is canonical on first mount (empty hash → default route).
    if (window.location.hash === '') {
      window.location.replace(`#${DEFAULT_ROUTE}`);
    }
    update();
    return subscribe(update);
  }, []);

  return route;
}
