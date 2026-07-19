import { defineConfig } from 'vite';

export default defineConfig({
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
});
