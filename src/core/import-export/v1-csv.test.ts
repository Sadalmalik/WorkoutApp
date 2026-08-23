import { describe, it, expect } from 'vitest';
import {
  InMemoryStorage,
  emptySaveData,
  parseCsv,
  parseV1Exercises,
  parseV1Results,
  parseV1Date,
  buildV1ImportDocument,
  collectDedupItems,
  buildImportDiff,
  defaultMergePolicies,
  applyImport,
  runImport,
} from '../index.ts';
import type { SaveData, Exercise } from '../index.ts';

// ---- raw CSV parsing ------------------------------------------------------

describe('parseCsv', () => {
  it('splits simple rows and cells', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps commas inside quoted fields', () => {
    expect(parseCsv('name,note\n"Жим, узкий","раз, два"')).toEqual([
      ['name', 'note'],
      ['Жим, узкий', 'раз, два'],
    ]);
  });

  it('unescapes doubled quotes inside quoted fields', () => {
    expect(parseCsv('a\n"he said ""hi"""')).toEqual([['a'], ['he said "hi"']]);
  });

  it('keeps newlines inside quoted fields', () => {
    expect(parseCsv('a\n"line1\nline2"')).toEqual([['a'], ['line1\nline2']]);
  });

  it('handles CRLF line endings and a trailing newline', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips a leading BOM', () => {
    expect(parseCsv('﻿a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('preserves empty trailing cells', () => {
    expect(parseCsv('a,b,c\n1,,')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', ''],
    ]);
  });
});

// ---- date parsing ---------------------------------------------------------

describe('parseV1Date', () => {
  it('parses ISO YYYY-MM-DD as UTC midnight', () => {
    expect(parseV1Date('2024-01-15')).toBe(Date.UTC(2024, 0, 15));
  });

  it('parses Russian DD.MM.YYYY', () => {
    expect(parseV1Date('15.01.2024')).toBe(Date.UTC(2024, 0, 15));
  });

  it('parses DD/MM/YYYY and 2-digit years', () => {
    expect(parseV1Date('05/03/24')).toBe(Date.UTC(2024, 2, 5));
  });

  it('returns null for empty or unparseable input', () => {
    expect(parseV1Date('')).toBeNull();
    expect(parseV1Date('   ')).toBeNull();
    expect(parseV1Date('not a date')).toBeNull();
  });
});

// ---- «Exercise List» → Exercise[] -----------------------------------------

describe('parseV1Exercises', () => {
  it('maps name, muscleGroup→zone+notes, video links; muscleRefs stays empty', () => {
    const csv = [
      'Name,MuscleGroup,VideoLinks',
      'Жим лёжа,Грудь,https://a.example https://b.example',
    ].join('\n');

    const [ex] = parseV1Exercises(csv);
    expect(ex.name).toBe('Жим лёжа');
    expect(ex.zone).toBe('Грудь');
    expect(ex.notes).toBe('Грудь');
    expect(ex.videoLinks).toEqual(['https://a.example', 'https://b.example']);
    expect(ex.muscleRefs).toEqual([]);
    expect(ex.isBodyweight).toBe(false);
    expect(ex.id).toMatch(/[0-9a-f-]{36}/i);
  });

  it('matches headers regardless of case and surrounding spaces', () => {
    const csv = ['  NAME , Muscle Group ,  video links ', 'Присед,Ноги,'].join('\n');
    const [ex] = parseV1Exercises(csv);
    expect(ex.name).toBe('Присед');
    expect(ex.zone).toBe('Ноги');
    expect(ex.videoLinks).toEqual([]);
  });

  it('prefers an explicit zone column and still keeps muscleGroup in notes', () => {
    const csv = ['name,zone,muscleGroup', 'Тяга,Спина,широчайшие'].join('\n');
    const [ex] = parseV1Exercises(csv);
    expect(ex.zone).toBe('Спина');
    expect(ex.notes).toBe('широчайшие');
  });

  it('handles quoted commas and gives each exercise a distinct id', () => {
    const csv = ['name,muscleGroup', '"Жим, узкий",Грудь', 'Присед,Ноги'].join('\n');
    const list = parseV1Exercises(csv);
    expect(list.map((e) => e.name)).toEqual(['Жим, узкий', 'Присед']);
    expect(list[0].id).not.toBe(list[1].id);
  });

  it('skips rows with an empty name', () => {
    const csv = ['name,muscleGroup', ',Грудь', 'Присед,Ноги'].join('\n');
    expect(parseV1Exercises(csv).map((e) => e.name)).toEqual(['Присед']);
  });
});

// ---- «Results» → Result[] -------------------------------------------------

describe('parseV1Results', () => {
  const exercises: Exercise[] = parseV1Exercises(
    ['name,muscleGroup', 'Жим лёжа,Грудь', 'Присед,Ноги'].join('\n'),
  );
  const benchId = exercises[0].id;

  it('maps actWeight/actReps/date and links by exercise name', () => {
    const csv = [
      'date,weekday,setNumber,exerciseName,recWeight,recReps,actWeight,actReps',
      '2024-01-15,Mon,1,Жим лёжа,80,8,82.5,7',
    ].join('\n');

    const [r] = parseV1Results(csv, exercises);
    expect(r.exerciseId).toBe(benchId);
    expect(r.weight).toBe(82.5);
    expect(r.reps).toBe(7);
    expect(r.timestamp).toBe(Date.UTC(2024, 0, 15));
  });

  it('matches exercise name case-insensitively', () => {
    const csv = ['date,exerciseName,actWeight,actReps', '2024-01-15,ЖИМ ЛЁЖА,80,8'].join('\n');
    expect(parseV1Results(csv, exercises)[0].exerciseId).toBe(benchId);
  });

  it('tolerates a comma decimal separator in weight', () => {
    const csv = ['date,exerciseName,actWeight,actReps', '2024-01-15,Присед,100,5'].join('\n');
    expect(parseV1Results(csv, exercises)[0].weight).toBe(100);
    const csv2 = ['date,exerciseName,actWeight,actReps', '2024-01-15,Присед,"92,5",5'].join('\n');
    expect(parseV1Results(csv2, exercises)[0].weight).toBe(92.5);
  });

  it('skips rows with an unknown exercise, or missing weight/reps/date', () => {
    const csv = [
      'date,exerciseName,actWeight,actReps',
      '2024-01-15,Неизвестное,80,8', // unknown exercise
      ',Жим лёжа,80,8', // missing date
      '2024-01-15,Жим лёжа,,8', // missing weight (planned, not performed)
      '2024-01-15,Жим лёжа,80,', // missing reps
      '2024-01-15,Присед,100,5', // valid
    ].join('\n');

    const results = parseV1Results(csv, exercises);
    expect(results).toHaveLength(1);
    expect(results[0].exerciseId).toBe(exercises[1].id);
  });
});

// ---- document assembly + pipeline round-trip ------------------------------

const EXERCISES_CSV = ['name,muscleGroup,videoLinks', 'Жим лёжа,Грудь,', 'Присед,Ноги,'].join('\n');
const RESULTS_CSV = [
  'date,exerciseName,actWeight,actReps',
  '2024-01-15,Жим лёжа,80,8',
  '2024-01-16,Присед,100,5',
].join('\n');

describe('buildV1ImportDocument', () => {
  it('wraps exercises and results in a full export; results link to collected exercises', () => {
    const doc = buildV1ImportDocument(
      { exercisesCsv: EXERCISES_CSV, resultsCsv: RESULTS_CSV, importResults: true, exportedAt: 42 },
    );
    expect(doc.kind).toBe('full');
    expect(doc.exportedAt).toBe(42);
    expect(doc.exercises).toHaveLength(2);
    expect(doc.results).toHaveLength(2);
    expect(doc.muscles).toEqual([]);
    expect(doc.programs).toEqual([]);

    const exIds = new Set(doc.exercises.map((e) => e.id));
    for (const r of doc.results) expect(exIds.has(r.exerciseId)).toBe(true);
  });

  it('omits results when importResults is false', () => {
    const doc = buildV1ImportDocument(
      { exercisesCsv: EXERCISES_CSV, resultsCsv: RESULTS_CSV, importResults: false, exportedAt: 1 },
    );
    expect(doc.results).toEqual([]);
    expect(doc.exercises).toHaveLength(2);
  });
});

describe('v1 CSV through the ticket-12 pipeline', () => {
  it('applies into an empty save: exercises added, results carried', () => {
    const doc = buildV1ImportDocument(
      { exercisesCsv: EXERCISES_CSV, resultsCsv: RESULTS_CSV, importResults: true, exportedAt: 1 },
    );
    const existing = emptySaveData();

    expect(collectDedupItems(doc, existing)).toEqual([]); // no name clashes
    const next = applyImport(doc, existing, {}, defaultMergePolicies());

    expect(next.exercises.map((e) => e.name).sort()).toEqual(['Жим лёжа', 'Присед']);
    expect(next.results).toHaveLength(2);
    const benchId = next.exercises.find((e) => e.name === 'Жим лёжа')!.id;
    expect(next.results.some((r) => r.exerciseId === benchId && r.weight === 80)).toBe(true);
  });

  it('dedups a name clash against the existing catalog and re-links its results', () => {
    const existing = emptySaveData();
    existing.exercises = [
      {
        id: 'existing-bench',
        name: 'Жим лёжа',
        zone: 'Грудь',
        videoLinks: [],
        isBodyweight: false,
        equipmentWeightStep: 2.5,
        notes: '',
        muscleRefs: [],
      },
    ];

    const doc = buildV1ImportDocument(
      { exercisesCsv: EXERCISES_CSV, resultsCsv: RESULTS_CSV, importResults: true, exportedAt: 1 },
      existing,
    );

    const items = collectDedupItems(doc, existing);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Жим лёжа');
    expect(items[0].existingId).toBe('existing-bench');

    // Default Pass-1 answer is "duplicate": the CSV bench collapses onto the existing exercise.
    const next = applyImport(doc, existing, {}, defaultMergePolicies());
    expect(next.exercises.map((e) => e.name).sort()).toEqual(['Жим лёжа', 'Присед']);
    // The bench result re-links to the existing exercise id.
    expect(next.results.some((r) => r.exerciseId === 'existing-bench' && r.weight === 80)).toBe(true);
  });

  it('with a distinct decision, keeps a separate exercise and its results follow the fresh id', () => {
    const existing = emptySaveData();
    existing.exercises = [
      {
        id: 'existing-bench',
        name: 'Жим лёжа',
        zone: 'Другое',
        videoLinks: [],
        isBodyweight: false,
        equipmentWeightStep: 2.5,
        notes: '',
        muscleRefs: [],
      },
    ];

    const doc = buildV1ImportDocument(
      { exercisesCsv: EXERCISES_CSV, resultsCsv: RESULTS_CSV, importResults: true, exportedAt: 1 },
      existing,
    );
    const incomingBenchId = doc.exercises.find((e) => e.name === 'Жим лёжа')!.id;

    const next = applyImport(doc, existing, { [incomingBenchId]: 'distinct' }, defaultMergePolicies());

    // Two exercises named «Жим лёжа» now coexist under different ids.
    const benches = next.exercises.filter((e) => e.name === 'Жим лёжа');
    expect(benches).toHaveLength(2);
    const freshBench = benches.find((e) => e.id !== 'existing-bench')!;
    expect(next.results.some((r) => r.exerciseId === freshBench.id && r.weight === 80)).toBe(true);
  });

  it('does not clobber existing settings/session when base is passed', () => {
    const existing: SaveData = emptySaveData();
    existing.settings = { theme: 'dark', colorblindPalette: 'deuteranopia', continueThresholdHours: 12 };
    existing.session = { id: 'live-session' } as SaveData['session'];

    const doc = buildV1ImportDocument(
      { exercisesCsv: EXERCISES_CSV, importResults: false, exportedAt: 1 },
      existing,
    );
    const next = applyImport(doc, existing, {}, defaultMergePolicies());

    expect(next.settings).toEqual(existing.settings);
    expect(next.session).toEqual(existing.session);
  });

  it('runImport persists the merged save through storage', () => {
    const storage = new InMemoryStorage();
    const doc = buildV1ImportDocument(
      { exercisesCsv: EXERCISES_CSV, resultsCsv: RESULTS_CSV, importResults: true, exportedAt: 1 },
    );
    runImport(storage, doc, {}, defaultMergePolicies());

    const stored = storage.load()!;
    expect(stored.exercises).toHaveLength(2);
    expect(stored.results).toHaveLength(2);
  });

  it('buildImportDiff reports the incoming exercises as adds in an empty save', () => {
    const doc = buildV1ImportDocument(
      { exercisesCsv: EXERCISES_CSV, importResults: false, exportedAt: 1 },
    );
    const diff = buildImportDiff(doc, emptySaveData(), {});
    expect(diff.items.every((i) => i.status === 'add')).toBe(true);
    expect(diff.items).toHaveLength(2);
  });
});
