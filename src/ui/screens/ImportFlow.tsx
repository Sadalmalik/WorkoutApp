import { useState } from 'react';
import { Upload, FileSpreadsheet } from 'lucide-react';
import type {
  Storage,
  SaveData,
  ExportDocument,
  DedupItem,
  DedupDecision,
  DedupDecisions,
  ImportDiff,
  DiffItem,
  MergePolicy,
  MergePolicies,
  NamedKind,
} from '../../core/index.ts';
import {
  parseImportDocument,
  collectDedupItems,
  buildImportDiff,
  defaultMergePolicies,
  buildV1ImportDocument,
  runImport,
  ImportError,
} from '../../core/index.ts';

/**
 * Two-pass import flow (ticket 12) as a small staged wizard, so both passes are visible to the user:
 *
 *   pick file → [Pass 1: duplicate/distinct questions] → [Pass 2: diff + merge policies] → apply.
 *
 * All merge logic lives in the pure core ({@link parseImportDocument}, {@link collectDedupItems},
 * {@link buildImportDiff}, {@link runImport}); this component only reads the file and collects the
 * user's answers. `onImported` reloads the app save after a successful merge.
 */

type Stage =
  | { name: 'idle' }
  | { name: 'error'; message: string }
  | { name: 'dedup'; doc: ExportDocument; items: DedupItem[]; decisions: DedupDecisions }
  | { name: 'diff'; doc: ExportDocument; decisions: DedupDecisions; diff: ImportDiff; policies: MergePolicies }
  | { name: 'done'; added: number };

const KIND_LABELS: Record<NamedKind, string> = {
  exercise: 'Упражнения',
  muscle: 'Мышцы',
  program: 'Программы',
};

const STATUS_LABELS = { add: 'добавить', changed: 'изменено', identical: 'совпадает' } as const;

export function ImportFlow({
  storage,
  save,
  onImported,
}: {
  storage: Storage;
  save: SaveData;
  onImported: () => void;
}) {
  const [stage, setStage] = useState<Stage>({ name: 'idle' });

  /** Convergence point for both entries (JSON file, v1 CSV): a document → the dedup/diff wizard. */
  function startFromDoc(doc: ExportDocument) {
    const items = collectDedupItems(doc, save);
    if (items.length > 0) {
      setStage({ name: 'dedup', doc, items, decisions: {} });
    } else {
      setStage({ name: 'diff', doc, decisions: {}, diff: buildImportDiff(doc, save, {}), policies: defaultMergePolicies() });
    }
  }

  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-picking the same file
    if (!file) return;

    try {
      startFromDoc(parseImportDocument(await file.text()));
    } catch (err) {
      const message = err instanceof ImportError ? err.message : 'Не удалось прочитать файл.';
      setStage({ name: 'error', message });
    }
  }

  function setDecision(id: string, decision: DedupDecision) {
    setStage((s) => (s.name === 'dedup' ? { ...s, decisions: { ...s.decisions, [id]: decision } } : s));
  }

  function toDiff() {
    if (stage.name !== 'dedup') return;
    setStage({
      name: 'diff',
      doc: stage.doc,
      decisions: stage.decisions,
      diff: buildImportDiff(stage.doc, save, stage.decisions),
      policies: defaultMergePolicies(),
    });
  }

  function setTypePolicy(kind: NamedKind, policy: MergePolicy) {
    setStage((s) =>
      s.name === 'diff' ? { ...s, policies: { ...s.policies, perType: { ...s.policies.perType, [kind]: policy } } } : s,
    );
  }

  function setItemPolicy(id: string, policy: MergePolicy | '') {
    setStage((s) => {
      if (s.name !== 'diff') return s;
      const perItem = { ...s.policies.perItem };
      if (policy === '') delete perItem[id];
      else perItem[id] = policy;
      return { ...s, policies: { ...s.policies, perItem } };
    });
  }

  function apply() {
    if (stage.name !== 'diff') return;
    const before = save.exercises.length + save.muscles.length + save.programs.length;
    const next = runImport(storage, stage.doc, stage.decisions, stage.policies);
    const after = next.exercises.length + next.muscles.length + next.programs.length;
    onImported();
    setStage({ name: 'done', added: after - before });
  }

  function reset() {
    setStage({ name: 'idle' });
  }

  return (
    <div className="import" aria-label="Импорт данных">
      {stage.name === 'idle' || stage.name === 'error' ? (
        <>
          <label className="btn btn--ghost import__pick">
            <Upload aria-hidden /> Импортировать из файла
            <input type="file" accept="application/json,.json" onChange={onPickFile} hidden />
          </label>
          <CsvStep
            save={save}
            onStart={startFromDoc}
            onError={(message) => setStage({ name: 'error', message })}
          />
        </>
      ) : null}

      {stage.name === 'error' ? <p className="import__error">{stage.message}</p> : null}

      {stage.name === 'dedup' ? (
        <DedupStep items={stage.items} decisions={stage.decisions} onDecide={setDecision} onNext={toDiff} onCancel={reset} />
      ) : null}

      {stage.name === 'diff' ? (
        <DiffStep
          diff={stage.diff}
          policies={stage.policies}
          onTypePolicy={setTypePolicy}
          onItemPolicy={setItemPolicy}
          onApply={apply}
          onCancel={reset}
        />
      ) : null}

      {stage.name === 'done' ? (
        <div className="import__done">
          <p>Импорт завершён. Новых сущностей: {stage.added}.</p>
          <button type="button" className="btn btn--ghost" onClick={reset}>
            Закрыть
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Migration from v1 CSV exports. Reads the «Exercise List» CSV (required) and, when the history
 * toggle is on, the «Results» CSV (optional), builds a full-export document in the pure core
 * ({@link buildV1ImportDocument}, passing the current `save` so it never clobbers live
 * settings/session), and hands it to the same dedup/diff wizard via `onStart`.
 */
function CsvStep({
  save,
  onStart,
  onError,
}: {
  save: SaveData;
  onStart: (doc: ExportDocument) => void;
  onError: (message: string) => void;
}) {
  const [exercisesCsv, setExercisesCsv] = useState<string | null>(null);
  const [resultsCsv, setResultsCsv] = useState<string | null>(null);
  const [importResults, setImportResults] = useState(false);

  async function readInto(
    event: React.ChangeEvent<HTMLInputElement>,
    set: (text: string | null) => void,
  ) {
    const file = event.target.files?.[0];
    set(file ? await file.text() : null);
  }

  function proceed() {
    if (exercisesCsv === null) return;
    try {
      const doc = buildV1ImportDocument(
        { exercisesCsv, resultsCsv, importResults, exportedAt: Date.now() },
        save,
      );
      onStart(doc);
    } catch {
      onError('Не удалось разобрать CSV из v1.');
    }
  }

  return (
    <details className="import__csv">
      <summary className="import__csv-summary">
        <FileSpreadsheet aria-hidden /> Импорт из v1 (CSV)
      </summary>

      <label className="import__csv-field">
        <span>Список упражнений (Exercise List)</span>
        <input type="file" accept=".csv,text/csv" onChange={(e) => readInto(e, setExercisesCsv)} />
      </label>

      <label className="import__csv-check">
        <input
          type="checkbox"
          checked={importResults}
          onChange={(e) => setImportResults(e.target.checked)}
        />{' '}
        Импортировать историю результатов
      </label>

      {importResults ? (
        <label className="import__csv-field">
          <span>Результаты (Results)</span>
          <input type="file" accept=".csv,text/csv" onChange={(e) => readInto(e, setResultsCsv)} />
        </label>
      ) : null}

      <button
        type="button"
        className="btn btn--primary"
        disabled={exercisesCsv === null}
        onClick={proceed}
      >
        Далее
      </button>
    </details>
  );
}

function DedupStep({
  items,
  decisions,
  onDecide,
  onNext,
  onCancel,
}: {
  items: DedupItem[];
  decisions: DedupDecisions;
  onDecide: (id: string, d: DedupDecision) => void;
  onNext: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="import__step">
      <h3 className="import__step-title">Проход 1 — совпадения по имени</h3>
      <p className="screen__note">Для каждого совпадения укажи: это тот же элемент или другая сущность с тем же именем.</p>
      <ul className="import__list">
        {items.map((item) => {
          const decision = decisions[item.incomingId] ?? 'duplicate';
          return (
            <li key={item.incomingId} className="import__row">
              <span className="import__name">
                {KIND_LABELS[item.kind]}: «{item.name}»
              </span>
              <span className="import__choices">
                <label>
                  <input
                    type="radio"
                    name={`dedup-${item.incomingId}`}
                    checked={decision === 'duplicate'}
                    onChange={() => onDecide(item.incomingId, 'duplicate')}
                  />{' '}
                  дубликат
                </label>
                <label>
                  <input
                    type="radio"
                    name={`dedup-${item.incomingId}`}
                    checked={decision === 'distinct'}
                    onChange={() => onDecide(item.incomingId, 'distinct')}
                  />{' '}
                  разные
                </label>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="import__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Отмена
        </button>
        <button type="button" className="btn btn--primary" onClick={onNext}>
          Далее
        </button>
      </div>
    </div>
  );
}

function DiffStep({
  diff,
  policies,
  onTypePolicy,
  onItemPolicy,
  onApply,
  onCancel,
}: {
  diff: ImportDiff;
  policies: MergePolicies;
  onTypePolicy: (kind: NamedKind, p: MergePolicy) => void;
  onItemPolicy: (id: string, p: MergePolicy | '') => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const kinds: NamedKind[] = ['exercise', 'muscle', 'program'];
  const merges = diff.items.filter((i) => i.status !== 'add'); // rows a policy applies to
  const addCount = diff.items.length - merges.length;

  return (
    <div className="import__step">
      <h3 className="import__step-title">Проход 2 — сводка изменений</h3>
      <p className="screen__note">Новых элементов: {addCount}. Совпавших по id — ниже; выбери политику.</p>

      <div className="import__policies">
        {kinds
          .filter((k) => merges.some((i) => i.kind === k))
          .map((kind) => (
            <label key={kind} className="import__policy">
              {KIND_LABELS[kind]}:{' '}
              <select value={policies.perType[kind]} onChange={(e) => onTypePolicy(kind, e.target.value as MergePolicy)}>
                <option value="skip">пропустить</option>
                <option value="overwrite">перезаписать</option>
                <option value="keep-both">оставить оба</option>
              </select>
            </label>
          ))}
      </div>

      {merges.length > 0 ? (
        <ul className="import__list">
          {merges.map((item: DiffItem) => (
            <li key={item.incomingId} className="import__row">
              <span className="import__name">
                {KIND_LABELS[item.kind]}: «{item.name}» ({STATUS_LABELS[item.status]})
              </span>
              <select
                className="import__override"
                value={policies.perItem[item.incomingId] ?? ''}
                onChange={(e) => onItemPolicy(item.incomingId, e.target.value as MergePolicy | '')}
              >
                <option value="">по типу</option>
                <option value="skip">пропустить</option>
                <option value="overwrite">перезаписать</option>
                <option value="keep-both">оставить оба</option>
              </select>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="import__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Отмена
        </button>
        <button type="button" className="btn btn--primary" onClick={onApply}>
          Применить
        </button>
      </div>
    </div>
  );
}
