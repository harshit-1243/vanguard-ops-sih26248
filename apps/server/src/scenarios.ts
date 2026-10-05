import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ScenarioSchema,
  summarizeScenario,
  type Scenario,
  type ScenarioListItem,
} from '@vanguard/shared';
import type { CustomScenarioRecord } from './store/types';

/**
 * Built-in scenario templates (read-only, from /scenarios) plus scenarios authored in the DS
 * scenario editor (persisted in the store). Sessions snapshot the scenario at creation, so editing
 * or deleting a custom scenario never changes an existing exercise or its replay.
 */
export class ScenarioRegistry {
  private readonly builtin = new Map<string, Scenario>();
  private readonly custom = new Map<string, { scenario: Scenario; updatedAt: Date }>();

  constructor(scenarios: Scenario[]) {
    for (const s of scenarios) this.builtin.set(s.id, s);
  }

  /** Load and Zod-validate every *.json in a directory. Invalid files throw with path-specific messages. */
  static fromDir(dir: string): ScenarioRegistry {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort();
    const list = files.map((f) => parseScenarioFile(path.join(dir, f)));
    if (list.length === 0) throw new Error(`No scenarios found in ${dir}`);
    return new ScenarioRegistry(list);
  }

  /** Load stored custom scenarios; ones that no longer validate are skipped and reported. */
  loadCustom(records: CustomScenarioRecord[]): string[] {
    const bad: string[] = [];
    for (const r of records) {
      const res = ScenarioSchema.safeParse(r.scenario);
      if (res.success && !this.builtin.has(res.data.id)) this.custom.set(res.data.id, { scenario: res.data, updatedAt: r.updatedAt });
      else bad.push(r.id);
    }
    return bad;
  }

  get(id: string): Scenario | undefined {
    return this.builtin.get(id) ?? this.custom.get(id)?.scenario;
  }

  isBuiltin(id: string): boolean {
    return this.builtin.has(id);
  }

  isCustom(id: string): boolean {
    return this.custom.has(id);
  }

  putCustom(scenario: Scenario, updatedAt: Date): void {
    if (this.builtin.has(scenario.id)) throw new Error(`${scenario.id} is a built-in scenario`);
    this.custom.set(scenario.id, { scenario, updatedAt });
  }

  removeCustom(id: string): boolean {
    return this.custom.delete(id);
  }

  list(): ScenarioListItem[] {
    return [
      ...[...this.builtin.values()].map((s) => ({ ...summarizeScenario(s), custom: false, updatedAt: null })),
      ...[...this.custom.values()].map((c) => ({ ...summarizeScenario(c.scenario), custom: true, updatedAt: c.updatedAt.toISOString() })),
    ];
  }
}

export function parseScenarioFile(file: string): Scenario {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  const res = ScenarioSchema.safeParse(raw);
  if (!res.success) {
    const issues = res.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid scenario ${path.basename(file)}:\n${issues}`);
  }
  return res.data;
}
