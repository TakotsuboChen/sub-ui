import { cn } from '@/lib/utils'

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SVG_SIZES = {
  sm: 'size-5',
  md: 'size-6',
  lg: 'size-9',
} as const

/**
 * Minimal stacked-prism mark representing multiple edge nodes unified into
 * a single control-plane subscription. Renders cleanly without a heavy box.
 */
export function BrandLogo({ size = 'md', className }: BrandLogoProps) {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      aria-hidden='true'
      className={cn('text-primary shrink-0', SVG_SIZES[size], className)}
    >
      <path
        d='M8.7 4H17.8Q20 4 19.12 6.02L16.88 11.18Q16 13.2 13.8 13.2H4.7Q2.5 13.2 3.38 11.18L5.62 6.02Q6.5 4 8.7 4Z'
        fill='currentColor'
        fillOpacity='0.34'
      />
      <path
        d='M10.2 10.8H19.3Q21.5 10.8 20.62 12.82L18.38 17.98Q17.5 20 15.3 20H6.2Q4 20 4.88 17.98L7.12 12.82Q8 10.8 10.2 10.8Z'
        fill='currentColor'
      />
    </svg>
  )
}
