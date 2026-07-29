import { validateJsonResponse } from './response-validator.js';

function issueText(result) {
  return (result.issues || [])
    .slice(0, 12)
    .map((issue) => (typeof issue === 'string' ? issue : `${issue.path}: ${issue.message}`))
    .join('; ');
}

export async function requestWithOneRepair({
  request,
  messages = [],
  schema,
  additionalValidator,
  repairPrompt,
  systemPrompt = '',
}) {
  const firstRaw = await request(messages);
  const first = validateJsonResponse(firstRaw, schema, additionalValidator);
  if (first.success) return { ...first, repaired: false, attempts: 1 };

  const baseMessages = messages.length > 0 ? messages : [{ role: 'system', content: systemPrompt }];

  const repairMessages = [
    ...baseMessages,
    { role: 'assistant', content: String(firstRaw || '').slice(0, 6_000) },
    {
      role: 'user',
      content: `${repairPrompt}\nОшибки: ${issueText(first)}\nИсправь JSON и верни только один валидный JSON-объект без markdown и пояснений.`,
    },
  ];
  const repairedRaw = await request(repairMessages);
  const repairedValidator = additionalValidator
    ? (data) => additionalValidator(data, { isRepairedAttempt: true })
    : null;
  const repaired = validateJsonResponse(repairedRaw, schema, repairedValidator);
  if (repaired.success) return { ...repaired, repaired: true, attempts: 2 };
  return {
    success: false,
    errorType: repaired.errorType,
    issues: repaired.issues,
    repaired: true,
    attempts: 2,
  };
}
