import { Check, Palette, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  resolveThemeFont,
  type ThemeFont,
  type ThemeMode,
  type ThemePreset,
  type ThemeRadius,
  type ThemeScale,
  useAppStore,
} from '@/stores/app-store'

const PRESETS: { id: ThemePreset; label: string; dot: string }[] = [
  { id: 'default', label: '默认海蓝', dot: 'oklch(0.56 0.19 253)' },
  { id: 'anthropic', label: '报刊陶土', dot: 'oklch(0.66 0.148 38)' },
  { id: 'simple-large', label: '简洁大字', dot: 'oklch(0.22 0 0)' },
  { id: 'lake-view', label: '湖畔翡翠', dot: 'oklch(0.64 0.16 165)' },
  { id: 'ocean-breeze', label: '深海湛蓝', dot: 'oklch(0.546 0.215 262.88)' },
  { id: 'rose-garden', label: '玫瑰绯红', dot: 'oklch(0.583 0.235 12.23)' },
]

const FONTS: { id: ThemeFont; label: string; preview?: string }[] = [
  { id: 'default', label: '自动 (Auto)', preview: undefined },
  { id: 'sans', label: 'Sans', preview: 'var(--font-public-sans)' },
  { id: 'serif', label: 'Serif', preview: 'var(--font-serif)' },
]

const SCALES: { id: ThemeScale; label: string }[] = [
  { id: 'sm', label: '紧凑' },
  { id: 'default', label: '标准' },
  { id: 'lg', label: '舒适' },
  { id: 'xl', label: '大号' },
]

const RADII: { id: ThemeRadius; label: string }[] = [
  { id: 'default', label: 'Auto' },
  { id: 'none', label: '0' },
  { id: 'sm', label: 'SM' },
  { id: 'md', label: 'MD' },
  { id: 'lg', label: 'LG' },
  { id: 'xl', label: 'XL' },
]

export function ConfigDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    themeMode,
    themePreset,
    themeFont,
    themeRadius,
    themeScale,
    setThemeMode,
    setThemePreset,
    setThemeFont,
    setThemeRadius,
    setThemeScale,
    resetThemeCustomization,
  } = useAppStore()

  if (!open) return null

  const autoFont = resolveThemeFont('default', themePreset)
  const autoFontFamily = autoFont === 'serif' ? 'var(--font-serif)' : 'sans-serif'

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

        <div className='flex-1 space-y-6 overflow-y-auto pr-1'>
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
                    themeMode === m.id ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
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
                    themePreset === p.id ? 'border-primary bg-primary/10 text-foreground' : 'hover:bg-accent'
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
            <p className='text-muted-foreground mb-2 text-sm font-medium'>字体风格</p>
            <div className='grid grid-cols-3 gap-2.5'>
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  type='button'
                  onClick={() => setThemeFont(f.id)}
                  className={cn(
                    'flex flex-col items-center rounded-md border px-2 py-2 transition',
                    themeFont === f.id ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
                  )}
                >
                  <span
                    className='text-lg leading-tight font-medium'
                    style={{ fontFamily: f.preview ?? autoFontFamily }}
                  >
                    Aa
                  </span>
                  <span className='mt-1 text-xs font-medium'>{f.label}</span>
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
            <div className='grid grid-cols-6 gap-1.5'>
              {RADII.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setThemeRadius(r.id)}
                  className={cn(
                    'rounded-md border py-1.5 text-xs font-medium transition',
                    themeRadius === r.id ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className='mt-4 border-t pt-4'>
          <Button variant='outline' className='w-full' onClick={resetThemeCustomization}>
            <RotateCcw className='size-3.5' /> 恢复默认外观
          </Button>
        </div>
      </div>
    </div>
  )
}
