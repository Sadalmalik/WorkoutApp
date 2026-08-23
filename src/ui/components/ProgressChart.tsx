import { useLayoutEffect, useRef } from 'react';
import type { Report, ExerciseDayPoint } from '../../core/index.ts';

/**
 * Progress chart widget (ticket 09 / ADR 0002) — display-only.
 *
 * It knows nothing about metrics: the {@link Report} supplies the line count, labels, per-line scale
 * and the value of each line at a point. Points are laid out on a REAL-TIME axis keyed by the day
 * ordinal, so idle stretches show up as proportional gaps (minimum step one day). The plot is pinned
 * to the right edge and scrolls left, so the freshest data is visible immediately.
 *
 * Lines are distinguished by more than colour (a11y groundwork for ticket 14): each line carries its
 * own stroke dash pattern and marker shape, keyed off the line index.
 */

const PX_PER_DAY = 22;
const SUBCHART_HEIGHT = 150;
const PAD = { top: 16, right: 14, bottom: 26, left: 44 };

/** Per-line visual encoding — stroke dash + marker shape, so colour is never the sole signal. */
const LINE_STYLES = [
  { dash: undefined, marker: 'circle' as const },
  { dash: '7 4', marker: 'square' as const },
  { dash: '2 4', marker: 'triangle' as const },
  { dash: '10 3 2 3', marker: 'diamond' as const },
];

function lineStyle(line: number) {
  return LINE_STYLES[line % LINE_STYLES.length];
}

export function ProgressChart({ points, report }: { points: ExerciseDayPoint[]; report: Report }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pin to the right edge (freshest data) whenever the data or its width changes.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el !== null) el.scrollLeft = el.scrollWidth;
  }, [points, report.id]);

  if (points.length === 0) {
    return <p className="progress-chart__empty">Пока нет данных для графика.</p>;
  }

  const minDay = points[0].day;
  const maxDay = points[points.length - 1].day;
  const span = maxDay - minDay;
  const plotWidth = span * PX_PER_DAY;
  const svgWidth = PAD.left + plotWidth + PAD.right;

  // separateCharts → one stacked sub-chart per line; otherwise all lines share one axis.
  const groups: number[][] = report.separateCharts
    ? Array.from({ length: report.lineCount }, (_, i) => [i])
    : [Array.from({ length: report.lineCount }, (_, i) => i)];

  const x = (day: number) => PAD.left + (day - minDay) * PX_PER_DAY;

  return (
    <div className="progress-chart">
      <div className="progress-chart__scroll" ref={scrollRef}>
        <div className="progress-chart__stack" style={{ width: svgWidth }}>
          {groups.map((lines, gi) => (
            <SubChart key={gi} lines={lines} points={points} report={report} x={x} width={svgWidth} />
          ))}
        </div>
      </div>
      <Legend lines={groups.flat()} report={report} />
    </div>
  );
}

/** One axis with one or more lines drawn on a shared y-scale. */
function SubChart({
  lines,
  points,
  report,
  x,
  width,
}: {
  lines: number[];
  points: ExerciseDayPoint[];
  report: Report;
  x: (day: number) => number;
  width: number;
}) {
  const height = SUBCHART_HEIGHT;
  const innerTop = PAD.top;
  const innerBottom = height - PAD.bottom;

  // Shared max across the lines in this sub-chart.
  const max = Math.max(...lines.map((l) => report.lineMax(l, points)));
  const y = (v: number) => innerBottom - (v / max) * (innerBottom - innerTop);

  return (
    <svg
      className="progress-chart__svg"
      width={width}
      height={height}
      role="img"
      aria-label={lines.map((l) => report.lineLabel(l)).join(', ')}
    >
      {/* baseline + max gridline */}
      <line className="progress-chart__axis" x1={PAD.left} y1={y(0)} x2={width - PAD.right} y2={y(0)} />
      <line
        className="progress-chart__grid"
        x1={PAD.left}
        y1={y(max)}
        x2={width - PAD.right}
        y2={y(max)}
      />
      <text className="progress-chart__tick" x={PAD.left - 6} y={y(max)} dy="0.32em" textAnchor="end">
        {formatTick(max)}
      </text>
      <text className="progress-chart__tick" x={PAD.left - 6} y={y(0)} dy="0.32em" textAnchor="end">
        0
      </text>

      {lines.map((line) => (
        <LinePath key={line} line={line} points={points} report={report} x={x} y={y} />
      ))}
    </svg>
  );
}

/** A single report line: a polyline through the points plus a marker at each. */
function LinePath({
  line,
  points,
  report,
  x,
  y,
}: {
  line: number;
  points: ExerciseDayPoint[];
  report: Report;
  x: (day: number) => number;
  y: (v: number) => number;
}) {
  const style = lineStyle(line);
  const coords = points.map((p) => ({ px: x(p.day), py: y(report.valueAt(line, p)) }));
  const d = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.px},${c.py}`).join(' ');

  return (
    <g className={`progress-chart__line progress-chart__line--${line % LINE_STYLES.length}`}>
      {coords.length > 1 ? (
        <path className="progress-chart__stroke" d={d} strokeDasharray={style.dash} fill="none" />
      ) : null}
      {coords.map((c, i) => (
        <Marker key={i} shape={style.marker} cx={c.px} cy={c.py} />
      ))}
    </g>
  );
}

function Marker({ shape, cx, cy }: { shape: (typeof LINE_STYLES)[number]['marker']; cx: number; cy: number }) {
  const r = 3.5;
  if (shape === 'square') {
    return <rect className="progress-chart__marker" x={cx - r} y={cy - r} width={r * 2} height={r * 2} />;
  }
  if (shape === 'triangle') {
    return (
      <polygon className="progress-chart__marker" points={`${cx},${cy - r} ${cx - r},${cy + r} ${cx + r},${cy + r}`} />
    );
  }
  if (shape === 'diamond') {
    return (
      <polygon className="progress-chart__marker" points={`${cx},${cy - r} ${cx - r},${cy} ${cx},${cy + r} ${cx + r},${cy}`} />
    );
  }
  return <circle className="progress-chart__marker" cx={cx} cy={cy} r={r} />;
}

/** Line labels with their marker/dash swatch, so the encoding is readable without reading the plot. */
function Legend({ lines, report }: { lines: number[]; report: Report }) {
  return (
    <ul className="progress-chart__legend">
      {lines.map((line) => {
        const style = lineStyle(line);
        return (
          <li key={line} className={`progress-chart__legend-item progress-chart__line--${line % LINE_STYLES.length}`}>
            <svg className="progress-chart__legend-swatch" width={26} height={12} aria-hidden>
              <line
                className="progress-chart__stroke"
                x1={1}
                y1={6}
                x2={25}
                y2={6}
                strokeDasharray={style.dash}
                fill="none"
              />
              <Marker shape={style.marker} cx={13} cy={6} />
            </svg>
            <span>{report.lineLabel(line)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function formatTick(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
