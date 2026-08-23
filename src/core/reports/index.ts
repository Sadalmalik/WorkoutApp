/** Reports subsystem barrel (ADR 0002 / ticket 09): interface, exercise reports, day aggregation. */

export type { Report, DataPoint } from './report.ts';
export type { DaySet, ExerciseDayPoint } from './points.ts';
export { pickDaySet, exerciseDayPoints } from './points.ts';
export type { ReportDescriptor } from './exercise-reports.ts';
export { maxWeightReport, maxWeightRepsReport, EXERCISE_REPORTS } from './exercise-reports.ts';
