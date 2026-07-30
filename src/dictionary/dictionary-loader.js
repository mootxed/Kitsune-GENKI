import { DictionaryEntrySchema, DictionaryManifestSchema } from './dictionary-contract.js';

function defaultBaseUrl(explicitBaseUrl) {
  if (explicitBaseUrl) return explicitBaseUrl;
  if (typeof document !== 'undefined' && document.baseURI) return document.baseURI;
  if (typeof location !== 'undefined' && location.href) return new URL('./', location.href).href;
  return 'http://localhost/';
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
  }

  async load() {
    const rawManifest = await fetchJson(
      this.fetchImpl,
      this.manifestUrl.href,
      'dictionary manifest'
    );
    const manifest = DictionaryManifestSchema.parse(rawManifest);
    const resolve = (relativePath) => new URL(relativePath, this.manifestUrl).href;
    const [entriesDocument, tokenDocument, aliasDocument] = await Promise.all([
      fetchJson(this.fetchImpl, resolve(manifest.entries), 'dictionary entries'),
      fetchJson(this.fetchImpl, resolve(manifest.tokenIndex), 'dictionary token index'),
      fetchJson(this.fetchImpl, resolve(manifest.aliases), 'dictionary aliases'),
    ]);
    const entries = (entriesDocument.entries || []).map((entry) =>
      DictionaryEntrySchema.parse(entry)
    );
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
      throw new Error('[Dictionary] Duplicate DictionaryEntry.id');
    }
    return {
      manifest,
      entries,
      tokenIndex: tokenDocument.tokens || {},
      aliases: aliasDocument.aliases || {},
    };
  }
}
