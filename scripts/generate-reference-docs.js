/* scripts/generate-reference-docs.js — Generator for technical version reference documentation */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_VERSION,
  STATE_SCHEMA_VERSION,
  INDEXED_DB_VERSION,
  INDEXED_DB_NAME,
  COURSE_SCHEMA_VERSION,
  DEFAULT_COURSE_ID,
  DEFAULT_COURSE_CONTENT_VERSION,
} from '../src/app-metadata.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(ROOT_DIR, 'docs', 'reference', 'generated-versions.md');

export function generateReferenceDocsContent() {
  return `# Технические версии KotoKitsu

> Этот файл генерируется автоматически. Не редактировать вручную.

| Компонент | Текущая версия |
| --- | --- |
| KotoKitsu | ${APP_VERSION} |
| State schema | ${STATE_SCHEMA_VERSION} |
| IndexedDB schema | ${INDEXED_DB_VERSION} |
| IndexedDB name | ${INDEXED_DB_NAME} |
| Course schema | ${COURSE_SCHEMA_VERSION} |
| Default course | ${DEFAULT_COURSE_ID} |
| GENKI I content | ${DEFAULT_COURSE_CONTENT_VERSION} |
`;
}

function run() {
  const content = generateReferenceDocsContent();
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, content, 'utf-8');
  console.log(`✅ Reference docs generated successfully: ${path.relative(ROOT_DIR, OUTPUT_FILE)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  run();
}
