import { describe, it, expect } from 'vitest';
import {
  InMemoryStorage,
  emptySaveData,
  newProgram,
  newBlock,
  newBlockExercise,
  newWorkout,
  newWorkoutDay,
  exportFull,
  exportProgramShare,
  collectExerciseIds,
  SCHEMA_VERSION,
} from '../index.ts';
import type {
  SaveData,
  Exercise,
  Muscle,
  Program,
  Result,
  BodyweightEntry,
} from '../index.ts';

/** Muscle catalog entry. */
function muscle(id: string, name: string): Muscle {
  return { id, name };
}

/** Exercise catalog entry referencing zero or more muscles. */
function exercise(id: string, name: string, muscleIds: string[] = []): Exercise {
  return {
    id,
    name,
    zone: 'Тест',
    videoLinks: [],
    isBodyweight: false,
    equipmentWeightStep: 2.5,
    notes: '',
    muscleRefs: muscleIds.map((muscleId) => ({ muscleId, involvement: 0.5 })),
  };
}

/** A one-day program whose single block references the given exercise ids. */
function programUsing(name: string, exerciseIds: string[]): Program {
  const base = newProgram(name, { planLength: 1 });
  const block = newBlock(exerciseIds.map((id) => newBlockExercise(id)));
  const workout = newWorkout([block]);
  base.plans[0].days[0] = newWorkoutDay(workout);
  return base;
}

/**
 * Fully populated save fixture:
 * - muscles m1, m2, m3 (m3 referenced by nobody)
 * - exercises e1 (→m1), e2 (→m2), e3 (unreferenced by any program)
 * - one program referencing e1 and e2 only
 * - plus results, bodyweight, an active program, scheduler state and a session.
 */
function populatedSave(): SaveData {
  const save = emptySaveData();

  save.muscles = [muscle('m1', 'Грудь'), muscle('m2', 'Спина'), muscle('m3', 'Ноги')];
  save.exercises = [
    exercise('e1', 'Жим', ['m1']),
    exercise('e2', 'Тяга', ['m2']),
    exercise('e3', 'Присед', ['m3']), // not used by any program
  ];

  const program = programUsing('Программа A', ['e1', 'e2']);
  save.programs = [program];

  save.activeProgram = { programId: program.id, schedulerId: 'calendar', paused: false };
  save.schedulerState = { kind: 'calendar', startEpochDay: 100, cursor: 3 };

  const results: Result[] = [
    { id: 'r1', exerciseId: 'e1', timestamp: 1_000, weight: 80, reps: 8 },
    { id: 'r2', exerciseId: 'e2', timestamp: 2_000, weight: 90, reps: 6 },
  ];
  save.results = results;

  const bw: BodyweightEntry[] = [{ id: 'b1', weight: 82, date: 1_500 }];
  save.bodyweightLog = bw;

  save.settings = { theme: 'dark', colorblindPalette: null, continueThresholdHours: 8 };

  return save;
}

describe('exportFull', () => {
  it('carries the schemaVersion and full-mode discriminator', () => {
    const doc = exportFull(populatedSave(), 42);
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    expect(doc.kind).toBe('full');
    expect(doc.exportedAt).toBe(42);
  });

  it('includes every section of the save', () => {
    const save = populatedSave();
    const doc = exportFull(save, 0);

    expect(doc.exercises).toHaveLength(3);
    expect(doc.muscles).toHaveLength(3);
    expect(doc.programs).toHaveLength(1);
    expect(doc.activeProgram).toEqual(save.activeProgram);
    expect(doc.schedulerState).toEqual(save.schedulerState);
    expect(doc.results).toHaveLength(2);
    expect(doc.bodyweightLog).toHaveLength(1);
    expect(doc.settings).toEqual(save.settings);
  });

  it('reads the save through the Storage port (InMemoryStorage)', () => {
    const storage = new InMemoryStorage(populatedSave());
    const loaded = storage.load();
    expect(loaded).not.toBeNull();

    const doc = exportFull(loaded!, 7);
    expect(doc.kind).toBe('full');
    expect(doc.results).toHaveLength(2);
  });

  it('survives a JSON round-trip unchanged (self-contained document)', () => {
    const doc = exportFull(populatedSave(), 123);
    const clone = JSON.parse(JSON.stringify(doc));
    expect(clone).toEqual(doc);
  });
});

describe('exportProgramShare', () => {
  it('carries the schemaVersion and program-share discriminator', () => {
    const doc = exportProgramShare(populatedSave(), 99);
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    expect(doc.kind).toBe('program-share');
    expect(doc.exportedAt).toBe(99);
  });

  it('includes all programs, with their recommended scheduler travelling inside', () => {
    const save = populatedSave();
    save.programs[0].recommendedSchedulerId = 'hybrid';
    const doc = exportProgramShare(save, 0);

    expect(doc.programs).toHaveLength(1);
    expect(doc.programs[0].recommendedSchedulerId).toBe('hybrid');
  });

  it('includes only the exercises referenced by program blocks', () => {
    const doc = exportProgramShare(populatedSave(), 0);
    const ids = doc.exercises.map((e) => e.id).sort();
    expect(ids).toEqual(['e1', 'e2']); // e3 is unreferenced and excluded
  });

  it('includes only the muscles referenced by the included exercises', () => {
    const doc = exportProgramShare(populatedSave(), 0);
    const ids = doc.muscles.map((m) => m.id).sort();
    expect(ids).toEqual(['m1', 'm2']); // m3 belongs only to the excluded e3
  });

  it('omits all personal and runtime state', () => {
    const doc = exportProgramShare(populatedSave(), 0) as unknown as Record<string, unknown>;
    expect(doc.results).toBeUndefined();
    expect(doc.bodyweightLog).toBeUndefined();
    expect(doc.settings).toBeUndefined();
    expect(doc.schedulerState).toBeUndefined();
    expect(doc.activeProgram).toBeUndefined();
    expect(doc.session).toBeUndefined();
  });

  it('survives a JSON round-trip unchanged', () => {
    const doc = exportProgramShare(populatedSave(), 5);
    const clone = JSON.parse(JSON.stringify(doc));
    expect(clone).toEqual(doc);
  });
});

describe('collectExerciseIds (transitive reference collection)', () => {
  it('gathers exercise ids from every block of every training day', () => {
    const p = programUsing('P', ['e1', 'e2']);
    // add a second workout day referencing e1 again and e4 (a superset block)
    const superset = newBlock([newBlockExercise('e1'), newBlockExercise('e4')]);
    p.plans[0].days.push(newWorkoutDay(newWorkout([superset])));

    const ids = collectExerciseIds([p]);
    expect([...ids].sort()).toEqual(['e1', 'e2', 'e4']);
  });

  it('returns an empty set for a program with no training days', () => {
    const restOnly = newProgram('Rest', { planLength: 2 }); // all rest days
    expect(collectExerciseIds([restOnly]).size).toBe(0);
  });

  it('does not include an exercise that no program references', () => {
    const ids = collectExerciseIds([programUsing('P', ['e1'])]);
    expect(ids.has('e3')).toBe(false);
    expect(ids.has('e1')).toBe(true);
  });
});
