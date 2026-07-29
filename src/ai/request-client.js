import { openRouterRequest } from '../../services.js';
import { getOpenRouterKey } from '../openrouter-key.js';

export const DEFAULT_AI_MODEL = 'deepseek/deepseek-v4-flash';

export function validateOpenRouterSettings(settings) {
  const key = String(getOpenRouterKey() || settings?.openrouterKey || '').trim();
  if (!key) throw new Error('Не задан API-ключ OpenRouter. Откройте Настройки.');
  if (!key.startsWith('sk-or-v1-')) {
    throw new Error("Неверный формат API-ключа. Ключ должен начинаться с 'sk-or-v1-'");
  }
  if (key.length < 40) throw new Error('API-ключ слишком короткий. Проверьте правильность ключа.');
  return { key, model: settings?.model || DEFAULT_AI_MODEL };
}

export function createAIRequestClient(settings, options = {}) {
  const transport = options.transport || openRouterRequest;
  return async function request(messages) {
    const { key, model } = validateOpenRouterSettings(settings);
    const response = await transport({
      model,
      messages,
      key,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${responseText.slice(0, 160)}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content || !String(content).trim()) throw new Error('API вернул пустой ответ.');
    return content;
  };
}
