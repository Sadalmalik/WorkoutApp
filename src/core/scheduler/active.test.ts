import { describe, it, expect } from 'vitest';
import { FixedClock, InMemoryStorage } from '../ports/index.ts';
import { emptySaveData } from '../model/index.ts';
import type { Program, PlanDay, SaveData } from '../model/index.ts';
import { DAY_MS } from './day.ts';
import {
  startProgram,
  getHomeState,
  currentWorkout,
  advanceSchedule,
  skipSchedule,
  deferCurrentBlock,
  pauseProgram,
  resumeProgram,
  cancelProgram,
  changeScheduler,
} from './active.ts';

const rest: PlanDay = { kind: 'rest' };

function w(tag: string, blockIds: string[] = [`${tag}-b`]): PlanDay {
  return {
    kind: 'workout',
    workout: {
      id: tag,
      blocks: blockIds.map((id) => ({ id, exercises: [], sets: 1, betweenSetsRest: 0, betweenSupersetExercisesRest: 0 })),
      betweenBlocksRest: 0,
    },
  };
}

function program(id: string, days: PlanDay[], recommended: 'calendar' | 'hybrid'): Program {
  return { id, name: id, plans: [{ id: `${id}-plan`, days }], recommendedSchedulerId: recommended };
}

function atDay(n: number): FixedClock {
  return new FixedClock(n * DAY_MS);
}

/** Storage seeded with `programs` and nothing active. */
function storageWith(...programs: Program[]): InMemoryStorage {
  const save: SaveData = { ...emptySaveData(), programs };
  return new InMemoryStorage(save);
}

describe('startProgram', () => {
  it('binds the program with its recommended scheduler and initialises the state', () => {
    const store = storageWith(program('P', [w('W0'), rest], 'hybrid'));
    startProgram(store, atDay(5), 'P');

    const save = store.load()!;
    expect(save.activeProgram).toEqual({ programId: 'P', schedulerId: 'hybrid', paused: false });
    expect(save.schedulerState).toMatchObject({ kind: 'hybrid', cursor: 0, cursorDay: 5 });
  });

  it('honours an explicitly chosen scheduler over the recommendation', () => {
    const store = storageWith(program('P', [w('W0')], 'hybrid'));
    startProgram(store, atDay(0), 'P', 'calendar');
    expect(store.load()!.activeProgram!.schedulerId).toBe('calendar');
    expect(store.load()!.schedulerState).toMatchObject({ kind: 'calendar', startDay: 0 });
  });

  it('throws for an unknown program', () => {
    const store = storageWith();
    expect(() => startProgram(store, atDay(0), 'missing')).toThrow();
  });
});

describe('homeState', () => {
  it('is no-program before launch', () => {
    const store = storageWith(program('P', [w('W0')], 'calendar'));
    expect(getHomeState(store, atDay(0)).kind).toBe('no-program');
  });

  it('reports a due workout', () => {
    const store = storageWith(program('P', [w('W0'), rest], 'calendar'));
    startProgram(store, atDay(0), 'P');
    const state = getHomeState(store, atDay(0));
    expect(state.kind).toBe('workout');
    if (state.kind === 'workout') expect(state.workout.id).toBe('W0');
  });

  it('reports completed on the day the workout is finished, then rest the next day', () => {
    const store = storageWith(program('P', [w('W0'), rest], 'calendar'));
    startProgram(store, atDay(0), 'P');
    advanceSchedule(store, atDay(0));
    expect(getHomeState(store, atDay(0)).kind).toBe('completed');
    expect(getHomeState(store, atDay(1)).kind).toBe('rest');
  });

  it('reports paused while paused, and resumes to the underlying state', () => {
    const store = storageWith(program('P', [w('W0')], 'calendar'));
    startProgram(store, atDay(0), 'P');
    pauseProgram(store);
    expect(getHomeState(store, atDay(0)).kind).toBe('paused');
    resumeProgram(store);
    expect(getHomeState(store, atDay(0)).kind).toBe('workout');
  });
});

describe('drive verbs persist through storage', () => {
  it('advanceSchedule moves the hybrid cursor', () => {
    const store = storageWith(program('P', [w('A'), w('B')], 'hybrid'));
    startProgram(store, atDay(0), 'P');
    expect(currentWorkout(store, atDay(0))?.id).toBe('A');
    advanceSchedule(store, atDay(0));
    expect(currentWorkout(store, atDay(0))?.id).toBe('B');
  });

  it('skipSchedule pulls the next workout forward on a hybrid rest day', () => {
    const store = storageWith(program('P', [w('A'), rest, w('B')], 'hybrid'));
    startProgram(store, atDay(0), 'P');
    advanceSchedule(store, atDay(0)); // finish A → rest day next
    expect(currentWorkout(store, atDay(1))).toBeNull(); // rest
    skipSchedule(store, atDay(1)); // начать следующую
    expect(currentWorkout(store, atDay(1))?.id).toBe('B');
  });

  it('a paused program freezes the verbs and currentWorkout', () => {
    const store = storageWith(program('P', [w('A'), w('B')], 'hybrid'));
    startProgram(store, atDay(0), 'P');
    pauseProgram(store);
    expect(currentWorkout(store, atDay(0))).toBeNull();
    advanceSchedule(store, atDay(0)); // no-op while paused
    resumeProgram(store);
    expect(currentWorkout(store, atDay(0))?.id).toBe('A'); // cursor untouched
  });
});

describe('deferCurrentBlock', () => {
  it('seeds the order from the live workout and swaps the block with the next', () => {
    const store = storageWith(program('P', [w('W0', ['a', 'b', 'c'])], 'calendar'));
    startProgram(store, atDay(0), 'P');

    deferCurrentBlock(store, atDay(0), 'a');
    expect(currentWorkout(store, atDay(0))!.blocks.map((b) => b.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('cancel & change scheduler', () => {
  it('cancelProgram clears the binding back to no-program', () => {
    const store = storageWith(program('P', [w('W0')], 'calendar'));
    startProgram(store, atDay(0), 'P');
    cancelProgram(store);

    const save = store.load()!;
    expect(save.activeProgram).toBeNull();
    expect(save.schedulerState).toBeNull();
    expect(getHomeState(store, atDay(0)).kind).toBe('no-program');
  });

  it('changeScheduler swaps the strategy and re-inits state from the clock', () => {
    const store = storageWith(program('P', [w('W0'), rest], 'calendar'));
    startProgram(store, atDay(0), 'P');
    changeScheduler(store, atDay(9), 'hybrid');

    const save = store.load()!;
    expect(save.activeProgram!.schedulerId).toBe('hybrid');
    expect(save.schedulerState).toMatchObject({ kind: 'hybrid', cursorDay: 9 });
  });
});
