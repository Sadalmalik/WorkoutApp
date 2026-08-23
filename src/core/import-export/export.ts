/**
 * Data export (ticket 11).
 *
 * Two pure, DOM-free modes turn a {@link SaveData} into a self-contained, JSON-serialisable
 * document that ticket 12 (import) reads back:
 *
 * - {@link exportFull} — the whole save (backup / move to another device): every catalog,
 *   the full results history, bodyweight log, settings, active-program binding, scheduler
 *   runtime state and the unfinished session.
 * - {@link exportProgramShare} — programs plus only the exercises they reference and the
 *   muscles those exercises reference (share a program with a friend). Deliberately omits all
 *   personal / runtime data (results, bodyweight, settings, `activeProgram`, `schedulerState`,
 *   `session`).
 *
 * Both produce an {@link ExportDocument}: an envelope carrying `schemaVersion` (so import can
 * detect and migrate old files), a `kind` discriminator, and `exportedAt`. The document is a
 * plain data object — the UI (or a test) is responsible for JSON-stringifying it and handing
 * the bytes to a Blob/download.
 */

import type {
  SaveData,
  Exercise,
  Muscle,
  Program,
  ActiveProgram,
  SchedulerState,
  Result,
  BodyweightEntry,
  Session,
  Settings,
} from '../model/index.ts';
import { SCHEMA_VERSION } from '../model/index.ts';

/** Discriminates the two export modes. Import (ticket 12) branches on this field. */
export type ExportKind = 'full' | 'program-share';

/** Fields common to every export document. */
export interface ExportEnvelope {
  /** Save-schema version the document was written at (see {@link SCHEMA_VERSION}). */
  schemaVersion: number;
  /** Which export mode produced this document. */
  kind: ExportKind;
  /** When the file was exported, epoch milliseconds. Informational; import ignores it. */
  exportedAt: number;
}

/**
 * Full backup: a complete, self-contained copy of {@link SaveData} (minus its redundant inner
 * `schemaVersion`, which the envelope carries once). Round-trips through import to restore a
 * device exactly.
 */
export interface FullExport extends ExportEnvelope {
  kind: 'full';
  exercises: Exercise[];
  muscles: Muscle[];
  programs: Program[];
  activeProgram: ActiveProgram | null;
  schedulerState: SchedulerState | null;
  results: Result[];
  bodyweightLog: BodyweightEntry[];
  session: Session | null;
  settings: Settings;
}

/**
 * Shareable program bundle: the selected programs plus their transitive dependencies only.
 * `programs` carry their own `recommendedSchedulerId` field, so the recommended scheduler
 * travels inside the programs — there is no separate field for it.
 */
export interface ProgramShareExport extends ExportEnvelope {
  kind: 'program-share';
  /** Full programs (plans, days, blocks, targets, `recommendedSchedulerId`). */
  programs: Program[];
  /** Only the exercises referenced by `programs`' blocks. */
  exercises: Exercise[];
  /** Only the muscles referenced by the included `exercises`' `muscleRefs`. */
  muscles: Muscle[];
}

/** Any export document. Import discriminates on {@link ExportEnvelope.kind}. */
export type ExportDocument = FullExport | ProgramShareExport;

/**
 * Full export: copy every section of `save` into a {@link FullExport} envelope.
 *
 * @param exportedAt epoch ms stamped into the envelope (pass `clock.now()` from the UI).
 */
export function exportFull(save: SaveData, exportedAt: number): FullExport {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'full',
    exportedAt,
    exercises: save.exercises,
    muscles: save.muscles,
    programs: save.programs,
    activeProgram: save.activeProgram,
    schedulerState: save.schedulerState,
    results: save.results,
    bodyweightLog: save.bodyweightLog,
    session: save.session,
    settings: save.settings,
  };
}

/**
 * "Programs + exercises" export: all programs, plus only the exercises their blocks reference
 * and only the muscles those exercises reference. No personal or runtime state.
 *
 * @param exportedAt epoch ms stamped into the envelope (pass `clock.now()` from the UI).
 */
export function exportProgramShare(save: SaveData, exportedAt: number): ProgramShareExport {
  const exerciseIds = collectExerciseIds(save.programs);
  const exercises = save.exercises.filter((e) => exerciseIds.has(e.id));

  const muscleIds = collectMuscleIds(exercises);
  const muscles = save.muscles.filter((m) => muscleIds.has(m.id));

  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'program-share',
    exportedAt,
    programs: save.programs,
    exercises,
    muscles,
  };
}

/**
 * Every catalog exercise id referenced from any block of any program (transitive collection:
 * program → plan → training day → workout → block → slot → `exerciseId`).
 */
export function collectExerciseIds(programs: Program[]): Set<string> {
  const ids = new Set<string>();
  for (const program of programs) {
    for (const plan of program.plans) {
      for (const day of plan.days) {
        if (day.kind !== 'workout') continue;
        for (const block of day.workout.blocks) {
          for (const slot of block.exercises) {
            ids.add(slot.exerciseId);
          }
        }
      }
    }
  }
  return ids;
}

/** Every muscle id referenced by the `muscleRefs` of the given exercises. */
export function collectMuscleIds(exercises: Exercise[]): Set<string> {
  const ids = new Set<string>();
  for (const exercise of exercises) {
    for (const ref of exercise.muscleRefs) {
      ids.add(ref.muscleId);
    }
  }
  return ids;
}

/**
 * Serialise an {@link ExportDocument} to a pretty-printed JSON string (2-space indent) suitable
 * for writing to a `.json` file. Kept here so both the UI and round-trip tests share one format.
 */
export function exportToJson(doc: ExportDocument): string {
  return JSON.stringify(doc, null, 2);
}
