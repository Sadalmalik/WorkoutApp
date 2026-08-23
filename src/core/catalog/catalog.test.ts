import { describe, it, expect } from 'vitest';
import { InMemoryStorage, emptySaveData } from '../index.ts';
import type { Exercise } from '../index.ts';
import {
  DEFAULT_WEIGHT_STEP,
  createExercise,
  updateExercise,
  getExercise,
  listExercises,
  searchExercises,
  collectZones,
} from './catalog.ts';

function freshStorage() {
  return new InMemoryStorage(emptySaveData());
}

describe('createExercise', () => {
  it('assigns a fresh id, applies defaults and persists', () => {
    const storage = freshStorage();

    const created = createExercise(storage, { name: 'Приседания' });

    expect(created.id).toMatch(/[0-9a-f-]{36}/i);
    expect(created.zone).toBe('');
    expect(created.videoLinks).toEqual([]);
    expect(created.isBodyweight).toBe(false);
    expect(created.equipmentWeightStep).toBe(DEFAULT_WEIGHT_STEP);
    expect(created.notes).toBe('');
    expect(created.muscleRefs).toEqual([]);

    // Persisted through the port.
    expect(storage.load()?.exercises).toEqual([created]);
  });

  it('keeps full field set from the draft and trims text', () => {
    const storage = freshStorage();

    const created = createExercise(storage, {
      name: '  Жим лёжа  ',
      zone: '  Грудь ',
      videoLinks: [' https://a ', '', '  '],
      isBodyweight: false,
      equipmentWeightStep: 1.25,
      notes: 'узкий хват',
    });

    expect(created.name).toBe('Жим лёжа');
    expect(created.zone).toBe('Грудь');
    expect(created.videoLinks).toEqual(['https://a']);
    expect(created.equipmentWeightStep).toBe(1.25);
    expect(created.notes).toBe('узкий хват');
  });

  it('gives each new exercise a distinct id', () => {
    const storage = freshStorage();
    const a = createExercise(storage, { name: 'A' });
    const b = createExercise(storage, { name: 'B' });
    expect(a.id).not.toBe(b.id);
    expect(listExercises(storage)).toHaveLength(2);
  });

  it('seeds an empty save when storage was empty', () => {
    const storage = new InMemoryStorage(); // load() === null
    const created = createExercise(storage, { name: 'X' });
    expect(storage.load()?.exercises).toEqual([created]);
  });
});

describe('updateExercise', () => {
  it('patches only supplied fields and keeps the id', () => {
    const storage = freshStorage();
    const created = createExercise(storage, { name: 'Тяга', zone: 'Спина', notes: 'n' });

    const updated = updateExercise(storage, created.id, { zone: 'Поясница' });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Тяга');
    expect(updated.zone).toBe('Поясница');
    expect(updated.notes).toBe('n');
    expect(getExercise(storage, created.id)).toEqual(updated);
  });

  it('normalizes patched text and links', () => {
    const storage = freshStorage();
    const created = createExercise(storage, { name: 'Тяга' });

    const updated = updateExercise(storage, created.id, {
      name: '  Тяга штанги ',
      videoLinks: ['  https://v ', ''],
    });

    expect(updated.name).toBe('Тяга штанги');
    expect(updated.videoLinks).toEqual(['https://v']);
  });

  it('throws for an unknown id', () => {
    const storage = freshStorage();
    expect(() => updateExercise(storage, 'nope', { name: 'x' })).toThrow(/not found/i);
  });
});

describe('getExercise / listExercises', () => {
  it('returns undefined for a missing id', () => {
    const storage = freshStorage();
    expect(getExercise(storage, 'missing')).toBeUndefined();
  });

  it('lists all exercises sorted by name', () => {
    const storage = freshStorage();
    createExercise(storage, { name: 'Ягодичный мост' });
    createExercise(storage, { name: 'Бицепс' });
    createExercise(storage, { name: 'Жим' });

    expect(listExercises(storage).map((e) => e.name)).toEqual([
      'Бицепс',
      'Жим',
      'Ягодичный мост',
    ]);
  });
});

describe('searchExercises', () => {
  const catalog: Exercise[] = [
    ex('Жим гантелей лёжа 30°', 'Грудь'),
    ex('Жим штанги лёжа', 'Грудь'),
    ex('Приседания со штангой', 'Ноги'),
    ex('Тяга верхнего блока', 'Спина'),
  ];

  it('is case-insensitive', () => {
    expect(names(searchExercises(catalog, 'жим'))).toEqual(['Жим гантелей лёжа 30°', 'Жим штанги лёжа']);
    expect(names(searchExercises(catalog, 'ЖИМ'))).toEqual(['Жим гантелей лёжа 30°', 'Жим штанги лёжа']);
  });

  it('matches on a name substring anywhere in the name', () => {
    expect(names(searchExercises(catalog, 'гантел'))).toEqual(['Жим гантелей лёжа 30°']);
    expect(names(searchExercises(catalog, 'блока'))).toEqual(['Тяга верхнего блока']);
  });

  it('matches by zone', () => {
    expect(names(searchExercises(catalog, 'спина'))).toEqual(['Тяга верхнего блока']);
    expect(names(searchExercises(catalog, 'грудь'))).toEqual(['Жим гантелей лёжа 30°', 'Жим штанги лёжа']);
  });

  it('returns everything (sorted) for an empty or whitespace query', () => {
    expect(names(searchExercises(catalog, ''))).toEqual([
      'Жим гантелей лёжа 30°',
      'Жим штанги лёжа',
      'Приседания со штангой',
      'Тяга верхнего блока',
    ]);
    expect(searchExercises(catalog, '   ')).toHaveLength(4);
  });

  it('returns an empty result when nothing matches (drives the create-new affordance)', () => {
    expect(searchExercises(catalog, 'становая')).toEqual([]);
  });

  it('sorts results by name', () => {
    // 'Жим штанги' comes after 'Жим гантелей' alphabetically.
    expect(names(searchExercises(catalog, 'жим'))[0]).toBe('Жим гантелей лёжа 30°');
  });
});

describe('collectZones', () => {
  it('returns distinct, non-empty, sorted zones', () => {
    const catalog: Exercise[] = [
      ex('a', 'Грудь'),
      ex('b', 'Спина'),
      ex('c', 'Грудь'),
      ex('d', ''),
      ex('e', 'Ноги'),
    ];
    expect(collectZones(catalog)).toEqual(['Грудь', 'Ноги', 'Спина']);
  });

  it('de-duplicates case-insensitively, keeping the first spelling', () => {
    const catalog: Exercise[] = [ex('a', 'Грудь'), ex('b', 'грудь')];
    expect(collectZones(catalog)).toEqual(['Грудь']);
  });
});

function ex(name: string, zone: string): Exercise {
  return {
    id: name,
    name,
    zone,
    videoLinks: [],
    isBodyweight: false,
    equipmentWeightStep: 2.5,
    notes: '',
    muscleRefs: [],
  };
}

function names(list: Exercise[]): string[] {
  return list.map((e) => e.name);
}
