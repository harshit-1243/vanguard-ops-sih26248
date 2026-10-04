import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const pct = (n: number | null | undefined, digits = 0): string =>
  n === null || n === undefined ? '—' : `${(n * 100).toFixed(digits)}%`;

export const num = (n: number | null | undefined, digits = 2): string =>
  n === null || n === undefined ? '—' : n.toFixed(digits);
