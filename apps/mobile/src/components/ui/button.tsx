import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
        secondary: 'bg-muted text-foreground hover:bg-muted/70',
        outline: 'border border-input bg-card hover:bg-muted',
        ghost: 'hover:bg-muted',
        danger: 'bg-negative text-white hover:bg-negative/90',
        brand: 'bg-brand text-white hover:bg-brand/90 dark:text-[#0b0d26]',
        link: 'text-primary underline-offset-4 hover:underline px-0 h-auto',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 text-sm',
        lg: 'h-12 px-5 text-base',
        icon: 'h-11 w-11',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, block, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size, block }), className)} {...props} />
));
Button.displayName = 'Button';

export interface ButtonLinkProps extends LinkProps, VariantProps<typeof buttonVariants> {}

/** A router link styled as a button. */
export function ButtonLink({ className, variant, size, block, ...props }: ButtonLinkProps) {
  return <Link className={cn(buttonVariants({ variant, size, block }), className)} {...props} />;
}
