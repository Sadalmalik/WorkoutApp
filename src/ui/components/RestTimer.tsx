import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Play, Pause, RotateCcw, Plus, Minus } from 'lucide-react';
import type { Clock, TimerState, TimerPhase } from '../../core/index.ts';
import {
  createTimer,
  timerPhase,
  timerRemaining,
  isRunning,
  startTimer,
  pauseTimer,
  resetTimer,
  addTime,
} from '../../core/index.ts';
import { RestTimerAudio, vibrateEndOfRest, notifyEndOfRest, ensureNotifyPermission } from './restTimerSignal.ts';

/**
 * Rest timer widget (ticket 08) — the circle-with-inner-button control that fills {@link timerSlot}.
 *
 * The countdown truth lives entirely in the pure core ({@link TimerState} + {@link Clock}); this
 * component only renders it and repaints. While running, a 250 ms interval forces a re-render, but it
 * never advances a counter — every frame recomputes the remaining time from the injected clock, so
 * the display cannot drift and a return from a backgrounded tab immediately shows the correct
 * (possibly expired) state.
 *
 * The mandatory end-of-rest sound (spec:188) must fire even with the tab backgrounded, where the
 * poll is throttled. So the signal is NOT tied to the poll detecting the running→finished edge:
 * whenever the timer changes it is scheduled on the timer's absolute deadline — the beep via Web
 * Audio (queued on the audio clock, immune to background throttling) and vibration + best-effort
 * notification via a `setTimeout`. The poll drives only the visual display.
 *
 * Start / pause / finished are differentiated by icon SHAPE and text label, not colour alone, so the
 * control stays legible before ticket 14 tunes the palette.
 */
export interface RestTimerProps {
  /** Time source (injected {@link Clock}) — the same one the session screen uses. */
  clock: Clock;
  /** Recommended interval (seconds) to preload for the current place; from `recommendedRestSeconds`. */
  presetSeconds: number;
  /**
   * Opaque key identifying the current session place (cursor). When it changes the timer re-preloads
   * the new recommended interval — unless a countdown is currently running (which is left alone).
   */
  placeKey?: string;
}

/** The four increment magnitudes (seconds) from the spec: ±1/10/30/60. */
const INCREMENTS = [1, 10, 30, 60] as const;

export function RestTimer({ clock, presetSeconds, placeKey }: RestTimerProps) {
  const presetMs = Math.max(0, Math.round(presetSeconds)) * 1000;
  const [timer, setTimer] = useState<TimerState>(() => createTimer(presetMs));
  const [, forceTick] = useState(0);
  const audioRef = useRef<RestTimerAudio | null>(null);

  // Preload the recommended interval when the place changes, unless a countdown is running.
  useEffect(() => {
    setTimer((t) => (isRunning(t) ? t : createTimer(presetMs)));
  }, [placeKey, presetMs]);

  const now = clock.now();
  const phase = timerPhase(timer, now);
  const remaining = timerRemaining(timer, now);

  // Repaint loop while running. Truth stays in `clock`; this only forces a re-render.
  useEffect(() => {
    if (phase !== 'running') return;
    const id = window.setInterval(() => forceTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [phase]);

  // Schedule the mandatory end-of-rest signal on the timer's ABSOLUTE deadline rather than waiting
  // for the poll to notice expiry. Web Audio playback queued on the audio clock is not throttled in
  // a backgrounded tab, so the beep fires on time even when this component is frozen; vibration and
  // the (best-effort) notification ride a setTimeout. Rescheduled whenever the timer changes
  // (start / pause / reset / ±adjust); natural expiry leaves `timer` untouched, so the queued signal
  // is never cancelled out from under itself. The 250 ms poll below drives only the visual display.
  useEffect(() => {
    const audio = audioRef.current;
    if (!isRunning(timer)) {
      audio?.cancelScheduled();
      return;
    }
    const remainingMs = timerRemaining(timer, clock.now());
    if (remainingMs <= 0) return;

    audio?.scheduleBeep(remainingMs / 1000);
    const sideId = window.setTimeout(() => {
      vibrateEndOfRest();
      notifyEndOfRest();
    }, remainingMs);

    return () => {
      audio?.cancelScheduled();
      window.clearTimeout(sideId);
    };
  }, [timer, clock]);

  // Release the audio context on unmount.
  useEffect(() => () => audioRef.current?.dispose(), []);

  function handleStart() {
    // AudioContext must be created/resumed from a user gesture (autoplay policy).
    if (audioRef.current === null) audioRef.current = new RestTimerAudio();
    audioRef.current.arm();
    // Same user gesture: ask for notification permission so notifyEndOfRest can fire (story 24).
    ensureNotifyPermission();
    setTimer((t) => startTimer(t, clock.now()));
  }

  function handleToggle() {
    if (phase === 'running') {
      setTimer((t) => pauseTimer(t, clock.now()));
      return;
    }
    if (phase === 'finished') {
      setTimer((t) => resetTimer(t));
      return;
    }
    handleStart();
  }

  function handleReset() {
    setTimer((t) => resetTimer(t));
  }

  function handleAdjust(deltaSeconds: number) {
    setTimer((t) => addTime(t, deltaSeconds * 1000, clock.now()));
  }

  const total = timer.durationMs > 0 ? timer.durationMs : 1;
  const fraction = Math.max(0, Math.min(1, remaining / total));

  const center = centerFor(phase);

  return (
    <div className="rest-timer" data-phase={phase}>
      <div className="rest-timer__dial">
        <Ring fraction={fraction} />
        <button
          type="button"
          className="rest-timer__center"
          data-phase={phase}
          onClick={handleToggle}
          aria-label={center.aria}
        >
          <span className="rest-timer__time">{phase === 'finished' ? 'Готово' : formatTime(remaining)}</span>
          <span className="rest-timer__action">
            {center.icon}
            <span className="rest-timer__action-label">{center.label}</span>
          </span>
        </button>
      </div>

      <div className="rest-timer__adjust" role="group" aria-label="Докрутка таймера">
        {INCREMENTS.map((sec) => (
          <button
            key={`minus-${sec}`}
            type="button"
            className="rest-timer__chip rest-timer__chip--minus"
            onClick={() => handleAdjust(-sec)}
            aria-label={`Минус ${sec} секунд`}
          >
            <Minus aria-hidden />
            {sec}
          </button>
        ))}
        {INCREMENTS.map((sec) => (
          <button
            key={`plus-${sec}`}
            type="button"
            className="rest-timer__chip rest-timer__chip--plus"
            onClick={() => handleAdjust(sec)}
            aria-label={`Плюс ${sec} секунд`}
          >
            <Plus aria-hidden />
            {sec}
          </button>
        ))}
      </div>

      {phase !== 'idle' ? (
        <button type="button" className="rest-timer__reset" onClick={handleReset}>
          <RotateCcw aria-hidden /> Сбросить
        </button>
      ) : null}
    </div>
  );
}

/** Icon + labels for the center button, by phase. Shape and text differ, not colour alone. */
function centerFor(phase: TimerPhase): { icon: ReactNode; label: string; aria: string } {
  switch (phase) {
    case 'running':
      return { icon: <Pause aria-hidden />, label: 'Пауза', aria: 'Пауза' };
    case 'paused':
      return { icon: <Play aria-hidden />, label: 'Продолжить', aria: 'Продолжить отдых' };
    case 'finished':
      return { icon: <RotateCcw aria-hidden />, label: 'Заново', aria: 'Запустить заново' };
    case 'idle':
    default:
      return { icon: <Play aria-hidden />, label: 'Старт', aria: 'Запустить отдых' };
  }
}

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** SVG progress ring; `fraction` (0..1) is the share still remaining. */
function Ring({ fraction }: { fraction: number }) {
  const offset = CIRCUMFERENCE * (1 - fraction);
  return (
    <svg className="rest-timer__ring" viewBox="0 0 120 120" aria-hidden>
      <circle className="rest-timer__ring-track" cx="60" cy="60" r={RADIUS} />
      <circle
        className="rest-timer__ring-progress"
        cx="60"
        cy="60"
        r={RADIUS}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

/** `M:SS`, rounding partial seconds up so the display hits 0:00 exactly at expiry. */
function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
