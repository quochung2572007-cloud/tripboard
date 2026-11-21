/**
 * Navigation Config — what appears in the top bar. Routes are file-based
 * (src/pages/), this only controls the links.
 */

import type { Role } from './constants'

export interface NavItem {
  path: string
  label: string
  roles?: Role[]
  devOnly?: boolean
}

export const nav: NavItem[] = [
  { path: '/home', label: 'My trips' },
  { path: '/api-status', label: 'API Status', devOnly: true },
]
