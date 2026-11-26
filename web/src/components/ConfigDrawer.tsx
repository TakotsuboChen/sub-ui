import { useEffect, type ReactNode, type SVGProps } from 'react'
import { CircleCheck, RotateCcw, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  IconLayoutCompact,
  IconLayoutDefault,
  IconLayoutFull,
  IconSidebarFloating,
  IconSidebarInset,
  IconSidebarSidebar,
  IconThemeDark,
  IconThemeLight,
  IconThemeSystem,
} from '@/components/ConfigPreviewIcons'
import { Button } from '@/components/ui'
import { MOTION_TRANSITION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import {
  type ContentLayout,
  resolveThemeFont,
  type SidebarCollapsible,
  type SidebarVariant,
  THEME_PRESETS,
  type ThemeFont,
  type ThemeMode,
  type ThemeRadius,
  type ThemeScale,
  useAppStore,
} from '@/stores/app-store'

const FONTS: { value: ThemeFont; label: string; preview?: string }[] = [
  { value: 'default', label: 'Auto', preview: undefined },
  { value: 'sans', label: 'Sans', preview: 'var(--font-public-sans)' },
  { value: 'serif', label: 'Serif', preview: 'var(--font-serif)' },
]

const RADII: { value: ThemeRadius; label: string; preview: string }[] = [
  { value: 'default', label: 'Auto', preview: '1rem' },
  { value: 'none', label: '0', preview: '0' },
  { value: 'sm', label: '0.3', preview: '0.3rem' },
  { value: 'md', label: '0.5', preview: '0.5rem' },
  { value: 'lg', label: '0.75', preview: '0.75rem' },
  { value: 'xl', label: '1.0', preview: '1rem' },
]

const SCALES: { value: ThemeScale; label: string; rows: number; rowGap: string }[] = [
  { value: 'sm', label: '紧凑', rows: 4, rowGap: '3px' },
  { value: 'default', label: '标准', rows: 3, rowGap: '6px' },
  { value: 'lg', label: '舒适', rows: 2, rowGap: '10px' },
  { value: 'xl', label: '大号', rows: 1, rowGap: '14px' },
]

function SectionTitle({
  title,
  showReset,
  onReset,
}: {
  title: string
  showReset?: boolean
  onReset?: () => void
}) {
  return (
    <div className='text-muted-foreground mb-2.5 flex items-center gap-2 text-sm font-semibold'>
      <span>{title}</span>
      {showReset && onReset && (
        <Button size='icon-sm' variant='secondary' className='size-4.5 rounded-sm' onClick={onReset} title='恢复默认'>
          <RotateCcw className='size-2.5' />
        </Button>
      )}
    </div>
  )
}

function SvgPreviewOption({
  checked,
  label,
  onClick,
  icon: Icon,
  isTheme = false,
}: {
  checked: boolean
  label: string
  onClick: () => void
  icon: (props: SVGProps<SVGSVGElement>) => ReactNode
  isTheme?: boolean
}) {
  return (
    <button
      type='button'
      role='radio'
      aria-checked={checked}
      data-checked={checked}
      onClick={onClick}
      className='group flex flex-col items-stretch text-left outline-none'
    >
      <div
        className={cn(
          'ring-border relative rounded-md ring-1 transition duration-200',
          'group-hover:ring-primary/60',
          checked && 'ring-primary shadow-lg'
        )}
      >
        {checked && (
          <CircleCheck className='fill-primary absolute top-0 right-0 z-10 size-5 translate-x-1/2 -translate-y-1/2 stroke-white' />
        )}
        <Icon
          className={cn(
            'w-full',
            !isTheme &&
              (checked
                ? 'stroke-primary fill-primary'
                : 'stroke-muted-foreground fill-muted-foreground')
          )}
        />
      </div>
      <div className='mt-1.5 text-center text-xs'>{label}</div>
    </button>
  )
}

function PreviewCard({
  checked,
  label,
  onClick,
  children,
}: {
  checked: boolean
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type='button'
      role='radio'
      aria-checked={checked}
      onClick={onClick}
      className='group flex flex-col items-stretch outline-none'
    >
      <div
        className={cn(
          'ring-border relative h-12 rounded-md ring-1 transition',
          'group-hover:ring-primary/60',
          checked && 'ring-primary shadow-md'
        )}
      >
        {checked && (
          <CircleCheck className='fill-primary absolute top-0 right-0 z-10 size-5 translate-x-1/2 -translate-y-1/2 stroke-white' />
        )}
        {children}
      </div>
      <div className='mt-1.5 truncate text-center text-xs'>{label}</div>
    </button>
  )
}

export function ConfigDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    themeMode,
    themePreset,
    themeFont,
    themeRadius,
    themeScale,
    contentLayout,
    sidebarVariant,
    sidebarCollapsible,
    sidebarCollapsed,
    setThemeMode,
    setThemePreset,
    setThemeFont,
    setThemeRadius,
    setThemeScale,
    setContentLayout,
    setSidebarVariant,
    setSidebarCollapsible,
    setSidebarCollapsed,
    resetThemeCustomization,
  } = useAppStore()
  const shouldReduce = useReducedMotion()

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const autoFont = resolveThemeFont('default', themePreset)
  const autoFontFamily = autoFont === 'serif' ? 'var(--font-serif)' : 'sans-serif'
  const layoutRadioState = sidebarCollapsed ? sidebarCollapsible : 'default'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key='config-drawer-backdrop'
          initial={shouldReduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={shouldReduce ? undefined : { opacity: 0 }}
          transition={MOTION_TRANSITION.fast}
          className='fixed inset-0 z-50 flex justify-end bg-black/15 backdrop-blur-xs'
          onClick={onClose}
        >
          <motion.div
            key='config-drawer-panel'
            initial={shouldReduce ? false : { x: '100%', opacity: 0.9 }}
            animate={{ x: 0, opacity: 1 }}
            exit={shouldReduce ? undefined : { x: '100%', opacity: 0.9 }}
            transition={MOTION_TRANSITION.default}
            className='bg-background text-foreground flex h-dvh w-full max-w-md flex-col border-l shadow-xl'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='border-border/70 bg-background/85 flex items-start justify-between border-b px-5 py-4 backdrop-blur-sm'>
              <div>
                <h2 className='text-base font-medium'>外观与主题设置</h2>
                <p className='text-muted-foreground mt-0.5 text-xs'>
                  调整界面主题、字体、色板及侧边栏布局风格（即时生效并持久化）
                </p>
              </div>
              <Button variant='ghost' size='icon-sm' onClick={onClose} aria-label='关闭设置'>
                <X className='size-4' />
              </Button>
            </div>

            <div className='flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-5 py-5'>
              {/* Theme Mode */}
              <div>
                <SectionTitle
                  title='明暗模式'
                  showReset={themeMode !== 'system'}
                  onReset={() => setThemeMode('system')}
                />
                <div role='radiogroup' className='grid grid-cols-3 gap-4'>
                  {(
                    [
                      { value: 'system', label: '跟随系统', icon: IconThemeSystem },
                      { value: 'light', label: '浅色', icon: IconThemeLight },
                      { value: 'dark', label: '深色', icon: IconThemeDark },
                    ] as { value: ThemeMode; label: string; icon: (p: SVGProps<SVGSVGElement>) => ReactNode }[]
                  ).map((item) => (
                    <SvgPreviewOption
                      key={item.value}
                      checked={themeMode === item.value}
                      label={item.label}
                      icon={item.icon}
                      isTheme
                      onClick={() => setThemeMode(item.value)}
                    />
                  ))}
                </div>
              </div>

              {/* Color Preset */}
              <div>
                <SectionTitle
                  title='主题色板 (OKLCH Presets)'
                  showReset={themePreset !== 'default'}
                  onReset={() => setThemePreset('default')}
                />
                <div role='radiogroup' className='grid grid-cols-4 gap-3'>
                  {THEME_PRESETS.map((preset) => (
                    <PreviewCard
                      key={preset.value}
                      checked={themePreset === preset.value}
                      label={preset.label}
                      onClick={() => setThemePreset(preset.value)}
                    >
                      <div
                        aria-hidden='true'
                        className='absolute inset-0 rounded-md'
                        style={{
                          background:
                            preset.value === 'default'
                              ? 'linear-gradient(135deg, oklch(0.68 0.2 25) 0%, oklch(0.8 0.17 85) 25%, oklch(0.72 0.18 155) 50%, oklch(0.66 0.19 245) 75%, oklch(0.68 0.2 315) 100%)'
                              : `linear-gradient(135deg, ${preset.swatches[0]} 0%, ${preset.swatches[1]} 100%)`,
                        }}
                      />
                    </PreviewCard>
                  ))}
                </div>
              </div>

              {/* Font */}
              <div>
                <SectionTitle
                  title='字体风格'
                  showReset={themeFont !== 'default'}
                  onReset={() => setThemeFont('default')}
                />
                <div role='radiogroup' className='grid grid-cols-3 gap-4'>
                  {FONTS.map((option) => (
                    <PreviewCard
                      key={option.value}
                      checked={themeFont === option.value}
                      label={option.label}
                      onClick={() => setThemeFont(option.value)}
                    >
                      <span
                        aria-hidden='true'
                        className='text-foreground absolute inset-0 flex items-center justify-center text-lg leading-none font-medium'
                        style={{ fontFamily: option.preview ?? autoFontFamily }}
                      >
                        Aa
                      </span>
                    </PreviewCard>
                  ))}
                </div>
              </div>

              {/* Border Radius */}
              <div>
                <SectionTitle
                  title='组件圆角'
                  showReset={themeRadius !== 'default'}
                  onReset={() => setThemeRadius('default')}
                />
                <div role='radiogroup' className='grid grid-cols-6 gap-2'>
                  {RADII.map((option) => (
                    <PreviewCard
                      key={option.value}
                      checked={themeRadius === option.value}
                      label={option.label}
                      onClick={() => setThemeRadius(option.value)}
                    >
                      <span
                        aria-hidden='true'
                        className='border-foreground/70 absolute top-2.5 left-2.5 size-3.5 border-t-[1.5px] border-l-[1.5px]'
                        style={{ borderTopLeftRadius: option.preview }}
                      />
                    </PreviewCard>
                  ))}
                </div>
              </div>

              {/* Density Scale */}
              <div>
                <SectionTitle
                  title='界面密度'
                  showReset={themeScale !== 'default'}
                  onReset={() => setThemeScale('default')}
                />
                <div role='radiogroup' className='grid grid-cols-4 gap-3'>
                  {SCALES.map((option) => (
                    <PreviewCard
                      key={option.value}
                      checked={themeScale === option.value}
                      label={option.label}
                      onClick={() => setThemeScale(option.value)}
                    >
                      <div
                        aria-hidden='true'
                        className='absolute inset-2.5 flex flex-col justify-center'
                        style={{ gap: option.rowGap }}
                      >
                        {Array.from({ length: option.rows }, (_, idx) => 85 - idx * 10).map((w) => (
                          <span key={w} className='bg-foreground/60 block h-[2px] rounded-full' style={{ width: `${w}%` }} />
                        ))}
                      </div>
                    </PreviewCard>
                  ))}
                </div>
              </div>

              {/* Sidebar Style (Desktop) */}
              <div className='max-md:hidden'>
                <SectionTitle
                  title='侧边栏风格'
                  showReset={sidebarVariant !== 'inset'}
                  onReset={() => setSidebarVariant('inset')}
                />
                <div role='radiogroup' className='grid grid-cols-3 gap-4'>
                  {(
                    [
                      { value: 'inset', label: '内嵌浮岛', icon: IconSidebarInset },
                      { value: 'floating', label: '悬浮侧栏', icon: IconSidebarFloating },
                      { value: 'sidebar', label: '经典直边', icon: IconSidebarSidebar },
                    ] as { value: SidebarVariant; label: string; icon: (p: SVGProps<SVGSVGElement>) => ReactNode }[]
                  ).map((item) => (
                    <SvgPreviewOption
                      key={item.value}
                      checked={sidebarVariant === item.value}
                      label={item.label}
                      icon={item.icon}
                      onClick={() => setSidebarVariant(item.value)}
                    />
                  ))}
                </div>
              </div>

              {/* Layout Mode (Desktop) */}
              <div className='max-md:hidden'>
                <SectionTitle
                  title='侧边栏收起模式'
                  showReset={layoutRadioState !== 'default'}
                  onReset={() => {
                    setSidebarCollapsed(false)
                    setSidebarCollapsible('icon')
                  }}
                />
                <div role='radiogroup' className='grid grid-cols-3 gap-4'>
                  {(
                    [
                      { value: 'default', label: '默认展开', icon: IconLayoutDefault },
                      { value: 'icon', label: '图标折叠', icon: IconLayoutCompact },
                      { value: 'offcanvas', label: '全幅收起', icon: IconLayoutFull },
                    ] as { value: 'default' | SidebarCollapsible; label: string; icon: (p: SVGProps<SVGSVGElement>) => ReactNode }[]
                  ).map((item) => (
                    <SvgPreviewOption
                      key={item.value}
                      checked={layoutRadioState === item.value}
                      label={item.label}
                      icon={item.icon}
                      onClick={() => {
                        if (item.value === 'default') {
                          setSidebarCollapsed(false)
                        } else {
                          setSidebarCollapsible(item.value)
                          setSidebarCollapsed(true)
                        }
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Content Width (Desktop) */}
              <div className='max-md:hidden'>
                <SectionTitle
                  title='内容区宽度'
                  showReset={contentLayout !== 'full'}
                  onReset={() => setContentLayout('full')}
                />
                <div role='radiogroup' className='grid grid-cols-2 gap-4'>
                  {(
                    [
                      { value: 'full', label: '铺满全宽', centered: false },
                      { value: 'centered', label: '居中阅读 (1280px)', centered: true },
                    ] as { value: ContentLayout; label: string; centered: boolean }[]
                  ).map((option) => (
                    <PreviewCard
                      key={option.value}
                      checked={contentLayout === option.value}
                      label={option.label}
                      onClick={() => setContentLayout(option.value)}
                    >
                      <div aria-hidden='true' className='absolute inset-2 flex flex-col gap-1.5'>
                        <span className='bg-foreground/40 block h-1.5 w-full rounded-sm' />
                        <div className={cn('flex flex-1 flex-col gap-1', option.centered ? 'mx-auto w-1/2' : 'w-full')}>
                          <span className='bg-foreground/60 block h-[2px] w-full rounded-full' />
                          <span className='bg-foreground/60 block h-[2px] w-3/4 rounded-full' />
                        </div>
                      </div>
                    </PreviewCard>
                  ))}
                </div>
              </div>
            </div>

            <div className='border-border/70 bg-background/85 border-t px-5 py-3.5 backdrop-blur-sm'>
              <Button variant='destructive' className='w-full' onClick={resetThemeCustomization}>
                <RotateCcw className='size-3.5' /> 恢复全部默认外观与布局
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
