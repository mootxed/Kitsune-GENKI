import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        crypto: 'readonly',
        Notification: 'readonly',
        SpeechSynthesisUtterance: 'readonly',
        location: 'readonly',
        history: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        confirm: 'readonly',
        alert: 'readonly',
        prompt: 'readonly',
        process: 'readonly',
        global: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        CustomEvent: 'readonly',
        Event: 'readonly',
        indexedDB: 'readonly',
        IDBDatabase: 'readonly',
        IDBTransaction: 'readonly',
        IDBKeyRange: 'readonly',
        AudioContext: 'readonly',
        webkitAudioContext: 'readonly',
        performance: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        // Service Worker
        self: 'readonly',
        caches: 'readonly',
        clients: 'readonly',
        importScripts: 'readonly',
        skipWaiting: 'readonly',
        Response: 'readonly',
        BroadcastChannel: 'readonly',
        // Vitest globals for tests
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
        // Third-party browser globals
        HanziWriter: 'readonly',
      },
    },
    plugins: {
      prettier,
    },
    rules: {
      'prettier/prettier': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-debugger': 'warn',
      'no-undef': 'error',
      'no-useless-catch': 'warn',
      'no-useless-assignment': 'warn',
      'no-dupe-keys': 'error',
      'no-control-regex': 'warn',
      'preserve-caught-error': 'off',
    },
  },
  // ===== SERVICE WORKER OVERRIDE =====
  // public/sw.js runs as a classic script (NOT an ES module) in the SW global scope.
  // We keep all quality rules active but adjust the environment.
  {
    files: ['public/sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script', // SW is a classic script, not an ES module
      globals: {
        // Service Worker global scope — these are NOT the same as window.*
        self: 'readonly',
        caches: 'readonly',
        clients: 'readonly',
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
        Headers: 'readonly',
        importScripts: 'readonly',
        skipWaiting: 'readonly',
        console: 'readonly',
        Promise: 'readonly',
        Array: 'readonly',
        Set: 'readonly',
        Map: 'readonly',
        // SW lifecycle events
        addEventListener: 'readonly',
        removeEventListener: 'readonly',
      },
    },
    plugins: {
      prettier,
    },
    rules: {
      'prettier/prettier': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-debugger': 'warn',
      // no-undef is still active, but SW globals are declared above
      'no-undef': 'error',
      'no-useless-catch': 'warn',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '.vscode/**'],
  },
];
