import type {
  Muscle,
  Exercise,
  Program,
  ActiveProgram,
  SchedulerState,
  Result,
  BodyweightEntry,
  Session,
} from './entities.ts';
import type { Settings } from './settings.ts';
import { DEFAULT_SETTINGS } from './settings.ts';

/**
 * Current save-schema version. Present from the first release so future migrations have an
 * anchor. Bump when the persisted shape changes in a non-additive way.
 */
export const SCHEMA_VERSION = 1;

/**
 * The single object persisted under one {@link STORAGE_KEY} in `localStorage`. All app data
 * lives here; export/import moves this shape (or a subset) between devices.
 *
 * Sections are typed as stub collections in ticket 01; later tickets populate the entity
 * shapes without changing these field names.
 */
export interface SaveData {
  schemaVersion: number;
  exercises: Exercise[];
  muscles: Muscle[];
  programs: Program[];
  /** Currently running program + chosen scheduler, or `null` if none is active. */
  activeProgram: ActiveProgram | null;
  /** Runtime state owned by the active scheduler, or `null` if no program is active. */
  schedulerState: SchedulerState | null;
  results: Result[];
  bodyweightLog: BodyweightEntry[];
  /** The current unfinished session, or `null` if none is in progress. */
  session: Session | null;
  settings: Settings;
}

/** A fresh, empty save at the current {@link SCHEMA_VERSION}. */
export function emptySaveData(): SaveData {
  return {
    schemaVersion: SCHEMA_VERSION,
    exercises: [],
    muscles: [],
    programs: [],
    activeProgram: null,
    schedulerState: null,
    results: [],
    bodyweightLog: [],
    session: null,
    settings: { ...DEFAULT_SETTINGS },
  };
}
