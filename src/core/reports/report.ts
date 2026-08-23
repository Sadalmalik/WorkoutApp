/**
 * A single data point fed to a {@link Report}. Its concrete shape depends on the report
 * (exercise-day, bodyweight+workout, muscle). Opaque at the interface level; ticket 09
 * defines the exercise-day point and the two Phase 1 reports.
 */
export type DataPoint = unknown;

/**
 * Pluggable analytics strategy (ADR 0002). Turns a slice of data into chart lines; the chart
 * widget is display-only and asks the report for structure and values.
 *
 * INTERFACE ONLY. Phase 1 implementations ("max weight per day", "max weight + reps at it")
 * arrive in ticket 09.
 */
export interface Report {
  readonly id: string;

  /** Number of lines this report draws. */
  readonly lineCount: number;

  /** Label for a given line (0-based). */
  lineLabel(line: number): string;

  /** Max scale value for a line across the given points (for axis scaling). */
  lineMax(line: number, points: readonly DataPoint[]): number;

  /** `true` to stack lines as separate charts; `false` to draw them on one shared axis. */
  readonly separateCharts: boolean;

  /** Value of `line` at `point`. */
  valueAt(line: number, point: DataPoint): number;
}
