import { defineConfig } from 'tsup';

// Bundle the server and the workspace packages (which ship TS source) into dist/.
// Third-party dependencies stay external and resolve from node_modules at runtime.
export default defineConfig({
  entry: { index: 'src/index.ts', 'seed-demo': 'scripts/seed-demo.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  noExternal: [/^@vanguard\//],
});
