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

/** Lazily-armed Web Audio beeper. Create once per component and reuse. */
export class RestTimerAudio {
  private ctx: AudioContext | null = null;

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

  /** Three short pulses. No-op if the context could not be created. */
  beep(): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const start = ctx.currentTime;
    const pulse = 0.12;
    const gap = 0.08;
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
    }
  }

  /** Release the audio context. */
  dispose(): void {
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
export function notifyEndOfRest(): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification('Отдых окончен', { body: 'Пора к следующему подходу', tag: 'rest-timer' });
  } catch {
    // Some browsers require a ServiceWorkerRegistration to construct notifications; ignore.
  }
}
