/**
 * Stub entity types for the save shape.
 *
 * Ticket 01 only fixes identity (every entity carries a stable `id: string`, uuid v4) and
 * the field names of {@link SaveData}. Full field sets are filled in by later tickets:
 * catalogs (02/03), programs & blocks (05), scheduler state (04), results & session (06),
 * reports (09). Keep these minimal so later tickets can extend without churn.
 */

/** Catalog entry: a muscle. Filled by the muscle-catalog ticket (Phase 2 UI). */
export interface Muscle {
  id: string;
  name: string;
}

/**
 * A weighted link from an exercise to a muscle in the muscle catalog. `involvement` is the
 * manual 0..1 engagement coefficient (see CONTEXT.md → Мышца). Phase 1 leaves the list empty;
 * the muscle-catalog UI (Phase 2) populates it. Defined here so the field shape is stable.
 */
export interface MuscleRef {
  /** Id of the referenced {@link Muscle}. */
  muscleId: string;
  /** Engagement coefficient in the range 0..1. */
  involvement: number;
}

/**
 * Catalog entry: an exercise (movement), e.g. «Жим гантелей лёжа 30°». Lives in the catalog
 * independently of any program (see CONTEXT.md → Упражнение).
 */
export interface Exercise {
  /** Stable uuid v4 identity; references from blocks/results point here. */
  id: string;
  /** Display name; also the matching key on import. */
  name: string;
  /** Free-text zone (Спина, Грудь…); coarse bucket, autocompleted from prior values. */
  zone: string;
  /** Reference video URLs. */
  videoLinks: string[];
  /** True when the movement is loaded by bodyweight rather than external weight. */
  isBodyweight: boolean;
  /** Increment (kg) of the equipment's weight stack/plates; used by weight pickers. */
  equipmentWeightStep: number;
  /** Free-text notes. */
  notes: string;
  /** Weighted muscle links; empty in Phase 1 (populated by the muscle-catalog ticket). */
  muscleRefs: MuscleRef[];
}

/** A training program (plans + rotation). Filled by the program-editor ticket. */
export interface Program {
  id: string;
  name: string;
}

/**
 * A single training day resolved by a {@link Scheduler} from a {@link Program}: the ordered
 * blocks to perform now. Filled by the scheduler ticket (04). `null` there means a rest day.
 */
export interface Workout {
  id: string;
}

/**
 * Binding of the currently running program to a chosen scheduler strategy.
 * Filled by the program-launch ticket.
 */
export interface ActiveProgram {
  programId: string;
  /** Id of the chosen scheduler strategy, e.g. 'calendar' | 'hybrid'. */
  schedulerId: string;
}

/**
 * Opaque per-scheduler runtime state (start date, cursor, …) persisted separately from the
 * program. Each {@link Scheduler} owns its own shape; the core treats it as opaque JSON.
 * Filled by the scheduler ticket (04).
 */
export type SchedulerState = Record<string, unknown>;

/** A recorded performed set. Filled by the session/results ticket (06). */
export interface Result {
  id: string;
}

/**
 * A single bodyweight measurement (the "Лог веса тела" / bodyweight log; see CONTEXT.md).
 *
 * Append-only entries; the app never edits an existing measurement in place, it records a new
 * one. Ordered by {@link BodyweightEntry.date} when read for charts (Phase 2). Units are always
 * kilograms (SaveData invariant #4).
 */
export interface BodyweightEntry {
  id: string;
  /** Measured bodyweight in kilograms. */
  weight: number;
  /** When the measurement was taken, epoch milliseconds (from the injected `Clock`). */
  date: number;
}

/** The current unfinished workout session; survives reload and day change. Filled by ticket 06. */
export interface Session {
  id: string;
}
