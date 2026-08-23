# Workout App v2

Offline-first PWA for showing workouts and tracking strength progress. All data lives in the
browser (`localStorage`); moving data between devices and sharing programs is done via
export/import files. No network backend.

See [`CONTEXT.md`](CONTEXT.md) for the domain glossary and `docs/adr/` for architecture decisions.

## Architecture

- `src/core/` — pure TypeScript engine, no React/DOM/`localStorage` imports. External effects go
  through injected ports (`Clock`, `Storage`).
- `src/ui/` — thin React shell over the core public API (hash router, bottom nav, screens).

## Scripts

```
npm run dev         # vite dev server
npm run build       # tsc --noEmit && vite build
npm run preview     # preview production build
npm test            # vitest run
npm run test:watch  # vitest (watch)
npm run typecheck   # tsc --noEmit
```
