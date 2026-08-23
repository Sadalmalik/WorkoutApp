import { useEffect } from 'react';
import type { Clock, Storage, Program, ActiveProgram, SchedulerId } from '../../core/index.ts';
import {
  SCHEDULER_IDS,
  SCHEDULER_LABELS,
  pauseProgram,
  resumeProgram,
  cancelProgram,
  changeScheduler,
} from '../../core/index.ts';

/**
 * Active-program popup, opened by a double-tap on the Home nav button. Offers the program-level
 * actions that are not part of the day-to-day Home flow: pause/resume, change scheduler, and
 * cancel. Every action writes through the core and then calls `onChange` so Home re-reads the save.
 */
export function ProgramPopup({
  storage,
  clock,
  program,
  active,
  onChange,
  onClose,
}: {
  storage: Storage;
  clock: Clock;
  program: Program;
  active: ActiveProgram;
  onChange: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function pauseResume() {
    if (active.paused) resumeProgram(storage);
    else pauseProgram(storage);
    onChange();
    onClose();
  }

  function pickScheduler(id: SchedulerId) {
    if (id !== active.schedulerId) {
      changeScheduler(storage, clock, id);
      onChange();
    }
  }

  function cancel() {
    cancelProgram(storage);
    onChange();
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="program-popup-title">
        <h2 id="program-popup-title" className="modal__title">
          {program.name}
        </h2>

        <label className="modal__field">
          <span className="modal__label">Расписание</span>
          <select
            className="input"
            value={active.schedulerId}
            onChange={(e) => pickScheduler(e.target.value as SchedulerId)}
          >
            {SCHEDULER_IDS.map((id) => (
              <option key={id} value={id}>
                {SCHEDULER_LABELS[id]}
              </option>
            ))}
          </select>
        </label>

        <div className="modal__actions modal__actions--stack">
          <button type="button" className="btn btn--primary" onClick={pauseResume}>
            {active.paused ? 'Продолжить' : 'Поставить на паузу'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={cancel}>
            Отменить программу
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
