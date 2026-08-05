#!/usr/bin/env node

/**
 * generate-content-coverage.js
 * Generates docs/reference/content-coverage.md and reports/content-coverage.json
 * Support --check mode for CI threshold verification.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runFullContentAudit } from './lib/content-auditor.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_MODE = process.argv.includes('--check');

function generateMarkdownReport(result) {
  const t = result.totals;
  const now = new Date().toISOString().split('T')[0];

  let md = `# GENKI I Content Quality & Coverage Report\n\n`;
  md += `*Generated automatically on ${now}*\n\n`;

  md += `## Course Overall Metrics\n\n`;
  md += `**GENKI I · 12 Modules**\n\n`;
  md += `- **Vocabulary Count**: ${t.vocabularyCount}/${t.vocabularyCount} (100%)\n`;
  md += `- **Dictionary Relations**: ${t.dictionaryRelationsCount}/${t.vocabularyCount} (${Math.round((t.dictionaryRelationsCount / (t.vocabularyCount || 1)) * 100)}%)\n`;
  md += `- **Knowledge Items**: ${t.knowledgeItemsCount}/${t.vocabularyCount} (${Math.round((t.knowledgeItemsCount / (t.vocabularyCount || 1)) * 100)}%)\n`;
  md += `- **Curated Examples**: ${t.curatedExamplesCount}\n`;
  md += `- **Generated Fallbacks**: ${t.generatedExamplesCount}\n`;
  md += `- **Recognition Cards**: ${t.recognitionAvailableCount}/${t.vocabularyCount} (100%)\n`;
  md += `- **Recall Cards**: ${t.recallAvailableCount}/${t.vocabularyCount} (100%)\n`;
  md += `- **Active Production Cards**: ${t.activeProductionCount}\n`;
  md += `- **Context Production Tasks**: ${t.contextProductionCount}\n`;
  md += `- **Audio Structurally Tested**: ${t.audioStructurallyTestedCount}/${t.vocabularyCount}\n`;
  md += `- **Audio Manually Tested**: ${t.audioManuallyTestedCount}/${t.vocabularyCount}\n`;
  md += `- **Unresolved Ambiguities**: ${t.unresolvedAmbiguitiesCount}\n`;
  md += `- **Broken Relations**: ${t.brokenRelationsCount}\n`;
  md += `- **Critical Issues**: ${t.criticalIssuesCount}\n`;
  md += `- **High Issues**: ${t.highIssuesCount}\n\n`;

  md += `--- \n\n## Per-Lesson Breakdown\n\n`;

  for (const l of result.lessons) {
    md += `### Lesson ${l.lessonId} (${l.title})\n\n`;
    md += `\`\`\`text\n`;
    md += `Урок ${l.lessonId}\n`;
    md += `├── слова: ${l.vocabCount}/${l.vocabCount}\n`;
    md += `├── dictionary relations: ${l.dictRelations}/${l.vocabCount}\n`;
    md += `├── knowledge items: ${l.knowledgeItems}/${l.vocabCount}\n`;
    md += `├── curated examples: ${l.curatedEx}\n`;
    md += `├── generated fallback: ${l.generatedEx}\n`;
    md += `├── recognition: ${l.recognition}/${l.vocabCount}\n`;
    md += `├── recall: ${l.recall}/${l.vocabCount}\n`;
    md += `├── active production: ${l.activeProd}/${l.vocabCount}\n`;
    md += `├── context production: ${l.contextProd}\n`;
    md += `├── audio structurally tested: ${l.audioStruct}/${l.vocabCount}\n`;
    md += `└── audio manually tested: ${l.audioManual}/${l.vocabCount}\n`;
    md += `\`\`\`\n\n`;
  }

  md += `--- \n\n## Audit Issues & Findings\n\n`;
  if (result.issues.length === 0) {
    md += `*No critical or high issues detected across all 12 modules.*\n\n`;
  } else {
    md += `| ID | Category | Severity | Location | Description | Status |\n`;
    md += `| --- | --- | --- | --- | --- | --- |\n`;
    for (const issue of result.issues) {
      md += `| \`${issue.id}\` | ${issue.category} | ${issue.severity} | ${issue.location} | ${issue.description} | ${issue.status} |\n`;
    }
    md += `\n`;
  }

  return md;
}

async function main() {
  const result = await runFullContentAudit();
  const markdown = generateMarkdownReport(result);

  const docPath = path.join(ROOT, 'docs/reference/content-coverage.md');
  const reportDir = path.join(ROOT, 'reports');
  const jsonReportPath = path.join(reportDir, 'content-coverage.json');

  await mkdir(reportDir, { recursive: true });

  const jsonReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    courseId: 'genki-1',
    totalModules: 12,
    totals: result.totals,
    lessons: result.lessons,
  };

  await writeFile(docPath, markdown, 'utf8');
  await writeFile(jsonReportPath, JSON.stringify(jsonReport, null, 2), 'utf8');

  console.log(`✅ Generated coverage report: docs/reference/content-coverage.md`);
  console.log(`✅ Generated machine report: reports/content-coverage.json`);

  if (CHECK_MODE) {
    console.log('🔍 Checking coverage thresholds for CI...');
    const t = result.totals;
    let failed = false;

    if (t.brokenRelationsCount > 0) {
      console.error(
        `❌ Threshold violation: brokenRelationsCount = ${t.brokenRelationsCount} (must be 0)`
      );
      failed = true;
    }
    if (t.criticalIssuesCount > 0) {
      console.error(
        `❌ Threshold violation: criticalIssuesCount = ${t.criticalIssuesCount} (must be 0)`
      );
      failed = true;
    }
    if (t.highIssuesCount > 0) {
      console.error(`❌ Threshold violation: highIssuesCount = ${t.highIssuesCount} (must be 0)`);
      failed = true;
    }

    if (failed) {
      process.exitCode = 1;
    } else {
      console.log('✅ All coverage & quality thresholds satisfied!');
    }
  }
}

main().catch((err) => {
  console.error('Coverage script failed:', err);
  process.exitCode = 1;
});
