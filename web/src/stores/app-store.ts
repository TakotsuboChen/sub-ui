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
export type ThemePreset =
  | 'default'
  | 'anthropic'
  | 'simple-large'
  | 'underground'
  | 'rose-garden'
  | 'lake-view'
  | 'sunset-glow'
  | 'forest-whisper'
  | 'ocean-breeze'
  | 'lavender-dream'
export type ThemeFont = 'default' | 'sans' | 'serif'
export type ResolvedThemeFont = 'system' | 'sans' | 'serif'
export type ThemeRadius = 'default' | 'none' | 'sm' | 'md' | 'lg' | 'xl'
export type ThemeScale = 'default' | 'sm' | 'lg' | 'xl'
export type ContentLayout = 'full' | 'centered'
export type SidebarVariant = 'inset' | 'floating' | 'sidebar'
export type SidebarCollapsible = 'icon' | 'offcanvas'

export const THEME_PRESETS: readonly {
  value: ThemePreset
  label: string
  swatches: [string, string]
}[] = [
  { value: 'default', label: '默认海蓝', swatches: ['oklch(0.72 0.18 250)', 'oklch(0.7 0.12 280)'] },
  { value: 'anthropic', label: '报刊陶土', swatches: ['oklch(0.984 0.005 95)', 'oklch(0.685 0.142 38)'] },
  { value: 'simple-large', label: '简洁大字', swatches: ['oklch(0.15 0 0)', 'oklch(0.99 0 0)'] },
  { value: 'underground', label: '暗夜翡翠', swatches: ['oklch(0.5315 0.0694 156.19)', 'oklch(0.5748 0.0862 336.52)'] },
  { value: 'rose-garden', label: '玫瑰绯红', swatches: ['oklch(0.5827 0.2418 12.23)', 'oklch(0.8131 0.1129 5.67)'] },
  { value: 'lake-view', label: '湖畔翡翠', swatches: ['oklch(0.765 0.177 163.22)', 'oklch(0.551 0.0899 200.52)'] },
  { value: 'sunset-glow', label: '日落余晖', swatches: ['oklch(0.5591 0.1882 25.33)', 'oklch(0.7938 0.1248 42.42)'] },
  { value: 'forest-whisper', label: '林间微风', swatches: ['oklch(0.5276 0.1072 182.22)', 'oklch(0.5236 0.0505 250.18)'] },
  { value: 'ocean-breeze', label: '深海湛蓝', swatches: ['oklch(0.5461 0.2152 262.88)', 'oklch(0.5854 0.2041 277.12)'] },
  { value: 'lavender-dream', label: '薰衣草梦', swatches: ['oklch(0.5709 0.1808 306.89)', 'oklch(0.811 0.0589 201.14)'] },
] as const

const VALID_PRESETS = new Set<ThemePreset>(THEME_PRESETS.map((p) => p.value))

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
  contentLayout: ContentLayout
  sidebarVariant: SidebarVariant
  sidebarCollapsible: SidebarCollapsible
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
  setContentLayout: (l: ContentLayout) => void
  setSidebarVariant: (v: SidebarVariant) => void
  setSidebarCollapsible: (c: SidebarCollapsible) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  resetThemeCustomization: () => void
  toggleSidebar: () => void
}

function applyTheme(
  mode: ThemeMode,
  preset: ThemePreset,
  font: ThemeFont,
  radius: ThemeRadius,
  scale: ThemeScale,
  contentLayout: ContentLayout
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
  if (contentLayout === 'full') root.removeAttribute('data-theme-content-layout')
  else root.setAttribute('data-theme-content-layout', contentLayout)
}

function readStoredPreset(): ThemePreset {
  const raw = localStorage.getItem('subui-theme-preset') as ThemePreset | null
  return raw && VALID_PRESETS.has(raw) ? raw : 'default'
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  meta: null,
  bootstrapped: false,
  themeMode: (localStorage.getItem('subui-theme-mode') as ThemeMode) || 'system',
  themePreset: readStoredPreset(),
  themeFont: (localStorage.getItem('subui-theme-font') as ThemeFont) || 'default',
  themeRadius: (localStorage.getItem('subui-theme-radius') as ThemeRadius) || 'default',
  themeScale: (localStorage.getItem('subui-theme-scale') as ThemeScale) || 'default',
  contentLayout: (localStorage.getItem('subui-theme-content-layout') as ContentLayout) || 'full',
  sidebarVariant: (localStorage.getItem('subui-sidebar-variant') as SidebarVariant) || 'inset',
  sidebarCollapsible: (localStorage.getItem('subui-sidebar-collapsible') as SidebarCollapsible) || 'icon',
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
    const { themePreset, themeFont, themeRadius, themeScale, contentLayout } = get()
    applyTheme(themeMode, themePreset, themeFont, themeRadius, themeScale, contentLayout)
    set({ themeMode })
  },

  setThemePreset: (themePreset) => {
    if (themePreset === 'default') localStorage.removeItem('subui-theme-preset')
    else localStorage.setItem('subui-theme-preset', themePreset)
    const { themeMode, themeFont, themeRadius, themeScale, contentLayout } = get()
    applyTheme(themeMode, themePreset, themeFont, themeRadius, themeScale, contentLayout)
    set({ themePreset })
  },

  setThemeFont: (themeFont) => {
    if (themeFont === 'default') localStorage.removeItem('subui-theme-font')
    else localStorage.setItem('subui-theme-font', themeFont)
    const { themeMode, themePreset, themeRadius, themeScale, contentLayout } = get()
    applyTheme(themeMode, themePreset, themeFont, themeRadius, themeScale, contentLayout)
    set({ themeFont })
  },

  setThemeRadius: (themeRadius) => {
    if (themeRadius === 'default') localStorage.removeItem('subui-theme-radius')
    else localStorage.setItem('subui-theme-radius', themeRadius)
    const { themeMode, themePreset, themeFont, themeScale, contentLayout } = get()
    applyTheme(themeMode, themePreset, themeFont, themeRadius, themeScale, contentLayout)
    set({ themeRadius })
  },

  setThemeScale: (themeScale) => {
    if (themeScale === 'default') localStorage.removeItem('subui-theme-scale')
    else localStorage.setItem('subui-theme-scale', themeScale)
    const { themeMode, themePreset, themeFont, themeRadius, contentLayout } = get()
    applyTheme(themeMode, themePreset, themeFont, themeRadius, themeScale, contentLayout)
    set({ themeScale })
  },

  setContentLayout: (contentLayout) => {
    if (contentLayout === 'full') localStorage.removeItem('subui-theme-content-layout')
    else localStorage.setItem('subui-theme-content-layout', contentLayout)
    const { themeMode, themePreset, themeFont, themeRadius, themeScale } = get()
    applyTheme(themeMode, themePreset, themeFont, themeRadius, themeScale, contentLayout)
    set({ contentLayout })
  },

  setSidebarVariant: (sidebarVariant) => {
    localStorage.setItem('subui-sidebar-variant', sidebarVariant)
    set({ sidebarVariant })
  },

  setSidebarCollapsible: (sidebarCollapsible) => {
    localStorage.setItem('subui-sidebar-collapsible', sidebarCollapsible)
    set({ sidebarCollapsible })
  },

  setSidebarCollapsed: (sidebarCollapsed) => {
    localStorage.setItem('subui-sidebar-collapsed', String(sidebarCollapsed))
    set({ sidebarCollapsed })
  },

  resetThemeCustomization: () => {
    localStorage.removeItem('subui-theme-mode')
    localStorage.removeItem('subui-theme-preset')
    localStorage.removeItem('subui-theme-font')
    localStorage.removeItem('subui-theme-radius')
    localStorage.removeItem('subui-theme-scale')
    localStorage.removeItem('subui-theme-content-layout')
    localStorage.removeItem('subui-sidebar-variant')
    localStorage.removeItem('subui-sidebar-collapsible')
    localStorage.removeItem('subui-sidebar-collapsed')
    applyTheme('system', 'default', 'default', 'default', 'default', 'full')
    set({
      themeMode: 'system',
      themePreset: 'default',
      themeFont: 'default',
      themeRadius: 'default',
      themeScale: 'default',
      contentLayout: 'full',
      sidebarVariant: 'inset',
      sidebarCollapsible: 'icon',
      sidebarCollapsed: false,
    })
  },

  toggleSidebar: () => {
    const next = !get().sidebarCollapsed
    localStorage.setItem('subui-sidebar-collapsed', String(next))
    set({ sidebarCollapsed: next })
  },
}))
