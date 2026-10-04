import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'default' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const variantCls: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 font-semibold',
  default: 'bg-raised text-ink hover:bg-line border border-line',
  ghost: 'text-muted hover:text-ink hover:bg-raised',
  danger: 'bg-bad/15 text-bad border border-bad/50 hover:bg-bad/25',
  outline: 'border border-line text-ink hover:border-muted',
};
const sizeCls: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-xs gap-1',
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }>(
  ({ className, variant = 'default', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap',
        variantCls[variant],
        sizeCls[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-9 w-full rounded-md border border-line bg-bg px-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'h-9 w-full rounded-md border border-line bg-bg px-2 text-sm text-ink focus:border-accent focus:outline-none',
      className,
    )}
    {...props}
  />
));
Select.displayName = 'Select';

export function Label({ children, htmlFor, className }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted', className)}>
      {children}
    </label>
  );
}

type Tone = 'neutral' | 'blue' | 'red' | 'ok' | 'warn' | 'bad' | 'accent' | 'unk';
const toneCls: Record<Tone, string> = {
  neutral: 'border-line text-muted bg-panel2',
  blue: 'border-blue/50 text-blue bg-blue/10',
  red: 'border-red/50 text-red bg-red/10',
  ok: 'border-ok/50 text-ok bg-ok/10',
  warn: 'border-warn/50 text-warn bg-warn/10',
  bad: 'border-bad/50 text-bad bg-bad/10',
  accent: 'border-accent/60 text-accent bg-accent/10',
  unk: 'border-unk/50 text-unk bg-unk/10',
};

export function Badge({ tone = 'neutral', className, children, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[10px] font-medium uppercase leading-4 tracking-wide', toneCls[tone], className)}
      {...props}
    >
      {children}
    </span>
  );
}

export function Panel({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-lg border border-line bg-panel', className)} {...props}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-2 border-b border-line px-3 py-2', className)}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{children}</h2>
      {right}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-6 text-center text-xs text-faint">{children}</p>;
}

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cn('text-[11px] text-faint', className)}>
      Training simulation — synthetic data. All units, callsigns, terrain and events are fictional.
    </p>
  );
}
