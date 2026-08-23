import { describe, it, expect } from 'vitest';
import { InMemoryStorage, emptySaveData } from '../index.ts';
import type { Exercise, Program, Block } from '../index.ts';
import {
  DEFAULT_SCHEDULER_ID,
  DEFAULT_TARGET,
  newProgram,
  newPlan,
  newWorkout,
  newWorkoutDay,
  newBlock,
  newBlockExercise,
  validateProgram,
  createProgram,
  updateProgram,
  getProgram,
  listPrograms,
  deleteProgram,
} from './programs.ts';

function ex(id: string, name: string): Exercise {
  return {
    id,
    name,
    zone: '',
    videoLinks: [],
    isBodyweight: false,
    equipmentWeightStep: 2.5,
    notes: '',
    muscleRefs: [],
  };
}

/** A fresh storage whose catalog already holds `ids` so referential integrity passes. */
function storageWithCatalog(...ids: string[]) {
  const save = emptySaveData();
  save.exercises = ids.map((id) => ex(id, id));
  return new InMemoryStorage(save);
}

describe('builders', () => {
  it('newProgram creates one plan of the requested length, all rest days', () => {
    const program = newProgram('Push/Pull', { planLength: 4 });

    expect(program.id).toMatch(/[0-9a-f-]{36}/i);
    expect(program.name).toBe('Push/Pull');
    expect(program.plans).toHaveLength(1);
    expect(program.plans[0].days).toHaveLength(4);
    expect(program.plans[0].days.every((d) => d.kind === 'rest')).toBe(true);
    expect(program.recommendedSchedulerId).toBe(DEFAULT_SCHEDULER_ID);
  });

  it('newProgram defaults to a single-day plan and trims the name', () => {
    const program = newProgram('  Linear  ');
    expect(program.name).toBe('Linear');
    expect(program.plans[0].days).toHaveLength(1);
  });

  it('newPlan enforces a minimum of one day', () => {
    expect(newPlan(0).days).toHaveLength(1);
    expect(newPlan(-3).days).toHaveLength(1);
  });

  it('newBlockExercise copies the target and assigns a fresh slot id', () => {
    const a = newBlockExercise('ex-1');
    const b = newBlockExercise('ex-1');
    expect(a.exerciseId).toBe('ex-1');
    expect(a.target).toEqual(DEFAULT_TARGET);
    expect(a.target).not.toBe(DEFAULT_TARGET); // defensive copy
    expect(a.id).not.toBe(b.id);
  });

  it('a block with two or more exercises is a superset by length only', () => {
    const superset = newBlock([newBlockExercise('a'), newBlockExercise('b')]);
    expect(superset.exercises).toHaveLength(2);
    // No dedicated flag/entity: "superset" is just exercises.length >= 2.
    expect('isSuperset' in superset).toBe(false);
  });
});

describe('validateProgram', () => {
  /** A minimal valid program: one training day, one block, one exercise slot. */
  function validProgram(exerciseId = 'ex-1'): Program {
    const program = newProgram('P', { planLength: 1 });
    program.plans[0].days[0] = newWorkoutDay(newWorkout([newBlock([newBlockExercise(exerciseId)])]));
    return program;
  }

  it('accepts a well-formed program', () => {
    expect(validateProgram(validProgram())).toEqual([]);
  });

  it('accepts a superset block', () => {
    const program = newProgram('P', { planLength: 1 });
    program.plans[0].days[0] = newWorkoutDay(
      newWorkout([newBlock([newBlockExercise('a'), newBlockExercise('b')])]),
    );
    expect(validateProgram(program)).toEqual([]);
  });

  it('rejects an empty name', () => {
    const program = validProgram();
    program.name = '   ';
    expect(validateProgram(program).join('\n')).toMatch(/Название/);
  });

  it('rejects an empty block (no exercises)', () => {
    const program = newProgram('P', { planLength: 1 });
    program.plans[0].days[0] = newWorkoutDay(newWorkout([newBlock([])]));
    expect(validateProgram(program).join('\n')).toMatch(/хотя бы одно упражнение/);
  });

  it('rejects sets < 1', () => {
    const program = validProgram();
    trainingBlock(program).sets = 0;
    expect(validateProgram(program).join('\n')).toMatch(/сетов/);
  });

  it('rejects negative rest intervals', () => {
    const program = validProgram();
    trainingBlock(program).betweenSetsRest = -5;
    expect(validateProgram(program).join('\n')).toMatch(/междуСетами/);
  });

  it('rejects a training day with no blocks', () => {
    const program = newProgram('P', { planLength: 1 });
    program.plans[0].days[0] = newWorkoutDay(newWorkout([]));
    expect(validateProgram(program).join('\n')).toMatch(/хотя бы один блок/);
  });

  it('rejects reps < 1', () => {
    const program = validProgram();
    trainingBlock(program).exercises[0].target = { weight: 20, reps: 0 };
    expect(validateProgram(program).join('\n')).toMatch(/повторы/);
  });

  it('flags a duplicate BlockExercise.id across the program', () => {
    const program = validProgram();
    const dup = newBlockExercise('a');
    const another = { ...newBlockExercise('b'), id: dup.id };
    trainingBlock(program).exercises = [dup, another];
    expect(validateProgram(program).join('\n')).toMatch(/дублирующийся BlockExercise\.id/);
  });

  it('checks referential integrity against a known-id set', () => {
    const program = validProgram('missing');
    expect(validateProgram(program, ['other']).join('\n')).toMatch(/отсутствует в каталоге/);
    expect(validateProgram(program, ['missing'])).toEqual([]);
  });
});

describe('storage CRUD', () => {
  it('creates, reads back and lists a program (round-trip through InMemoryStorage)', () => {
    const storage = storageWithCatalog('ex-1');
    const program = withOneExercise(newProgram('Linear', { planLength: 2 }), 'ex-1');

    const created = createProgram(storage, program);
    expect(getProgram(storage, created.id)).toEqual(created);

    const roundTripped = storage.load()?.programs[0];
    expect(roundTripped).toEqual(created);
    expect(listPrograms(storage)).toEqual([created]);
  });

  it('rejects creating a program that references an unknown exercise', () => {
    const storage = storageWithCatalog('ex-1');
    const program = withOneExercise(newProgram('Bad'), 'ghost');
    expect(() => createProgram(storage, program)).toThrow(/Invalid program|каталог/i);
    expect(listPrograms(storage)).toEqual([]);
  });

  it('rejects a duplicate create for the same id', () => {
    const storage = storageWithCatalog('ex-1');
    const program = withOneExercise(newProgram('P'), 'ex-1');
    createProgram(storage, program);
    expect(() => createProgram(storage, program)).toThrow(/already exists/i);
  });

  it('updates an existing program and persists the change', () => {
    const storage = storageWithCatalog('ex-1');
    const program = createProgram(storage, withOneExercise(newProgram('P'), 'ex-1'));

    const edited: Program = { ...program, name: 'Renamed' };
    const updated = updateProgram(storage, edited);

    expect(updated.name).toBe('Renamed');
    expect(getProgram(storage, program.id)?.name).toBe('Renamed');
    expect(listPrograms(storage)).toHaveLength(1);
  });

  it('throws when updating an unknown program', () => {
    const storage = storageWithCatalog('ex-1');
    const program = withOneExercise(newProgram('P'), 'ex-1');
    expect(() => updateProgram(storage, program)).toThrow(/not found/i);
  });

  it('deletes a program', () => {
    const storage = storageWithCatalog('ex-1');
    const program = createProgram(storage, withOneExercise(newProgram('P'), 'ex-1'));
    deleteProgram(storage, program.id);
    expect(getProgram(storage, program.id)).toBeUndefined();
    expect(listPrograms(storage)).toEqual([]);
  });

  it('preserves BlockExercise.id and exerciseId references across a round-trip', () => {
    const storage = storageWithCatalog('ex-1', 'ex-2');
    const slotA = newBlockExercise('ex-1', { weight: 40, reps: 5 });
    const slotB = newBlockExercise('ex-2', { weight: 0, reps: 12 });
    const program = newProgram('Superset day', { planLength: 1 });
    program.plans[0].days[0] = newWorkoutDay(newWorkout([newBlock([slotA, slotB])]));

    const created = createProgram(storage, program);
    const loaded = getProgram(storage, created.id)!;
    const slots = ((loaded.plans[0].days[0] as { kind: 'workout'; workout: { blocks: Block[] } }).workout.blocks[0]).exercises;

    expect(slots.map((s) => s.id)).toEqual([slotA.id, slotB.id]);
    expect(slots.map((s) => s.exerciseId)).toEqual(['ex-1', 'ex-2']);
    expect(slots[0].target).toEqual({ weight: 40, reps: 5 });
  });
});

/** Put a single training day (one block, one exercise `exerciseId`) into a program's plan. */
function withOneExercise(program: Program, exerciseId: string): Program {
  program.plans[0].days[0] = newWorkoutDay(newWorkout([newBlock([newBlockExercise(exerciseId)])]));
  return program;
}

/** Reach the first block of the first training day (test helper; assumes the shape built above). */
function trainingBlock(program: Program): Block {
  const day = program.plans[0].days[0];
  if (day.kind !== 'workout') throw new Error('expected a workout day');
  return day.workout.blocks[0];
}
