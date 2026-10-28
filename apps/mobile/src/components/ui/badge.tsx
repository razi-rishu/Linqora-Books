import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3', {
  variants: {
    tone: {
      neutral: 'bg-muted text-muted-foreground',
      primary: 'bg-primary-soft text-primary',
      positive: 'bg-positive-soft text-positive',
      negative: 'bg-negative-soft text-negative',
      warning: 'bg-warning-soft text-warning',
      brand: 'bg-brand-soft text-brand',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
