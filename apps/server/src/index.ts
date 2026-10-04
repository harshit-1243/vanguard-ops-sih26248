import { buildApp } from './app';
import { loadConfig } from './config';

async function main(): Promise<void> {
  const config = loadConfig();
  const { app, manager, store } = await buildApp(config);
  const restored = await manager.rehydrateAll();
  if (restored > 0) app.log.info(`Rehydrated ${restored} open session(s) from the event log (paused)`);
  if (config.SEED_DEMO_ON_EMPTY && (await store.countSessions()) === 0) {
    const { seedDemo } = await import('./demo');
    const demo = await seedDemo(manager);
    app.log.info(`Seeded demo exercise ${demo.code} (DS PIN ${demo.pin})`);
  }
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`VANGUARD OPS on :${config.PORT} · store=${store.kind} · LLM=${config.LLM_PROVIDER}`);

  const stop = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop('SIGINT'));
  process.on('SIGTERM', () => void stop('SIGTERM'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
