import type { ReactNode } from 'react'
import { motion, useReducedMotion, type Variants } from 'motion/react'
import {
  CARD_ITEM_VARIANTS,
  CARD_STAGGER_VARIANTS,
  MOTION_TRANSITION,
  MOTION_VARIANTS,
  STAGGER_ITEM_VARIANTS,
  STAGGER_VARIANTS,
} from '@/lib/motion'

export function PageTransition({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const shouldReduce = useReducedMotion()

  if (shouldReduce) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      initial={MOTION_VARIANTS.pageEnter.initial}
      animate={MOTION_VARIANTS.pageEnter.animate}
      transition={MOTION_TRANSITION.default}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function AnimatedPage({
  pageKey,
  children,
  className,
}: {
  pageKey: string
  children: ReactNode
  className?: string
}) {
  const shouldReduce = useReducedMotion()

  if (shouldReduce) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      key={pageKey}
      initial={MOTION_VARIANTS.pageEnter.initial}
      animate={MOTION_VARIANTS.pageEnter.animate}
      transition={MOTION_TRANSITION.fast}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function StaggerContainer({
  children,
  className,
  variants,
}: {
  children: ReactNode
  className?: string
  variants?: Variants
}) {
  const shouldReduce = useReducedMotion()

  if (shouldReduce) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      variants={variants ?? STAGGER_VARIANTS}
      initial='initial'
      animate='animate'
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
  variants,
}: {
  children: ReactNode
  className?: string
  variants?: Variants
}) {
  const shouldReduce = useReducedMotion()

  if (shouldReduce) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div variants={variants ?? STAGGER_ITEM_VARIANTS} className={className}>
      {children}
    </motion.div>
  )
}

export function CardStaggerContainer({
  children,
  className,
  variants,
}: {
  children: ReactNode
  className?: string
  variants?: Variants
}) {
  const shouldReduce = useReducedMotion()

  if (shouldReduce) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      variants={variants ?? CARD_STAGGER_VARIANTS}
      initial='initial'
      animate='animate'
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function CardStaggerItem({
  children,
  className,
  variants,
}: {
  children: ReactNode
  className?: string
  variants?: Variants
}) {
  const shouldReduce = useReducedMotion()

  if (shouldReduce) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div variants={variants ?? CARD_ITEM_VARIANTS} className={className}>
      {children}
    </motion.div>
  )
}

export function FadeIn({
  children,
  className,
  delay,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const shouldReduce = useReducedMotion()

  if (shouldReduce) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      initial={MOTION_VARIANTS.fadeIn.initial}
      animate={MOTION_VARIANTS.fadeIn.animate}
      transition={{ ...MOTION_TRANSITION.default, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
