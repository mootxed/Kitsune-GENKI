import { validateJsonResponse } from './response-validator.js';

function issueText(result) {
  return (result.issues || [])
    .slice(0, 12)
    .map((issue) => (typeof issue === 'string' ? issue : `${issue.path}: ${issue.message}`))
    .join('; ');
}

export async function requestWithOneRepair({
  request,
  messages,
  schema,
  additionalValidator,
  repairPrompt,
}) {
  const firstRaw = await request(messages);
  const first = validateJsonResponse(firstRaw, schema, additionalValidator);
  if (first.success) return { ...first, repaired: false, attempts: 1 };

  const repairMessages = [
    {
      role: 'system',
      content:
        'Исправь JSON по указанным ошибкам. Верни только один JSON-объект без markdown и пояснений.',
    },
    {
      role: 'user',
      content: `${repairPrompt}\nОшибки: ${issueText(first)}\nОтвет:\n${String(firstRaw || '').slice(0, 6_000)}`,
    },
  ];
  const repairedRaw = await request(repairMessages);
  const repaired = validateJsonResponse(repairedRaw, schema, additionalValidator);
  if (repaired.success) return { ...repaired, repaired: true, attempts: 2 };
  return {
    success: false,
    errorType: repaired.errorType,
    issues: repaired.issues,
    repaired: true,
    attempts: 2,
  };
}
