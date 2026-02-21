import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

const baseOptions = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
};

const serviceWorkerBuild = {
  ...baseOptions,
  entryPoints: ['background/service-worker.ts'],
  outfile: 'dist/background/service-worker.js',
  // ESM required for MV3 service workers
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
};

const contentScriptBuild = {
  ...baseOptions,
  entryPoints: ['content/injector.ts'],
  outfile: 'dist/content/injector.js',
  // IIFE required — Chrome content scripts don't support ES modules
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  // Prevent name collisions with page globals
  globalName: undefined,
};

// Standalone bundle for the mock harness — lets mock-chat.html call the real
// buildSuggestionPrompt instead of maintaining a duplicated inline version.
const mockPromptBuilderBuild = {
  ...baseOptions,
  entryPoints: ['utils/prompt-builder.ts'],
  outfile: 'dist/mock/prompt-builder.js',
  format: 'iife',
  globalName: 'OFCPromptBuilder',
  platform: 'browser',
  target: 'es2020',
};

if (isWatch) {
  const swCtx = await esbuild.context(serviceWorkerBuild);
  const csCtx = await esbuild.context(contentScriptBuild);
  const pbCtx = await esbuild.context(mockPromptBuilderBuild);
  await Promise.all([swCtx.watch(), csCtx.watch(), pbCtx.watch()]);
  console.log('Watching for changes...');
} else {
  await Promise.all([
    esbuild.build(serviceWorkerBuild),
    esbuild.build(contentScriptBuild),
    esbuild.build(mockPromptBuilderBuild),
  ]);
  console.log('Build complete.');
}
