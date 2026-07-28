export function extractJson(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { success: false, errorType: 'EMPTY', issues: ['Пустой ответ'] };
  }
  let text = raw
    .replace(/```json\s*/giu, '')
    .replace(/```\s*/gu, '')
    .trim();
  const objectStart = text.indexOf('{');
  const arrayStart = text.indexOf('[');
  const start =
    objectStart === -1
      ? arrayStart
      : arrayStart === -1
        ? objectStart
        : Math.min(objectStart, arrayStart);
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  try {
    return { success: true, data: JSON.parse(text) };
  } catch (error) {
    return { success: false, errorType: 'JSON_PARSE', issues: [error.message] };
  }
}

export function validateJsonResponse(raw, schema, additionalValidator = null) {
  const extracted = extractJson(raw);
  if (!extracted.success) return extracted;
  const parsed = schema.safeParse(extracted.data);
  if (!parsed.success) {
    return {
      success: false,
      errorType: 'SCHEMA_VALIDATION',
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }
  if (additionalValidator) {
    const additional = additionalValidator(parsed.data);
    if (!additional.success) {
      return {
        success: false,
        errorType: 'SEMANTIC_VALIDATION',
        issues: additional.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      };
    }
    return { success: true, data: additional.data };
  }
  return { success: true, data: parsed.data };
}
