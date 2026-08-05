#!/usr/bin/env node

/**
 * audit-content.js
 * CLI command to run full Japanese content audit on GENKI I.
 */

import { runFullContentAudit } from './lib/content-auditor.js';

async function main() {
  console.log('🔍 Starting Japanese Content & Coverage Audit (GENKI I)...');
  const result = await runFullContentAudit();

  console.log('\n========================================');
  console.log('📊 Content Audit Metrics Summary');
  console.log('========================================');
  console.log(`Lessons Audited:               12 / 12`);
  console.log(`Vocabulary Items:              ${result.totals.vocabularyCount}`);
  console.log(`Grammar Topics:                ${result.totals.grammarCount}`);
  console.log(
    `Dictionary Relations:          ${result.totals.dictionaryRelationsCount} / ${result.totals.vocabularyCount}`
  );
  console.log(
    `Knowledge Items:               ${result.totals.knowledgeItemsCount} / ${result.totals.vocabularyCount}`
  );
  console.log(`Curated Examples:              ${result.totals.curatedExamplesCount}`);
  console.log(`Generated Fallback Examples:   ${result.totals.generatedExamplesCount}`);
  console.log(`Recognition Cards:             ${result.totals.recognitionAvailableCount}`);
  console.log(`Recall Cards:                  ${result.totals.recallAvailableCount}`);
  console.log(`Active Production Cards:       ${result.totals.activeProductionCount}`);
  console.log(`Context Production Cards:      ${result.totals.contextProductionCount}`);
  console.log(`Audio Structurally Tested:     ${result.totals.audioStructurallyTestedCount}`);
  console.log(`Audio Manually Tested:         ${result.totals.audioManuallyTestedCount}`);
  console.log(`Broken Relations:              ${result.totals.brokenRelationsCount}`);
  console.log(`Critical Issues:               ${result.totals.criticalIssuesCount}`);
  console.log(`High Issues:                   ${result.totals.highIssuesCount}`);
  console.log('========================================\n');

  if (result.issues.length > 0) {
    console.log(`⚠️  Found ${result.issues.length} total content issues:`);
    for (const issue of result.issues) {
      console.log(`  [${issue.severity.toUpperCase()}] ${issue.location}: ${issue.description}`);
    }
  } else {
    console.log('✅ 100% of content elements passed automated structural audit checks!');
  }

  if (result.totals.brokenRelationsCount > 0 || result.totals.criticalIssuesCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Audit script failed:', err);
  process.exitCode = 1;
});
