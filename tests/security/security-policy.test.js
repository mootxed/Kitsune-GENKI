import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Security: SECURITY.md Compliance Audit', () => {
  const securityMdPath = path.resolve(process.cwd(), 'SECURITY.md');

  it('verifies SECURITY.md exists and contains expected disclosure policies', () => {
    expect(fs.existsSync(securityMdPath)).toBe(true);

    const content = fs.readFileSync(securityMdPath, 'utf8');

    // Primary private reporting channel
    expect(content).toContain('Private Vulnerability Reporting');
    expect(content).not.toContain('создайте тему в разделе Discussions');

    // Supported versions
    expect(content).toContain('Поддерживаемые версии');
    expect(content).toContain('main');

    // Response targets
    expect(content).toContain('3 рабочих дней');
    expect(content).toContain('7 рабочих дней');

    // Safe Harbor and Bug Bounty
    expect(content).toContain('Safe Harbor');
    expect(content).toContain('не предлагает денежных вознаграждений');
  });
});
