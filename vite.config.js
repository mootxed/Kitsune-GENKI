import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { visualizer } from 'rollup-plugin-visualizer';

/**
 * Vite Service Worker plugin.
 *
 * Build-time tasks:
 *  1. Replace `__CACHE_VERSION__` in dist/sw.js with a content-hash derived
 *     from the Vite-generated assets.
 *  2. Inject precache assets into `__STATIC_ASSETS_BEGIN__` / `__STATIC_ASSETS_END__`.
 *     Excludes lazy screen chunks to keep initial offline cache lean.
 *  3. Replace `__CORE_ASSETS_BEGIN__` / `__CORE_ASSETS_END__` with main entry files.
 */
function vitePluginServiceWorker() {
  return {
    name: 'vite-plugin-service-worker',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.includes('/sw.js')) {
          const publicSwPath = path.resolve(__dirname, 'public/sw.js');
          if (fs.existsSync(publicSwPath)) {
            let content = fs.readFileSync(publicSwPath, 'utf8');
            const devVersion = `dev-${Date.now()}`;
            content = content.replace(/__CACHE_VERSION__/g, devVersion);
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'no-store');
            return res.end(content);
          }
        }
        next();
      });
    },

    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const swPath = path.resolve(distDir, 'sw.js');
      const assetsDir = path.resolve(distDir, 'assets');

      if (!fs.existsSync(swPath)) return;

      let assetFiles = [];
      if (fs.existsSync(assetsDir)) {
        assetFiles = fs
          .readdirSync(assetsDir)
          .filter((file) => !file.endsWith('.map'))
          .map((file) => `assets/${file}`);
      }

      const hashInput = [...assetFiles].sort().join('|') || 'no-assets';
      const cacheVersion = crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 12);

      const mainJs = assetFiles.find((f) => /assets\/index-[^/]+\.js$/.test(f));
      const mainCss = assetFiles.find((f) => /assets\/index-[^/]+\.css$/.test(f));

      let swContent = fs.readFileSync(swPath, 'utf8');

      // 1. Replace CACHE_VERSION placeholder
      swContent = swContent.replace(/__CACHE_VERSION__/g, cacheVersion);

      // 2. Inject CORE_ASSETS (critical shell: main JS + CSS entry points)
      const coreAssets = [mainJs, mainCss].filter(Boolean);
      if (coreAssets.length > 0) {
        const coreFormatted = coreAssets.map((a) => `  '${a}'`).join(',\n');
        swContent = swContent.replace(
          /\/\* __CORE_ASSETS_BEGIN__ \*\/[\s\S]*?\/\* __CORE_ASSETS_END__ \*\//,
          `/* __CORE_ASSETS_BEGIN__ */\n${coreFormatted}\n  /* __CORE_ASSETS_END__ */`
        );
      }

      // 3. Inject ONLY essential static assets into STATIC_ASSETS precache
      // Lazy feature chunks are cached at runtime upon fetch (Requirement 30)
      const lazyChunkPattern =
        /assets\/(shop|dev-tools|ai-story|stories|plan|word-details|user-dictionaries|statistics|chat|crossword|word-search|minigame|index\.esm|vendor-hanziwriter|settings|vendor-zod|storage-recovery|study-plan-forecast)-[^/]+\.js$/;
      const precacheAssets = assetFiles.filter((file) => !lazyChunkPattern.test(file));

      const formattedAssets = precacheAssets.map((a) => `  '${a}'`).join(',\n');
      const staticReplacement = `/* __STATIC_ASSETS_BEGIN__ */\n${formattedAssets}\n  /* __STATIC_ASSETS_END__ */`;
      swContent = swContent.replace(
        /\/\* __STATIC_ASSETS_BEGIN__ \*\/[\s\S]*?\/\* __STATIC_ASSETS_END__ \*\//,
        staticReplacement
      );

      fs.writeFileSync(swPath, swContent, 'utf8');
      console.log(
        `[SW Plugin] dist/sw.js updated — cache version: ${cacheVersion}, precached assets: ${precacheAssets.length}/${assetFiles.length}`
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const isAnalyze = mode === 'analyze';

  return {
    plugins: [
      vitePluginServiceWorker(),
      isAnalyze &&
        visualizer({
          filename: 'dist/bundle-analysis.html',
          open: false,
          gzipSize: true,
          brotliSize: true,
        }),
    ].filter(Boolean),

    base: process.env.VITE_BASE || '/',
    root: '.',
    publicDir: 'public',

    server: {
      port: 3000,
      open: true,
      watch: {
        usePolling: true,
        interval: 500,
        ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
      },
    },

    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: 'hidden',
      minify: 'terser',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/hanzi-writer')) {
              return 'vendor-hanziwriter';
            }
            if (id.includes('node_modules/ts-fsrs')) {
              return 'vendor-fsrs';
            }
            if (id.includes('node_modules/zod')) {
              return 'vendor-zod';
            }
            if (id.includes('src/forecast-service') || id.includes('src/plan-risk-adaptation')) {
              return 'study-plan-forecast';
            }
          },
        },
      },
    },

    optimizeDeps: {
      include: [],
    },

    test: {
      environment: 'jsdom',
      server: {
        deps: {
          inline: [/@exodus\/bytes/, /parse5/, /jsdom/, /whatwg-url/],
        },
      },
    },
  };
});
