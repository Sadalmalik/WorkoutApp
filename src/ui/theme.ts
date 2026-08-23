import { useEffect } from 'react';
import type { Theme } from '../core/index.ts';

/**
 * Colourblind palette ids. `null` (or an unknown value) means the default palette — no
 * `data-palette` attribute, so the base tokens apply. Each id maps to a `[data-palette]` block
 * in styles.css that redefines the accent + chart-series hues for that deficiency.
 */
export type ColorblindPalette = 'protanopia' | 'deuteranopia' | 'tritanopia';

/** The selectable palettes, in menu order, with their Russian labels. */
export const PALETTE_OPTIONS: readonly { id: ColorblindPalette; label: string }[] = [
  { id: 'protanopia', label: 'Протанопия (красный)' },
  { id: 'deuteranopia', label: 'Дейтеранопия (зелёный)' },
  { id: 'tritanopia', label: 'Тританопия (синий)' },
];

const PALETTE_IDS = new Set<string>(PALETTE_OPTIONS.map((p) => p.id));

/**
 * Apply the selected colourblind palette to the document root via `data-palette`. A `null` or
 * unrecognised value removes the attribute, falling back to the default palette.
 */
export function applyPalette(palette: string | null): void {
  if (palette !== null && PALETTE_IDS.has(palette)) {
    document.documentElement.dataset.palette = palette;
  } else {
    delete document.documentElement.dataset.palette;
  }
}

/** React hook: applies the colourblind palette from settings whenever it changes. */
export function usePalette(palette: string | null): void {
  useEffect(() => {
    applyPalette(palette);
  }, [palette]);
}

/**
 * Resolve the effective light/dark value for a theme setting, consulting the OS for `'system'`.
 */
function resolve(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

/** Apply the resolved theme to the document root via `data-theme`. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = resolve(theme);
}

/**
 * React hook: applies the theme and, while the setting is `'system'`, follows OS changes live.
 */
export function useTheme(theme: Theme): void {
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);
}
