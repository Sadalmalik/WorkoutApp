/** Rest timer subsystem barrel (ticket 08). */

export type { TimerState, TimerPhase } from './timer.ts';
export {
  remainingMs,
  createTimer,
  timerPhase,
  timerRemaining,
  isExpired,
  isRunning,
  startTimer,
  pauseTimer,
  resetTimer,
  addTime,
  recommendedRestSeconds,
} from './timer.ts';
