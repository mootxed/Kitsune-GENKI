#!/usr/bin/env node
/**
 * Временный скрипт для конвертации PNG → WebP
 * Конвертирует все ранги и обложки историй с качеством 85%
 */

import sharp from 'sharp';
import { readdir, unlink } from 'fs/promises';
import { join } from 'path';

const QUALITY = 85;
const DIRECTORIES = [
  { path: 'public/rank', pattern: /\.(png)$/i },
  { path: 'public/image', pattern: /\.(png)$/i },
];

async function convertDirectory(dirPath, pattern) {
  console.log(`\n📁 Обрабатываю директорию: ${dirPath}`);

  try {
    const files = await readdir(dirPath);
    const pngFiles = files.filter((file) => pattern.test(file));

    console.log(`   Найдено PNG файлов: ${pngFiles.length}`);

    for (const file of pngFiles) {
      const inputPath = join(dirPath, file);
      const outputPath = inputPath.replace(/\.png$/i, '.webp');

      try {
        await sharp(inputPath).webp({ quality: QUALITY }).toFile(outputPath);

        console.log(`   ✅ ${file} → ${file.replace('.png', '.webp')}`);

        // Удаляем исходный PNG файл после успешной конвертации
        await unlink(inputPath);
        console.log(`   🗑️  Удалён: ${file}`);
      } catch (err) {
        console.error(`   ❌ Ошибка конвертации ${file}:`, err.message);
      }
    }

    return pngFiles.length;
  } catch (err) {
    console.error(`❌ Ошибка чтения директории ${dirPath}:`, err.message);
    return 0;
  }
}

async function main() {
  console.log('🎨 Начинаю конвертацию PNG → WebP\n');
  console.log(`   Качество: ${QUALITY}%`);

  let totalConverted = 0;

  for (const dir of DIRECTORIES) {
    const count = await convertDirectory(dir.path, dir.pattern);
    totalConverted += count;
  }

  console.log(`\n✨ Готово! Конвертировано файлов: ${totalConverted}`);
}

main().catch((err) => {
  console.error('💥 Критическая ошибка:', err);
  process.exit(1);
});
