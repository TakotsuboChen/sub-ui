import { Monitor, MoonStar, Sun } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { type ThemeMode, useAppStore } from '@/stores/app-store'

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Monitor }[] = [
  { value: 'system', label: '跟随系统', icon: Monitor },
  { value: 'light', label: '浅色模式', icon: Sun },
  { value: 'dark', label: '深色模式', icon: MoonStar },
]

export function ThemeQuickSwitcher({ className }: { className?: string }) {
  const { themeMode, setThemeMode } = useAppStore()
  const shouldReduce = useReducedMotion()

  return (
    <div
      role='radiogroup'
      aria-label='切换明暗模式'
      className={cn(
        'border-border/70 bg-muted/50 inline-flex items-center gap-0.5 rounded-lg border p-0.5',
        className
      )}
    >
      {THEME_OPTIONS.map((opt) => {
        const Icon = opt.icon
        const active = themeMode === opt.value
        return (
          <Button
            key={opt.value}
            variant='ghost'
            size='icon-sm'
            role='radio'
            aria-label={opt.label}
            aria-checked={active}
            title={opt.label}
            onClick={() => setThemeMode(opt.value)}
            className={cn(
              'relative size-7 rounded-md hover:bg-transparent',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {active && (
              <motion.span
                layoutId='theme-switcher-active'
                className='bg-background ring-border/80 absolute inset-0 rounded-md shadow-2xs ring-1'
                transition={
                  shouldReduce
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 500, damping: 32, mass: 0.3 }
                }
              />
            )}
            <Icon className='relative z-10 size-3.5' />
          </Button>
        )
      })}
    </div>
  )
}
