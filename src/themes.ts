/**
 * Theme catalog — metadata only; colors live in src/themes.css.
 */

export const THEMES = [
  {
    id: 'journal',
    label: 'Journal',
    description: 'Warm paper, teal ink, postmark red — Tripboard’s travel-notebook look.',
  },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

/** Read the currently active theme id from <html data-theme>. */
export function getActiveTheme(): ThemeId {
  if (typeof document === 'undefined') return 'journal'
  const id = document.documentElement.getAttribute('data-theme') as ThemeId | null
  return id ?? 'journal'
}

/** Look up a theme entry by id, or fall back to the first theme. */
export function getTheme(id: string) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
