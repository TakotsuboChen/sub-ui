import { create } from 'zustand'
import { apiFetch } from '@/lib/api'

export interface User {
  id: number
  username: string
  email: string
  role: 'admin' | 'user'
  status: 'active' | 'disabled' | 'exhausted' | 'expired'
  subToken: string
  balanceCents: number
  planId: number | null
  quotaBytes: number
  usedBytes: number
  totalUsedBytes: number
  expiresAt: number
  resetMode: string
  cycleDays: number
  nextResetAt: number
  rulePresetId: number | null
  lastOnlineAt: number
  remark: string
  createdAt: string
}

export interface PublicMeta {
  version?: string
  siteName: string
  siteSubtitle: string
  announcement: string
  registrationEnabled: boolean
  inviteCodeRequired: boolean
  allowUserRuleOverride: boolean
  setupRequired: boolean
  paymentChannels: Record<string, boolean>
}

export type ThemeMode = 'light' | 'dark' | 'system'
export type ThemePreset = 'default' | 'anthropic' | 'simple-large' | 'lake-view' | 'ocean-breeze' | 'rose-garden'
export type ThemeFont = 'default' | 'sans' | 'serif'
export type ResolvedThemeFont = 'system' | 'sans' | 'serif'
export type ThemeRadius = 'default' | 'none' | 'sm' | 'md' | 'lg' | 'xl'
export type ThemeScale = 'default' | 'sm' | 'lg' | 'xl'

export function resolveThemeFont(font: ThemeFont, preset: ThemePreset): ResolvedThemeFont {
  if (font === 'default') {
    return preset === 'anthropic' ? 'serif' : 'system'
  }
  return font
}

interface AppState {
  user: User | null
  meta: PublicMeta | null
  bootstrapped: boolean
  themeMode: ThemeMode
  themePreset: ThemePreset
  themeFont: ThemeFont
  themeRadius: ThemeRadius
  themeScale: ThemeScale
  sidebarCollapsed: boolean
  setAuth: (token: string, user: User) => void
  logout: () => Promise<void>
  refreshMe: () => Promise<void>
  refreshMeta: () => Promise<void>
  setThemeMode: (m: ThemeMode) => void
  setThemePreset: (p: ThemePreset) => void
  setThemeFont: (f: ThemeFont) => void
  setThemeRadius: (r: ThemeRadius) => void
  setThemeScale: (s: ThemeScale) => void
  resetThemeCustomization: () => void
  toggleSidebar: () => void
}

function applyTheme(
  mode: ThemeMode,
  preset: ThemePreset,
  font: ThemeFont,
  radius: ThemeRadius,
  scale: ThemeScale
) {
  const root = document.documentElement
  const isDark =
    mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', isDark)
  if (preset === 'default') root.removeAttribute('data-theme-preset')
  else root.setAttribute('data-theme-preset', preset)
  root.setAttribute('data-theme-font', resolveThemeFont(font, preset))
  if (radius === 'default') root.removeAttribute('data-theme-radius')
  else root.setAttribute('data-theme-radius', radius)
  if (scale === 'default') root.removeAttribute('data-theme-scale')
  else root.setAttribute('data-theme-scale', scale)
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  meta: null,
  bootstrapped: false,
  themeMode: (localStorage.getItem('subui-theme-mode') as ThemeMode) || 'system',
  themePreset: (localStorage.getItem('subui-theme-preset') as ThemePreset) || 'default',
  themeFont: (localStorage.getItem('subui-theme-font') as ThemeFont) || 'default',
  themeRadius: (localStorage.getItem('subui-theme-radius') as ThemeRadius) || 'default',
  themeScale: (localStorage.getItem('subui-theme-scale') as ThemeScale) || 'default',
  sidebarCollapsed: localStorage.getItem('subui-sidebar-collapsed') === 'true',

  setAuth: (token, user) => {
    localStorage.setItem('subui_jwt', token)
    set({ user, bootstrapped: true })
  },

  logout: async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // ignore
    }
    localStorage.removeItem('subui_jwt')
    set({ user: null })
  },

  refreshMeta: async () => {
    const meta = await apiFetch<PublicMeta>('/api/system/public')
    set({ meta })
  },

  refreshMe: async () => {
    try {
      await get().refreshMeta()
      const tok = localStorage.getItem('subui_jwt')
      if (!tok) {
        set({ user: null, bootstrapped: true })
        return
      }
      const res = await apiFetch<{ user: User }>('/api/auth/me')
      set({ user: res.user, bootstrapped: true })
    } catch {
      set({ user: null, bootstrapped: true })
    }
  },

  setThemeMode: (themeMode) => {
    localStorage.setItem('subui-theme-mode', themeMode)
    const { themePreset, themeFont, themeRadius, themeScale } = get()
    applyTheme(themeMode, themePreset, themeFont, themeRadius, themeScale)
    set({ themeMode })
  },

  setThemePreset: (themePreset) => {
    if (themePreset === 'default') localStorage.removeItem('subui-theme-preset')
    else localStorage.setItem('subui-theme-preset', themePreset)
    const { themeMode, themeFont, themeRadius, themeScale } = get()
    applyTheme(themeMode, themePreset, themeFont, themeRadius, themeScale)
    set({ themePreset })
  },

  setThemeFont: (themeFont) => {
    if (themeFont === 'default') localStorage.removeItem('subui-theme-font')
    else localStorage.setItem('subui-theme-font', themeFont)
    const { themeMode, themePreset, themeRadius, themeScale } = get()
    applyTheme(themeMode, themePreset, themeFont, themeRadius, themeScale)
    set({ themeFont })
  },

  setThemeRadius: (themeRadius) => {
    if (themeRadius === 'default') localStorage.removeItem('subui-theme-radius')
    else localStorage.setItem('subui-theme-radius', themeRadius)
    const { themeMode, themePreset, themeFont, themeScale } = get()
    applyTheme(themeMode, themePreset, themeFont, themeRadius, themeScale)
    set({ themeRadius })
  },

  setThemeScale: (themeScale) => {
    if (themeScale === 'default') localStorage.removeItem('subui-theme-scale')
    else localStorage.setItem('subui-theme-scale', themeScale)
    const { themeMode, themePreset, themeFont, themeRadius } = get()
    applyTheme(themeMode, themePreset, themeFont, themeRadius, themeScale)
    set({ themeScale })
  },

  resetThemeCustomization: () => {
    localStorage.removeItem('subui-theme-mode')
    localStorage.removeItem('subui-theme-preset')
    localStorage.removeItem('subui-theme-font')
    localStorage.removeItem('subui-theme-radius')
    localStorage.removeItem('subui-theme-scale')
    applyTheme('system', 'default', 'default', 'default', 'default')
    set({
      themeMode: 'system',
      themePreset: 'default',
      themeFont: 'default',
      themeRadius: 'default',
      themeScale: 'default',
    })
  },

  toggleSidebar: () => {
    const next = !get().sidebarCollapsed
    localStorage.setItem('subui-sidebar-collapsed', String(next))
    set({ sidebarCollapsed: next })
  },
}))
