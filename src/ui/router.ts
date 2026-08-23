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
