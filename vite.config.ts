import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import { buildInfo } from './scripts/build-info.mjs';
import { wranglerConfigPath } from './scripts/production-config.mjs';

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  if (process.env.HARIMU_DEPLOY_TARGET && process.env.HARIMU_DEPLOY_TARGET !== 'cloudflare') {
    throw new Error('Development builds only target Cloudflare preview.');
  }

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  const build = buildInfo();
  return {
    // #138: served by GET /api/version.
    define: { __HARIMU_BUILD_SHA__: JSON.stringify(build.sha), __HARIMU_BUILT_AT__: JSON.stringify(build.builtAt) },
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        configPath: wranglerConfigPath(), // #501c: wrangler.jsonc unless HARIMU_WRANGLER_CONFIG names wrangler.prod.jsonc (scripts/build-production.mjs)
      }),
    ],
  };
});
