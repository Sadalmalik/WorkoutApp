import { Fragment } from 'react';
import type { TimelineModel, TimelineBlockState } from '../../core/index.ts';

/**
 * Workout timeline (ticket 07) — a horizontal row of blocks, each a vertical column of circles
 * (one circle per exercise slot). A horizontal line between columns stands for the `междуБлоками`
 * interval; intra-block intervals are not drawn (spec → Таймлайн). Presentation only: it renders the
 * {@link TimelineModel} produced by the core `timelineModel` selector and reports defer intents.
 *
 * ## States (differentiated by outline/fill, not colour alone — ticket 14 tunes the palette)
 * - `done` — the whole block filled (`data-state="done"` on column and dots).
 * - `current` — outlined circles with an inner marker (`.timeline__marker`).
 * - `upcoming` — empty outline; deferrable ones are a `<button>` invoking {@link onDefer}.
 *
 * When {@link TimelineModel.paused} is true (an ad-hoc exercise is running) the whole widget renders
 * dimmed (`data-paused`) while keeping the cursor position for resume.
 */
export interface TimelineProps {
  model: TimelineModel;
  /** Defer a block — swap it with the next (core `deferSessionBlock`). */
  onDefer: (blockId: string) => void;
}

export function Timeline({ model, onDefer }: TimelineProps) {
  const restLabel = `${model.betweenBlocksRest} с между блоками`;

  return (
    <div
      className="timeline"
      data-paused={model.paused ? true : undefined}
      role="group"
      aria-label={model.paused ? 'Таймлайн тренировки (приостановлен)' : 'Таймлайн тренировки'}
    >
      <ol className="timeline__track">
        {model.blocks.map((block, index) => (
          <Fragment key={block.blockId}>
            {index > 0 ? (
              <li className="timeline__link" aria-hidden title={restLabel} />
            ) : null}
            <BlockColumn
              index={index}
              state={block.state}
              dots={block.dots.length}
              isSuperset={block.isSuperset}
              canDefer={block.canDefer}
              onDefer={() => onDefer(block.blockId)}
            />
          </Fragment>
        ))}
      </ol>
      {model.paused ? (
        <span className="timeline__paused" role="status">
          приостановлено
        </span>
      ) : null}
    </div>
  );
}

const STATE_LABEL: Record<TimelineBlockState, string> = {
  done: 'пройден',
  current: 'текущий',
  upcoming: 'предстоит',
};

/**
 * One block column. Deferrable blocks are a `<button>` (the whole column is the tap target);
 * non-deferrable ones are a plain `<li>`. The circles are decorative — the accessible label carries
 * the block number and state.
 */
function BlockColumn({
  index,
  state,
  dots,
  isSuperset,
  canDefer,
  onDefer,
}: {
  index: number;
  state: TimelineBlockState;
  dots: number;
  isSuperset: boolean;
  canDefer: boolean;
  onDefer: () => void;
}) {
  const label = `Блок ${index + 1}: ${STATE_LABEL[state]}${isSuperset ? ', суперсет' : ''}`;
  const column = (
    <span className="timeline__dots" aria-hidden>
      {Array.from({ length: dots }, (_, i) => (
        <span key={i} className="timeline__dot" data-state={state}>
          {state === 'current' ? <span className="timeline__marker" /> : null}
        </span>
      ))}
    </span>
  );

  if (canDefer) {
    return (
      <li className="timeline__block">
        <button
          type="button"
          className="timeline__defer"
          data-state={state}
          onClick={onDefer}
          aria-label={`${label}. Отложить (поменять со следующим)`}
          title="Отложить блок"
        >
          {column}
        </button>
      </li>
    );
  }

  return (
    <li className="timeline__block" data-state={state} aria-label={label}>
      {column}
    </li>
  );
}
