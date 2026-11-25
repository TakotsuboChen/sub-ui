import React, { useState } from 'react'
import {
  Activity,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Server,
  Settings,
  Shield,
  ShoppingBag,
  Sliders,
  Sun,
  UserCog,
  Users,
} from 'lucide-react'
import { BrandLogo } from '@/components/BrandLogo'
import { ConfigDrawer } from '@/components/ConfigDrawer'
import { Badge, Button } from '@/components/ui'
import { cn, formatCents } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'

export type PageKey =
  | 'dashboard'
  | 'rules'
  | 'store'
  | 'account'
  | 'admin-overview'
  | 'admin-nodes'
  | 'admin-users'
  | 'admin-rules'
  | 'admin-plans'
  | 'admin-orders'
  | 'admin-settings'

interface NavItem {
  key: PageKey
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const USER_NAV: NavItem[] = [
  { key: 'dashboard', label: '订阅概览', icon: LayoutDashboard },
  { key: 'rules', label: '分流与规则覆写', icon: GitBranch },
  { key: 'store', label: '订阅商店与充值', icon: ShoppingBag },
  { key: 'account', label: '邀请与账户安全', icon: UserCog },
]

const ADMIN_NAV: NavItem[] = [
  { key: 'admin-overview', label: '全局运维看板', icon: Activity },
  { key: 'admin-nodes', label: 'S-UI 节点集群', icon: Server },
  { key: 'admin-users', label: '用户与节点绑定', icon: Users },
  { key: 'admin-rules', label: 'ACL 预设与全局规则', icon: Sliders },
  { key: 'admin-plans', label: '套餐与卡密 CDK', icon: Package },
  { key: 'admin-orders', label: '订单与邀请码', icon: Receipt },
  { key: 'admin-settings', label: '系统与支付网关', icon: Settings },
]

export function Layout({
  activePage,
  onNavigate,
  children,
}: {
  activePage: PageKey
  onNavigate: (k: PageKey) => void
  children: React.ReactNode
}) {
  const { user, meta, themeMode, setThemeMode, sidebarCollapsed, toggleSidebar, logout } = useAppStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const isDark =
    themeMode === 'dark' ||
    (themeMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const isAdmin = user?.role === 'admin'

  const handleSelect = (k: PageKey) => {
    onNavigate(k)
    setMobileMenuOpen(false)
  }

  const sidebarContent = (
    <div className='flex h-full flex-col gap-5 px-3 py-4'>
      <div>
        {!sidebarCollapsed && (
          <p className='text-muted-foreground mb-2 px-2.5 text-xs font-semibold tracking-wider uppercase'>
            用户工作台
          </p>
        )}
        <div className='space-y-1'>
          {USER_NAV.map((item) => {
            const Icon = item.icon
            const active = activePage === item.key
            return (
              <button
                key={item.key}
                onClick={() => handleSelect(item.key)}
                title={item.label}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
                )}
              >
                <Icon className='size-4 shrink-0' />
                {!sidebarCollapsed && <span className='truncate'>{item.label}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {isAdmin && (
        <div>
          {!sidebarCollapsed && (
            <p className='text-muted-foreground mb-2 flex items-center gap-1.5 px-2.5 text-xs font-semibold tracking-wider uppercase'>
              <Shield className='size-3.5' />
              管理员控制台
            </p>
          )}
          <div className='space-y-1'>
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon
              const active = activePage === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => handleSelect(item.key)}
                  title={item.label}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
                  )}
                >
                  <Icon className='size-4 shrink-0' />
                  {!sidebarCollapsed && <span className='truncate'>{item.label}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!sidebarCollapsed && (
        <div className='bg-card/80 mt-auto rounded-lg border p-3 text-xs'>
          <div className='flex items-center justify-between'>
            <span className='text-muted-foreground'>账户余额</span>
            <span className='font-mono font-semibold'>{formatCents(user?.balanceCents ?? 0)}</span>
          </div>
          <div className='mt-2 flex items-center justify-between'>
            <span className='text-muted-foreground'>身份权限</span>
            <Badge variant={isAdmin ? 'default' : 'secondary'}>
              {isAdmin ? 'Administrator' : 'Member'}
            </Badge>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className='bg-sidebar flex min-h-svh flex-col'>
      <header className='bg-sidebar/95 sticky top-0 z-30 flex h-[var(--app-header-height)] items-center justify-between border-b px-3 backdrop-blur-sm sm:px-5'>
        <div className='flex items-center gap-2.5'>
          <Button
            variant='ghost'
            size='icon'
            className='md:hidden'
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            <Menu className='size-4' />
          </Button>
          <Button
            variant='ghost'
            size='icon'
            className='hidden md:inline-flex'
            onClick={toggleSidebar}
            title='切换侧边栏'
          >
            {sidebarCollapsed ? <PanelLeftOpen className='size-4' /> : <PanelLeftClose className='size-4' />}
          </Button>

          <div className='flex items-center gap-2'>
            <BrandLogo size='sm' />
            <span className='text-sm font-bold tracking-tight'>{meta?.siteName || 'Sub-UI'}</span>
            <Badge variant='outline' className='hidden font-mono text-xs sm:inline-flex'>
              v{meta?.version || __APP_VERSION__}
            </Badge>
          </div>
        </div>

        <div className='flex items-center gap-1.5 sm:gap-2'>
          <Button
            variant='ghost'
            size='icon'
            onClick={() => setThemeMode(isDark ? 'light' : 'dark')}
            title='切换明暗模式'
          >
            {isDark ? <Sun className='size-4' /> : <Moon className='size-4' />}
          </Button>
          <Button variant='ghost' size='icon' onClick={() => setDrawerOpen(true)} title='外观主题设置'>
            <Palette className='size-4' />
          </Button>
          <div className='bg-card hidden items-center gap-2 rounded-full border px-3 py-1 text-xs sm:flex'>
            <span className='bg-success size-2 rounded-full' />
            <span className='font-medium'>{user?.username}</span>
          </div>
          <Button variant='ghost' size='sm' onClick={() => void logout()} title='退出登录'>
            <LogOut className='size-3.5' />
            <span className='hidden sm:inline'>退出</span>
          </Button>
        </div>
      </header>

      <div className='flex min-h-0 flex-1'>
        <aside
          className={cn(
            'bg-sidebar hidden shrink-0 border-r transition-all duration-200 md:block',
            sidebarCollapsed ? 'w-16' : 'w-60'
          )}
        >
          {sidebarContent}
        </aside>

        {mobileMenuOpen && (
          <div
            className='fixed inset-0 z-40 flex bg-black/50 md:hidden'
            onClick={() => setMobileMenuOpen(false)}
          >
            <aside className='bg-sidebar h-full w-64 border-r' onClick={(e) => e.stopPropagation()}>
              {sidebarContent}
            </aside>
          </div>
        )}

        <main className='bg-background flex-1 overflow-y-auto p-4 sm:p-6'>
          <div className='mx-auto max-w-7xl space-y-5'>{children}</div>
        </main>
      </div>

      <ConfigDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}
