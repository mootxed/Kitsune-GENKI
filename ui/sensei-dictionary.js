import {
  ensurePersonalDictionary,
  PERSONAL_DICTIONARY_ID,
  prepareTokenDictionaryDraft,
  resolveGlobalTokenMatch,
  saveSenseiDictionaryEntry,
} from '../src/ai/personal-dictionary.js';
import { registerUserDictionaryEntry } from '../src/dictionary/dictionary-store.js';

function node(tag, text = '') {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  return element;
}

function labeled(labelText, control) {
  const label = node('label');
  label.className = 'sensei-dict-field';
  label.append(node('span', labelText), control);
  return label;
}

function input(value = '', options = {}) {
  const opts = typeof options === 'string' ? { name: options } : options;
  const control = node('input');
  control.type = opts.type || 'text';
  if (opts.name) control.name = opts.name;
  control.setAttribute('autocomplete', opts.autocomplete || 'off');
  if (opts.placeholder) control.placeholder = opts.placeholder;
  control.value = value;
  return control;
}

function closeDialog(dialog, opener) {
  dialog.close?.();
  dialog.remove();
  opener?.focus?.();
}

export async function openSenseiDictionaryDialog({
  repository,
  token,
  sentence,
  opener,
  catalogMatch = null,
  userMatch = null,
  onSaved,
  onOpenExisting,
}) {
  const personal = await ensurePersonalDictionary(repository);
  const dictionaries = await repository.listDictionaries();
  const sentenceText = sentence.tokens.map((item) => item.kanji || item.writing || '').join('');
  let globalMatch = null;
  try {
    const resolution = await resolveGlobalTokenMatch(token, {
      sentence: sentenceText,
      aiHint: token.dictionaryId ? { dictionaryId: token.dictionaryId } : null,
    });
    if (resolution.status === 'resolved') globalMatch = resolution.entry;
  } catch (error) {
    console.warn('[SenseiDictionary] Global lookup unavailable:', error);
  }
  const draft = prepareTokenDictionaryDraft({
    token,
    sentence: sentenceText,
    sentenceTranslation: sentence.translation,
    catalogMatch,
    userMatch,
    globalMatch,
    dictionaryId: personal.id || PERSONAL_DICTIONARY_ID,
  });
  const dialog = node('dialog');
  dialog.className = 'sensei-dictionary-dialog';
  dialog.setAttribute('aria-label', 'Добавить слово в словарь');
  const form = node('form');
  form.method = 'dialog';
  form.className = 'sensei-dictionary-form';
  form.name = 'sensei-dictionary-form';
  form.setAttribute('autocomplete', 'off');
  form.setAttribute('data-autofill', 'false');
  form.append(node('h2', 'Добавить в словарь'));

  const dictionary = node('select');
  dictionary.name = 'dict_target_id';
  dictionary.setAttribute('autocomplete', 'off');
  dictionaries.forEach((item) => {
    const option = node('option', item.name);
    option.value = item.id;
    option.selected = item.kind === 'personal' || item.id === personal.id;
    dictionary.append(option);
  });
  const createOption = node('option', '＋ Создать новый словарь');
  createOption.value = '__new__';
  dictionary.append(createOption);
  const newDictionaryName = input('', {
    name: 'dict_new_name',
    placeholder: 'Название нового словаря',
    autocomplete: 'off',
  });
  newDictionaryName.hidden = true;
  dictionary.addEventListener('change', () => {
    newDictionaryName.hidden = dictionary.value !== '__new__';
  });

  const writing = input(draft.writing, { name: 'dict_writing', autocomplete: 'off' });
  const reading = input(draft.reading, { name: 'dict_reading', autocomplete: 'off' });
  const meanings = node('textarea');
  meanings.name = 'dict_meanings';
  meanings.setAttribute('autocomplete', 'off');
  meanings.value = draft.meanings.join('\n');
  const partOfSpeech = input(draft.partOfSpeech.join(', '), {
    name: 'dict_part_of_speech',
    autocomplete: 'off',
  });
  const tags = input(draft.tags.join(', '), { name: 'dict_tags', autocomplete: 'off' });
  const notes = node('textarea');
  notes.name = 'dict_notes';
  notes.setAttribute('autocomplete', 'off');
  notes.value = draft.notes;
  const context = node(
    'p',
    `Форма в тексте: ${draft.sourceContext.surfaceForm}\nПредложение: ${sentenceText}\nПеревод: ${sentence.translation}\nИсточник: AI Сенсей`
  );
  context.className = 'sensei-dictionary-context';
  if (draft.uncertain) {
    const warning = node('p', '⚠️ Словарная форма определена приблизительно. Проверьте данные.');
    warning.className = 'sensei-dictionary-warning';
    form.append(warning);
  }
  form.append(
    labeled('Целевой словарь', dictionary),
    labeled('Новый словарь', newDictionaryName),
    labeled('Написание', writing),
    labeled('Чтение', reading),
    labeled('Значения', meanings),
    labeled('Часть речи', partOfSpeech),
    labeled('Теги', tags),
    labeled('Заметка', notes),
    context
  );
  const actions = node('div');
  actions.className = 'sensei-dictionary-actions';
  const cancel = node('button', 'Отмена');
  cancel.type = 'button';
  cancel.name = 'dict_cancel';
  cancel.addEventListener('click', () => closeDialog(dialog, opener));
  const submit = node('button', 'Проверить и сохранить');
  submit.type = 'submit';
  submit.name = 'dict_save';
  submit.className = 'btn-primary';
  actions.append(cancel, submit);
  form.append(actions);
  form.append(actions);

  const buildDraft = async () => {
    let dictionaryId = dictionary.value;
    return {
      ...draft,
      dictionaryId,
      newDictionaryName: dictionaryId === '__new__' ? newDictionaryName.value.trim() : '',
      writing: writing.value.trim(),
      reading: reading.value.trim(),
      meanings: meanings.value
        .split(/\n|;/gu)
        .map((value) => value.trim())
        .filter(Boolean),
      partOfSpeech: partOfSpeech.value
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      tags: tags.value
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      notes: notes.value.trim(),
    };
  };

  const save = async (candidate, duplicateAction = 'cancel', duplicateEntry = null) => {
    const result = await saveSenseiDictionaryEntry({
      repository,
      draft: candidate,
      duplicateAction,
      duplicateEntry,
    });
    if (result.status === 'saved') {
      try {
        await registerUserDictionaryEntry({
          id: result.entry.globalDictionaryId,
          dictionaryForm: result.entry.writing,
          reading: result.entry.reading,
          meanings: result.entry.meanings,
          partOfSpeech: result.entry.partOfSpeech?.[0] || null,
          verbClass: result.entry.verbClass || null,
          adjectiveClass: result.entry.adjectiveClass || null,
          transitivity: result.entry.transitivity || null,
          tokenForms: result.entry.tokenForms || result.entry.alternativeWritings || [],
          confidence: result.entry.confidence ?? 0.5,
          verified: result.entry.verified === true,
        });
      } catch (error) {
        console.warn('[SenseiDictionary] Global AI entry registration failed:', error);
      }
      closeDialog(dialog, opener);
      onSaved?.(result.entry);
      return;
    }
    if (result.status === 'open') {
      closeDialog(dialog, opener);
      onOpenExisting?.(result.entry);
      return;
    }
    if (result.status === 'duplicate') {
      actions.replaceChildren();
      const notice = node('p', 'Это слово уже есть в словаре.');
      const existing = result.duplicates[0];
      const open = node('button', 'Открыть существующее');
      open.type = 'button';
      open.name = 'dict_duplicate_open';
      open.addEventListener('click', () => save(candidate, 'open', existing));
      const merge = node('button', 'Объединить данные');
      merge.type = 'button';
      merge.name = 'dict_duplicate_merge';
      merge.addEventListener('click', () => save(candidate, 'merge', existing));
      const separate = node('button', 'Добавить отдельно');
      separate.type = 'button';
      separate.name = 'dict_duplicate_separate';
      separate.addEventListener('click', () => save(candidate, 'separate', existing));
      const abort = node('button', 'Отмена');
      abort.type = 'button';
      abort.name = 'dict_duplicate_abort';
      abort.addEventListener('click', () => closeDialog(dialog, opener));
      actions.append(notice, open, merge, separate, abort);
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const candidate = await buildDraft();
      await save(candidate);
    } catch (error) {
      const alert = node('p', error.message);
      alert.className = 'sensei-dictionary-warning';
      actions.prepend(alert);
    } finally {
      submit.disabled = false;
    }
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDialog(dialog, opener);
  });
  dialog.append(form);
  document.body.append(dialog);
  dialog.showModal?.();
  if (!dialog.open) dialog.setAttribute('open', '');
  writing.focus();
}
