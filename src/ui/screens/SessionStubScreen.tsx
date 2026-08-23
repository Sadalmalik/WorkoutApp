import { ChevronLeft } from 'lucide-react';
import type { Clock, Storage, Workout } from '../../core/index.ts';
import { currentWorkout, advanceSchedule } from '../../core/index.ts';
import { navigate, ROUTES } from '../router.ts';

/**
 * Session STUB (ticket 04). The real workout session is ticket 05; this placeholder only proves the
 * integration seam:
 *
 * - it reads the due workout via {@link currentWorkout} (the same call the real session will use);
 * - its "Завершить" button calls {@link advanceSchedule} exactly once, which moves the scheduler
 *   cursor. Ticket 05 replaces this screen's body with real set logging but keeps that single
 *   `advanceSchedule` call on completion.
 */
export function SessionStubScreen({
  storage,
  clock,
  onChange,
}: {
  storage: Storage;
  clock: Clock;
  onChange: () => void;
}) {
  const workout: Workout | null = currentWorkout(storage, clock);

  // No workout due (e.g. opened directly on a rest day): bounce back to Home.
  if (workout === null) {
    navigate(ROUTES.home);
    return null;
  }

  function finish() {
    advanceSchedule(storage, clock);
    onChange();
    navigate(ROUTES.home);
  }

  return (
    <section className="screen session-stub">
      <header className="catalog__header">
        <button type="button" className="icon-btn" aria-label="Назад" onClick={() => navigate(ROUTES.home)}>
          <ChevronLeft aria-hidden />
        </button>
        <h1 className="catalog__title">Сессия</h1>
      </header>

      <p className="screen__note">
        Заглушка сессии (тикет 05). Тренировка из {workout.blocks.length}{' '}
        {pluralBlocks(workout.blocks.length)}.
      </p>

      <div className="form__actions">
        <button type="button" className="btn btn--primary" onClick={finish}>
          Завершить тренировку
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => navigate(ROUTES.home)}>
          Назад
        </button>
      </div>
    </section>
  );
}

function pluralBlocks(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'блока';
  return 'блоков';
}
