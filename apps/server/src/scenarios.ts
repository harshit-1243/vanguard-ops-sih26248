import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ScenarioSchema,
  summarizeScenario,
  type Scenario,
  type ScenarioSummary,
} from '@vanguard/shared';

export class ScenarioRegistry {
  private readonly byId = new Map<string, Scenario>();

  constructor(scenarios: Scenario[]) {
    for (const s of scenarios) this.byId.set(s.id, s);
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

  get(id: string): Scenario | undefined {
    return this.byId.get(id);
  }

  list(): ScenarioSummary[] {
    return [...this.byId.values()].map(summarizeScenario);
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
