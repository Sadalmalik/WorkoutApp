import { useState } from 'react';
import { Play, SkipForward, Pause } from 'lucide-react';
import type { Clock, Storage, SaveData, Program, SchedulerId } from '../../core/index.ts';
import {
  homeState,
  startProgram,
  skipSchedule,
  resumeProgram,
  SCHEDULER_IDS,
  SCHEDULER_LABELS,
} from '../../core/index.ts';
import { navigateToSession } from '../router.ts';

/**
 * Home — the day-to-day state machine (ticket 04). Renders exactly one of the
 * {@link import('../../core/index.ts').HomeStatus} states and its actions, delegating every
 * mutation to the core and calling `onChange` so the shell re-reads the save.
 *
 * Program-level actions (pause/cancel/change scheduler) live in the double-tap
 * {@link import('../components/ProgramPopup.tsx').ProgramPopup}, not here.
 */
export function HomeScreen({
  save,
  storage,
  clock,
  onChange,
}: {
  save: SaveData;
  storage: Storage;
  clock: Clock;
  onChange: () => void;
}) {
  const [launching, setLaunching] = useState(false);
  const status = homeState(save, clock);

  if (launching || status.kind === 'no-program') {
    return (
      <ProgramLauncher
        programs={save.programs}
        canCancel={launching && status.kind !== 'no-program'}
        onCancel={() => setLaunching(false)}
        onLaunch={(programId, schedulerId) => {
          startProgram(storage, clock, programId, schedulerId);
          setLaunching(false);
          onChange();
        }}
      />
    );
  }

  function start() {
    navigateToSession();
  }

  function skip() {
    skipSchedule(storage, clock);
    onChange();
  }

  return (
    <section className="screen home">
      <h1 className="screen__title">Home</h1>
      <p className="home__program">{status.program.name}</p>

      {status.kind === 'workout' ? (
        <HomeCard title="Сегодня — тренировка" hint={`${status.workout.blocks.length} бл.`}>
          <button type="button" className="btn btn--primary" onClick={start}>
            <Play aria-hidden /> Начать
          </button>
          <button type="button" className="btn btn--ghost" onClick={skip}>
            <SkipForward aria-hidden /> Пропустить
          </button>
        </HomeCard>
      ) : null}

      {status.kind === 'rest' ? (
        <HomeCard title="День отдыха" hint="Отдых по плану">
          <button type="button" className="btn btn--ghost" onClick={skip}>
            <SkipForward aria-hidden /> Начать следующую
          </button>
        </HomeCard>
      ) : null}

      {status.kind === 'completed' ? (
        <HomeCard title="Тренировка завершена" hint="На сегодня всё">
          <button type="button" className="btn btn--ghost" onClick={skip}>
            <SkipForward aria-hidden /> Начать следующую
          </button>
        </HomeCard>
      ) : null}

      {status.kind === 'paused' ? (
        <HomeCard title="Программа на паузе" hint="Курсор заморожен">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              resumeProgram(storage);
              onChange();
            }}
          >
            <Play aria-hidden /> Продолжить
          </button>
        </HomeCard>
      ) : null}

      <p className="screen__note">Двойной тап по Home — управление программой.</p>
    </section>
  );
}

/** One Home state card: a title, a short hint, and its action buttons. */
function HomeCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="home-card">
      <div className="home-card__head">
        <span className="home-card__title">{title}</span>
        <span className="home-card__hint">{hint}</span>
      </div>
      <div className="home-card__actions">{children}</div>
    </div>
  );
}

/**
 * Launch flow: pick a program and a scheduler (defaulting to the program's recommended one), then
 * start. Doubles as the "no active program" Home state. When opened over a running program
 * (relaunch), `canCancel` shows a way back.
 */
function ProgramLauncher({
  programs,
  canCancel,
  onCancel,
  onLaunch,
}: {
  programs: Program[];
  canCancel: boolean;
  onCancel: () => void;
  onLaunch: (programId: string, schedulerId: SchedulerId) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = programs.find((p) => p.id === selectedId) ?? null;
  const [scheduler, setScheduler] = useState<SchedulerId | null>(null);

  // Effective scheduler: the explicit choice, else the selected program's recommendation.
  const effectiveScheduler: SchedulerId | null =
    scheduler ?? selected?.recommendedSchedulerId ?? null;

  return (
    <section className="screen home">
      <h1 className="screen__title">Начать программу</h1>

      {programs.length === 0 ? (
        <p className="screen__note">
          Программ пока нет. Создай программу в разделе Настройки → Программы.
        </p>
      ) : (
        <>
          <ul className="catalog__list" aria-label="Программы">
            {programs.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="catalog__item"
                  aria-current={p.id === selectedId ? 'true' : undefined}
                  data-active={p.id === selectedId || undefined}
                  onClick={() => {
                    setSelectedId(p.id);
                    setScheduler(null); // reset to the new program's recommendation
                  }}
                >
                  <span className="catalog__item-name">{p.name}</span>
                  <span className="catalog__item-zone">{SCHEDULER_LABELS[p.recommendedSchedulerId]}</span>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <label className="field">
              <span className="field__label">Расписание</span>
              <select
                className="input"
                value={effectiveScheduler ?? ''}
                onChange={(e) => setScheduler(e.target.value as SchedulerId)}
              >
                {SCHEDULER_IDS.map((id) => (
                  <option key={id} value={id}>
                    {SCHEDULER_LABELS[id]}
                    {id === selected.recommendedSchedulerId ? ' (рекомендовано)' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="form__actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={selected === null || effectiveScheduler === null}
              onClick={() => {
                if (selected !== null && effectiveScheduler !== null) {
                  onLaunch(selected.id, effectiveScheduler);
                }
              }}
            >
              <Play aria-hidden /> Запустить
            </button>
            {canCancel ? (
              <button type="button" className="btn btn--ghost" onClick={onCancel}>
                <Pause aria-hidden /> Отмена
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
