/**
 * Data import — the two-pass merge pipeline (ticket 12).
 *
 * Reads an {@link ExportDocument} written by {@link ./export.ts} (either a `full` backup or a
 * `program-share` bundle) and merges it into an existing {@link SaveData} without clobbering data
 * and without creating duplicates. Pure of DOM/React (ARCH invariant #1): the UI hands in the file
 * text and the user's answers, the pipeline returns a new {@link SaveData}; a thin `runImport`
 * wrapper persists it through the injected {@link Storage} port.
 *
 * The pipeline is designed as a sequence of pure stages so the UI can ask its questions
 * incrementally:
 *
 *   1. {@link parseImportDocument} — text → validated {@link ExportDocument} (throws {@link ImportError}).
 *   2. {@link collectDedupItems} — Pass 1: every incoming *named* entity (exercise / muscle /
 *      program) whose name collides with an existing one (but whose id differs) becomes a
 *      "duplicate or distinct?" question.
 *   3. {@link buildImportDiff} — Pass 2: given the pass-1 answers, an add/changed/identical diff of
 *      the named catalogs, so the UI can pick a merge policy per type and per item.
 *   4. {@link applyImport} — given both passes' decisions, produce the merged {@link SaveData}:
 *      re-linked references, policy-applied catalogs, union-deduped results / bodyweight, and (for a
 *      full backup only) replaced settings / scheduler state / session.
 *
 * ### Identity vs content
 * Pass 1 resolves *identity* (is this the same real-world thing as the existing entity, or a
 * coincidental name clash?). Pass 2 resolves *content* (for entities that landed on an existing id,
 * keep existing / take incoming / keep both). References inside the incoming document are rewritten
 * exactly once, at {@link applyImport} time, from the final `incomingId → finalId` map that both
 * passes together determine — so a "distinct" exercise (fresh id) and every incoming block / result
 * / session slot that pointed at it stay internally consistent.
 */

import type {
  SaveData,
  Exercise,
  Muscle,
  Program,
  Result,
  BodyweightEntry,
  ActiveProgram,
  Session,
} from '../model/index.ts';
import { SCHEMA_VERSION, emptySaveData, newId } from '../model/index.ts';
import type { Storage } from '../ports/index.ts';
import type { ExportDocument } from './export.ts';


/** The three entity kinds that carry a name and therefore take part in Pass-1 name dedup. */
export type NamedKind = 'exercise' | 'muscle' | 'program';

/**
 * Pass-1 answer for one name collision:
 * - `duplicate` — the incoming entity *is* the existing one; its incoming references collapse onto
 *   the existing id (Pass 2 then decides whether to keep or overwrite the existing content).
 * - `distinct` — a coincidental name clash; the incoming entity is given a fresh id and every
 *   incoming reference to it is re-linked to that fresh id, so it is added as a separate entity.
 */
export type DedupDecision = 'duplicate' | 'distinct';

/** One Pass-1 question: an incoming named entity whose name matched an existing entity (different id). */
export interface DedupItem {
  kind: NamedKind;
  /** Id of the entity as it appears in the incoming document. */
  incomingId: string;
  /** The colliding name (matched exactly against the existing catalog). */
  name: string;
  /** Id of the existing entity that shares the name. */
  existingId: string;
}

/** Pass-1 answers, keyed by {@link DedupItem.incomingId}. Missing answers default to `duplicate`. */
export type DedupDecisions = Record<string, DedupDecision>;

/** How an incoming named entity relates to the existing catalog once Pass-1 identities are resolved. */
export type DiffStatus = 'add' | 'identical' | 'changed';

/**
 * Pass-2 merge policy for an entity that landed on an existing id (`identical` / `changed`):
 * - `skip` — keep the existing entity, drop the incoming content (default).
 * - `overwrite` — replace the existing entity's content with the incoming one.
 * - `keep-both` — add the incoming entity as a separate entity under a fresh id (references to it
 *   follow to the fresh id).
 *
 * `add` entities ignore the policy — they are always added.
 */
export type MergePolicy = 'skip' | 'overwrite' | 'keep-both';

/** One row of the Pass-2 diff for a named entity. */
export interface DiffItem {
  kind: NamedKind;
  /** Id of the entity in the incoming document (before the final re-link). */
  incomingId: string;
  /** Existing id the entity maps onto when `status !== 'add'`; equals `incomingId` for an add. */
  targetId: string;
  name: string;
  status: DiffStatus;
}

/** The Pass-2 diff handed to the UI: one {@link DiffItem} per incoming named entity. */
export interface ImportDiff {
  items: DiffItem[];
}

/** Pass-2 policy selection: a default per type, overridable per item. */
export interface MergePolicies {
  /** Default policy for each named kind. */
  perType: Record<NamedKind, MergePolicy>;
  /** Per-item overrides, keyed by {@link DiffItem.incomingId}. */
  perItem: Record<string, MergePolicy>;
}

/** Raised by {@link parseImportDocument} when the file is not a valid, importable export document. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}



/**
 * Parse and validate import file `text` into an {@link ExportDocument}.
 *
 * Rejects malformed JSON, an unknown `kind`, a `schemaVersion` this build cannot read, and missing
 * required sections. Returns the document unchanged on success (no merging happens here).
 *
 * @throws {@link ImportError} on any structural problem.
 */
export function parseImportDocument(text: string): ExportDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('Файл не является корректным JSON.');
  }

  if (raw === null || typeof raw !== 'object') {
    throw new ImportError('Ожидался объект документа экспорта.');
  }

  const doc = raw as Record<string, unknown>;
  const kind = doc.kind;
  if (kind !== 'full' && kind !== 'program-share') {
    throw new ImportError(`Неизвестный тип документа: ${String(kind)}.`);
  }

  const version = doc.schemaVersion;
  if (typeof version !== 'number') {
    throw new ImportError('Отсутствует поле schemaVersion.');
  }
  if (version > SCHEMA_VERSION) {
    throw new ImportError(
      `Версия файла (${version}) новее поддерживаемой (${SCHEMA_VERSION}). Обновите приложение.`,
    );
  }
  if (version < SCHEMA_VERSION) {
    // Only v1 exists so far; older versions have no migration path yet.
    throw new ImportError(`Версия файла (${version}) не поддерживается.`);
  }

  requireArray(doc, 'programs');
  requireArray(doc, 'exercises');
  requireArray(doc, 'muscles');
  if (kind === 'full') {
    requireArray(doc, 'results');
    requireArray(doc, 'bodyweightLog');
    if (doc.settings === null || typeof doc.settings !== 'object') {
      throw new ImportError('Полный экспорт без секции settings.');
    }
  }

  return raw as ExportDocument;
}

function requireArray(doc: Record<string, unknown>, field: string): void {
  if (!Array.isArray(doc[field])) {
    throw new ImportError(`Секция «${field}» отсутствует или имеет неверный формат.`);
  }
}



/**
 * Pass 1: the "duplicate or distinct?" questions for this document against `existing`.
 *
 * A question is raised for an incoming named entity only when its name matches an existing entity of
 * the same kind **and** their ids differ. When the incoming id already exists, or no existing entity
 * shares the name, there is nothing ambiguous and no question is produced.
 */
export function collectDedupItems(doc: ExportDocument, existing: SaveData): DedupItem[] {
  const items: DedupItem[] = [];
  collectKind(items, 'exercise', doc.exercises, existing.exercises);
  collectKind(items, 'muscle', doc.muscles, existing.muscles);
  collectKind(items, 'program', doc.programs, existing.programs);
  return items;
}

function collectKind(
  out: DedupItem[],
  kind: NamedKind,
  incoming: ReadonlyArray<{ id: string; name: string }>,
  existing: ReadonlyArray<{ id: string; name: string }>,
): void {
  const existingIds = new Set(existing.map((e) => e.id));
  const byName = new Map<string, string>();
  for (const e of existing) {
    if (!byName.has(e.name)) byName.set(e.name, e.id);
  }

  for (const inc of incoming) {
    if (existingIds.has(inc.id)) continue; // same id → same entity, no question
    const existingId = byName.get(inc.name);
    if (existingId === undefined) continue; // unique name → a plain add, no question
    out.push({ kind, incomingId: inc.id, name: inc.name, existingId });
  }
}



/** Per-entity outcome of Pass-1 identity resolution, before any content policy is applied. */
interface EntityResolution {
  kind: NamedKind;
  incomingId: string;
  name: string;
  /** Id the entity lands on after Pass 1: an existing id (duplicate/same), or a fresh id (distinct). */
  interimId: string;
  /** Content status against the existing catalog at `interimId`. */
  status: DiffStatus;
  /** The incoming entity rewritten with the interim id maps, used for the content diff and overwrite. */
  rewritten: unknown;
}

/** Interim `incomingId → landing id` maps, one per named kind. */
interface InterimMaps {
  exercise: Map<string, string>;
  muscle: Map<string, string>;
  program: Map<string, string>;
}

interface Resolution {
  entities: EntityResolution[];
  maps: InterimMaps;
}

/**
 * Apply Pass-1 decisions to build, per named kind, the interim `incomingId → landing id` map, then
 * classify each incoming entity (add / identical / changed) against the existing catalog.
 *
 * Not pure: `distinct` decisions mint fresh ids via {@link newId}. The concrete fresh values are
 * irrelevant to the diff (they only ever classify as `add`); {@link applyImport} runs its own
 * resolution so the ids it persists are internally consistent.
 */
function resolve(doc: ExportDocument, existing: SaveData, decisions: DedupDecisions): Resolution {
  const maps: InterimMaps = {
    exercise: landingMap(doc.exercises, existing.exercises, decisions),
    muscle: landingMap(doc.muscles, existing.muscles, decisions),
    program: landingMap(doc.programs, existing.programs, decisions),
  };

  const entities: EntityResolution[] = [];
  classifyKind(entities, 'exercise', doc.exercises, existing.exercises, maps, (e) =>
    rewriteExercise(e, maps),
  );
  classifyKind(entities, 'muscle', doc.muscles, existing.muscles, maps, (m) =>
    rewriteMuscle(m, maps),
  );
  classifyKind(entities, 'program', doc.programs, existing.programs, maps, (p) =>
    rewriteProgram(p, maps),
  );

  return { entities, maps };
}

/** Build the interim landing map for one kind from Pass-1 decisions. */
function landingMap(
  incoming: ReadonlyArray<{ id: string; name: string }>,
  existing: ReadonlyArray<{ id: string; name: string }>,
  decisions: DedupDecisions,
): Map<string, string> {
  const existingIds = new Set(existing.map((e) => e.id));
  const byName = new Map<string, string>();
  for (const e of existing) {
    if (!byName.has(e.name)) byName.set(e.name, e.id);
  }

  const map = new Map<string, string>();
  for (const inc of incoming) {
    if (existingIds.has(inc.id)) {
      map.set(inc.id, inc.id); // same id → same entity
      continue;
    }
    const existingId = byName.get(inc.name);
    if (existingId === undefined) {
      map.set(inc.id, inc.id); // plain add, keeps its id
      continue;
    }
    const decision = decisions[inc.id] ?? 'duplicate';
    map.set(inc.id, decision === 'distinct' ? newId() : existingId);
  }
  return map;
}

function classifyKind(
  out: EntityResolution[],
  kind: NamedKind,
  incoming: ReadonlyArray<{ id: string; name: string }>,
  existing: ReadonlyArray<{ id: string }>,
  maps: InterimMaps,
  rewrite: (entity: unknown) => unknown,
): void {
  const existingById = new Map(existing.map((e) => [e.id, e]));
  const kindMap = maps[kind];

  for (const inc of incoming) {
    const interimId = kindMap.get(inc.id) ?? inc.id;
    const rewritten = rewrite(inc);
    const existingEntity = existingById.get(interimId);
    const status: DiffStatus =
      existingEntity === undefined ? 'add' : deepEqual(rewritten, existingEntity) ? 'identical' : 'changed';
    out.push({ kind, incomingId: inc.id, name: inc.name, interimId, status, rewritten });
  }
}



/**
 * Pass 2: the add / changed / identical diff of the named catalogs, given Pass-1 answers.
 *
 * Drives the UI's policy screen. `add` rows are informational (they are always added); `identical`
 * and `changed` rows are where skip / overwrite / keep-both applies.
 */
export function buildImportDiff(
  doc: ExportDocument,
  existing: SaveData,
  decisions: DedupDecisions,
): ImportDiff {
  const { entities } = resolve(doc, existing, decisions);
  const items: DiffItem[] = entities.map((e) => ({
    kind: e.kind,
    incomingId: e.incomingId,
    targetId: e.interimId,
    name: e.name,
    status: e.status,
  }));
  return { items };
}

/** Fresh default policies: skip existing entities of every kind, no per-item overrides. */
export function defaultMergePolicies(): MergePolicies {
  return {
    perType: { exercise: 'skip', muscle: 'skip', program: 'skip' },
    perItem: {},
  };
}



/** Per-entity action derived from Pass-2 policy. */
type EntityAction = 'skip' | 'overwrite' | 'add';

/**
 * Produce the merged {@link SaveData} from both passes' decisions.
 *
 * - Named catalogs (exercises / muscles / programs) are merged per the resolved identities and the
 *   chosen policy (skip / overwrite / keep-both).
 * - All incoming references are re-linked once, via the final `incomingId → finalId` map.
 * - `results` and `bodyweightLog` (full export only) are unioned with the existing history and
 *   deduped by value: results by `(exerciseId, timestamp, weight, reps)`, bodyweight by `(weight, date)`.
 * - `settings`, `activeProgram` + `schedulerState`, and `session` (full export only) are **replaced**
 *   by the incoming values (with their entity references re-linked).
 *
 * Program-share documents carry none of the personal / runtime sections, so those are left untouched.
 *
 * @returns a new {@link SaveData}; `existing` is not mutated.
 */
export function applyImport(
  doc: ExportDocument,
  existing: SaveData,
  decisions: DedupDecisions,
  policies: MergePolicies,
): SaveData {
  const { entities, maps } = resolve(doc, existing, decisions);

  // Final maps start from the interim landing maps; keep-both overrides a landing id with a fresh id.
  const finalMaps: InterimMaps = {
    exercise: new Map(maps.exercise),
    muscle: new Map(maps.muscle),
    program: new Map(maps.program),
  };
  const actions = new Map<string, EntityAction>();

  for (const e of entities) {
    if (e.status === 'add') {
      actions.set(e.incomingId, 'add');
      continue;
    }
    const policy = policies.perItem[e.incomingId] ?? policies.perType[e.kind] ?? 'skip';
    if (policy === 'keep-both') {
      finalMaps[e.kind].set(e.incomingId, newId());
      actions.set(e.incomingId, 'add');
    } else {
      actions.set(e.incomingId, policy); // 'skip' | 'overwrite'
    }
  }

  const next = cloneSave(existing);

  next.exercises = mergeCatalog(
    existing.exercises,
    doc.exercises,
    actions,
    (ex) => rewriteExercise(ex, finalMaps) as Exercise,
  );
  next.muscles = mergeCatalog(
    existing.muscles,
    doc.muscles,
    actions,
    (m) => rewriteMuscle(m, finalMaps) as Muscle,
  );
  next.programs = mergeCatalog(
    existing.programs,
    doc.programs,
    actions,
    (p) => rewriteProgram(p, finalMaps) as Program,
  );

  if (doc.kind === 'full') {
    applyFullSections(next, doc, finalMaps);
  }

  return next;
}

/**
 * Merge one named catalog: existing entries in place (some overwritten), then appended adds.
 * `rewrite` re-links each incoming entity to its final id; `actions` says skip / overwrite / add.
 */
function mergeCatalog<T extends { id: string }>(
  existing: ReadonlyArray<T>,
  incoming: ReadonlyArray<{ id: string }>,
  actions: Map<string, EntityAction>,
  rewrite: (entity: unknown) => T,
): T[] {
  const merged = existing.map((e) => ({ ...e }));
  const indexById = new Map(merged.map((e, i) => [e.id, i]));

  for (const inc of incoming) {
    const action = actions.get(inc.id) ?? 'skip';
    if (action === 'skip') continue;

    const rewritten = rewrite(inc);
    if (action === 'overwrite') {
      const idx = indexById.get(rewritten.id);
      if (idx !== undefined) merged[idx] = rewritten;
      else merged.push(rewritten);
    } else {
      // add (plain add, distinct, or keep-both) — final id is guaranteed unique
      merged.push(rewritten);
      indexById.set(rewritten.id, merged.length - 1);
    }
  }
  return merged;
}

/** Replace/union the full-export-only sections (results, bodyweight, settings, scheduler, session). */
function applyFullSections(next: SaveData, doc: ExportDocument, maps: InterimMaps): void {
  if (doc.kind !== 'full') return;

  next.results = unionResults(
    next.results,
    doc.results.map((r) => ({ ...r, exerciseId: remap(maps.exercise, r.exerciseId) })),
  );
  next.bodyweightLog = unionBodyweight(next.bodyweightLog, doc.bodyweightLog);

  next.settings = { ...doc.settings };
  next.activeProgram = remapActiveProgram(doc.activeProgram, maps.program);
  next.schedulerState = doc.schedulerState;
  next.session = remapSession(doc.session, maps.exercise, maps.program);
}



/** Union results, deduping by `(exerciseId, timestamp, weight, reps)`; existing entries win. */
function unionResults(existing: ReadonlyArray<Result>, incoming: ReadonlyArray<Result>): Result[] {
  const key = (r: Result) => `${r.exerciseId}|${r.timestamp}|${r.weight}|${r.reps}`;
  const seenKeys = new Set(existing.map(key));
  const usedIds = new Set(existing.map((r) => r.id));
  const merged = existing.map((r) => ({ ...r }));

  for (const r of incoming) {
    if (seenKeys.has(key(r))) continue;
    seenKeys.add(key(r));
    const id = usedIds.has(r.id) ? newId() : r.id;
    usedIds.add(id);
    merged.push({ ...r, id });
  }
  return merged;
}

/** Union the bodyweight log, deduping by `(weight, date)`; existing entries win. */
function unionBodyweight(
  existing: ReadonlyArray<BodyweightEntry>,
  incoming: ReadonlyArray<BodyweightEntry>,
): BodyweightEntry[] {
  const key = (b: BodyweightEntry) => `${b.weight}|${b.date}`;
  const seenKeys = new Set(existing.map(key));
  const usedIds = new Set(existing.map((b) => b.id));
  const merged = existing.map((b) => ({ ...b }));

  for (const b of incoming) {
    if (seenKeys.has(key(b))) continue;
    seenKeys.add(key(b));
    const id = usedIds.has(b.id) ? newId() : b.id;
    usedIds.add(id);
    merged.push({ ...b, id });
  }
  return merged;
}



/**
 * Load the existing save through `storage`, {@link applyImport} the document, and persist the result.
 * @returns the merged {@link SaveData} that was stored.
 */
export function runImport(
  storage: Storage,
  doc: ExportDocument,
  decisions: DedupDecisions,
  policies: MergePolicies,
): SaveData {
  const existing = storage.load() ?? emptySaveData();
  const next = applyImport(doc, existing, decisions, policies);
  storage.save(next);
  return next;
}



function remap(map: Map<string, string>, id: string): string {
  return map.get(id) ?? id;
}

function rewriteExercise(entity: unknown, maps: InterimMaps): Exercise {
  const ex = entity as Exercise;
  return {
    ...ex,
    id: remap(maps.exercise, ex.id),
    muscleRefs: ex.muscleRefs.map((ref) => ({
      ...ref,
      muscleId: remap(maps.muscle, ref.muscleId),
    })),
  };
}

function rewriteMuscle(entity: unknown, maps: InterimMaps): Muscle {
  const m = entity as Muscle;
  return { ...m, id: remap(maps.muscle, m.id) };
}

function rewriteProgram(entity: unknown, maps: InterimMaps): Program {
  const p = entity as Program;
  return {
    ...p,
    id: remap(maps.program, p.id),
    plans: p.plans.map((plan) => ({
      ...plan,
      days: plan.days.map((day) =>
        day.kind === 'workout'
          ? {
              ...day,
              workout: {
                ...day.workout,
                blocks: day.workout.blocks.map((block) => ({
                  ...block,
                  exercises: block.exercises.map((slot) => ({
                    ...slot,
                    exerciseId: remap(maps.exercise, slot.exerciseId),
                  })),
                })),
              },
            }
          : day,
      ),
    })),
  };
}

function remapActiveProgram(
  active: ActiveProgram | null,
  programMap: Map<string, string>,
): ActiveProgram | null {
  if (active === null) return null;
  return { ...active, programId: remap(programMap, active.programId) };
}

function remapSession(
  session: Session | null,
  exerciseMap: Map<string, string>,
  programMap: Map<string, string>,
): Session | null {
  if (session === null) return null;
  // Ticket 06 may still be filling out Session; re-link only the fields that exist on this shape.
  const s = session as Session & {
    programId?: string;
    workout?: { blocks: Array<{ exercises: Array<{ exerciseId: string }> }> };
    loggedSets?: Array<{ exerciseId: string }>;
    adHoc?: { exerciseId: string } | null;
  };
  const next: typeof s = { ...s };

  if (typeof s.programId === 'string') {
    next.programId = remap(programMap, s.programId);
  }
  if (s.workout) {
    next.workout = {
      ...s.workout,
      blocks: s.workout.blocks.map((block) => ({
        ...block,
        exercises: block.exercises.map((slot) => ({
          ...slot,
          exerciseId: remap(exerciseMap, slot.exerciseId),
        })),
      })),
    };
  }
  if (Array.isArray(s.loggedSets)) {
    next.loggedSets = s.loggedSets.map((set) => ({
      ...set,
      exerciseId: remap(exerciseMap, set.exerciseId),
    }));
  }
  if (s.adHoc) {
    next.adHoc = { ...s.adHoc, exerciseId: remap(exerciseMap, s.adHoc.exerciseId) };
  }
  return next as Session;
}



/** JSON deep-clone of a save (all sections are JSON-safe), so the input is never mutated. */
function cloneSave(save: SaveData): SaveData {
  return JSON.parse(JSON.stringify(save)) as SaveData;
}

/** Structural deep equality, order-insensitive on object keys, order-sensitive on arrays. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;

  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr || bArr) {
    if (!aArr || !bArr || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === 'object') {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ka = Object.keys(ao);
    const kb = Object.keys(bo);
    if (ka.length !== kb.length) return false;
    return ka.every(
      (k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]),
    );
  }
  return false;
}

