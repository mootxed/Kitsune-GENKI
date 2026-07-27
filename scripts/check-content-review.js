#!/usr/bin/env node
/* scripts/check-content-review.js — Content Quality Review Status CLI Auditor */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../public/data');

function scanDirectory(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(scanDirectory(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      results.push(fullPath);
    }
  }
  return results;
}

function auditContentFiles() {
  const jsonFiles = scanDirectory(DATA_DIR);
  let verified = 0;
  let needsReview = 0;
  let blocked = 0;
  let totalTasks = 0;

  for (const filePath of jsonFiles) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);

      // Check top-level review field
      if (data.review) {
        if (data.review.status === 'verified') verified++;
        else if (data.review.status === 'blocked') blocked++;
        else needsReview++;
      }

      // Check tasks/topics/questions inside JSON
      const items = Array.isArray(data.topics)
        ? data.topics
        : Array.isArray(data.items)
          ? data.items
          : Array.isArray(data.questions)
            ? data.questions
            : [];

      for (const item of items) {
        totalTasks++;
        if (item.review?.status === 'verified') verified++;
        else if (item.review?.status === 'blocked') blocked++;
        else needsReview++;
      }
    } catch (err) {
      console.warn(`[ContentAudit] Error reading ${filePath}:`, err.message);
    }
  }

  console.log('----------------------------------------------------');
  console.log('🇯🇵 KotoKitsu Content Review Quality Audit Report');
  console.log('----------------------------------------------------');
  console.log(`✅ Verified (Проверено):     ${verified}`);
  console.log(`⚠️  Needs Review (Требуют):   ${needsReview}`);
  console.log(`🚫 Blocked (Заблокировано):  ${blocked}`);
  console.log(`📊 Всего элементов:        ${totalTasks + jsonFiles.length}`);
  console.log('----------------------------------------------------');
}

auditContentFiles();
