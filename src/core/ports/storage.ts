import type { SaveData } from '../model/save-data.ts';

/**
 * Port: whole-save persistence. The core reads and writes the entire {@link SaveData}
 * object as one unit; it never knows whether the bytes live in `localStorage`, memory,
 * or a file.
 */
export interface Storage {
  /** Load the persisted save, or `null` if nothing has been saved yet. */
  load(): SaveData | null;
  /** Persist the whole save, overwriting any previous value. */
  save(data: SaveData): void;
}

/** localStorage key under which the single save object is stored. */
export const STORAGE_KEY = 'workout-app-v2';

/**
 * Browser adapter backed by `localStorage`.
 *
 * NOTE: this is the one place in `core` that touches a browser global. It references
 * the ambient `localStorage` object (no import), and only inside method bodies, so the
 * pure core and its tests never execute DOM code. Tests use {@link InMemoryStorage}.
 */
export class LocalStorageStorage implements Storage {
  constructor(private readonly key: string = STORAGE_KEY) {}

  load(): SaveData | null {
    const raw = localStorage.getItem(this.key);
    if (raw === null) return null;
    return JSON.parse(raw) as SaveData;
  }

  save(data: SaveData): void {
    localStorage.setItem(this.key, JSON.stringify(data));
  }
}

/**
 * In-memory adapter for tests. Round-trips through JSON so callers cannot accidentally
 * mutate stored data by reference, matching {@link LocalStorageStorage} semantics.
 */
export class InMemoryStorage implements Storage {
  private raw: string | null;

  constructor(initial: SaveData | null = null) {
    this.raw = initial === null ? null : JSON.stringify(initial);
  }

  load(): SaveData | null {
    return this.raw === null ? null : (JSON.parse(this.raw) as SaveData);
  }

  save(data: SaveData): void {
    this.raw = JSON.stringify(data);
  }
}
