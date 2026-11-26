import React, { useEffect, useRef, useState } from 'react'
import {
  Activity,
  GitBranch,
  LayoutDashboard,
  Menu,
  Package,
  Palette,
  PanelLeft,
  Receipt,
  Server,
  Settings,
  Shield,
  ShoppingBag,
  Sliders,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { BrandLogo } from '@/components/BrandLogo'
import { ConfigDrawer } from '@/components/ConfigDrawer'
import { ProfileDropdown } from '@/components/ProfileDropdown'
import { ThemeQuickSwitcher } from '@/components/ThemeQuickSwitcher'
import { Badge, Button } from '@/components/ui'
import { MOTION_TRANSITION, SIDEBAR_ITEM_VARIANTS, SIDEBAR_STAGGER_VARIANTS } from '@/lib/motion'
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
  const {
    user,
    meta,
    sidebarVariant,
    sidebarCollapsible,
    sidebarCollapsed,
    toggleSidebar,
  } = useAppStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const shouldReduce = useReducedMotion()

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [activePage])

  // Keyboard shortcut Ctrl/Cmd + B to toggle sidebar (aligned with NewAPI)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'b' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (window.innerWidth < 768) {
          setMobileMenuOpen((v) => !v)
        } else {
          toggleSidebar()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleSidebar])

  const isAdmin = user?.role === 'admin'
  const isIconCollapsed = sidebarCollapsed && sidebarCollapsible === 'icon'
  const isOffcanvasCollapsed = sidebarCollapsed && sidebarCollapsible === 'offcanvas'

  const handleSelect = (k: PageKey) => {
    onNavigate(k)
    setMobileMenuOpen(false)
  }

  const renderNavGroup = (title: string, items: NavItem[], iconOnly: boolean, layoutPrefix: string) => (
    <div>
      <div
        className={cn(
          'text-sidebar-foreground/60 mb-1.5 flex items-center gap-1.5 px-2 text-[11px] font-medium tracking-wider uppercase transition-[height,opacity,margin] duration-200 ease-linear',
          iconOnly ? 'pointer-events-none mb-0 h-0 overflow-hidden opacity-0' : 'h-6 opacity-100'
        )}
      >
        {title === '管理员控制台' && <Shield className='size-3 shrink-0' />}
        <span className='truncate'>{title}</span>
      </div>
      <div className='space-y-1'>
        {items.map((item) => {
          const Icon = item.icon
          const active = activePage === item.key
          return (
            <motion.div key={item.key} variants={shouldReduce ? undefined : SIDEBAR_ITEM_VARIANTS}>
              <button
                type='button'
                onClick={() => handleSelect(item.key)}
                title={item.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center rounded-md text-sm font-medium transition-[width,height,padding,color,background-color] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                  iconOnly ? 'mx-auto size-8 justify-center p-0' : 'h-8 w-full gap-2 px-2.5',
                  active
                    ? 'text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/75 hover:bg-muted/80 hover:text-sidebar-foreground'
                )}
              >
                {active && (
                  <motion.span
                    layoutId={`${layoutPrefix}-active-pill`}
                    transition={
                      shouldReduce
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 420, damping: 32, mass: 0.5 }
                    }
                    className='bg-sidebar-accent absolute inset-0 rounded-md'
                  />
                )}
                <Icon className='relative z-10 size-4 shrink-0' />
                {!iconOnly && <span className='relative z-10 min-w-0 flex-1 truncate text-left'>{item.label}</span>}
              </button>
            </motion.div>
          )
        })}
      </div>
    </div>
  )

  const renderSidebarContent = (iconOnly: boolean, layoutPrefix: string) => (
    <motion.div
      variants={shouldReduce ? undefined : SIDEBAR_STAGGER_VARIANTS}
      initial={shouldReduce ? false : 'initial'}
      animate='animate'
      className={cn('flex min-h-full flex-col gap-4 py-3', iconOnly ? 'px-1.5' : 'px-2.5')}
    >
      {renderNavGroup('用户工作台', USER_NAV, iconOnly, layoutPrefix)}
      {isAdmin && renderNavGroup('管理员控制台', ADMIN_NAV, iconOnly, layoutPrefix)}

      {!iconOnly && (
        <div className='bg-background/70 ring-foreground/8 mt-auto rounded-xl p-3 text-sm ring-1'>
          <div className='flex items-center justify-between'>
            <span className='text-muted-foreground text-xs'>账户余额</span>
            <span className='font-semibold tabular-nums'>{formatCents(user?.balanceCents ?? 0)}</span>
          </div>
          <div className='mt-2 flex items-center justify-between'>
            <span className='text-muted-foreground text-xs'>身份权限</span>
            <Badge variant={isAdmin ? 'default' : 'secondary'}>
              {isAdmin ? 'Administrator' : 'Member'}
            </Badge>
          </div>
        </div>
      )}
    </motion.div>
  )

  return (
    <div className='bg-sidebar text-sidebar-foreground flex h-svh flex-col overflow-hidden'>
      {/* NewAPI-style transparent integrated top header */}
      <header className='z-30 flex h-[var(--app-header-height)] w-full shrink-0 items-center justify-between px-2 sm:px-3'>
        <div className='flex min-w-0 items-center gap-1.5 sm:gap-2'>
          <Button
            variant='ghost'
            size='icon'
            className='md:hidden'
            onClick={() => setMobileMenuOpen((v) => !v)}
            title='打开导航菜单'
          >
            <Menu className='size-4' />
          </Button>
          <Button
            variant='ghost'
            size='icon'
            className='hidden md:inline-flex'
            onClick={toggleSidebar}
            title='切换侧边栏 (Ctrl+B)'
          >
            <PanelLeft className='size-4' />
          </Button>

          <button
            type='button'
            onClick={() => onNavigate('dashboard')}
            className='text-foreground hover:bg-accent inline-flex h-7 min-w-0 items-center gap-2 rounded-md px-1.5 text-sm font-semibold transition-colors outline-none'
          >
            <BrandLogo size='sm' />
            <span className='max-w-44 truncate'>{meta?.siteName || 'Sub-UI'}</span>
          </button>

          <Badge variant='outline' className='hidden text-xs tabular-nums sm:inline-flex'>
            v{meta?.version || __APP_VERSION__}
          </Badge>
        </div>

        <div className='flex shrink-0 items-center gap-1.5 sm:gap-2'>
          <ThemeQuickSwitcher className='hidden sm:inline-flex' />
          <Button variant='ghost' size='icon' onClick={() => setDrawerOpen(true)} title='外观与布局设置'>
            <Palette className='size-4' />
          </Button>
          <ProfileDropdown onNavigate={onNavigate} />
        </div>
      </header>

      <div className='flex min-h-0 flex-1'>
        {/* Desktop Sidebar */}
        <aside
          data-variant={sidebarVariant}
          data-state={sidebarCollapsed ? 'collapsed' : 'expanded'}
          className={cn(
            'hidden h-full shrink-0 transition-[width,padding,opacity] duration-200 ease-linear md:block',
            isOffcanvasCollapsed
              ? 'pointer-events-none w-0 overflow-hidden opacity-0'
              : isIconCollapsed
                ? sidebarVariant === 'floating'
                  ? 'w-15 p-2'
                  : 'w-12'
                : sidebarVariant === 'floating'
                  ? 'w-56 p-2'
                  : 'w-52',
            sidebarVariant === 'sidebar' && !isOffcanvasCollapsed && 'border-sidebar-border border-r'
          )}
        >
          <div
            className={cn(
              'no-scrollbar h-full overflow-y-auto',
              sidebarVariant === 'floating' &&
                'bg-sidebar ring-sidebar-border rounded-xl shadow-sm ring-1'
            )}
          >
            {renderSidebarContent(isIconCollapsed, 'desktop-nav')}
          </div>
        </aside>

        {/* Mobile Drawer Sidebar */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              key='mobile-nav-backdrop'
              initial={shouldReduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={shouldReduce ? undefined : { opacity: 0 }}
              transition={MOTION_TRANSITION.fast}
              className='fixed inset-0 z-40 flex bg-black/20 backdrop-blur-xs md:hidden'
              onClick={() => setMobileMenuOpen(false)}
            >
              <motion.aside
                key='mobile-nav-panel'
                initial={shouldReduce ? false : { x: '-100%' }}
                animate={{ x: 0 }}
                exit={shouldReduce ? undefined : { x: '-100%' }}
                transition={MOTION_TRANSITION.default}
                className='bg-sidebar flex h-full w-68 flex-col border-r shadow-xl'
                onClick={(e) => e.stopPropagation()}
              >
                <div className='flex h-[var(--app-header-height)] shrink-0 items-center justify-between border-b px-3'>
                  <div className='flex items-center gap-2'>
                    <BrandLogo size='sm' />
                    <span className='text-sm font-semibold'>{meta?.siteName || 'Sub-UI'}</span>
                  </div>
                  <Button variant='ghost' size='icon-sm' onClick={() => setMobileMenuOpen(false)}>
                    <X className='size-4' />
                  </Button>
                </div>
                <div className='min-h-0 flex-1 overflow-y-auto'>
                  {renderSidebarContent(false, 'mobile-nav')}
                </div>
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Workspace (supports NewAPI Inset floating canvas, Floating, and classic Sidebar) */}
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col',
            sidebarVariant === 'inset' && 'md:pt-0 md:pr-2 md:pb-2',
            sidebarVariant === 'inset' && isOffcanvasCollapsed && 'md:pl-2'
          )}
        >
          <main
            ref={mainRef}
            data-slot='sidebar-inset'
            className={cn(
              'bg-background text-foreground flex-1 overflow-y-auto',
              sidebarVariant === 'inset' && 'md:ring-foreground/8 md:rounded-xl md:shadow-xs md:ring-1'
            )}
          >
            <div className='w-full p-4 sm:p-6'>{children}</div>
          </main>
        </div>
      </div>

      <ConfigDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}
