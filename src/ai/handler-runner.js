import { requestWithOneRepair } from './repair.js';
import { serializeAIContext } from './context-builder.js';

export async function runStructuredHandler({
  handlerName,
  systemPrompt,
  input,
  inputSchema,
  outputSchema,
  context,
  request,
  additionalValidator,
}) {
  const parsedInput = inputSchema.parse(input);
  const result = await requestWithOneRepair({
    request,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Вход сценария:\n${JSON.stringify(parsedInput)}\nОграниченный контекст:\n${serializeAIContext(context)}`,
      },
    ],
    schema: outputSchema,
    additionalValidator,
    repairPrompt: `Исправь structured output для handler ${handlerName}, сохранив учебный смысл.`,
    systemPrompt,
  });
  if (!result.success) {
    return {
      success: false,
      fallbackText:
        'Не удалось безопасно построить интерактивный материал. Попробуйте уточнить запрос.',
      attempts: result.attempts,
      issues: result.issues,
    };
  }
  return {
    success: true,
    artifact: result.data,
    repaired: result.repaired,
    attempts: result.attempts,
  };
}
