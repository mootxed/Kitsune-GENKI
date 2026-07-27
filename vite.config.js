import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Vite Service Worker plugin.
 *
 * Build-time tasks:
 *  1. Replace `__CACHE_VERSION__` in dist/sw.js with a content-hash derived
 *     from the Vite-generated assets.  A new build always gets a new hash
 *     whenever any asset changes — no manual bumping required.
 *  2. Inject the list of hashed production assets between the
 *     `__STATIC_ASSETS_BEGIN__` / `__STATIC_ASSETS_END__` markers.
 *  3. Replace `__CORE_ASSETS_BEGIN__` / `__CORE_ASSETS_END__` with the
 *     main JS and CSS entry-point file names (index-<hash>.js, index-<hash>.css).
 *
 * Dev-time:
 *  The `configureServer` hook replaces `__CACHE_VERSION__` with a
 *  `dev-<timestamp>` string so that each dev restart creates a new
 *  cache version (prevents stale dev caches from accumulating).
 */
function vitePluginServiceWorker() {
  return {
    name: 'vite-plugin-service-worker',

    // Development: patch the public/sw.js on-the-fly for the dev server
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.includes('/sw.js')) {
          const publicSwPath = path.resolve(__dirname, 'public/sw.js');
          if (fs.existsSync(publicSwPath)) {
            let content = fs.readFileSync(publicSwPath, 'utf8');
            const devVersion = `dev-${Date.now()}`;
            content = content.replace(/__CACHE_VERSION__/g, devVersion);
            // In dev, keep the placeholder markers as-is (no hashed assets)
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'no-store');
            return res.end(content);
          }
        }
        next();
      });
    },

    // Production: run after all assets are written to dist/
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const swPath = path.resolve(distDir, 'sw.js');
      const assetsDir = path.resolve(distDir, 'assets');

      if (!fs.existsSync(swPath)) return;

      // Collect all non-map asset files
      let assetFiles = [];
      if (fs.existsSync(assetsDir)) {
        assetFiles = fs
          .readdirSync(assetsDir)
          .filter((file) => !file.endsWith('.map'))
          .map((file) => `assets/${file}`);
      }

      // Derive cache version from the content hash of all asset filenames
      // (sorted so order doesn't matter). Changes whenever any asset changes.
      const hashInput = [...assetFiles].sort().join('|') || 'no-assets';
      const cacheVersion = crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 12);

      // Identify the main entry-point files (index-<hash>.js / .css)
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

      // 3. Inject all assets between STATIC_ASSETS markers
      const formattedAssets = assetFiles.map((a) => `  '${a}'`).join(',\n');
      const staticReplacement = `/* __STATIC_ASSETS_BEGIN__ */\n${formattedAssets}\n  /* __STATIC_ASSETS_END__ */`;
      swContent = swContent.replace(
        /\/\* __STATIC_ASSETS_BEGIN__ \*\/[\s\S]*?\/\* __STATIC_ASSETS_END__ \*\//,
        staticReplacement
      );

      fs.writeFileSync(swPath, swContent, 'utf8');
      console.log(
        `[SW Plugin] dist/sw.js updated — cache version: ${cacheVersion}, assets: ${assetFiles.length}`
      );
    },
  };
}

export default defineConfig({
  plugins: [vitePluginServiceWorker()],

  // Base path для GitHub Pages
  base: '/Kitsune-GENKI/',

  // Корневая директория проекта
  root: '.',

  // Публичная директория (для статических ресурсов)
  publicDir: 'public',

  // Настройки сервера разработки
  server: {
    port: 3000,
    open: true,
    watch: {
      // Полностью отключаем chokidar-вотчер для стабильного старта без дескрипторов
      usePolling: true,
      interval: 500,
      ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
    },
  },

  // Настройки сборки
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Генерация source maps для отладки
    sourcemap: true,
    // Минификация для production
    minify: 'terser',
    // Разделение кода для оптимизации
    rollupOptions: {
      output: {
        manualChunks: {},
      },
    },
  },

  // Оптимизация зависимостей
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
});
