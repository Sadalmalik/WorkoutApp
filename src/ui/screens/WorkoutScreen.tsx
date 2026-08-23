import type { ReactNode } from 'react';
import { ChevronLeft, Minus, Plus, Check, Video } from 'lucide-react';

/**
 * Presentational workout screen — the fixed, non-scrolling viewport (ticket 05).
 *
 * Regions, bottom → up per the spec: (global bottom nav) → timeline → results table → submit →
 * input → timer → compact header. In DOM/top → bottom that is: header, timer, input, submit, table,
 * timeline. Only {@link WorkoutScreenProps.tableSlot} grows and scrolls internally
 * (`.workout__table`); the page itself never scrolls.
 *
 * ## Integration slots for later tickets (keep these seams stable)
 * - `timerSlot` — **ticket 08** timer. Preloaded rest hint passed as `header.restHint` for now.
 * - `tableSlot` — **ticket 06** results table (edit/delete of the current session). It is the only
 *   region with internal scroll.
 * - `timelineSlot` — **ticket 07** timeline (block dots, defer, paused marker).
 * - `inputSlot` — **ticket 06** logging panel (weight/reps entry + "add set"). When provided it
 *   replaces the basic `input`+submit region; the `input`/`onLog` props are then unused.
 */
export interface WorkoutScreenProps {
  header: {
    exerciseName: string;
    zone?: string;
    /** e.g. "100 кг × 10" for a planned set, or "Внеплановое" for ad-hoc. */
    targetText?: string;
    /** e.g. "Блок 1/3 · сет 2/4" or "Внеплановое упражнение". */
    progressText?: string;
    videoUrl?: string | null;
    /** Rest hint until the ticket-08 timer replaces {@link timerSlot}. */
    restHint?: string;
  };
  /** Ticket 08 timer widget. */
  timerSlot?: ReactNode;
  /** Ticket 06 results table (internal scroll). */
  tableSlot?: ReactNode;
  /** Ticket 07 timeline. */
  timelineSlot?: ReactNode;
  /** Ticket 06 logging panel; when set, replaces the basic {@link input}+submit region. */
  inputSlot?: ReactNode;
  /** Basic weight/reps input (used only when {@link inputSlot} is absent). */
  input?: {
    weight: number;
    reps: number;
    weightStep: number;
    onWeight: (value: number) => void;
    onReps: (value: number) => void;
  };
  /** Log the current set (used only when {@link inputSlot} is absent). */
  onLog?: () => void;
  logLabel?: string;
  /** Leave the screen (session is persisted). */
  onExit: () => void;
  /** Extra action shown in the header row (e.g. "+" ad-hoc, "вернуться к плану"). */
  headerAction?: ReactNode;
}

export function WorkoutScreen({
  header,
  timerSlot,
  tableSlot,
  timelineSlot,
  inputSlot,
  input,
  onLog,
  logLabel = 'Записать сет',
  onExit,
  headerAction,
}: WorkoutScreenProps) {
  return (
    <section className="workout">
      {/* Compact header (top) */}
      <header className="workout__header">
        <button type="button" className="icon-btn" aria-label="Назад" onClick={onExit}>
          <ChevronLeft aria-hidden />
        </button>
        <div className="workout__title-wrap">
          <h1 className="workout__name">{header.exerciseName}</h1>
          <p className="workout__sub">
            {header.zone ? <span className="workout__zone">{header.zone}</span> : null}
            {header.targetText ? <span className="workout__target">{header.targetText}</span> : null}
            {header.progressText ? <span className="workout__progress">{header.progressText}</span> : null}
          </p>
        </div>
        {header.videoUrl ? (
          <a
            className="icon-btn"
            href={header.videoUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Видео упражнения"
          >
            <Video aria-hidden />
          </a>
        ) : null}
        {headerAction}
      </header>

      {/* Timer slot (ticket 08) */}
      <div className="workout__timer" data-slot="timer">
        {timerSlot ?? (
          <span className="workout__slot-note">
            Таймер — тикет 08{header.restHint ? ` · отдых ${header.restHint}` : ''}
          </span>
        )}
      </div>

      {/* Logging panel: ticket 06 widget when provided, else the basic ticket-05 input+submit. */}
      {inputSlot ? (
        <div className="workout__input-slot" data-slot="input">
          {inputSlot}
        </div>
      ) : (
        <>
          <div className="workout__input">
            <Stepper
              label="Вес, кг"
              value={input?.weight ?? 0}
              step={input?.weightStep ?? 1}
              min={0}
              onChange={(v) => input?.onWeight(v)}
            />
            <Stepper
              label="Повторы"
              value={input?.reps ?? 0}
              step={1}
              min={0}
              onChange={(v) => input?.onReps(v)}
            />
          </div>
          <div className="workout__submit">
            <button type="button" className="btn btn--primary workout__log" onClick={onLog}>
              <Check aria-hidden /> {logLabel}
            </button>
          </div>
        </>
      )}

      {/* Results table (ticket 06) — the only region that scrolls */}
      <div className="workout__table" data-slot="table">
        {tableSlot ?? (
          <p className="workout__slot-note workout__slot-note--center">Таблица результатов — тикет 06</p>
        )}
      </div>

      {/* Timeline (ticket 07) */}
      <div className="workout__timeline" data-slot="timeline">
        {timelineSlot ?? <span className="workout__slot-note">Таймлайн — тикет 07</span>}
      </div>
    </section>
  );
}

/** A basic −/value/+ stepper; the whole input block is replaced by ticket 06. */
function Stepper({
  label,
  value,
  step,
  min,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  onChange: (value: number) => void;
}) {
  const dec = () => onChange(Math.max(min, round(value - step)));
  const inc = () => onChange(round(value + step));
  return (
    <div className="stepper">
      <span className="stepper__label">{label}</span>
      <div className="stepper__row">
        <button type="button" className="stepper__btn" aria-label={`${label} меньше`} onClick={dec}>
          <Minus aria-hidden />
        </button>
        <span className="stepper__value">{value}</span>
        <button type="button" className="stepper__btn" aria-label={`${label} больше`} onClick={inc}>
          <Plus aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Avoid floating-point noise from fractional steps (e.g. 2.5 kg). */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
