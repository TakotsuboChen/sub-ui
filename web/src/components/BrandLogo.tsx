import { cn } from '@/lib/utils'

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const CONTAINER_SIZES = {
  sm: 'size-7 rounded-lg',
  md: 'size-8 rounded-lg',
  lg: 'size-10 rounded-xl',
} as const

const SVG_SIZES = {
  sm: 'size-4',
  md: 'size-[18px]',
  lg: 'size-5',
} as const

/**
 * Renders the Sub-UI geometric brand emblem: three source nodes converging
 * into a central routing hub and flowing forward as a unified stream.
 */
export function BrandLogo({ size = 'sm', className }: BrandLogoProps) {
  return (
    <div
      className={cn(
        'bg-primary text-primary-foreground relative flex shrink-0 items-center justify-center shadow-2xs ring-1 ring-inset ring-white/15',
        CONTAINER_SIZES[size],
        className
      )}
    >
      <svg
        viewBox='0 0 24 24'
        fill='none'
        xmlns='http://www.w3.org/2000/svg'
        aria-hidden='true'
        className={SVG_SIZES[size]}
      >
        <circle cx='5.5' cy='6' r='1.65' fill='currentColor' />
        <circle cx='4.5' cy='12' r='1.65' fill='currentColor' />
        <circle cx='5.5' cy='18' r='1.65' fill='currentColor' />
        <path
          d='M7.15 6C10.45 6 11.15 10.4 13.95 11.7'
          stroke='currentColor'
          strokeWidth='1.85'
          strokeLinecap='round'
        />
        <path d='M6.25 12H13.95' stroke='currentColor' strokeWidth='1.85' strokeLinecap='round' />
        <path
          d='M7.15 18C10.45 18 11.15 13.6 13.95 12.3'
          stroke='currentColor'
          strokeWidth='1.85'
          strokeLinecap='round'
        />
        <circle cx='14.8' cy='12' r='2.45' fill='currentColor' />
        <path d='M17.25 12H20.8' stroke='currentColor' strokeWidth='1.95' strokeLinecap='round' />
        <path
          d='M18.6 9.5L21.1 12L18.6 14.5'
          stroke='currentColor'
          strokeWidth='1.85'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      </svg>
    </div>
  )
}
