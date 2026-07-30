import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

function decodeXml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/giu, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&');
}

function textRuns(xml) {
  return [...String(xml || '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gu)]
    .map((match) => decodeXml(match[1]))
    .join('');
}

function withoutTagPrefixes(xml) {
  return String(xml || '').replace(/<(\/?)(?:\w+:)([\w-]+)/gu, '<$1$2');
}

function columnIndex(cellReference) {
  const letters = String(cellReference || '').match(/^[A-Z]+/u)?.[0] || '';
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return result - 1;
}

function firstWorksheetPath(files) {
  const workbook = strFromU8(files['xl/workbook.xml']);
  const relationships = strFromU8(files['xl/_rels/workbook.xml.rels']);
  const relationshipId = workbook.match(/<(?:\w+:)?sheet\b[^>]*\br:id="([^"]+)"/u)?.[1];
  if (!relationshipId) throw new Error('XLSX: workbook does not contain a worksheet');

  const relationshipTag = [...relationships.matchAll(/<Relationship\b([^>]*)\/?>/gu)].find(
    (match) => match[1].match(/\bId="([^"]+)"/u)?.[1] === relationshipId
  );
  const target = relationshipTag?.[1].match(/\bTarget="([^"]+)"/u)?.[1];
  if (!target) throw new Error(`XLSX: missing relationship ${relationshipId}`);

  const normalizedTarget = target.replace(/^\/+/u, '');
  return normalizedTarget.startsWith('xl/')
    ? normalizedTarget
    : `xl/${normalizedTarget.replace(/^\.\//u, '')}`;
}

export function parseXlsxBuffer(buffer) {
  const bytes = ArrayBuffer.isView(buffer)
    ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : new Uint8Array(buffer);
  const files = unzipSync(bytes);
  if (!files['xl/workbook.xml'] || !files['xl/_rels/workbook.xml.rels']) {
    throw new Error(`XLSX: invalid workbook archive (${Object.keys(files).join(', ')})`);
  }

  const sharedStringsXml = files['xl/sharedStrings.xml']
    ? withoutTagPrefixes(strFromU8(files['xl/sharedStrings.xml']))
    : '';
  const sharedStrings = [...sharedStringsXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/gu)].map(
    (match) => textRuns(match[1])
  );

  const worksheetPath = firstWorksheetPath(files);
  if (!files[worksheetPath]) throw new Error(`XLSX: worksheet not found: ${worksheetPath}`);
  const worksheet = withoutTagPrefixes(strFromU8(files[worksheetPath]));
  const rows = [];

  for (const rowMatch of worksheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gu)) {
    const values = new Map();
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gu)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2] || '';
      const reference = attributes.match(/\br="([^"]+)"/u)?.[1];
      const type = attributes.match(/\bt="([^"]+)"/u)?.[1];
      const rawValue = body.match(/<v>([\s\S]*?)<\/v>/u)?.[1] ?? '';
      let value;
      if (type === 's') {
        const index = Number(rawValue);
        if (!Number.isInteger(index) || sharedStrings[index] === undefined) {
          throw new Error(`XLSX: invalid shared string index "${rawValue}"`);
        }
        value = sharedStrings[index];
      } else if (type === 'inlineStr') {
        value = textRuns(body);
      } else {
        value = decodeXml(rawValue);
      }
      values.set(columnIndex(reference), value);
    }
    const width = Math.max(-1, ...values.keys()) + 1;
    rows.push(Array.from({ length: width }, (_, index) => values.get(index) ?? ''));
  }

  return rows;
}

export async function readXlsxRows(filePath) {
  return parseXlsxBuffer(await readFile(filePath));
}
