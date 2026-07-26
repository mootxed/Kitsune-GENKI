import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

function vitePluginServiceWorker() {
  return {
    name: 'vite-plugin-service-worker',
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

      let swContent = fs.readFileSync(swPath, 'utf8');

      const formattedAssets = assetFiles.map((a) => `  '${a}'`).join(',\n');
      const replacement = `/* __STATIC_ASSETS_BEGIN__ */\n${formattedAssets}\n  /* __STATIC_ASSETS_END__ */`;

      swContent = swContent.replace(
        /\/\* __STATIC_ASSETS_BEGIN__ \*\/[\s\S]*?\/\* __STATIC_ASSETS_END__ \*\//,
        replacement
      );

      fs.writeFileSync(swPath, swContent, 'utf8');
      console.log(`[SW Plugin] Updated dist/sw.js with ${assetFiles.length} production asset(s).`);
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
