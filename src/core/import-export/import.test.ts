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
  exportToJson,
  parseImportDocument,
  collectDedupItems,
  buildImportDiff,
  defaultMergePolicies,
  applyImport,
  runImport,
  ImportError,
} from '../index.ts';
import type {
  SaveData,
  Exercise,
  Muscle,
  Program,
  Result,
  BodyweightEntry,
  DedupDecisions,
  MergePolicies,
} from '../index.ts';

// ---- fixtures -------------------------------------------------------------

function muscle(id: string, name: string): Muscle {
  return { id, name };
}

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

/** One-day program whose single block references the given exercise ids. */
function programUsing(id: string, name: string, exerciseIds: string[]): Program {
  const base = newProgram(name, { planLength: 1 });
  base.id = id;
  const block = newBlock(exerciseIds.map((eid) => newBlockExercise(eid)));
  base.plans[0].days[0] = newWorkoutDay(newWorkout([block]));
  return base;
}

/** A save with muscle m1, exercise e1 (→m1), program p1 (uses e1), one result and one bodyweight. */
function saveA(): SaveData {
  const save = emptySaveData();
  save.muscles = [muscle('m1', 'Грудь')];
  save.exercises = [exercise('e1', 'Жим', ['m1'])];
  save.programs = [programUsing('p1', 'Программа A', ['e1'])];
  save.results = [{ id: 'r1', exerciseId: 'e1', timestamp: 1_000, weight: 80, reps: 8 }];
  save.bodyweightLog = [{ id: 'b1', weight: 82, date: 1_500 }];
  save.settings = { theme: 'light', colorblindPalette: null, continueThresholdHours: 6 };
  return save;
}

/** All exercise ids referenced by any block of a program. */
function programExerciseIds(program: Program): string[] {
  const ids: string[] = [];
  for (const plan of program.plans) {
    for (const day of plan.days) {
      if (day.kind !== 'workout') continue;
      for (const block of day.workout.blocks) {
        for (const slot of block.exercises) ids.push(slot.exerciseId);
      }
    }
  }
  return ids;
}

const noDecisions: DedupDecisions = {};

// ---- Stage 1: parse & validate -------------------------------------------

describe('parseImportDocument', () => {
  it('accepts a well-formed full export and round-trips through exportToJson', () => {
    const doc = exportFull(saveA(), 42);
    const parsed = parseImportDocument(exportToJson(doc));
    expect(parsed.kind).toBe('full');
    expect(parsed).toEqual(doc);
  });

  it('accepts a program-share export', () => {
    const doc = exportProgramShare(saveA(), 7);
    const parsed = parseImportDocument(exportToJson(doc));
    expect(parsed.kind).toBe('program-share');
  });

  it('rejects malformed JSON', () => {
    expect(() => parseImportDocument('{not json')).toThrow(ImportError);
  });

  it('rejects an unknown kind', () => {
    const bad = JSON.stringify({ schemaVersion: 1, kind: 'nope', exportedAt: 0 });
    expect(() => parseImportDocument(bad)).toThrow(/Неизвестный тип/);
  });

  it('rejects a newer schemaVersion', () => {
    const bad = JSON.stringify({
      schemaVersion: 99,
      kind: 'full',
      exportedAt: 0,
      programs: [],
      exercises: [],
      muscles: [],
      results: [],
      bodyweightLog: [],
      settings: {},
    });
    expect(() => parseImportDocument(bad)).toThrow(/новее/);
  });

  it('rejects a full export missing a required section', () => {
    const bad = JSON.stringify({
      schemaVersion: 1,
      kind: 'full',
      exportedAt: 0,
      programs: [],
      exercises: [],
      muscles: [],
      // results missing
      bodyweightLog: [],
      settings: {},
    });
    expect(() => parseImportDocument(bad)).toThrow(/results/);
  });
});

// ---- Stage 2: Pass-1 dedup questions -------------------------------------

describe('collectDedupItems (Pass 1)', () => {
  it('asks a question when an incoming name matches an existing entity with a different id', () => {
    const existing = saveA();
    const incoming = emptySaveData();
    incoming.exercises = [exercise('X', 'Жим')]; // same name as e1, different id
    const doc = exportFull(incoming, 0);

    const items = collectDedupItems(doc, existing);
    expect(items).toEqual([
      { kind: 'exercise', incomingId: 'X', name: 'Жим', existingId: 'e1' },
    ]);
  });

  it('asks nothing when the incoming id already exists (same entity)', () => {
    const existing = saveA();
    const doc = exportFull(saveA(), 0); // identical ids
    expect(collectDedupItems(doc, existing)).toEqual([]);
  });

  it('asks nothing when the incoming name is unique (a plain add)', () => {
    const existing = saveA();
    const incoming = emptySaveData();
    incoming.exercises = [exercise('X', 'Присед')];
    const doc = exportFull(incoming, 0);
    expect(collectDedupItems(doc, existing)).toEqual([]);
  });

  it('covers all three named kinds', () => {
    const existing = saveA();
    const incoming = emptySaveData();
    incoming.muscles = [muscle('mX', 'Грудь')];
    incoming.exercises = [exercise('eX', 'Жим', ['mX'])];
    incoming.programs = [programUsing('pX', 'Программа A', ['eX'])];
    const doc = exportFull(incoming, 0);

    const kinds = collectDedupItems(doc, existing)
      .map((i) => i.kind)
      .sort();
    expect(kinds).toEqual(['exercise', 'muscle', 'program']);
  });
});

// ---- Pass 1: distinct vs duplicate re-linking -----------------------------

describe('applyImport — Pass-1 identity re-linking', () => {
  it('"distinct": mints a new id and re-links incoming references to it', () => {
    const existing = saveA();
    const incoming = emptySaveData();
    incoming.muscles = [muscle('m1', 'Грудь')];
    incoming.exercises = [exercise('eIn', 'Жим', ['m1'])]; // name clash with e1
    incoming.programs = [programUsing('pIn', 'Программа B', ['eIn'])];
    incoming.results = [{ id: 'rIn', exerciseId: 'eIn', timestamp: 5_000, weight: 100, reps: 5 }];
    const doc = exportFull(incoming, 0);

    const decisions: DedupDecisions = { eIn: 'distinct' };
    const next = applyImport(doc, existing, decisions, defaultMergePolicies());

    // Existing exercise kept; a second exercise added under a fresh id.
    expect(next.exercises).toHaveLength(2);
    const added = next.exercises.find((e) => e.id !== 'e1')!;
    expect(added.id).not.toBe('eIn');
    expect(added.name).toBe('Жим');

    // The incoming program and result now point at the fresh id, not the old one.
    const importedProgram = next.programs.find((p) => p.name === 'Программа B')!;
    expect(programExerciseIds(importedProgram)).toEqual([added.id]);
    const importedResult = next.results.find((r) => r.timestamp === 5_000)!;
    expect(importedResult.exerciseId).toBe(added.id);
  });

  it('"duplicate": collapses incoming references onto the existing id, no new exercise', () => {
    const existing = saveA();
    const incoming = emptySaveData();
    incoming.exercises = [exercise('eIn', 'Жим')]; // name clash with e1
    incoming.programs = [programUsing('pIn', 'Программа B', ['eIn'])];
    incoming.results = [{ id: 'rIn', exerciseId: 'eIn', timestamp: 5_000, weight: 100, reps: 5 }];
    const doc = exportFull(incoming, 0);

    const decisions: DedupDecisions = { eIn: 'duplicate' };
    const next = applyImport(doc, existing, decisions, defaultMergePolicies());

    // No duplicate exercise created.
    expect(next.exercises).toHaveLength(1);
    expect(next.exercises[0].id).toBe('e1');

    // Imported program's block and the imported result both reference the existing exercise.
    const importedProgram = next.programs.find((p) => p.name === 'Программа B')!;
    expect(programExerciseIds(importedProgram)).toEqual(['e1']);
    const importedResult = next.results.find((r) => r.timestamp === 5_000)!;
    expect(importedResult.exerciseId).toBe('e1');
  });

  it('missing Pass-1 answer defaults to duplicate', () => {
    const existing = saveA();
    const incoming = emptySaveData();
    incoming.exercises = [exercise('eIn', 'Жим')];
    const doc = exportFull(incoming, 0);

    const next = applyImport(doc, existing, noDecisions, defaultMergePolicies());
    expect(next.exercises).toHaveLength(1);
  });
});

// ---- Stage 4: diff --------------------------------------------------------

describe('buildImportDiff (Pass 2)', () => {
  it('classifies add / identical / changed', () => {
    const existing = saveA();
    const incoming = emptySaveData();
    incoming.exercises = [
      exercise('e1', 'Жим', ['m1']), // same id + content -> identical
      exercise('eNew', 'Присед'), // unique -> add
    ];
    const doc = exportFull(incoming, 0);

    const diff = buildImportDiff(doc, existing, noDecisions);
    const byId = new Map(diff.items.map((i) => [i.incomingId, i]));
    expect(byId.get('e1')!.status).toBe('identical');
    expect(byId.get('eNew')!.status).toBe('add');
  });

  it('flags a changed entity (same id, different content)', () => {
    const existing = saveA();
    const incoming = emptySaveData();
    const changed = exercise('e1', 'Жим', ['m1']);
    changed.notes = 'edited';
    incoming.exercises = [changed];
    const doc = exportFull(incoming, 0);

    const diff = buildImportDiff(doc, existing, noDecisions);
    expect(diff.items.find((i) => i.incomingId === 'e1')!.status).toBe('changed');
  });
});

// ---- Stage 5: merge policies ---------------------------------------------

describe('applyImport — Pass-2 policies', () => {
  function changedExerciseDoc() {
    const incoming = emptySaveData();
    const changed = exercise('e1', 'Жим', ['m1']);
    changed.notes = 'edited';
    changed.equipmentWeightStep = 5;
    incoming.exercises = [changed];
    return exportFull(incoming, 0);
  }

  it('skip (default): keeps the existing entity', () => {
    const next = applyImport(changedExerciseDoc(), saveA(), noDecisions, defaultMergePolicies());
    expect(next.exercises).toHaveLength(1);
    expect(next.exercises[0].notes).toBe('');
    expect(next.exercises[0].equipmentWeightStep).toBe(2.5);
  });

  it('overwrite: replaces the existing entity content', () => {
    const policies: MergePolicies = {
      perType: { exercise: 'overwrite', muscle: 'skip', program: 'skip' },
      perItem: {},
    };
    const next = applyImport(changedExerciseDoc(), saveA(), noDecisions, policies);
    expect(next.exercises).toHaveLength(1);
    expect(next.exercises[0].id).toBe('e1');
    expect(next.exercises[0].notes).toBe('edited');
    expect(next.exercises[0].equipmentWeightStep).toBe(5);
  });

  it('keep-both: adds the incoming entity under a fresh id', () => {
    const policies: MergePolicies = {
      perType: { exercise: 'keep-both', muscle: 'skip', program: 'skip' },
      perItem: {},
    };
    const next = applyImport(changedExerciseDoc(), saveA(), noDecisions, policies);
    expect(next.exercises).toHaveLength(2);
    const original = next.exercises.find((e) => e.id === 'e1')!;
    const clone = next.exercises.find((e) => e.id !== 'e1')!;
    expect(original.notes).toBe(''); // existing untouched
    expect(clone.notes).toBe('edited'); // incoming kept as a separate exercise
  });

  it('per-item override beats the per-type default', () => {
    const doc = changedExerciseDoc();
    const policies: MergePolicies = {
      perType: { exercise: 'skip', muscle: 'skip', program: 'skip' },
      perItem: { e1: 'overwrite' },
    };
    const next = applyImport(doc, saveA(), noDecisions, policies);
    expect(next.exercises[0].notes).toBe('edited');
  });
});

// ---- results & bodyweight union ------------------------------------------

describe('applyImport — union dedup of results and bodyweight', () => {
  it('deduplicates results by (exerciseId, timestamp, weight, reps)', () => {
    const existing = saveA(); // has r1: e1/1000/80/8
    const incoming = emptySaveData();
    incoming.exercises = [exercise('e1', 'Жим', ['m1'])];
    incoming.results = [
      { id: 'dup', exerciseId: 'e1', timestamp: 1_000, weight: 80, reps: 8 }, // same key as r1
      { id: 'new', exerciseId: 'e1', timestamp: 2_000, weight: 85, reps: 6 }, // new
    ];
    const doc = exportFull(incoming, 0);

    const next = applyImport(doc, existing, noDecisions, defaultMergePolicies());
    expect(next.results).toHaveLength(2); // r1 (kept) + new
    expect(next.results.some((r) => r.timestamp === 2_000)).toBe(true);
  });

  it('deduplicates bodyweight by (weight, date)', () => {
    const existing = saveA(); // b1: 82/1500
    const incoming = emptySaveData();
    incoming.bodyweightLog = [
      { id: 'dup', weight: 82, date: 1_500 }, // same key
      { id: 'new', weight: 83, date: 2_000 }, // new
    ];
    const doc = exportFull(incoming, 0);

    const next = applyImport(doc, existing, noDecisions, defaultMergePolicies());
    expect(next.bodyweightLog).toHaveLength(2);
  });

  it('routes a distinct exercise\'s results onto the new id (union stays consistent)', () => {
    const existing = saveA();
    const incoming = emptySaveData();
    incoming.exercises = [exercise('eIn', 'Жим')];
    incoming.results = [{ id: 'rIn', exerciseId: 'eIn', timestamp: 9_000, weight: 70, reps: 10 }];
    const doc = exportFull(incoming, 0);

    const next = applyImport(doc, existing, { eIn: 'distinct' }, defaultMergePolicies());
    const added = next.exercises.find((e) => e.id !== 'e1')!;
    const routed = next.results.find((r) => r.timestamp === 9_000)!;
    expect(routed.exerciseId).toBe(added.id);
  });
});

// ---- replaced sections (full export only) --------------------------------

describe('applyImport — replaced sections', () => {
  it('replaces settings, scheduler state, active program and session (full export)', () => {
    const existing = saveA();
    existing.activeProgram = { programId: 'p1', schedulerId: 'calendar', paused: false };
    existing.schedulerState = { kind: 'calendar', startEpochDay: 1, cursor: 0 };

    const incoming = saveA();
    incoming.settings = { theme: 'dark', colorblindPalette: 'deuteranopia', continueThresholdHours: 12 };
    incoming.activeProgram = { programId: 'p1', schedulerId: 'hybrid', paused: true };
    incoming.schedulerState = { kind: 'hybrid', cursor: 9 };
    const doc = exportFull(incoming, 0);

    const next = applyImport(doc, existing, noDecisions, defaultMergePolicies());
    expect(next.settings).toEqual(incoming.settings);
    expect(next.activeProgram).toEqual({ programId: 'p1', schedulerId: 'hybrid', paused: true });
    expect(next.schedulerState).toEqual({ kind: 'hybrid', cursor: 9 });
  });

  it('re-links a replaced active program when its program was declared distinct', () => {
    const existing = saveA();
    const incoming = emptySaveData();
    incoming.exercises = [exercise('e1', 'Жим', ['m1'])];
    incoming.muscles = [muscle('m1', 'Грудь')];
    incoming.programs = [programUsing('pIn', 'Программа A', ['e1'])]; // name clash with p1
    incoming.activeProgram = { programId: 'pIn', schedulerId: 'calendar', paused: false };
    const doc = exportFull(incoming, 0);

    const next = applyImport(doc, existing, { pIn: 'distinct' }, defaultMergePolicies());
    const added = next.programs.find((p) => p.id !== 'p1')!;
    expect(next.activeProgram!.programId).toBe(added.id);
  });

  it('program-share leaves personal/runtime sections untouched', () => {
    const existing = saveA();
    existing.settings = { theme: 'dark', colorblindPalette: null, continueThresholdHours: 9 };
    const before = JSON.parse(JSON.stringify(existing));

    const incoming = saveA();
    incoming.programs = [programUsing('p2', 'Программа B', ['e1'])];
    const doc = exportProgramShare(incoming, 0);

    const next = applyImport(doc, existing, noDecisions, defaultMergePolicies());
    expect(next.settings).toEqual(before.settings);
    expect(next.results).toEqual(before.results);
    expect(next.bodyweightLog).toEqual(before.bodyweightLog);
  });
});

// ---- round-trip -----------------------------------------------------------

describe('round-trip export → import', () => {
  it('into an empty save reproduces every section', () => {
    const source = saveA();
    const doc = parseImportDocument(exportToJson(exportFull(source, 123)));

    const next = applyImport(doc, emptySaveData(), noDecisions, defaultMergePolicies());
    expect(next.schemaVersion).toBe(source.schemaVersion);
    expect(next.exercises).toEqual(source.exercises);
    expect(next.muscles).toEqual(source.muscles);
    expect(next.programs).toEqual(source.programs);
    expect(next.results).toEqual(source.results);
    expect(next.bodyweightLog).toEqual(source.bodyweightLog);
    expect(next.settings).toEqual(source.settings);
  });

  it('into the same save is idempotent (no duplicates)', () => {
    const source = saveA();
    const doc = parseImportDocument(exportToJson(exportFull(source, 0)));

    const next = applyImport(doc, source, noDecisions, defaultMergePolicies());
    expect(next.exercises).toHaveLength(1);
    expect(next.muscles).toHaveLength(1);
    expect(next.programs).toHaveLength(1);
    expect(next.results).toHaveLength(1);
    expect(next.bodyweightLog).toHaveLength(1);
  });
});

// ---- storage wrapper ------------------------------------------------------

describe('runImport (Storage port)', () => {
  it('loads, merges and persists through InMemoryStorage', () => {
    const storage = new InMemoryStorage(saveA());
    const incoming = emptySaveData();
    incoming.exercises = [exercise('eNew', 'Присед')];
    const doc = exportFull(incoming, 0);

    const returned = runImport(storage, doc, noDecisions, defaultMergePolicies());
    expect(returned.exercises).toHaveLength(2);
    expect(storage.load()!.exercises).toHaveLength(2);
  });

  it('seeds an empty save when storage is empty', () => {
    const storage = new InMemoryStorage(null);
    const doc = exportFull(saveA(), 0);
    const returned = runImport(storage, doc, noDecisions, defaultMergePolicies());
    expect(returned.exercises).toHaveLength(1);
    expect(storage.load()).not.toBeNull();
  });
});
