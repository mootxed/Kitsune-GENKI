/* src/app-metadata.js — Single source of truth for application & schema versions */
import packageJson from '../package.json' with { type: 'json' };

export const APP_VERSION = packageJson.version;
export const STATE_SCHEMA_VERSION = 17;
export const INDEXED_DB_VERSION = 7;
/** Legacy DB name retained for backward compatibility with existing user data */
export const INDEXED_DB_NAME = 'KitsuneGenkiDB';
export const COURSE_SCHEMA_VERSION = 1;
export const ACTIVE_SESSION_SCHEMA_VERSION = 2;
export const DEFAULT_COURSE_ID = 'genki-1';
export const DEFAULT_COURSE_CONTENT_VERSION = '1.0.0';
