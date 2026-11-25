import { Check, Palette, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { type ThemeMode, type ThemePreset, type ThemeRadius, type ThemeScale, useAppStore } from '@/stores/app-store'

const PRESETS: { id: ThemePreset; label: string; dot: string }[] = [
  { id: 'default', label: '默认海蓝', dot: 'oklch(0.56 0.19 253)' },
  { id: 'anthropic', label: '报刊陶土', dot: 'oklch(0.66 0.148 38)' },
  { id: 'lake-view', label: '湖畔翡翠', dot: 'oklch(0.64 0.16 165)' },
  { id: 'ocean-breeze', label: '深海湛蓝', dot: 'oklch(0.546 0.215 262.88)' },
  { id: 'rose-garden', label: '玫瑰绯红', dot: 'oklch(0.583 0.235 12.23)' },
]

const SCALES: { id: ThemeScale; label: string }[] = [
  { id: 'sm', label: '紧凑' },
  { id: 'default', label: '标准' },
  { id: 'lg', label: '舒适' },
  { id: 'xl', label: '大号' },
]

export function ConfigDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    themeMode,
    themePreset,
    themeRadius,
    themeScale,
    setThemeMode,
    setThemePreset,
    setThemeRadius,
    setThemeScale,
  } = useAppStore()

  if (!open) return null

  return (
    <div className='fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[1px]' onClick={onClose}>
      <div
        className='bg-popover text-popover-foreground flex h-full w-80 flex-col border-l p-5 shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='mb-5 flex items-center justify-between border-b pb-3'>
          <div className='flex items-center gap-2 font-semibold'>
            <Palette className='text-primary size-4' />
            <span>界面外观主题</span>
          </div>
          <Button variant='ghost' size='icon' onClick={onClose}>
            <X className='size-4' />
          </Button>
        </div>

        <div className='space-y-6 overflow-y-auto'>
          <div>
            <p className='text-muted-foreground mb-2 text-sm font-medium'>明暗模式</p>
            <div className='grid grid-cols-3 gap-2'>
              {(
                [
                  { id: 'light', label: '浅色' },
                  { id: 'dark', label: '深色' },
                  { id: 'system', label: '跟随系统' },
                ] as { id: ThemeMode; label: string }[]
              ).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setThemeMode(m.id)}
                  className={cn(
                    'rounded-md border px-2.5 py-2 text-xs font-medium transition',
                    themeMode === m.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'hover:bg-accent'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className='text-muted-foreground mb-2 text-sm font-medium'>主题色板 (OKLCH Presets)</p>
            <div className='space-y-2'>
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setThemePreset(p.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-medium transition',
                    themePreset === p.id
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'hover:bg-accent'
                  )}
                >
                  <span className='flex items-center gap-2.5'>
                    <span className='size-3.5 rounded-full border' style={{ background: p.dot }} />
                    {p.label}
                  </span>
                  {themePreset === p.id && <Check className='text-primary size-3.5' />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className='text-muted-foreground mb-2 text-sm font-medium'>界面字号缩放</p>
            <div className='grid grid-cols-4 gap-2'>
              {SCALES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setThemeScale(s.id)}
                  className={cn(
                    'rounded-md border px-2 py-2 text-xs font-medium transition',
                    themeScale === s.id ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className='text-muted-foreground mb-2 text-sm font-medium'>组件圆角尺寸</p>
            <div className='grid grid-cols-5 gap-1.5'>
              {(['none', 'sm', 'md', 'lg', 'xl'] as ThemeRadius[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setThemeRadius(r)}
                  className={cn(
                    'rounded-md border py-1.5 text-xs font-medium uppercase transition',
                    themeRadius === r ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
