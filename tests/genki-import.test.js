import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import { parseXlsxBuffer } from '../scripts/lib/xlsx.js';
import { parseKanjiWorkbook, parseWordWorkbook } from '../scripts/import-genki-i-data.js';

function minimalWorkbook() {
  return Buffer.from(
    'UEsDBBQAAAAIAIGc/lwkCN5LUQAAAGcAAAAPAAAAeGwvd29ya2Jvb2sueG1ss7GvyM1RKEstKs7Mz7NVMtQzULK3synPL8pOys/PtrMpzkhNLSmG0gp5ibmptkouiSWJSgpgEc8UoB4lhSKrTCCjyDPFUEnfzkYfpkkfbg4AUEsDBBQAAAAIAIGc/lzmCGkeUAAAAGwAAAAaAAAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHOzsa/IzVEoSy0qzszPs1Uy1DNQsrezCUrNSSwBChRnZBYUo3IVQhKL0lNLbJXK84uyizNSU0uK9cGUoR7QJCUFzxRbpSLPFEMlfTsbfVRzAFBLAwQUAAAACACBnP5cY9V3yXYAAADpAAAAFAAAAHhsL3NoYXJlZFN0cmluZ3MueG1ss7GvyM1RKEstKs7Mz7NVMtQzULK3sykuLgESmXY2JXYXFl9suLDvwi4bfaCQPkgMKj7rwoYLey9subD9wg4cchswxOdf2Ao0beuFTUATt6DLGipcbMZuly66wOPmCY+bdmIYv+HCpotNQAM2Ag1qRMjqg7wDAFBLAwQUAAAACACBnP5cQ7b7rYIAAABFAQAAGAAAAHhsL3dvcmtzaGVldHMvc2hlZXQxLnhtbF3Q2wrDIAyA4VeRPMBS3ekmTdnWFylF2NhBULF7/LlSbOqVyhfwJ9R93y+VrA8P92lB7xromCbnn+FubWSaj36IA5N3k/J5BpjG/+WiQcUWQn4nbggTE46LXaXprd2kma310vbFMP9dAkwJMGL4UAVIO1YB0k5VgLRzFYBiG7gu6QdQSwECFAAUAAAACACBnP5cJAjeS1EAAABnAAAADwAAAAAAAAAAAAAAAAAAAAAAeGwvd29ya2Jvb2sueG1sUEsBAhQAFAAAAAgAgZz+XOYIaR5QAAAAbAAAABoAAAAAAAAAAAAAAAAAfgAAAHhsL19yZWxzL3dvcmtib29rLnhtbC5yZWxzUEsBAhQAFAAAAAgAgZz+XGPVd8l2AAAA6QAAABQAAAAAAAAAAAAAAAAABgEAAHhsL3NoYXJlZFN0cmluZ3MueG1sUEsBAhQAFAAAAAgAgZz+XEO2+62CAAAARQEAABgAAAAAAAAAAAAAAAAArgEAAHhsL3dvcmtzaGVldHMvc2hlZXQxLnhtbFBLBQYAAAAABAAEAA0BAABmAgAAAAA=',
    'base64'
  );
}

describe('GENKI I XLSX import', () => {
  it('reads shared strings and cell coordinates from XLSX', () => {
    expect(parseXlsxBuffer(minimalWorkbook())).toEqual([
      ['Урок', 'Кандзи', 'Кана', 'Перевод'],
      ['1 урок', '-', 'バス', 'автобус'],
    ]);
  });

  it('uses kana for a technical dash and preserves mixed-script written forms', () => {
    const rows = [
      ['Урок', 'Кандзи', 'Кана', 'Перевод'],
      ['1 урок', '-', 'バス', 'автобус'],
      ['', 'Lサイズ', 'エルサイズ', 'размер L'],
      ...Array.from({ length: 11 }, (_, index) => [
        `${index + 2} урок`,
        `слово${index + 2}`,
        `чтение${index + 2}`,
        `значение${index + 2}`,
      ]),
    ];
    const words = parseWordWorkbook(rows);
    expect(words[0]).toMatchObject({ writtenForm: 'バス', reading: 'バス' });
    expect(words[1]).toMatchObject({
      writtenForm: 'Lサイズ',
      reading: 'エルサイズ',
    });
  });

  it('rejects late duplicates and invalid kanji lessons', () => {
    const duplicateRows = [
      ['Урок', 'Кандзи', 'Кана', 'Перевод'],
      ...Array.from({ length: 12 }, (_, index) => [
        `${index + 1} урок`,
        index < 2 ? '同じ' : `語${index}`,
        index < 2 ? 'おなじ' : `かな${index}`,
        `значение ${index}`,
      ]),
    ];
    expect(() => parseWordWorkbook(duplicateRows)).toThrow('duplicate');
    expect(() =>
      parseKanjiWorkbook([
        ['Кандзи', 'Урок'],
        ['一', '2 урок'],
      ])
    ).toThrow('unlock lesson');
  });
});
