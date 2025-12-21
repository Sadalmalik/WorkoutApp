import { WorkoutResult } from '../types';

const QUEUE_KEY = 'workout_submission_queue';

/**
 * Retrieves the current queue from local storage.
 */
export const getQueue = (): WorkoutResult[] => {
  try {
    const stored = localStorage.getItem(QUEUE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("Failed to load queue", e);
    return [];
  }
};

/**
 * Adds an item to the end of the queue (FIFO).
 */
export const enqueue = (item: WorkoutResult): void => {
  const queue = getQueue();
  queue.push(item);
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error("Failed to save queue", e);
  }
};

/**
 * Removes the first item from the queue.
 */
export const dequeue = (): void => {
  const queue = getQueue();
  if (queue.length > 0) {
    queue.shift();
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error("Failed to update queue", e);
    }
  }
};

/**
 * Returns the current length of the queue.
 */
export const getQueueLength = (): number => {
  return getQueue().length;
};
