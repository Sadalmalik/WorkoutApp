import { useEffect } from 'react';
import type { Theme } from '../core/index.ts';

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
