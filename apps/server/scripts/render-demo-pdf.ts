import { writeFileSync } from 'node:fs';
import { buildAar } from '@vanguard/sim';
import { loadConfig } from '../src/config';
import { seedDemo } from '../src/demo';
import { SessionManager } from '../src/manager';
import { renderAarPdf } from '../src/pdf';
import { ScenarioRegistry } from '../src/scenarios';
import { MemoryEventStore } from '../src/store/memory';

// Dev helper: render the demo AAR PDF to a file (usage: tsx scripts/render-demo-pdf.ts out.pdf)
const config = loadConfig({ LOG_LEVEL: 'silent' });
const m = new SessionManager(new MemoryEventStore(), ScenarioRegistry.fromDir(config.scenariosDir), { tickHz: 1 });
const demo = await seedDemo(m);
const s = m.get(demo.code)!;
const pdf = await renderAarPdf(buildAar(s.sim.ctx, s.code));
writeFileSync(process.argv[2] ?? 'demo-aar.pdf', pdf);
console.log(`wrote ${pdf.length} bytes, skipped: ${demo.skipped.join(' | ') || 'none'}`);
