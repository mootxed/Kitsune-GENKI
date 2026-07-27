/* services.js — OpenRouter chat & AI Story Generator with Zod Validation & Repair */
import { parseAndValidateAIStory } from './src/ai-story-parser.js';

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 45000;

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const { signal: externalSignal, ...restOptions } = options;

  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      controller.abort();
      reject(
        new Error(`Превышено время ожидания ответа от API (${Math.round(timeoutMs / 1000)} сек)`)
      );
    }, timeoutMs);
  });

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    const res = await Promise.race([
      fetch(url, { ...restOptions, signal: controller.signal }),
      timeoutPromise,
    ]);
    return res;
  } finally {
    clearTimeout(timerId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

function getSystemPrompt(userLevel) {
  const level = userLevel || 'N5';
  return `Ты — KotoKitsu Sensei, дружелюбный учитель японского языка. 
Твоя задача — помогать ученикам уровня ${level} изучать японский язык.

Правила ответов:
- Объясняй понятно и коротко
- Все примеры должны соответствовать уровню ${level}
- Используй Markdown для форматирования (жирный текст, списки, таблицы)
- Приводи примеры с переводом
- Если ученик спрашивает про грамматику — объясни правило и дай 2-3 примера
- Если ученик не понял — перефразируй проще
- Отвечай на русском языке

Помни: ты не просто AI, ты наставник, который вдохновляет учеников! 🦊`;
}

// Обратная совместимость
const SYSTEM_PROMPT = getSystemPrompt('N5');

// ---- OpenRouter ----
async function askSensei(history, settings, options = {}) {
  if (!settings?.openrouterKey) {
    throw new Error('Не задан API-ключ OpenRouter. Откройте Настройки.');
  }
  // Валидация формата ключа
  const key = settings.openrouterKey.trim();
  if (!key.startsWith('sk-or-v1-')) {
    throw new Error("Неверный формат API-ключа. Ключ должен начинаться с 'sk-or-v1-'");
  }
  if (key.length < 40) {
    throw new Error('API-ключ слишком короткий. Проверьте правильность ключа.');
  }
  const systemPrompt = getSystemPrompt(settings.userLevel || 'N5');
  const messages = [{ role: 'system', content: systemPrompt }, ...history];
  const res = await fetchWithTimeout(
    OR_URL,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        'HTTP-Referer': location.origin,
        'X-Title': 'KotoKitsu',
      },
      body: JSON.stringify({
        model: settings.model || 'deepseek/deepseek-v4-flash',
        messages,
        provider: {
          data_collection: 'deny',
          zdr: true,
        },
      }),
      signal: options.signal,
    },
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error('OpenRouter ' + res.status + ': ' + t.slice(0, 160));
  }
  const data = await res.json();

  // Улучшенная обработка пустого ответа
  const content = data.choices?.[0]?.message?.content;
  if (!content || content.trim() === '') {
    throw new Error('API вернул пустой ответ. Попробуйте переформулировать вопрос.');
  }

  return content;
}

// ---- AI Story Generator ----
async function generateAIStory(userPrompt, weakWords, settings, options = {}) {
  if (!settings?.openrouterKey) {
    throw new Error('Не задан API-ключ OpenRouter. Откройте Настройки.');
  }

  const key = settings.openrouterKey.trim();
  if (!key.startsWith('sk-or-v1-')) {
    throw new Error("Неверный формат API-ключа. Должен начинаться с 'sk-or-v1-'");
  }
  if (key.length < 40) {
    throw new Error('API-ключ слишком короткий. Проверьте правильность ключа.');
  }

  const systemPrompt = `Ты — профессиональный генератор интерактивных историй для изучения японского языка уровня N5.

КРИТИЧЕСКИ ВАЖНО: Твой ответ должен быть ИСКЛЮЧИТЕЛЬНО валидным JSON без markdown разметки.
НЕ используй \`\`\`json или \`\`\` в ответе! Только чистый JSON.

Формат ответа (строго JSON):
{
  "story": [
    {
      "sentence_id": 1,
      "speaker": "Имя говорящего",
      "tokens": [
        { "kanji": "私", "writing": "わたし", "translation": "я", "type": "Pronoun" },
        { "kanji": "は", "writing": "は", "translation": "(тема)", "type": "Particle" }
      ],
      "translation": "Полный перевод предложения"
    }
  ]
}

Правила ролей и структуры (КРИТИЧЕСКИ ВАЖНО):
Выбери ОДИН из двух стилей для генерации:

1. СТИЛЬ "ПОВЕСТВОВАНИЕ" (Рассказ от одного лица):
   - Роль ("speaker") для ВСЕХ предложений должна быть одинаковой — "Рассказчик" или "私".
   - Исключи любые вопросы самому себе (вроде "買いますか？" - "Я куплю?"). Пиши только утверждения: "お菓子も買います。" ("Затем я покупаю еще и сладости.").
   - Действия других людей описывай от третьего лица: "店員さんが袋를くれます。" ("Продавец дает мне пакет.").

2. СТИЛЬ "ДИАЛОГ" (Разговор двух персонажей, например, Клиент "私" и Продавец "店員"):
   - Роли в поле "speaker" должны ЧЕТКО меняться в зависимости от того, кто говорит.
   - В токенах должна быть ТОЛЬКО ЧИСТАЯ ПРЯМАЯ РЕЧЬ персонажа. Никаких слов автора ("я сказал", "он говорит") внутри реплики быть не должно!
     * КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО: speaker: "店員", текст: "店員さんが「ありがとうございます」と言います"
     * ПРАВИЛЬНО: speaker: "店員", текст: "ありがとうございます。" (перевод: "Спасибо вам большое.")
     * КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО: speaker: "私", текст: "私は「お願いします」と言います"
     * ПРАВИЛЬНО: speaker: "私", текст: "お願いします。" (перевод: "Да, пожалуйста.")

Правила языка и перевода:
1. Создай историю (5-10 предложений) на естественном японском языке уровня N5 (вежливая форма ~masu / ~desu).
2. Перевод на русский ("translation") должен быть живым, художественным и естественным. Избегай дословного "роботизированного" перевода (особенно для частиц вроде も).
3. Перевод культурных реалий: Переводи "コンビニ" (konbini) как "конбини", "круглосуточный магазин" или "минимаркет" (но никогда не переводи как "удобный магазин").
${
  weakWords && weakWords.length > 0
    ? `- ОБЯЗАТЕЛЬНО используй в сюжете эти слова: ${weakWords.join(', ')}`
    : ''
}

Пользовательский запрос: ${userPrompt}

Ответь ТОЛЬКО JSON объектом, без дополнительного текста!`;

  const model = settings.model || 'deepseek/deepseek-v4-flash';

  const res = await fetchWithTimeout(
    OR_URL,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': location.origin,
        'X-Title': 'KotoKitsu',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        provider: {
          data_collection: 'deny',
          zdr: true,
        },
      }),
      signal: options.signal,
    },
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  if (!res.ok) {
    const t = await res.text();
    throw new Error('OpenRouter error ' + res.status + ': ' + t.slice(0, 160));
  }

  const data = await res.json();
  const rawContent = data.choices?.[0]?.message?.content;

  const firstAttemptResult = parseAndValidateAIStory(rawContent);

  if (firstAttemptResult.success) {
    return {
      story: firstAttemptResult.data.story,
      meta: {
        repaired: false,
        attempts: 1,
      },
    };
  }

  // --- Automatic Repair Retry (Exactly 1 retry attempt) ---
  console.warn(
    '[AIStory] Первый ответ не прошёл валидацию:',
    firstAttemptResult.errorType,
    firstAttemptResult.issues
  );

  const repairSystemPrompt = `Ты — экспертный помощник по исправлению JSON. Твоя задача — исправить переданный ответ так, чтобы он строго соответствовал указанной JSON-схеме истории.
Не меняй сюжет и японский текст без необходимости. Верни ТОЛЬКО чистый валидный JSON без markdown (без \`\`\`json).`;

  const errorDetails = (firstAttemptResult.issues || [])
    .map((issue) => `${issue.path ? issue.path + ': ' : ''}${issue.message}`)
    .join('; ');

  const repairUserPrompt = `Исходный ответ для исправления:
${(rawContent || '').slice(0, 2000)}

Ошибки валидации:
${errorDetails || firstAttemptResult.message}

Пожалуйста, исправь формат и обязательные поля, вернув строго валидный JSON вида:
{
  "story": [
    {
      "sentence_id": 1,
      "speaker": "...",
      "tokens": [
        { "kanji": "...", "writing": "...", "translation": "...", "type": "..." }
      ],
      "translation": "..."
    }
  ]
}`;

  const repairRes = await fetchWithTimeout(
    OR_URL,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': location.origin,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: repairSystemPrompt },
          { role: 'user', content: repairUserPrompt },
        ],
      }),
      signal: options.signal,
    },
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  if (!repairRes.ok) {
    const t = await repairRes.text();
    throw new Error('OpenRouter repair error ' + repairRes.status + ': ' + t.slice(0, 160));
  }

  const repairData = await repairRes.json();
  const repairRawContent = repairData.choices?.[0]?.message?.content;

  const repairResult = parseAndValidateAIStory(repairRawContent);

  if (repairResult.success) {
    console.log('[AIStory] История успешно исправлена при повторном repair-запросе');
    return {
      story: repairResult.data.story,
      meta: {
        repaired: true,
        attempts: 2,
      },
    };
  }

  const finalError = new Error(
    repairResult.errorType === 'JSON_PARSE'
      ? 'Невалидный JSON от ИИ после попытки исправления.'
      : 'Нарушение структуры схемы ответа ИИ после попытки исправления.'
  );
  finalError.errorType = repairResult.errorType;
  finalError.issues = repairResult.issues;
  throw finalError;
}

export const API = { askSensei, generateAIStory, SYSTEM_PROMPT, getSystemPrompt };
