/* src/ai-story-parser.js — Pure function parser & validator for AI story responses */
import { AIStorySchema } from './ai-story-schema.js';

/**
 * Extracts and parses a JSON string, stripping markdown fences and surrounding text.
 */
function extractJsonObjectString(rawText) {
  let cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  // Find boundaries of the outermost JSON object if surrounding text exists
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1).trim();
  }

  return cleaned;
}

/**
 * Parses and validates raw AI story text response against AIStorySchema.
 * @param {unknown} rawResponse - The raw response string from model
 * @returns {Object} Structured result { success: boolean, data?: Object, errorType?: string, message?: string, issues?: Array }
 */
export function parseAndValidateAIStory(rawResponse) {
  if (typeof rawResponse !== 'string' || rawResponse.trim() === '') {
    return {
      success: false,
      errorType: 'EMPTY',
      message: 'Получен пустой ответ от ИИ.',
      issues: [{ path: '', message: 'Response is empty or not a string' }],
    };
  }

  const jsonString = extractJsonObjectString(rawResponse);
  if (!jsonString) {
    return {
      success: false,
      errorType: 'JSON_PARSE',
      message: 'Ответ ИИ не содержит JSON-объект.',
      issues: [{ path: '', message: 'No JSON object bounds found in text' }],
    };
  }

  let parsedJson;
  try {
    parsedJson = JSON.parse(jsonString);
  } catch (parseError) {
    return {
      success: false,
      errorType: 'JSON_PARSE',
      message: 'Ошибка синтаксиса JSON в ответе ИИ.',
      issues: [{ path: '', message: parseError.message }],
    };
  }

  const result = AIStorySchema.safeParse(parsedJson);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));

    return {
      success: false,
      errorType: 'SCHEMA_VALIDATION',
      message: 'Структура ответа ИИ не соответствует требуемой схеме.',
      issues,
    };
  }

  return {
    success: true,
    data: result.data,
  };
}
