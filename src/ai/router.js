import { AI_INTENTS } from './intents.js';
import { IntentRouterSchema } from './schemas.js';
import { requestWithOneRepair } from './repair.js';

export const ROUTER_SYSTEM_PROMPT = `Ты классификатор учебных запросов японского языка.
Верни только JSON. Не выбирай крупное действие при неоднозначности: верни clarify_request.
Допустимые intent: general_question, explain_word, explain_grammar, compare_items, create_story,
create_quiz, clarify_request. Для истории wordSource по умолчанию mixed. Если пользователь указывает личный/пользовательский словарь или говорит "по словарю Название", укажи wordSource: "user_dictionary" и dictionaryName: "Название".`;

export async function routeIntent(text, { request }) {
  const result = await requestWithOneRepair({
    request,
    messages: [
      { role: 'system', content: ROUTER_SYSTEM_PROMPT },
      { role: 'user', content: String(text).trim() },
    ],
    schema: IntentRouterSchema,
    repairPrompt:
      'Исправь классификацию. Для неоднозначного запроса используй {"intent":"clarify_request","missing":["activityType"]}.',
  });
  if (result.success) return { ...result.data, meta: { repaired: result.repaired } };
  return {
    intent: AI_INTENTS.CLARIFY_REQUEST,
    missing: ['activityType'],
    question: 'Уточните, что именно сделать с материалом.',
    meta: { fallback: true, attempts: result.attempts },
  };
}
