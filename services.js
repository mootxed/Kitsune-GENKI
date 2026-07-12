/* services.js — OpenRouter chat (Google Drive удалён, используется Web Share API) */
(function (global) {
  const OR_URL = "https://openrouter.ai/api/v1/chat/completions";
  function getSystemPrompt(userLevel) {
    const level = userLevel || "N5";
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
  const SYSTEM_PROMPT = getSystemPrompt("N5");

  // ---- OpenRouter ----
  async function askSensei(history, settings) {
    if (!settings.openrouterKey) {
      throw new Error("Не задан API-ключ OpenRouter. Откройте Настройки.");
    }
    // Валидация формата ключа
    const key = settings.openrouterKey.trim();
    if (!key.startsWith("sk-or-v1-")) {
      throw new Error("Неверный формат API-ключа. Ключ должен начинаться с 'sk-or-v1-'");
    }
    if (key.length < 40) {
      throw new Error("API-ключ слишком короткий. Проверьте правильность ключа.");
    }
    const systemPrompt = getSystemPrompt(settings.userLevel || "N5");
    const messages = [{ role: "system", content: systemPrompt }, ...history];
    const res = await fetch(OR_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + settings.openrouterKey,
        "Content-Type": "application/json",
        "HTTP-Referer": location.origin,
        "X-Title": "Kitsune Genki",
      },
      body: JSON.stringify({
        model: settings.model || "deepseek/deepseek-v4-flash",
        messages,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error("OpenRouter " + res.status + ": " + t.slice(0, 160));
    }
    const data = await res.json();
    
    // Улучшенная обработка пустого ответа
    const content = data.choices?.[0]?.message?.content;
    if (!content || content.trim() === "") {
      throw new Error("API вернул пустой ответ. Попробуйте переформулировать вопрос.");
    }
    
    return content;
  }

  global.API = { askSensei, SYSTEM_PROMPT };
})(window);
