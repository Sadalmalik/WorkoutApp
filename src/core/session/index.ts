/** Session subsystem barrel (ticket 05). */

export type { SessionSummary, ActiveSlot } from './session.ts';
export {
  getSession,
  isSessionComplete,
  activeSlot,
  needsResumeDecision,
  startSession,
  logSet,
  editSessionSet,
  removeSessionSet,
  finishSession,
  abandonSession,
  deferSessionBlock,
  startAdHoc,
  endAdHoc,
  logAdHocResult,
} from './session.ts';
