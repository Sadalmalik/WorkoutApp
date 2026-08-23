/**
 * Phase 1 exercise reports (ADR 0002): the pluggable metric strategies behind the progress chart.
 *
 * Two reports ship in Phase 1:
 * - "макс. вес за день" — a single line;
 * - "макс. вес + повторы при нём" — two stacked lines (separate axes).
 *
 * For a "вес тела" exercise the key line is REPS, not weight, so the bodyweight variant of each
 * report puts reps first (see the ticket and CONTEXT.md → Результат). The chart widget stays
 * display-only: it asks the report for line count, labels, per-line scale and per-point values.
 */

import type { Report, DataPoint } from './report.ts';
import type { ExerciseDayPoint } from './points.ts';

/** One line's identity: its label and how to read its value off a day point. */
interface LineSpec {
  label: string;
  read(point: ExerciseDayPoint): number;
}

const WEIGHT_LINE: LineSpec = { label: 'Вес, кг', read: (p) => p.weight };
const REPS_LINE: LineSpec = { label: 'Повторы', read: (p) => p.reps };

function asPoint(point: DataPoint): ExerciseDayPoint {
  return point as ExerciseDayPoint;
}

/** Build a {@link Report} from a fixed list of {@link LineSpec}s. */
function makeReport(id: string, lines: readonly LineSpec[], separateCharts: boolean): Report {
  return {
    id,
    lineCount: lines.length,
    separateCharts,
    lineLabel(line) {
      return lines[line].label;
    },
    lineMax(line, points) {
      const read = lines[line].read;
      let max = 0;
      for (const p of points) max = Math.max(max, read(asPoint(p)));
      // Guard a degenerate all-zero axis so the widget never divides by zero.
      return max > 0 ? max : 1;
    },
    valueAt(line, point) {
      return lines[line].read(asPoint(point));
    },
  };
}

/**
 * "Макс. вес за день" — one line. Normal exercises plot weight; bodyweight exercises plot reps
 * (the meaningful load signal when there is no external weight).
 */
export function maxWeightReport(isBodyweight: boolean): Report {
  return makeReport('max-weight', [isBodyweight ? REPS_LINE : WEIGHT_LINE], false);
}

/**
 * "Макс. вес + повторы при нём" — two lines on separate stacked axes. The key line comes first:
 * weight for normal exercises, reps for bodyweight ones.
 */
export function maxWeightRepsReport(isBodyweight: boolean): Report {
  const lines = isBodyweight ? [REPS_LINE, WEIGHT_LINE] : [WEIGHT_LINE, REPS_LINE];
  return makeReport('max-weight-reps', lines, true);
}

/**
 * A selectable report for the chart's report switcher: a stable id, a menu label, and a factory
 * that binds the report to the exercise's bodyweight flag.
 */
export interface ReportDescriptor {
  id: string;
  label: string;
  make(isBodyweight: boolean): Report;
}

/** The Phase 1 exercise reports offered by the switcher, in menu order. */
export const EXERCISE_REPORTS: readonly ReportDescriptor[] = [
  { id: 'max-weight', label: 'Макс. за день', make: maxWeightReport },
  { id: 'max-weight-reps', label: 'Вес + повторы', make: maxWeightRepsReport },
];
