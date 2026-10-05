import { useId, type ReactNode } from 'react';
import { allCells } from '@vanguard/shared';
import { Input, Label, Select, Textarea } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/** Small labelled form controls for the scenario editor (each owns its id/label pairing). */
export function TextField({ label, value, onChange, max, className, mono }: { label: string; value: string; onChange: (v: string) => void; max?: number; className?: string; mono?: boolean }) {
  const id = useId();
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} maxLength={max} className={mono ? 'font-mono' : undefined} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function AreaField({ label, value, onChange, rows = 3, max, className }: { label: string; value: string; onChange: (v: string) => void; rows?: number; max?: number; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} rows={rows} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function NumField({ label, value, onChange, min, max, step = 1, className, hint }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: number; className?: string; hint?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        className="font-mono tabular"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
      {hint && <p className="mt-0.5 text-[10px] text-faint">{hint}</p>}
    </div>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange, className, allowEmpty }: { label: string; value: T | undefined; options: readonly (T | readonly [T, string])[]; onChange: (v: T | undefined) => void; className?: string; allowEmpty?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} value={value ?? ''} onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}>
        {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
        {options.map((o) => {
          const [v, t] = typeof o === 'string' ? [o, o] : o;
          return <option key={v} value={v}>{t}</option>;
        })}
      </Select>
    </div>
  );
}

const CELLS = allCells().sort();
export function CellField({ label, value, onChange, className, allowEmpty }: { label: string; value: string | undefined; onChange: (v: string | undefined) => void; className?: string; allowEmpty?: string }) {
  return <SelectField label={label} value={value} options={CELLS} onChange={onChange} className={className} allowEmpty={allowEmpty} />;
}

export function CheckField({ label, checked, onChange, className }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  return (
    <label className={cn('flex items-center gap-2 text-xs', className)}>
      <input type="checkbox" className="accent-[var(--color-accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function MultiCheck<T extends string>({ label, options, value, onChange, className }: { label: string; options: readonly T[]; value: readonly T[]; onChange: (v: T[]) => void; className?: string }) {
  return (
    <fieldset className={className}>
      <legend className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted">{label}</legend>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {options.map((o) => (
          <CheckField key={o} label={<span className="font-mono">{o}</span>} checked={value.includes(o)} onChange={(on) => onChange(on ? [...value, o] : value.filter((x) => x !== o))} />
        ))}
      </div>
    </fieldset>
  );
}
