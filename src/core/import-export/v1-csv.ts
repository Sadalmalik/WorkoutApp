/**
 * v1 → v2 migration via CSV (ticket 13).
 *
 * The v1 app kept its data in a Google Sheet with two tabs, «Exercise List» and «Results». This
 * module turns their CSV exports into core model entities and wraps them in a {@link FullExport}
 * document so the ticket-12 merge pipeline ({@link collectDedupItems} → {@link applyImport} /
 * {@link runImport}) handles the actual merge — name dedup against the existing catalog, fresh ids
 * for "distinct" name clashes, reference re-linking. No merge logic is duplicated here.
 *
 * Pure of DOM/React (ARCH invariant #1): the UI reads the two files and hands their text in.
 *
 * ### Field mapping
 * - «Exercise List»: `name` → {@link Exercise.name}; `zone` (or, when the export has no zone column,
 *   the v1 `muscleGroup` value, which in v1 encoded the coarse zone) → {@link Exercise.zone}; the
 *   free-text `muscleGroup` → {@link Exercise.notes} (structured muscle links are Phase 2, so
 *   `muscleRefs` stays empty); `videoLinks` → {@link Exercise.videoLinks}. Each exercise gets a
 *   fresh {@link newId}.
 * - «Results» (optional): each row with a usable `actWeight`/`actReps` becomes one {@link Result}
 *   ({@link Result.weight}/{@link Result.reps}); the row `date` → {@link Result.timestamp}; the row
 *   `exerciseName` is matched by name (case-insensitive, trimmed) to a just-parsed exercise and the
 *   result points at that exercise's fresh id. Rows whose exercise name matches nothing, or whose
 *   weight/reps/date are missing or unparseable, are skipped.
 *
 * Column headers are matched by a normalized name (lower-cased, stripped of spaces/underscores), so
 * header casing and spacing do not matter and a small set of ru/en aliases is accepted.
 */

import type { Exercise, Result, SaveData } from '../model/index.ts';
import { SCHEMA_VERSION, newId, DEFAULT_SETTINGS } from '../model/index.ts';
import type { FullExport } from './export.ts';


// ---- CSV parsing ----------------------------------------------------------

/**
 * Parse RFC-4180-style CSV `text` into rows of string cells.
 *
 * Handles quoted fields (`"a,b"`), embedded quotes (`""` → `"`), embedded newlines inside quotes,
 * both `\n` and `\r\n` line endings, and a leading UTF-8 BOM. A single trailing newline does not
 * produce a spurious empty row; blank rows in the middle are preserved (callers skip them).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1; // strip BOM

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n') {
      pushRow();
    } else if (c === '\r') {
      // swallow; the following '\n' (if any) ends the row, a lone '\r' does too
      if (text[i + 1] !== '\n') pushRow();
    } else {
      field += c;
    }
  }

  // Flush the final field/row unless the input ended exactly on a row break.
  if (field !== '' || row.length > 0) {
    pushRow();
  }

  return rows;
}

/** Normalize a header cell for matching: lower-case, drop surrounding/inner whitespace and `_`. */
function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/[\s_]+/g, '');
}

/** True when a row has no non-empty cells (a blank line). */
function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === '');
}

/**
 * Split rows into a header index and the data rows.
 * The first non-blank row is the header; `aliases` maps a logical column key to accepted
 * normalized header spellings. Returns `null` when there is no header row.
 */
function indexColumns(
  rows: string[][],
  aliases: Record<string, string[]>,
): { columns: Record<string, number>; data: string[][] } | null {
  const headerIdx = rows.findIndex((r) => !isBlankRow(r));
  if (headerIdx === -1) return null;

  const header = rows[headerIdx].map(normalizeHeader);
  const columns: Record<string, number> = {};
  for (const [key, spellings] of Object.entries(aliases)) {
    const idx = header.findIndex((h) => spellings.includes(h));
    if (idx !== -1) columns[key] = idx;
  }

  const data = rows.slice(headerIdx + 1).filter((r) => !isBlankRow(r));
  return { columns, data };
}

function cell(row: string[], index: number | undefined): string {
  if (index === undefined) return '';
  return (row[index] ?? '').trim();
}


// ---- «Exercise List» → Exercise[] -----------------------------------------

const EXERCISE_COLUMNS: Record<string, string[]> = {
  name: ['name', 'имя', 'название', 'exercise', 'exercisename', 'упражнение'],
  zone: ['zone', 'зона'],
  muscleGroup: [
    'musclegroup',
    'muscles',
    'muscle',
    'мышцы',
    'группамышц',
    'мышечнаягруппа',
    'группа',
  ],
  videoLinks: ['videolinks', 'video', 'videolink', 'видео', 'ссылки', 'ссылка', 'links'],
};

/**
 * Parse an «Exercise List» CSV into catalog {@link Exercise} entities (each with a fresh id).
 *
 * A row is skipped when its `name` cell is empty. `videoLinks` is split on whitespace / `;` / `,`
 * (URLs carry no spaces), so several links in one cell survive. See the module doc for the full
 * field mapping.
 */
export function parseV1Exercises(csv: string): Exercise[] {
  const indexed = indexColumns(parseCsv(csv), EXERCISE_COLUMNS);
  if (indexed === null) return [];
  const { columns, data } = indexed;

  const exercises: Exercise[] = [];
  for (const row of data) {
    const name = cell(row, columns.name);
    if (name === '') continue;

    const muscleGroup = cell(row, columns.muscleGroup);
    const zoneCell = cell(row, columns.zone);
    // v1 `muscleGroup` doubled as the coarse zone; fall back to it when there is no zone column,
    // and always preserve the free-text original in notes for the Phase-2 muscle-catalog linking.
    const zone = zoneCell !== '' ? zoneCell : muscleGroup;

    exercises.push({
      id: newId(),
      name,
      zone,
      videoLinks: splitLinks(cell(row, columns.videoLinks)),
      isBodyweight: false,
      equipmentWeightStep: DEFAULT_WEIGHT_STEP,
      notes: muscleGroup,
      muscleRefs: [],
    });
  }
  return exercises;
}

/** Default equipment weight step (kg) applied to imported exercises (mirrors the catalog default). */
const DEFAULT_WEIGHT_STEP = 2.5;

/** Split a video-links cell into individual non-empty links. */
function splitLinks(raw: string): string[] {
  if (raw === '') return [];
  return raw
    .split(/[\s;,]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}


// ---- «Results» → Result[] -------------------------------------------------

const RESULT_COLUMNS: Record<string, string[]> = {
  date: ['date', 'дата'],
  exerciseName: ['exercisename', 'exercise', 'name', 'упражнение', 'название'],
  actWeight: ['actweight', 'actualweight', 'weight', 'вес', 'фактическийвес'],
  actReps: ['actreps', 'actualreps', 'reps', 'повторы', 'повторения', 'фактическиеповторения'],
};

/**
 * Parse a «Results» CSV into {@link Result} history, linked to `exercises` by name.
 *
 * `exercises` are the entities returned by {@link parseV1Exercises} for the same import: a result's
 * `exerciseName` is matched to one of them (case-insensitive, trimmed) and the result carries that
 * exercise's id, so the two CSV blocks are internally consistent before they reach the pipeline.
 *
 * A row is skipped when its exercise name matches nothing, or its date / `actWeight` / `actReps`
 * cannot be parsed (e.g. a planned-but-not-performed set with empty actuals).
 */
export function parseV1Results(csv: string, exercises: ReadonlyArray<Exercise>): Result[] {
  const indexed = indexColumns(parseCsv(csv), RESULT_COLUMNS);
  if (indexed === null) return [];
  const { columns, data } = indexed;

  const idByName = new Map<string, string>();
  for (const ex of exercises) {
    const key = ex.name.trim().toLowerCase();
    if (!idByName.has(key)) idByName.set(key, ex.id);
  }

  const results: Result[] = [];
  for (const row of data) {
    const exerciseId = idByName.get(cell(row, columns.exerciseName).toLowerCase());
    if (exerciseId === undefined) continue;

    const weight = parseNumber(cell(row, columns.actWeight));
    const reps = parseNumber(cell(row, columns.actReps));
    const timestamp = parseV1Date(cell(row, columns.date));
    if (weight === null || reps === null || timestamp === null) continue;

    results.push({ id: newId(), exerciseId, timestamp, weight, reps });
  }
  return results;
}

/** Parse a numeric cell, tolerating a comma decimal separator; `null` when empty/unparseable. */
function parseNumber(raw: string): number | null {
  if (raw === '') return null;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a v1 date cell into epoch ms (UTC midnight), or `null`.
 *
 * Accepts ISO `YYYY-MM-DD` (and anything else {@link Date.parse} understands) plus the Russian
 * `DD.MM.YYYY` / `DD/MM/YYYY` forms (2-digit years are read as 20xx). UTC is used so the mapping is
 * independent of the machine timezone.
 */
export function parseV1Date(raw: string): number | null {
  const s = raw.trim();
  if (s === '') return null;

  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return Date.UTC(year, month - 1, day);
  }

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}


// ---- Assemble the import document -----------------------------------------

/** Inputs for {@link buildV1ImportDocument}: the two CSV texts plus the history toggle. */
export interface V1ImportInput {
  /** Text of the «Exercise List» CSV export. */
  exercisesCsv: string;
  /** Text of the «Results» CSV export; ignored unless {@link importResults} is true. */
  resultsCsv?: string | null;
  /** When true (and `resultsCsv` is present), the results history is parsed and included. */
  importResults: boolean;
  /** Epoch ms stamped into the envelope (pass `clock.now()` from the UI). */
  exportedAt: number;
}

/**
 * Build a {@link FullExport} document from v1 CSV, ready for the ticket-12 pipeline.
 *
 * The exercises (and, when requested, the results linked to them) go into an otherwise empty full
 * export. Because {@link applyImport} **replaces** a full export's `settings` / `activeProgram` /
 * `schedulerState` / `session`, pass the current save as `base` so those sections mirror it and the
 * replace is a no-op — importing a v1 catalog then never clobbers the user's live settings/session.
 * With no `base` (e.g. importing into a fresh install) those sections take empty defaults.
 *
 * @returns a full-export document; feed it to {@link collectDedupItems} → {@link applyImport} /
 *   {@link runImport} exactly like a parsed file.
 */
export function buildV1ImportDocument(input: V1ImportInput, base?: SaveData): FullExport {
  const exercises = parseV1Exercises(input.exercisesCsv);
  const results =
    input.importResults && input.resultsCsv != null
      ? parseV1Results(input.resultsCsv, exercises)
      : [];

  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'full',
    exportedAt: input.exportedAt,
    exercises,
    muscles: [],
    programs: [],
    activeProgram: base?.activeProgram ?? null,
    schedulerState: base?.schedulerState ?? null,
    results,
    bodyweightLog: [],
    session: base?.session ?? null,
    settings: base ? base.settings : { ...DEFAULT_SETTINGS },
  };
}
