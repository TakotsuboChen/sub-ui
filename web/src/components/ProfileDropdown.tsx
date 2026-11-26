import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, LogOut, ShieldCheck, UserCog, Wallet } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { PageKey } from '@/components/Layout'
import { Button } from '@/components/ui'
import { MOTION_TRANSITION } from '@/lib/motion'
import { formatCents } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, oklch(0.65 0.19 250), oklch(0.58 0.21 285))',
  'linear-gradient(135deg, oklch(0.66 0.17 165), oklch(0.56 0.14 205))',
  'linear-gradient(135deg, oklch(0.68 0.17 35), oklch(0.60 0.20 12))',
  'linear-gradient(135deg, oklch(0.64 0.19 305), oklch(0.62 0.18 255))',
]

function getAvatarGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]
}

export function ProfileDropdown({ onNavigate }: { onNavigate: (k: PageKey) => void }) {
  const { user, logout } = useAppStore()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const shouldReduce = useReducedMotion()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const username = user?.username || 'User'
  const initials = username.slice(0, 2).toUpperCase()
  const avatarBg = useMemo(() => getAvatarGradient(username), [username])
  const isAdmin = user?.role === 'admin'

  const go = (page: PageKey) => {
    setOpen(false)
    onNavigate(page)
  }

  return (
    <div ref={containerRef} className='relative'>
      <Button
        variant='ghost'
        size='icon'
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup='menu'
        title={`${username} (${isAdmin ? '管理员' : '普通用户'})`}
        className='size-8 rounded-full p-0'
      >
        <span
          className='flex size-6.5 items-center justify-center rounded-full text-[11px] font-semibold text-white shadow-2xs'
          style={{ background: avatarBg }}
        >
          {initials}
        </span>
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            role='menu'
            initial={shouldReduce ? false : { opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduce ? undefined : { opacity: 0, scale: 0.96, y: -4 }}
            transition={MOTION_TRANSITION.fast}
            className='bg-popover text-popover-foreground ring-foreground/10 absolute right-0 z-50 mt-2 w-60 origin-top-right rounded-xl p-1.5 text-sm shadow-lg ring-1'
          >
            <div className='flex items-center gap-2.5 px-2 py-2'>
              <span
                className='flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white'
                style={{ background: avatarBg }}
              >
                {initials}
              </span>
              <div className='min-w-0 flex-1'>
                <p className='truncate text-sm font-medium'>{username}</p>
                <div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                  <span>{isAdmin ? 'Administrator' : 'Member'}</span>
                  <span>·</span>
                  <span className='tabular-nums'>{formatCents(user?.balanceCents ?? 0)}</span>
                </div>
              </div>
            </div>

            <div className='bg-border my-1 h-px' />

            <button
              type='button'
              role='menuitem'
              onClick={() => go('account')}
              className='hover:bg-muted flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors'
            >
              <UserCog className='text-muted-foreground size-4' />
              <span>邀请与账户安全</span>
            </button>
            <button
              type='button'
              role='menuitem'
              onClick={() => go('store')}
              className='hover:bg-muted flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors'
            >
              <Wallet className='text-muted-foreground size-4' />
              <span>订阅商店与充值</span>
            </button>
            <button
              type='button'
              role='menuitem'
              onClick={() => go('rules')}
              className='hover:bg-muted flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors'
            >
              <ShieldCheck className='text-muted-foreground size-4' />
              <span>分流与规则覆写</span>
            </button>
            {isAdmin && (
              <button
                type='button'
                role='menuitem'
                onClick={() => go('admin-overview')}
                className='hover:bg-muted flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors'
              >
                <Activity className='text-muted-foreground size-4' />
                <span>全局运维看板</span>
              </button>
            )}

            <div className='bg-border my-1 h-px' />

            <button
              type='button'
              role='menuitem'
              onClick={() => {
                setOpen(false)
                void logout()
              }}
              className='text-destructive hover:bg-destructive/10 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors'
            >
              <LogOut className='size-4' />
              <span>退出登录</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
