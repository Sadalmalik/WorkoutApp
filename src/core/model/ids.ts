/**
 * Generate a fresh stable entity id (uuid v4).
 *
 * Every entity that carries identity (exercise, muscle, program, plan, block,
 * exercise-in-block, result, bodyweight entry) gets its id from here. Wrapped so tests
 * can stub id generation if they ever need deterministic ids.
 */
export function newId(): string {
  return crypto.randomUUID();
}
