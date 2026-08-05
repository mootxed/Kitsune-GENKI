#!/usr/bin/env node

/**
 * check-content-release.js
 * Strict release audit gate for KotoKitsu release candidate builds.
 */

import { runFullContentAudit } from './lib/content-auditor.js';

async function main() {
  console.log('🚀 Running Strict Release Content Audit...');
  const result = await runFullContentAudit();
  const t = result.totals;

  let failed = false;

  if (t.brokenRelationsCount > 0) {
    console.error(`❌ RELEASE BLOCKER: ${t.brokenRelationsCount} broken relations found.`);
    failed = true;
  }

  if (t.criticalIssuesCount > 0) {
    console.error(`❌ RELEASE BLOCKER: ${t.criticalIssuesCount} Critical issues found.`);
    failed = true;
  }

  if (t.highIssuesCount > 0) {
    console.error(`❌ RELEASE BLOCKER: ${t.highIssuesCount} High-severity issues found.`);
    failed = true;
  }

  if (t.dictionaryRelationsCount !== t.vocabularyCount) {
    console.error(
      `❌ RELEASE BLOCKER: Dictionary relations coverage is ${t.dictionaryRelationsCount}/${t.vocabularyCount}`
    );
    failed = true;
  }

  if (failed) {
    console.error(
      '\n❌ Release check FAILED. All Critical and High issues must be resolved before release.'
    );
    process.exitCode = 1;
  } else {
    console.log('\n✅ Strict Release Audit PASSED! All 12 content modules ready for release.');
  }
}

main().catch((err) => {
  console.error('Release check script failed:', err);
  process.exitCode = 1;
});
