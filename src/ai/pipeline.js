import { buildExplicitIntent, AI_INTENTS } from './intents.js';
import { IntentRouterSchema } from './schemas.js';
import { routeIntent } from './router.js';
import { buildAIContext } from './context-builder.js';
import { getAIHandler } from './handlers/index.js';

export async function runSenseiPipeline({
  text,
  explicitIntent = null,
  state,
  lessons,
  repository,
  request,
  overrides = {},
}) {
  const intentResult = explicitIntent
    ? IntentRouterSchema.parse(buildExplicitIntent(explicitIntent, text, overrides))
    : await routeIntent(text, { request });
  if (intentResult.intent === AI_INTENTS.CLARIFY_REQUEST) {
    return { status: 'clarify', intentResult };
  }
  if (
    !explicitIntent &&
    intentResult.intent === AI_INTENTS.CREATE_STORY &&
    overrides.wordSource &&
    overrides.wordSourceExplicit !== false
  ) {
    if (
      overrides.wordSourceExplicit ||
      intentResult.wordSource === 'mixed' ||
      !intentResult.wordSource
    ) {
      intentResult.wordSource = overrides.wordSource;
      if (overrides.dictionaryId) {
        intentResult.dictionaryId = overrides.dictionaryId;
      }
    }
  }

  if (
    repository &&
    (intentResult.wordSource === 'user_dictionary' ||
      intentResult.dictionaryName ||
      intentResult.dictionaryId)
  ) {
    const dictionaries = (await repository.listDictionaries()) || [];
    if (!intentResult.dictionaryId) {
      if (intentResult.dictionaryName) {
        const query = intentResult.dictionaryName.trim().toLowerCase();
        const matches = dictionaries.filter(
          (d) =>
            (d.name || '').toLowerCase().includes(query) ||
            query.includes((d.name || '').toLowerCase())
        );
        if (matches.length === 1) {
          intentResult.dictionaryId = matches[0].id;
        } else if (matches.length === 0 && dictionaries.length > 0) {
          return {
            status: 'clarify',
            intentResult: {
              intent: AI_INTENTS.CLARIFY_REQUEST,
              missing: ['topic'],
              question: `Словарь «${intentResult.dictionaryName}» не найден. Выберите один из доступных словарей: ${dictionaries.map((d) => d.name).join(', ')}`,
            },
          };
        } else if (matches.length > 1) {
          return {
            status: 'clarify',
            intentResult: {
              intent: AI_INTENTS.CLARIFY_REQUEST,
              missing: ['topic'],
              question: `Найдено несколько подходящих словарей: ${matches.map((d) => d.name).join(', ')}. Уточните название.`,
            },
          };
        }
      } else if (intentResult.wordSource === 'user_dictionary') {
        if (dictionaries.length === 1) {
          intentResult.dictionaryId = dictionaries[0].id;
        } else if (dictionaries.length > 1) {
          return {
            status: 'clarify',
            intentResult: {
              intent: AI_INTENTS.CLARIFY_REQUEST,
              missing: ['topic'],
              question: `Выберите словарь из доступных: ${dictionaries.map((d) => d.name).join(', ')}`,
            },
          };
        }
      }
    }
  }

  const handler = getAIHandler(intentResult.intent);
  if (!handler) {
    return {
      status: 'fallback',
      text: 'Не удалось выбрать учебный сценарий. Уточните запрос.',
      intentResult,
    };
  }
  const context = await buildAIContext({
    intentResult,
    state,
    lessons,
    repository,
  });
  const result = await handler({
    input: intentResult,
    context,
    request,
  });
  if (!result.success) {
    return {
      status: 'fallback',
      text: result.fallbackText,
      intentResult,
      context,
      attempts: result.attempts,
    };
  }
  return {
    status: 'success',
    intentResult,
    context,
    artifact: result.artifact,
    repaired: result.repaired,
  };
}
