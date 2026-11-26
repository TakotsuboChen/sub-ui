import React, { useEffect } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { MOTION_TRANSITION } from '@/lib/motion'
import { cn } from '@/lib/utils'

export function Card({
  className,
  size = 'default',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { size?: 'default' | 'sm' }) {
  return (
    <div
      data-slot='card'
      data-size={size}
      className={cn(
        'group/card bg-card text-card-foreground ring-foreground/10 flex flex-col gap-4 overflow-hidden rounded-xl py-4 text-sm ring-1 has-data-[slot=card-footer]:pb-0 data-[size=sm]:gap-3 data-[size=sm]:py-3',
        className
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot='card-header'
      className={cn(
        'group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4',
        className
      )}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      data-slot='card-title'
      className={cn('text-base leading-snug font-medium group-data-[size=sm]/card:text-sm', className)}
      {...props}
    />
  )
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p data-slot='card-description' className={cn('text-muted-foreground text-sm', className)} {...props} />
  )
}

export function CardAction({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot='card-action'
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  )
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot='card-content'
      className={cn('px-4 group-data-[size=sm]/card:px-3', className)}
      {...props}
    />
  )
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot='card-footer'
      className={cn('bg-muted/50 flex items-center rounded-b-xl border-t p-4 group-data-[size=sm]/card:p-3', className)}
      {...props}
    />
  )
}

type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link'
type ButtonSize = 'sm' | 'default' | 'lg' | 'icon' | 'icon-sm'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({
  className,
  variant = 'default',
  size = 'default',
  type = 'button',
  ...props
}: ButtonProps) {
  const variants: Record<ButtonVariant, string> = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    outline:
      'border-border bg-background hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
    ghost: 'hover:bg-muted hover:text-foreground dark:hover:bg-muted/50',
    destructive:
      'bg-destructive/10 text-destructive hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30',
    link: 'text-primary underline-offset-4 hover:underline',
  }
  const sizes: Record<ButtonSize, string> = {
    default: 'h-8 gap-1.5 px-3 text-sm rounded-lg',
    sm: 'h-7 gap-1 px-2.5 text-xs rounded-md',
    lg: 'h-9 gap-1.5 px-4 text-sm rounded-lg',
    icon: 'size-8 rounded-lg',
    'icon-sm': 'size-7 rounded-md',
  }
  return (
    <button
      data-slot='button'
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
}

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' | 'info'

export function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  const styles: Record<BadgeVariant, string> = {
    default: 'bg-primary text-primary-foreground border-transparent',
    secondary: 'bg-secondary text-secondary-foreground border-transparent',
    success: 'bg-success/12 text-success border-success/30',
    warning: 'border-warning/40 bg-warning/10 text-warning',
    destructive: 'bg-destructive/10 text-destructive border-destructive/25 dark:bg-destructive/20',
    info: 'bg-info/12 text-info border-info/25',
    outline: 'border-border text-foreground bg-transparent',
  }
  return (
    <span
      data-slot='badge'
      className={cn(
        'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all [&>svg]:pointer-events-none [&>svg]:size-3',
        styles[variant],
        className
      )}
      {...props}
    />
  )
}

const iconBadgeVariants = cva('flex shrink-0 items-center justify-center [&>svg]:shrink-0', {
  variants: {
    tone: {
      neutral: 'bg-muted text-muted-foreground',
      primary: 'bg-primary/10 text-primary',
      success: 'bg-success/10 text-success',
      warning: 'bg-warning/10 text-warning',
      info: 'bg-info/10 text-info',
      destructive: 'bg-destructive/10 text-destructive',
      'chart-1': 'bg-chart-1/10 text-chart-1',
      'chart-2': 'bg-chart-2/10 text-chart-2',
      'chart-3': 'bg-chart-3/10 text-chart-3',
      'chart-4': 'bg-chart-4/10 text-chart-4',
      'chart-5': 'bg-chart-5/10 text-chart-5',
    },
    size: {
      xs: 'size-5 rounded-md [&>svg]:size-3',
      sm: 'size-7 rounded-md [&>svg]:size-3.5',
      md: 'size-8 rounded-lg [&>svg]:size-4',
      title: 'size-8 rounded-lg sm:size-9 [&>svg]:size-4',
      lg: 'size-10 rounded-xl [&>svg]:size-5',
      stat: 'size-5 rounded-md sm:size-7 [&>svg]:size-3 sm:[&>svg]:size-3.5',
    },
  },
  defaultVariants: {
    tone: 'neutral',
    size: 'md',
  },
})

export type IconBadgeTone = NonNullable<VariantProps<typeof iconBadgeVariants>['tone']>

export function IconBadge({
  children,
  tone,
  size,
  className,
}: {
  children?: React.ReactNode
  tone?: IconBadgeTone
  size?: VariantProps<typeof iconBadgeVariants>['size']
  className?: string
}) {
  return (
    <span className={cn(iconBadgeVariants({ tone, size }), className)} aria-hidden='true'>
      {children}
    </span>
  )
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot='skeleton'
      className={cn('skeleton-shimmer rounded-md', className)}
      {...props}
    />
  )
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      data-slot='input'
      className={cn(
        'border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 flex h-8 w-full rounded-lg border px-3 py-1 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      data-slot='textarea'
      className={cn(
        'border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 flex min-h-20 w-full rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      data-slot='select'
      className={cn(
        'border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/40 flex h-8 w-full rounded-lg border px-3 py-1 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
        className
      )}
      {...props}
    />
  )
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      data-slot='label'
      className={cn('text-sm font-medium text-foreground/90', className)}
      {...props}
    />
  )
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean
  onCheckedChange: (val: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors',
        checked ? 'bg-primary' : 'bg-input',
        disabled && 'opacity-50'
      )}
    >
      <span
        className={cn(
          'bg-background pointer-events-none block size-4 rounded-full shadow-xs transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </button>
  )
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  maxWidth?: string
}) {
  const shouldReduce = useReducedMotion()

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key='dialog-overlay'
          initial={shouldReduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={shouldReduce ? undefined : { opacity: 0 }}
          transition={MOTION_TRANSITION.fast}
          onClick={onClose}
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/15 p-4 backdrop-blur-xs'
        >
          <motion.div
            key='dialog-content'
            data-slot='dialog-content'
            initial={shouldReduce ? false : { opacity: 0, scale: 0.96, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduce ? undefined : { opacity: 0, scale: 0.96, y: 6 }}
            transition={MOTION_TRANSITION.fast}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'bg-popover text-popover-foreground ring-foreground/10 relative max-h-[calc(100dvh-2rem)] w-full overflow-y-auto overscroll-contain rounded-xl p-5 text-sm shadow-xl ring-1 outline-none',
              maxWidth
            )}
          >
            <div className='mb-4 flex items-start justify-between gap-4'>
              <div>
                <h3 data-slot='dialog-title' className='text-base leading-none font-medium'>
                  {title}
                </h3>
                {description && <p className='text-muted-foreground mt-1.5 text-sm'>{description}</p>}
              </div>
              <Button variant='ghost' size='icon-sm' onClick={onClose} aria-label='关闭'>
                <X className='size-4' />
              </Button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
