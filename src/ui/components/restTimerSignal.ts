/**
 * End-of-rest signal effects (ticket 08) — UI-layer only (Web Audio / Vibration / Notification).
 *
 * The core timer stays DOM-free (ARCH invariant #1); every browser API lives here. Nothing throws
 * on an unsupported browser: each effect feature-detects and degrades silently.
 *
 * The {@link AudioContext} must be created from a user gesture (autoplay policy), so the component
 * calls {@link RestTimerAudio.arm} on the Start tap and {@link RestTimerAudio.beep} when the timer
 * expires. A single context is reused for the life of the component.
 */

type WebkitWindow = typeof globalThis & { webkitAudioContext?: typeof AudioContext };

/**
 * Lazily-armed Web Audio beeper. Create once per component and reuse.
 *
 * The end-of-rest sound is mandatory (spec:188) and must fire even when the tab is backgrounded,
 * where timer-based JS (`setInterval`/`setTimeout`) is throttled. Web Audio playback scheduled on
 * the audio hardware clock is NOT throttled once queued, so {@link scheduleBeep} queues the beep at
 * the timer's absolute end time instead of waiting for a poll to detect expiry. A pending beep is
 * cancelled/rescheduled by {@link cancelScheduled} on pause / reset / ±adjust.
 */
export class RestTimerAudio {
  private ctx: AudioContext | null = null;
  /** Oscillators queued by {@link scheduleBeep} but not yet played, so they can be cancelled. */
  private scheduled: OscillatorNode[] = [];

  /** Create/resume the audio context from within a user gesture. Safe to call repeatedly. */
  arm(): void {
    const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) return;
    if (this.ctx === null) {
      try {
        this.ctx = new Ctor();
      } catch {
        this.ctx = null;
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Three short pulses, played immediately. No-op if the context could not be created. */
  beep(): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    if (ctx.state === 'suspended') void ctx.resume();
    this.emitPulses(ctx.currentTime);
  }

  /**
   * Queue the end-of-rest beep to play `delaySeconds` from now on the audio clock — the reliable,
   * throttle-proof signal for a backgrounded tab. Replaces any previously scheduled beep. No-op if
   * the context could not be created.
   */
  scheduleBeep(delaySeconds: number): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    if (ctx.state === 'suspended') void ctx.resume();
    this.cancelScheduled();
    this.scheduled = this.emitPulses(ctx.currentTime + Math.max(0, delaySeconds));
  }

  /** Stop and drop any beep queued by {@link scheduleBeep} that has not finished playing. */
  cancelScheduled(): void {
    for (const osc of this.scheduled) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // Already stopped / ended — nothing to cancel.
      }
    }
    this.scheduled = [];
  }

  /** Emit the 3-pulse envelope starting at audio-clock time `start`; returns the oscillators. */
  private emitPulses(start: number): OscillatorNode[] {
    const ctx = this.ctx;
    if (ctx === null) return [];

    const pulse = 0.12;
    const gap = 0.08;
    const oscillators: OscillatorNode[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = start + i * (pulse + gap);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      // Short attack/decay envelope to avoid clicks.
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + pulse);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + pulse);
      oscillators.push(osc);
    }
    return oscillators;
  }

  /** Release the audio context. */
  dispose(): void {
    this.cancelScheduled();
    if (this.ctx !== null) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}

/** Vibrate on end-of-rest if the Vibration API is available. Silent no-op otherwise. */
export function vibrateEndOfRest(): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate([200, 100, 200]);
  }
}

/**
 * STRETCH (spec user story 24): a system notification when rest ends, to catch the signal with the
 * browser backgrounded (e.g. watching an exercise video). Only fires when permission was ALREADY
 * granted — this helper never prompts, to avoid an intrusive permission dialog mid-workout.
 *
 * TODO(ticket 08 stretch): request permission from a Settings toggle and add a Screen Wake Lock so
 * the signal is reliable with the screen locked. Deferred per spec ("Дальнейшие заметки": сигнал при
 * заблокированном экране желателен, но может быть отложен). Sound + vibration remain the mandatory
 * signal and are handled above.
 */
/**
 * Ask for notification permission once, from the Start user gesture, when it is still undecided
 * (`default`). Without this the granted-only {@link notifyEndOfRest} could never fire (story 24).
 * Never re-prompts once the user has answered (`granted` / `denied`).
 */
export function ensureNotifyPermission(): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'default') return;
  try {
    void Notification.requestPermission();
  } catch {
    // Older browsers expose only the callback form; ignore — sound + vibration remain mandatory.
  }
}

export function notifyEndOfRest(): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification('Отдых окончен', { body: 'Пора к следующему подходу', tag: 'rest-timer' });
  } catch {
    // Some browsers require a ServiceWorkerRegistration to construct notifications; ignore.
  }
}
