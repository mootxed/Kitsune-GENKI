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
