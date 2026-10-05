import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { aarFor, eventsJson } from '../src/aar';
import { createStore } from '../src/app';
import { loadConfig } from '../src/config';
import { seedDemo } from '../src/demo';
import { SessionManager } from '../src/manager';
import { renderAarPdf } from '../src/pdf';
import { ScenarioRegistry } from '../src/scenarios';

/**
 * `pnpm seed:demo` — create a finished, fully synthetic Iron Bridge exercise.
 * With DATABASE_URL it is persisted (open /aar/<code> with the printed PIN via DS login).
 * Without a database it writes the AAR PDF + event log to ./.data/ instead.
 */
const config = loadConfig({ ...process.env, LOG_LEVEL: 'warn' });
const store = await createStore(config);
await store.init();
const manager = new SessionManager(store, ScenarioRegistry.fromDir(config.scenariosDir), { tickHz: config.TICK_HZ });
const demo = await seedDemo(manager);
const session = manager.get(demo.code)!;
await session.flush();

console.log(`Demo exercise ready — scenario Iron Bridge, code ${demo.code}, DS PIN ${demo.pin}`);
if (demo.skipped.length) console.log(`(scripted actions not possible under degradation: ${demo.skipped.length})`);
if (store.kind === 'memory') {
  const out = path.resolve(process.env.INIT_CWD ?? process.cwd(), '.data');
  mkdirSync(out, { recursive: true });
  const pdf = await renderAarPdf(await aarFor(session));
  writeFileSync(path.join(out, `demo-aar-${demo.code}.pdf`), pdf);
  writeFileSync(path.join(out, `demo-events-${demo.code}.json`), JSON.stringify(eventsJson(session), null, 2));
  console.log(`No DATABASE_URL: wrote ${path.join(out, `demo-aar-${demo.code}.pdf`)} and the event log.`);
  console.log('Tip: the running app can also create one instantly — landing page › "See a finished demo exercise".');
} else {
  console.log(`Open http://localhost:${config.PORT}/ds-login and log in with ${demo.code} / ${demo.pin}, then open the AAR.`);
}
await store.close();
