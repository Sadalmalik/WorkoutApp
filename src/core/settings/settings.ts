import type { Storage } from '../ports/index.ts';
import type { Settings } from '../model/index.ts';
import { emptySaveData } from '../model/index.ts';

/**
 * Operations over user {@link Settings} (theme, colorblind palette, continue threshold).
 *
 * Like the other core subsystems, this reads the whole save through the {@link Storage} port,
 * mutates {@link SaveData.settings}, and writes it back. It never touches `localStorage` or the
 * DOM directly — applying the theme/palette to the document root is the UI layer's job.
 */

/**
 * Merge `patch` into the persisted settings and store the result. A partial patch keeps every
 * unspecified field (so writing just the theme leaves the palette untouched). Returns the updated
 * settings. Seeds an empty save when nothing has been stored yet.
 */
export function updateSettings(storage: Storage, patch: Partial<Settings>): Settings {
  const save = storage.load() ?? emptySaveData();
  const settings: Settings = { ...save.settings, ...patch };
  storage.save({ ...save, settings });
  return settings;
}
