import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));

/** First existing candidate path (dev: src/, prod bundle: dist/, docker: explicit env). */
function firstExisting(candidates: string[]): string {
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(8080),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.string().default('development'),
  LOG_LEVEL: z.string().default('info'),
  TICK_HZ: z.coerce.number().min(0.1).max(50).default(1),
  DATABASE_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : undefined)),
  SEED_DEMO_ON_EMPTY: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  SCENARIOS_DIR: z.string().optional(),
  WEB_DIST: z.string().optional(),
  LLM_PROVIDER: z.enum(['none', 'ollama', 'anthropic', 'groq', 'cerebras', 'xai', 'openai']).default('none'),
  /** OpenAI-compatible providers (groq | cerebras | xai | openai). Provider-specific key vars also work. */
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  CEREBRAS_API_KEY: z.string().optional(),
  XAI_API_KEY: z.string().optional(),
  OLLAMA_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('llama3.2'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
});

export type Config = z.infer<typeof EnvSchema> & { scenariosDir: string; webDist: string };

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<Config> = {},
): Config {
  const parsed = EnvSchema.parse(env);
  const scenariosDir =
    overrides.scenariosDir ??
    (parsed.SCENARIOS_DIR ? path.resolve(parsed.SCENARIOS_DIR) : undefined) ??
    firstExisting([
      path.resolve(here, '../../../scenarios'),
      path.resolve(process.cwd(), 'scenarios'),
      path.resolve(process.cwd(), '../../scenarios'),
    ]);
  const webDist =
    overrides.webDist ??
    (parsed.WEB_DIST ? path.resolve(parsed.WEB_DIST) : undefined) ??
    firstExisting([
      path.resolve(here, '../../web/dist'),
      path.resolve(process.cwd(), 'apps/web/dist'),
    ]);
  return { ...parsed, ...overrides, scenariosDir, webDist };
}
