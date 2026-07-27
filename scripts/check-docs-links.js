/* scripts/check-docs-links.js — Sanity and link checker for documentation files */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

let errorCount = 0;

function logError(file, msg) {
  console.error(`❌ [${path.relative(ROOT_DIR, file)}]: ${msg}`);
  errorCount++;
}

function getAllMarkdownFiles(dir) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getAllMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  if (content.trim().length === 0) {
    logError(filePath, 'File is empty');
  }

  // Check for absolute local paths like /home/mootxed/...
  const homePathMatch = content.match(/\/home\/[a-zA-Z0-9_-]+\/[^\s)]+/g);
  if (homePathMatch) {
    logError(filePath, `Contains absolute local filesystem path: ${homePathMatch[0]}`);
  }

  // Find all Markdown relative links: [text](link)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const rawLink = match[2].trim();

    // Ignore external URLs and mailto
    if (
      rawLink.startsWith('http://') ||
      rawLink.startsWith('https://') ||
      rawLink.startsWith('mailto:')
    ) {
      continue;
    }

    // Split anchor if present
    const [linkPath, anchor] = rawLink.split('#');

    // If link is purely an anchor on the same page
    if (!linkPath) {
      continue;
    }

    // Handle file:// links or relative file links
    let targetPath;
    if (linkPath.startsWith('file://')) {
      targetPath = fileURLToPath(linkPath);
    } else if (linkPath.startsWith('/')) {
      // Relative to root
      targetPath = path.join(ROOT_DIR, linkPath.slice(1));
    } else {
      // Relative to current file directory
      targetPath = path.resolve(path.dirname(filePath), linkPath);
    }

    if (!fs.existsSync(targetPath)) {
      logError(filePath, `Broken link to '${rawLink}' -> File not found: ${targetPath}`);
    }
  }
}

function run() {
  console.log('🔍 Checking documentation files in /docs and README.md...');

  const mdFiles = getAllMarkdownFiles(DOCS_DIR);
  const rootReadme = path.join(ROOT_DIR, 'README.md');
  if (fs.existsSync(rootReadme)) {
    mdFiles.push(rootReadme);
  }

  console.log(`Found ${mdFiles.length} Markdown files to validate.`);

  for (const file of mdFiles) {
    checkFile(file);
  }

  if (errorCount > 0) {
    console.error(`\n❌ Validation failed with ${errorCount} error(s).`);
    process.exit(1);
  } else {
    console.log('✅ Documentation check passed with 0 errors.');
  }
}

run();
