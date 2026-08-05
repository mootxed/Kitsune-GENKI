import { z } from 'zod';
import { secureRandomId } from '../utils.js';

const nowIso = () => new Date().toISOString();
const messageId = () => `ai-message:${secureRandomId()}`;

export const ChatMessageSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(['user', 'assistant']),
    type: z.enum(['text', 'explanation', 'story', 'quiz', 'error']),
    text: z.string().max(100_000),
    intent: z.string().max(100).optional(),
    context: z.record(z.string(), z.unknown()).optional(),
    artifact: z.unknown().optional(),
    createdAt: z.string().min(1),
  })
  .strip();

export function normalizeChatMessage(raw, index = 0) {
  const role = raw?.role === 'assistant' ? 'assistant' : 'user';
  const text = String(raw?.text ?? raw?.content ?? '');
  const artifact = raw?.artifact;
  const inferredType =
    raw?.type ||
    (artifact?.story
      ? 'story'
      : artifact?.quiz
        ? 'explanation'
        : role === 'assistant'
          ? 'explanation'
          : 'text');
  return ChatMessageSchema.parse({
    id: raw?.id || `ai-message:legacy-${index}`,
    role,
    type: inferredType,
    text,
    ...(raw?.intent ? { intent: raw.intent } : {}),
    ...(raw?.context && typeof raw.context === 'object' ? { context: raw.context } : {}),
    ...(artifact !== undefined ? { artifact } : {}),
    createdAt: raw?.createdAt || nowIso(),
  });
}

export function normalizeChatHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((message, index) => {
      try {
        return normalizeChatMessage(message, index);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function createUserChatMessage(text, intent) {
  return normalizeChatMessage({
    id: messageId(),
    role: 'user',
    type: 'text',
    text: String(text).trim(),
    ...(intent ? { intent } : {}),
    createdAt: nowIso(),
  });
}

export function createAssistantChatMessage({ text, intent, artifact, context, type }) {
  return normalizeChatMessage({
    id: messageId(),
    role: 'assistant',
    type: type || artifact?.type || 'explanation',
    text: String(text || artifact?.message || ''),
    intent,
    context,
    artifact,
    createdAt: nowIso(),
  });
}

function summarizeArtifact(message) {
  if (!message.artifact || typeof message.artifact !== 'object') return message.text;
  if (message.artifact.type === 'story' && Array.isArray(message.artifact.story)) {
    return [
      message.text,
      ...message.artifact.story.slice(-3).map((sentence) => {
        const tokens = Array.isArray(sentence?.tokens) ? sentence.tokens : [];
        const japanese = tokens.map((token) => token?.kanji || token?.writing || '').join('');
        return `${japanese} — ${sentence?.translation || ''}`;
      }),
    ].join('\n');
  }
  const examples = (Array.isArray(message.artifact.examples) ? message.artifact.examples : [])
    .slice(0, 3)
    .map((example) => `${example?.japanese || ''} — ${example?.translation || ''}`);
  return [message.text, ...examples].filter(Boolean).join('\n');
}

export function selectRelevantMessages(history, limit = 12) {
  return normalizeChatHistory(history)
    .slice(-Math.min(12, Math.max(1, limit)))
    .map((message) => ({
      role: message.role,
      content: summarizeArtifact(message).slice(0, 4_000),
    }));
}

export function updateQuizAnswer(history, messageIdValue, questionId, selectedIndex) {
  return normalizeChatHistory(history).map((message) => {
    if (message.id !== messageIdValue || !Array.isArray(message.artifact?.quiz?.questions)) {
      return message;
    }
    const questions = message.artifact.quiz.questions.map((question) => {
      if (!question || question.id !== questionId) return question;
      const options = Array.isArray(question.options) ? question.options : [];
      return {
        ...question,
        selectedIndex,
        answeredCorrectly: options[selectedIndex]?.isCorrect === true,
      };
    });
    return { ...message, artifact: { ...message.artifact, quiz: { questions } } };
  });
}

export function markTokenDictionaryEntry(history, messageIdValue, tokenKey, entryId) {
  return normalizeChatHistory(history).map((message) =>
    message.id === messageIdValue
      ? {
          ...message,
          context: {
            ...(message.context || {}),
            dictionaryTokens: {
              ...(message.context?.dictionaryTokens || {}),
              [tokenKey]: entryId,
            },
          },
        }
      : message
  );
}

export function clearChatHistory() {
  return [];
}

export function formatMessageAsNote(message) {
  const normalized = normalizeChatMessage(message);
  const lines = [normalized.text];
  if (normalized.artifact?.story?.length) {
    lines.push(
      '',
      'История:',
      ...normalized.artifact.story.map((s) => {
        const sentenceText = Array.isArray(s.tokens)
          ? s.tokens.map((t) => t.kanji || t.writing || '').join('')
          : s.japanese || '';
        return `${s.speaker ? `**${s.speaker}**: ` : ''}${sentenceText}\n_${s.translation || ''}_`;
      })
    );
  }
  if (normalized.artifact?.examples?.length) {
    lines.push(
      '',
      'Примеры:',
      ...normalized.artifact.examples.map(
        (example) => `- ${example.japanese} — ${example.translation}`
      )
    );
  }
  if (normalized.artifact?.quiz?.questions?.length) {
    lines.push(
      '',
      'Проверка:',
      ...normalized.artifact.quiz.questions.map(
        (question) =>
          `- ${question.prompt} — ${question.options.find((option) => option.isCorrect)?.text || ''}`
      )
    );
  }
  return {
    title: normalized.text.replace(/[#*`]/gu, '').split('\n')[0].slice(0, 48) || 'Заметка AI',
    content: lines.join('\n'),
  };
}
