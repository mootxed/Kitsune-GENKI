import { describe, expect, it } from 'vitest';
import {
  validateImportData,
  sanitizePrototypePollution,
  MAX_IMPORT_SIZE_BYTES,
} from '../../src/backup-manager.js';

import protoPollutionFixture from '../fixtures/security/prototype-pollution.json';
import futureSchemaFixture from '../fixtures/security/future-schema-version.json';
import backupWithKeyFixture from '../fixtures/security/backup-with-api-key.json';

describe('Security: Data Import Validation & Prototype Pollution Protection', () => {
  it('strips prototype pollution keys (__proto__, constructor, prototype)', () => {
    const raw = JSON.parse(JSON.stringify(protoPollutionFixture));
    const sanitized = sanitizePrototypePollution(raw);

    expect(sanitized.__proto__).toBe(Object.prototype);
    expect(Object.prototype.polluted).toBeUndefined();
    expect(sanitized.polluted).toBeUndefined();
  });

  it('rejects unsupported future schema versions', () => {
    const res = validateImportData(futureSchemaFixture);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Несовместимая версия схемы данных');
  });

  it('rejects oversized backup payload exceeding MAX_IMPORT_SIZE_BYTES', () => {
    const oversizedLength = MAX_IMPORT_SIZE_BYTES + 1;
    const res = validateImportData({ app: 'kotokitsu' }, oversizedLength);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Размер файла экспорта превышает допустимый лимит');
  });

  it('ignores and strips openrouterKey if included in imported backup settings', () => {
    const res = validateImportData(backupWithKeyFixture);
    expect(res.valid).toBe(true);
    expect(res.data.data.state.settings.openrouterKey).toBe('');
  });
});
