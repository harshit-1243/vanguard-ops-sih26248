import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as SliderPrimitive from '@radix-ui/react-slider';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <TabsPrimitive.List className={cn('flex shrink-0 gap-0.5 overflow-x-auto border-b border-line bg-panel px-1', className)}>
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={cn(
        'relative -mb-px flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2.5 py-2 text-xs font-medium text-muted hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink',
        className,
      )}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.Content value={value} className={cn('min-h-0 flex-1 overflow-y-auto focus-visible:outline-none', className)}>
      {children}
    </TabsPrimitive.Content>
  );
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string }) {
  return (
    <SliderPrimitive.Root
      className="relative flex h-5 w-full touch-none select-none items-center"
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onChange(v[0] ?? value)}
    >
      <SliderPrimitive.Track className="relative h-1.5 grow rounded-full bg-raised">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-accent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb aria-label={label} className="block h-4 w-4 rounded-full border-2 border-accent bg-bg shadow" />
    </SliderPrimitive.Root>
  );
}

export function Dialog({ open, onOpenChange, title, description, children, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[94vw] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-line bg-panel p-5 shadow-2xl',
            wide ? 'max-w-3xl' : 'max-w-md',
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
              {description && <DialogPrimitive.Description className="mt-1 text-xs text-muted">{description}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="rounded p-1 text-muted hover:bg-raised hover:text-ink" aria-label="Close">
              <X size={16} />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
