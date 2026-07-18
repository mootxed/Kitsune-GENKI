/* services.js — OpenRouter chat (Google Drive удалён, используется Web Share API) */

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
function getSystemPrompt(userLevel) {
  const level = userLevel || 'N5';
  return `Ты — Kitsune Sensei, дружелюбный учитель японского языка. 
Твоя задача — помогать ученикам уровня ${level} изучать японский язык по учебнику Genki.

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
async function askSensei(history, settings) {
  if (!settings.openrouterKey) {
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
  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + settings.openrouterKey,
      'Content-Type': 'application/json',
      'HTTP-Referer': location.origin,
      'X-Title': 'Kitsune Genki',
    },
    body: JSON.stringify({
      model: settings.model || 'deepseek/deepseek-v4-flash',
      messages,
    }),
  });
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
async function generateAIStory(userPrompt, weakWords, settings) {
  if (!settings.openrouterKey) {
    throw new Error('Не задан API-ключ OpenRouter. Откройте Настройки.');
  }

  const key = settings.openrouterKey.trim();
  if (!key.startsWith('sk-or-v1-')) {
    throw new Error("Неверный формат API-ключа. Должен начинаться с 'sk-or-v1-'");
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
   - Действия других людей описывай от третьего лица: "店員さんが袋をくれます。" ("Продавец дает мне пакет.").

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

  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': location.origin,
    },
    body: JSON.stringify({
      model: settings.model || 'deepseek/deepseek-v4-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error('OpenRouter error ' + res.status + ': ' + t.slice(0, 160));
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content || content.trim() === '') {
    throw new Error('API вернул пустой ответ. Попробуйте переформулировать запрос.');
  }

  return content;
}

export const API = { askSensei, generateAIStory, SYSTEM_PROMPT, getSystemPrompt };
