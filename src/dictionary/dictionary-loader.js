import { DictionaryEntrySchema, DictionaryManifestSchema } from './dictionary-contract.js';
import { normalizeDictionaryText } from './dictionary-id.js';

function defaultBaseUrl(explicitBaseUrl) {
  if (explicitBaseUrl) return explicitBaseUrl;
  if (typeof document !== 'undefined' && document.baseURI) return document.baseURI;
  if (typeof location !== 'undefined' && location.href) return new URL('./', location.href).href;
  return 'http://localhost/';
}

export function isSafeDictionaryPath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) return false;
  const pathStr = relativePath.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(pathStr)) return false;
  if (pathStr.includes('\\') || pathStr.startsWith('/') || pathStr.startsWith('\\')) return false;
  if (/\/\.\.\/|\/\.\.$|^\.\.\/|^\.\.$/u.test(pathStr)) return false;
  try {
    const decoded = decodeURIComponent(pathStr);
    if (decoded.includes('\\') || /\/\.\.\/|\/\.\.$|^\.\.\/|^\.\.$/u.test(decoded)) return false;
  } catch {
    return false;
  }
  return true;
}

async function fetchJson(fetchImpl, url, resource) {
  let response;
  try {
    response = await fetchImpl(url);
  } catch (cause) {
    throw new Error(`[Dictionary] Unable to load ${resource}: ${cause?.message || cause}`, {
      cause,
    });
  }
  if (!response?.ok) {
    throw new Error(
      `[Dictionary] Unable to load ${resource}: HTTP ${response?.status ?? 'unknown'}`
    );
  }
  try {
    return await response.json();
  } catch (cause) {
    throw new Error(`[Dictionary] Invalid JSON in ${resource}`, { cause });
  }
}

export class DictionaryLoader {
  constructor(options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new Error('[Dictionary] fetch implementation is required');
    }
    this.fetchImpl = fetchImpl;
    this.manifestUrl = new URL(
      options.manifestUrl || 'data/dictionary/manifest.json',
      defaultBaseUrl(options.baseUrl)
    );
    this.packageUrl = new URL('./', this.manifestUrl);
  }

  resolveResourceUrl(relativePath) {
    if (!isSafeDictionaryPath(relativePath)) {
      throw new Error(`[Dictionary] Unsafe resource path: ${relativePath}`);
    }
    let resolved;
    try {
      resolved = new URL(relativePath, this.manifestUrl);
    } catch (cause) {
      throw new Error(`[Dictionary] Invalid resource path: ${relativePath}`, { cause });
    }
    const packagePath = this.packageUrl.pathname.endsWith('/')
      ? this.packageUrl.pathname
      : `${this.packageUrl.pathname}/`;
    if (resolved.origin !== this.packageUrl.origin || !resolved.pathname.startsWith(packagePath)) {
      throw new Error(`[Dictionary] Resource escapes package root: ${relativePath}`);
    }
    return resolved.href;
  }

  async load() {
    const rawManifest = await fetchJson(
      this.fetchImpl,
      this.manifestUrl.href,
      'dictionary manifest'
    );
    const manifest = DictionaryManifestSchema.parse(rawManifest);

    const [entriesDocument, tokenDocument, aliasDocument] = await Promise.all([
      fetchJson(this.fetchImpl, this.resolveResourceUrl(manifest.entries), 'dictionary entries'),
      fetchJson(
        this.fetchImpl,
        this.resolveResourceUrl(manifest.tokenIndex),
        'dictionary token index'
      ),
      fetchJson(this.fetchImpl, this.resolveResourceUrl(manifest.aliases), 'dictionary aliases'),
    ]);

    if (
      !entriesDocument ||
      typeof entriesDocument !== 'object' ||
      !Array.isArray(entriesDocument.entries)
    ) {
      throw new Error('[Dictionary] Invalid dictionary entries document');
    }
    if (entriesDocument.schemaVersion !== manifest.schemaVersion) {
      throw new Error('[Dictionary] Schema version mismatch in entries document');
    }

    if (
      !tokenDocument ||
      typeof tokenDocument !== 'object' ||
      typeof tokenDocument.tokens !== 'object'
    ) {
      throw new Error('[Dictionary] Invalid dictionary token index document');
    }
    if (tokenDocument.schemaVersion !== manifest.schemaVersion) {
      throw new Error('[Dictionary] Schema version mismatch in token index document');
    }

    if (
      !aliasDocument ||
      typeof aliasDocument !== 'object' ||
      typeof aliasDocument.aliases !== 'object'
    ) {
      throw new Error('[Dictionary] Invalid dictionary aliases document');
    }
    if (aliasDocument.schemaVersion !== manifest.schemaVersion) {
      throw new Error('[Dictionary] Schema version mismatch in aliases document');
    }

    const entries = entriesDocument.entries.map((entry) => DictionaryEntrySchema.parse(entry));
    const entryIds = new Set();
    for (const entry of entries) {
      if (entryIds.has(entry.id)) {
        throw new Error(`[Dictionary] Duplicate DictionaryEntry.id: ${entry.id}`);
      }
      entryIds.add(entry.id);
    }

    const aliases = aliasDocument.aliases || {};
    for (const [key, target] of Object.entries(aliases)) {
      if (key === target) {
        throw new Error(`[Dictionary] Self-referential alias detected: ${key} -> ${target}`);
      }
      let current = target;
      const visited = new Set([key]);
      while (aliases[current]) {
        if (current === aliases[current]) {
          throw new Error(`[Dictionary] Self-referential alias detected: ${current} -> ${current}`);
        }
        if (visited.has(current)) {
          throw new Error(`[Dictionary] Alias cycle detected: ${key} -> ${current}`);
        }
        visited.add(current);
        current = aliases[current];
      }
      if (!entryIds.has(current)) {
        throw new Error(`[Dictionary] Dangling alias: ${key} targets unknown ${current}`);
      }
    }

    const tokenIndex = tokenDocument.tokens || {};
    for (const [token, candidateIds] of Object.entries(tokenIndex)) {
      for (const id of candidateIds) {
        if (!entryIds.has(id)) {
          throw new Error(`[Dictionary] Token index "${token}" references unknown entry ID ${id}`);
        }
      }
    }

    return {
      manifest,
      entries,
      tokenIndex,
      aliases,
    };
  }
}
