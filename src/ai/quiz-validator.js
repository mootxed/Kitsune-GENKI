import { z } from 'zod';

const ALLOWED_STEM_CONTINUATIONS = [
  'ます',
  'ました',
  'ません',
  'ましょう',
  'ませ',
  'まし',
  'たい',
  'たく',
  'たかった',
  'たくない',
  'ながら',
  'に行',
  'にい',
  'に',
  '始め',
  'はじめ',
  '続き',
  'つづけ',
  '直す',
  'なおす',
  'やすい',
  'にくい',
  'すぎ',
];

const KNOWN_MASU_STEMS = new Set([
  '勉強し',
  '練習し',
  '移動し',
  '会話し',
  '見学し',
  '選択し',
  'そうじし',
  '掃除し',
  '書き',
  '聞き',
  '読み',
  '話し',
  '買い',
  '売り',
  '泳ぎ',
  '遊び',
  '待ち',
  '選び',
  '走り',
  '帰り',
  '立ち',
  '飲み',
  '飛び',
  '作り',
  '使い',
  '言い',
  '思い',
  '歌い',
  '食べ',
  '起き',
  '降り',
  '教え',
  '答え',
  '開け',
  '閉め',
  '見',
]);

export function isMasuStem(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (KNOWN_MASU_STEMS.has(trimmed)) return true;
  if (
    trimmed.endsWith('し') &&
    trimmed !== 'し' &&
    !trimmed.endsWith('する') &&
    !trimmed.endsWith('した') &&
    !trimmed.endsWith('して') &&
    !trimmed.endsWith('しそう')
  ) {
    return true;
  }
  return false;
}

export function getContextAfterGap(prompt) {
  if (!prompt || typeof prompt !== 'string') return '';
  const match = prompt.match(/(?:\(|（)[_＿\s]*(?:\)|）)(.*)/s);
  if (match) return match[1].trim();
  return '';
}

export function validateSingleQuizQuestion(q) {
  const issues = [];
  if (!q) return issues;

  const options = Array.isArray(q.options) ? q.options : [];
  const correctOptions = options.filter((o) => o.isCorrect === true);

  if (correctOptions.length !== 1) {
    issues.push(`В вопросе ${q.id || ''} должен быть ровно один правильный ответ`);
    return issues;
  }

  const correctOpt = correctOptions[0];

  // 1. Verb form stem validation
  const targetTypes = ['verb_form', 'natural_sentence', 'usage', 'find_error', 'dictionary_form'];
  if (targetTypes.includes(q.type)) {
    if (isMasuStem(correctOpt.text)) {
      const afterGap = getContextAfterGap(q.prompt);
      const isAllowedContinuation = ALLOWED_STEM_CONTINUATIONS.some((cont) =>
        afterGap.startsWith(cont)
      );

      if (!isAllowedContinuation) {
        issues.push(
          `В вопросе ${q.id} вариант «${correctOpt.text}» ошибочно отмечен правильным. В данном предложении требуется законченное сказуемое. Исправь правильный вариант и объяснение.`
        );
      }
    }
  }

  // 2. Consistency between explanation and selected answer
  if (q.explanation && typeof q.explanation === 'string') {
    const expl = q.explanation.toLowerCase();
    const correctText = correctOpt.text.trim().toLowerCase();

    const claimsCorrectIsWrong =
      expl.includes(`${correctText} — неправильно`) ||
      expl.includes(`${correctText} не является правильн`) ||
      expl.includes(`${correctText} ошибочн`);

    if (claimsCorrectIsWrong) {
      issues.push(
        `В вопросе ${q.id} текст объяснения утверждает, что правильный вариант «${correctOpt.text}» неверен.`
      );
    }

    const wrongOptions = options.filter((o) => !o.isCorrect);
    for (const wrongOpt of wrongOptions) {
      const wrongText = wrongOpt.text.trim().toLowerCase();
      if (!wrongText) continue;
      const claimsWrongIsCorrect =
        expl.includes(`${wrongText} — правильный`) ||
        expl.includes(`${wrongText} является правильн`) ||
        expl.includes(`${wrongText} — верно`);
      if (claimsWrongIsCorrect) {
        issues.push(
          `В вопросе ${q.id} объяснение ошибочно называет неправильный вариант «${wrongOpt.text}» правильным.`
        );
        break;
      }
    }
  }

  return issues;
}

export function validateAllQuizQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  const issues = [];
  for (const q of questions) {
    const qIssues = validateSingleQuizQuestion(q);
    issues.push(...qIssues);
  }
  return issues;
}

export function filterInvalidQuizQuestions(quiz) {
  if (!quiz || !Array.isArray(quiz.questions)) return quiz;
  const validQuestions = quiz.questions.filter((q) => validateSingleQuizQuestion(q).length === 0);
  return { ...quiz, questions: validQuestions };
}
