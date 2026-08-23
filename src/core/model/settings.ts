/** Theme preference. `system` follows the OS setting. */
export type Theme = 'light' | 'dark' | 'system';

/** User settings, persisted inside {@link SaveData}. */
export interface Settings {
  theme: Theme;
  /**
   * Selected colorblind palette id, or `null` for the default palette.
   * Concrete palette ids are defined by the settings/accessibility ticket.
   */
  colorblindPalette: string | null;
  /**
   * Hours since the last logged set after which the "continue / finish" prompt is shown
   * for an unfinished session (also triggered by a calendar day change).
   */
  continueThresholdHours: number;
}

/** Default settings for a fresh save. */
export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  colorblindPalette: null,
  continueThresholdHours: 6,
};
