import {
  ImportProfileSchema,
  USER_DICTIONARY_SCHEMA_VERSION,
} from '../user-dictionaries/schema.js';
import { createNamespacedId } from '../user-dictionaries/normalize.js';

export function createImportProfile(input, now = new Date().toISOString()) {
  return ImportProfileSchema.parse({
    id: input.id || createNamespacedId('import-profile'),
    name: input.name,
    format: input.format,
    collectionPath: input.collectionPath ?? null,
    mapping: input.mapping || {},
    transforms: input.transforms || {},
    createdAt: input.createdAt || now,
    updatedAt: now,
    schemaVersion: USER_DICTIONARY_SCHEMA_VERSION,
  });
}
