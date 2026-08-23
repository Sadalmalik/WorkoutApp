import { useState } from 'react';
import { Minus, Plus, Check, Pencil, Trash2, X } from 'lucide-react';

/**
 * Ticket 06 results-table widget — the two DOM regions that replace the ticket-05 basic input.
 *
 * The workout screen is a fixed, non-growing viewport (spec: "Экран тренировки — фиксированный
 * вьюпорт"). This widget lives in two of its slots:
 * - {@link SetInputPanel} → `inputSlot`: weight/reps entry with −/+ steppers *and* precise numeric
 *   inputs, plus the "add set" button. Fixed height.
 * - {@link ResultsTable} → `tableSlot`: the logged sets of the current exercise, each editable and
 *   removable inline. This is the only region with internal scroll — the region itself
 *   (`.workout__table`) owns `overflow-y:auto`, so the page never grows as sets accumulate.
 *
 * Both are controlled: state (the input buffers, the "keep weight / clear reps" rule, the core
 * edit/remove calls) lives in the session container. This file is pure presentation.
 */

/** Avoid floating-point noise from fractional steps (e.g. 2.5 kg). */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Parse a possibly-comma-decimal buffer to a finite number, or `null` if blank/invalid. */
export function parseNum(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** A −/precise-input/+ field: type an exact value, or nudge it by `step`. */
function NumberField({
  label,
  value,
  step,
  min,
  onChange,
}: {
  label: string;
  value: string;
  step: number;
  min: number;
  onChange: (value: string) => void;
}) {
  const nudge = (delta: number) => {
    const current = parseNum(value) ?? 0;
    onChange(String(Math.max(min, round(current + delta))));
  };
  return (
    <div className="setinput__field">
      <span className="setinput__label">{label}</span>
      <div className="setinput__row">
        <button
          type="button"
          className="setinput__btn"
          aria-label={`${label} меньше`}
          onClick={() => nudge(-step)}
        >
          <Minus aria-hidden />
        </button>
        <input
          className="setinput__value"
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="setinput__btn"
          aria-label={`${label} больше`}
          onClick={() => nudge(step)}
        >
          <Plus aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** The weight/reps entry panel with an "add set" button (replaces the ticket-05 input+submit). */
export function SetInputPanel({
  weight,
  reps,
  weightStep,
  onWeight,
  onReps,
  onAdd,
  canAdd,
  addLabel = 'Добавить сет',
}: {
  weight: string;
  reps: string;
  weightStep: number;
  onWeight: (value: string) => void;
  onReps: (value: string) => void;
  onAdd: () => void;
  canAdd: boolean;
  addLabel?: string;
}) {
  return (
    <form
      className="setinput"
      onSubmit={(e) => {
        e.preventDefault();
        if (canAdd) onAdd();
      }}
    >
      <div className="setinput__fields">
        <NumberField label="Вес, кг" value={weight} step={weightStep} min={0} onChange={onWeight} />
        <NumberField label="Повторы" value={reps} step={1} min={0} onChange={onReps} />
      </div>
      <button type="submit" className="btn btn--primary setinput__add" disabled={!canAdd}>
        <Check aria-hidden /> {addLabel}
      </button>
    </form>
  );
}

/** One logged set as the widget sees it: its global index in `session.loggedSets` plus its value. */
export interface SetRow {
  /** Index into `session.loggedSets` (what the core edit/remove functions take). */
  index: number;
  weight: number;
  reps: number;
}

/** The scrollable table of the current exercise's logged sets, each editable/removable inline. */
export function ResultsTable({
  rows,
  weightStep,
  onEdit,
  onRemove,
  emptyNote = 'Пока нет записанных сетов',
}: {
  rows: SetRow[];
  weightStep: number;
  onEdit: (index: number, weight: number, reps: number) => void;
  onRemove: (index: number) => void;
  emptyNote?: string;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editReps, setEditReps] = useState('');

  if (rows.length === 0) {
    return <p className="workout__slot-note workout__slot-note--center">{emptyNote}</p>;
  }

  function beginEdit(row: SetRow) {
    setEditing(row.index);
    setEditWeight(String(row.weight));
    setEditReps(String(row.reps));
  }

  function commitEdit() {
    if (editing === null) return;
    const w = parseNum(editWeight);
    const r = parseNum(editReps);
    if (w === null || w < 0 || r === null || r < 1) return;
    onEdit(editing, w, round(r));
    setEditing(null);
  }

  return (
    <table className="restable" aria-label="Записанные сеты">
      <thead>
        <tr>
          <th className="restable__num" scope="col">
            №
          </th>
          <th scope="col">Вес, кг</th>
          <th scope="col">Повторы</th>
          <th className="restable__actions" scope="col">
            <span className="visually-hidden">Действия</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) =>
          editing === row.index ? (
            <tr key={row.index} className="restable__row restable__row--editing">
              <td className="restable__num">{i + 1}</td>
              <td>
                <input
                  className="restable__edit-input"
                  type="number"
                  inputMode="decimal"
                  step={weightStep}
                  min={0}
                  value={editWeight}
                  aria-label="Вес, кг"
                  autoFocus
                  onChange={(e) => setEditWeight(e.target.value)}
                />
              </td>
              <td>
                <input
                  className="restable__edit-input"
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={1}
                  value={editReps}
                  aria-label="Повторы"
                  onChange={(e) => setEditReps(e.target.value)}
                />
              </td>
              <td className="restable__actions">
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  aria-label="Сохранить"
                  onClick={commitEdit}
                >
                  <Check aria-hidden />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  aria-label="Отмена"
                  onClick={() => setEditing(null)}
                >
                  <X aria-hidden />
                </button>
              </td>
            </tr>
          ) : (
            <tr key={row.index} className="restable__row">
              <td className="restable__num">{i + 1}</td>
              <td className="restable__val">{row.weight}</td>
              <td className="restable__val">{row.reps}</td>
              <td className="restable__actions">
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  aria-label={`Изменить сет ${i + 1}`}
                  onClick={() => beginEdit(row)}
                >
                  <Pencil aria-hidden />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  aria-label={`Удалить сет ${i + 1}`}
                  onClick={() => onRemove(row.index)}
                >
                  <Trash2 aria-hidden />
                </button>
              </td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}
