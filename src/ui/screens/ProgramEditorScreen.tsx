import { useMemo, useState } from 'react';
import { ChevronLeft, Plus, X, Trash2 } from 'lucide-react';
import type { Exercise, Program, PlanDay, Workout, Block, BlockExercise } from '../../core/index.ts';
import {
  validateProgram,
  newWorkout,
  newWorkoutDay,
  newRestDay,
  newBlock,
  newBlockExercise,
} from '../../core/index.ts';
import { ExercisePicker } from '../components/ExercisePicker.tsx';

/** Scheduler choices offered as the program's recommended scheduler (ADR 0001 ids). */
const SCHEDULER_OPTIONS: { id: string; label: string }[] = [
  { id: 'calendar', label: 'Календарное' },
  { id: 'hybrid', label: 'Гибридное' },
];

/**
 * Linear program editor (ticket 03). Edits a working copy of the {@link Program} — its single
 * Phase-1 plan of fixed length, each day rest or a {@link Workout} of ordered {@link Block}s, each
 * block one or more exercises (>= 2 = superset), sets, and the two intra-block rest intervals; each
 * exercise slot a static {weight, reps} target. Structure is validated on every edit via the core
 * {@link validateProgram}; Save is disabled while errors remain.
 */
export function ProgramEditorScreen({
  program: initial,
  exercises,
  onSave,
  onCancel,
}: {
  program: Program;
  exercises: Exercise[];
  onSave: (program: Program) => void;
  onCancel: () => void;
}) {
  const [program, setProgram] = useState<Program>(initial);
  const exercisesById = useMemo(
    () => new Map(exercises.map((e) => [e.id, e])),
    [exercises],
  );
  const errors = useMemo(
    () => validateProgram(program, exercises.map((e) => e.id)),
    [program, exercises],
  );

  const plan = program.plans[0];

  function setDays(days: PlanDay[]) {
    setProgram({ ...program, plans: [{ ...plan, days }] });
  }

  function setDay(index: number, day: PlanDay) {
    setDays(plan.days.map((d, i) => (i === index ? day : d)));
  }

  function setDayCount(count: number) {
    const next = Math.max(1, Math.floor(count));
    if (next === plan.days.length) return;
    if (next < plan.days.length) {
      setDays(plan.days.slice(0, next));
    } else {
      const added = Array.from({ length: next - plan.days.length }, () => newRestDay());
      setDays([...plan.days, ...added]);
    }
  }

  return (
    <section className="catalog program-editor">
      <header className="catalog__header">
        <button type="button" className="icon-btn" aria-label="Назад" onClick={onCancel}>
          <ChevronLeft aria-hidden />
        </button>
        <h1 className="catalog__title">Редактор программы</h1>
      </header>

      <label className="field">
        <span className="field__label">Название</span>
        <input
          className="input"
          value={program.name}
          onChange={(e) => setProgram({ ...program, name: e.target.value })}
          placeholder="Например, Линейная база 3 дня"
        />
      </label>

      <label className="field">
        <span className="field__label">Рекомендованное расписание</span>
        <select
          className="input"
          value={program.recommendedSchedulerId}
          onChange={(e) => setProgram({ ...program, recommendedSchedulerId: e.target.value })}
        >
          {SCHEDULER_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field__label">Длина плана, дней</span>
        <input
          className="input program-editor__daycount"
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          value={plan.days.length}
          onChange={(e) => setDayCount(Number(e.target.value))}
        />
      </label>

      <ol className="day-list">
        {plan.days.map((day, i) => (
          <li key={i}>
            <DayEditor
              index={i}
              day={day}
              exercisesById={exercisesById}
              exercises={exercises}
              onChange={(d) => setDay(i, d)}
            />
          </li>
        ))}
      </ol>

      {errors.length > 0 ? (
        <ul className="program-editor__errors" aria-label="Ошибки структуры">
          {errors.map((msg, i) => (
            <li key={i} className="field__error">
              {msg}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="form__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={errors.length > 0}
          onClick={() => onSave(program)}
        >
          Сохранить
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </section>
  );
}

/** One plan day: rest/workout toggle and, for a training day, its workout editor. */
function DayEditor({
  index,
  day,
  exercisesById,
  exercises,
  onChange,
}: {
  index: number;
  day: PlanDay;
  exercisesById: Map<string, Exercise>;
  exercises: Exercise[];
  onChange: (day: PlanDay) => void;
}) {
  const isWorkout = day.kind === 'workout';

  return (
    <div className={`day${isWorkout ? ' day--workout' : ' day--rest'}`}>
      <div className="day__head">
        <span className="day__title">День {index + 1}</span>
        <div className="day__toggle" role="group" aria-label={`День ${index + 1}: тип`}>
          <button
            type="button"
            className={`chip${!isWorkout ? ' chip--on' : ''}`}
            aria-pressed={!isWorkout}
            onClick={() => onChange(newRestDay())}
          >
            Отдых
          </button>
          <button
            type="button"
            className={`chip${isWorkout ? ' chip--on' : ''}`}
            aria-pressed={isWorkout}
            onClick={() => {
              if (!isWorkout) onChange(newWorkoutDay(newWorkout()));
            }}
          >
            Тренировка
          </button>
        </div>
      </div>

      {day.kind === 'workout' ? (
        <WorkoutEditor
          workout={day.workout}
          exercisesById={exercisesById}
          exercises={exercises}
          onChange={(w) => onChange({ kind: 'workout', workout: w })}
        />
      ) : null}
    </div>
  );
}

/** A training day's workout: between-blocks rest + the ordered block list. */
function WorkoutEditor({
  workout,
  exercisesById,
  exercises,
  onChange,
}: {
  workout: Workout;
  exercisesById: Map<string, Exercise>;
  exercises: Exercise[];
  onChange: (workout: Workout) => void;
}) {
  const [pickingBlock, setPickingBlock] = useState(false);

  function setBlock(i: number, block: Block) {
    onChange({ ...workout, blocks: workout.blocks.map((b, j) => (j === i ? block : b)) });
  }

  function removeBlock(i: number) {
    onChange({ ...workout, blocks: workout.blocks.filter((_, j) => j !== i) });
  }

  return (
    <div className="workout">
      <NumberField
        label="Отдых междуБлоками, сек"
        value={workout.betweenBlocksRest}
        min={0}
        onChange={(n) => onChange({ ...workout, betweenBlocksRest: n })}
      />

      <ol className="block-list">
        {workout.blocks.map((block, i) => (
          <li key={block.id}>
            <BlockEditor
              index={i}
              block={block}
              exercisesById={exercisesById}
              exercises={exercises}
              onChange={(b) => setBlock(i, b)}
              onRemove={() => removeBlock(i)}
            />
          </li>
        ))}
      </ol>

      <button type="button" className="btn btn--ghost" onClick={() => setPickingBlock(true)}>
        <Plus aria-hidden /> Добавить блок
      </button>

      {pickingBlock ? (
        <ExercisePicker
          exercises={exercises}
          title="Первое упражнение блока"
          onCancel={() => setPickingBlock(false)}
          onPick={(exerciseId) => {
            onChange({ ...workout, blocks: [...workout.blocks, newBlock([newBlockExercise(exerciseId)])] });
            setPickingBlock(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** One block: its exercises (>= 2 = superset), sets, and rest intervals. */
function BlockEditor({
  index,
  block,
  exercisesById,
  exercises,
  onChange,
  onRemove,
}: {
  index: number;
  block: Block;
  exercisesById: Map<string, Exercise>;
  exercises: Exercise[];
  onChange: (block: Block) => void;
  onRemove: () => void;
}) {
  const [pickingExercise, setPickingExercise] = useState(false);
  const isSuperset = block.exercises.length >= 2;

  function setSlot(i: number, slot: BlockExercise) {
    onChange({ ...block, exercises: block.exercises.map((s, j) => (j === i ? slot : s)) });
  }

  function removeSlot(i: number) {
    onChange({ ...block, exercises: block.exercises.filter((_, j) => j !== i) });
  }

  return (
    <div className="block">
      <div className="block__head">
        <span className="block__title">
          Блок {index + 1}
          {isSuperset ? <span className="block__badge">суперсет</span> : null}
        </span>
        <button type="button" className="icon-btn" aria-label="Удалить блок" onClick={onRemove}>
          <Trash2 aria-hidden />
        </button>
      </div>

      <ul className="slot-list">
        {block.exercises.map((slot, i) => (
          <li key={slot.id}>
            <SlotRow
              slot={slot}
              exercise={exercisesById.get(slot.exerciseId)}
              canRemove={block.exercises.length > 1}
              onChange={(s) => setSlot(i, s)}
              onRemove={() => removeSlot(i)}
            />
          </li>
        ))}
      </ul>

      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPickingExercise(true)}>
        <Plus aria-hidden /> Упражнение {block.exercises.length >= 1 ? '(суперсет)' : ''}
      </button>

      <div className="block__params">
        <NumberField
          label="Сетов"
          value={block.sets}
          min={1}
          onChange={(n) => onChange({ ...block, sets: n })}
        />
        <NumberField
          label="междуСетами, сек"
          value={block.betweenSetsRest}
          min={0}
          onChange={(n) => onChange({ ...block, betweenSetsRest: n })}
        />
        <NumberField
          label="междуУпр. суперсета, сек"
          value={block.betweenSupersetExercisesRest}
          min={0}
          onChange={(n) => onChange({ ...block, betweenSupersetExercisesRest: n })}
        />
      </div>

      {pickingExercise ? (
        <ExercisePicker
          exercises={exercises}
          title="Добавить упражнение в блок"
          onCancel={() => setPickingExercise(false)}
          onPick={(exerciseId) => {
            onChange({ ...block, exercises: [...block.exercises, newBlockExercise(exerciseId)] });
            setPickingExercise(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** One exercise slot: catalog info (zone, videos) plus its static {weight, reps} target. */
function SlotRow({
  slot,
  exercise,
  canRemove,
  onChange,
  onRemove,
}: {
  slot: BlockExercise;
  exercise: Exercise | undefined;
  canRemove: boolean;
  onChange: (slot: BlockExercise) => void;
  onRemove: () => void;
}) {
  return (
    <div className="slot">
      <div className="slot__info">
        <span className="slot__name">{exercise?.name ?? '(упражнение удалено)'}</span>
        <span className="slot__meta">
          {exercise?.zone ? <span className="catalog__item-zone">{exercise.zone}</span> : null}
          {exercise && exercise.videoLinks.length > 0
            ? exercise.videoLinks.map((url, i) => (
                <a key={i} className="slot__video" href={url} target="_blank" rel="noreferrer">
                  видео {exercise.videoLinks.length > 1 ? i + 1 : ''}
                </a>
              ))
            : null}
        </span>
      </div>

      <div className="slot__target">
        <NumberField
          label="Вес, кг"
          value={slot.target.weight}
          min={0}
          step={0.5}
          onChange={(n) => onChange({ ...slot, target: { ...slot.target, weight: n } })}
        />
        <NumberField
          label="Повторы"
          value={slot.target.reps}
          min={1}
          onChange={(n) => onChange({ ...slot, target: { ...slot.target, reps: n } })}
        />
        {canRemove ? (
          <button
            type="button"
            className="icon-btn"
            aria-label="Убрать упражнение из блока"
            onClick={onRemove}
          >
            <X aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Small labelled numeric field. Keeps a local text buffer so the input can be cleared mid-edit
 * without snapping back; commits a parsed, clamped number to the model on every valid change and
 * on blur (empty → the minimum).
 */
function NumberField({
  label,
  value,
  min,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState<string>(String(value));

  // Re-sync when the model value changes from outside this field's own edits.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(String(value));
  }

  function commit(raw: string) {
    const parsed = Number(raw.replace(',', '.'));
    if (raw.trim() === '' || !Number.isFinite(parsed)) return;
    onChange(Math.max(min, parsed));
  }

  return (
    <label className="field field--num">
      <span className="field__label">{label}</span>
      <input
        className="input"
        type="number"
        min={min}
        step={step}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => {
          if (text.trim() === '') {
            setText(String(min));
            onChange(min);
          } else {
            setText(String(Math.max(min, Number(text.replace(',', '.')) || min)));
          }
        }}
      />
    </label>
  );
}
