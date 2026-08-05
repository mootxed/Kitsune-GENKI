import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../../src/security-helpers.js';
import { generateDiagnosticReport } from '../../src/dev-tools.js';

describe('Security: Secret Redaction & Diagnostics Sanitization', () => {
  it('redacts sensitive field names and OpenRouter key formats', () => {
    const sensitiveData = {
      user: 'test_user',
      apiKey: 'sk-or-v1-abc123def456ghi789jkl012',
      openrouterKey: 'sk-test-secret-value-12345',
      authorization: 'Bearer sk-or-v1-secret-token-here',
      nested: {
        token: 'secret-token-123',
      },
    };

    const redacted = redactSecrets(sensitiveData);
    expect(redacted.user).toBe('test_user');
    expect(redacted.apiKey).toBe('[REDACTED_SECRET]');
    expect(redacted.openrouterKey).toBe('[REDACTED_SECRET]');
    expect(redacted.authorization).toBe('[REDACTED_SECRET]');
    expect(redacted.nested.token).toBe('[REDACTED_SECRET]');
  });

  it('redacts OpenRouter and API key strings embedded in logs/messages', () => {
    const rawMsg = 'Error in request to OpenRouter with key sk-or-v1-8473928104829104810294810';
    const sanitized = redactSecrets(rawMsg);
    expect(sanitized).not.toContain('sk-or-v1-8473928104829104810294810');
    expect(sanitized).toContain('[REDACTED_SECRET]');
  });

  it('ensures generateDiagnosticReport does NOT leak test secret value sk-test-secret-value', () => {
    const mockState = {
      level: 5,
      xp: 100,
      settings: {
        openrouterKey: 'sk-test-secret-value-99999',
      },
    };

    const report = generateDiagnosticReport(mockState);
    expect(report).not.toContain('sk-test-secret-value-99999');
    expect(report).not.toContain('sk-test-secret-value');
  });
});
