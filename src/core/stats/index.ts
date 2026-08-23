/** Stats subsystem barrel (ticket 09): session personal records and session statistics. */

export type { RecordKind, PersonalRecord } from './records.ts';
export { detectPersonalRecords } from './records.ts';
export type { SessionStats } from './summary.ts';
export { sessionStats } from './summary.ts';
