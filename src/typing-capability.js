/* One authoritative definition of whether and how a vocabulary item can be typed. */

// The catalogue currently needs at most ten distinct kana for one answer.
// Twelve keeps the keyboard compact while leaving room for future content.
export const MAX_TYPING_UNIQUE_CHARS = 12;

const HIRAGANA_RE = /[\u3041-\u3096ー]/u;
const KATAKANA_RE = /[\u30a1-\u30f6]/gu;

export function katakanaToHiragana(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(KATAKANA_RE, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60));
}

export function hiraganaToKatakana(text) {
  return String(text || '').replace(/[\u3041-\u3096]/gu, (character) =>
    String.fromCharCode(character.charCodeAt(0) + 0x60)
  );
}

export function normalizeKanaAnswer(text) {
  return [...katakanaToHiragana(text)].filter((character) => HIRAGANA_RE.test(character)).join('');
}

export function parseTypingAnswers(writing) {
  if (!writing) return [];
  return String(writing)
    .split(/[/,、]/)
    .flatMap((answer) => expandOptionalGroups(answer.trim()))
    .map((answer) => normalizeKanaAnswer(answer))
    .filter(Boolean)
    .filter((answer, index, answers) => answers.indexOf(answer) === index);
}

function expandOptionalGroups(answer) {
  const match = /[（(]([^（）()]*)[）)]/u.exec(answer);
  if (!match) return [answer];

  const before = answer.slice(0, match.index);
  const after = answer.slice(match.index + match[0].length);
  return [
    ...expandOptionalGroups(`${before}${after}`),
    ...expandOptionalGroups(`${before}${match[1]}${after}`),
  ];
}

export function typingCapability(word, answerOverride = null) {
  const declaredAnswers = Array.isArray(answerOverride)
    ? answerOverride
    : Array.isArray(word?.acceptedAnswers)
      ? word.acceptedAnswers
      : [word?.writing];
  const sourceAnswers = declaredAnswers.flatMap((answer) => parseTypingAnswers(answer));
  const acceptedAnswers = sourceAnswers.filter(
    (answer, index, answers) => answers.indexOf(answer) === index
  );
  const keyboardCharacters = [...new Set(acceptedAnswers.flatMap((answer) => [...answer]))];
  const canType =
    acceptedAnswers.length > 0 && keyboardCharacters.length <= MAX_TYPING_UNIQUE_CHARS;

  return {
    canType,
    acceptedAnswers,
    keyboardCharacters,
    reason:
      acceptedAnswers.length === 0
        ? 'no-kana-answer'
        : keyboardCharacters.length > MAX_TYPING_UNIQUE_CHARS
          ? 'keyboard-too-large'
          : null,
  };
}
