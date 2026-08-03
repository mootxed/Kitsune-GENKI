import { openModal, closeModal, announce, announceAlert } from '../src/a11y-helpers.js';
import {
  createUserDictionaryExport,
  createUserDictionaryModel,
  exportUserDictionaryCsv,
  normalizeJapaneseForComparison,
  normalizeMeanings,
  normalizeTags,
  UserDictionaryRepository,
} from '../src/user-dictionaries/index.js';
import {
  deleteUserDictionaryWithProgress,
  deleteUserEntriesWithProgress,
  setUserEntriesLearningEnabled,
  updateUserEntryWithSync,
} from '../src/user-dictionaries/learning-service.js';
import {
  commitDictionaryImport,
  createImportErrorReport,
  createImportPreview,
  createImportProfile,
  detectDictionaryFormat,
  inferDictionaryMapping,
  parseDelimited,
  parseDictionaryJson,
} from '../src/dictionary-import/index.js';

const PAGE_SIZE = 100;
const TARGET_FIELDS = [
  'writing',
  'reading',
  'meanings',
  'alternativeWritings',
  'partOfSpeech',
  'tags',
  'examples.japanese',
  'examples.translation',
  'notes',
  'externalId',
];
const view = {
  dictionaryId: null,
  search: '',
  tag: 'all',
  learning: 'all',
  sort: 'updated-desc',
  page: 1,
  selected: new Set(),
};
let searchTimer = null;

function node(tag, options = {}, children = []) {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  if (options.type) element.type = options.type;
  if (options.id) element.id = options.id;
  if (options.name) element.name = options.name;
  if (options.value !== undefined) element.value = options.value;
  if (options.testId) element.dataset.testid = options.testId;
  if (options.disabled) element.disabled = true;
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      element.setAttribute(name, String(value));
    }
  }
  for (const child of children) element.append(child);
  return element;
}

function button(text, onClick, options = {}) {
  const element = node('button', {
    className: options.className || 'btn-secondary',
    text,
    type: 'button',
    testId: options.testId,
    disabled: options.disabled,
    attrs: options.attrs,
  });
  element.addEventListener('click', onClick);
  return element;
}

function download(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = node('a', { attrs: { href: url, download: filename } });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function modalShell({ title, description, opener, onRequestClose }) {
  const overlay = node('div', {
    className: 'user-dict-modal-overlay',
    attrs: { role: 'presentation' },
  });
  const dialog = node('section', {
    className: 'user-dict-modal',
    attrs: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': `user-dict-modal-title-${Date.now()}`,
    },
  });
  const titleElement = node('h2', { text: title });
  titleElement.id = dialog.getAttribute('aria-labelledby');
  const descriptionElement = node('p', { className: 'muted', text: description });
  const close = () => {
    if (onRequestClose && onRequestClose() === false) return;
    closeModal(dialog, opener);
    overlay.remove();
  };
  const closeButton = button('Закрыть', close, {
    className: 'icon-btn',
    attrs: { 'aria-label': 'Закрыть' },
  });
  dialog.append(
    node('div', { className: 'user-dict-modal-header' }, [
      node('div', {}, [titleElement, descriptionElement]),
      closeButton,
    ])
  );
  overlay.append(dialog);
  document.body.append(overlay);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  openModal(dialog, opener, { onClose: close });
  return { overlay, dialog, close };
}

function labeledControl(labelText, control, hint = '') {
  const label = node('label', { className: 'user-dict-field' });
  label.append(node('span', { text: labelText }), control);
  if (hint) label.append(node('small', { className: 'muted', text: hint }));
  return label;
}

function textInput(value = '', options = {}) {
  return node(options.multiline ? 'textarea' : 'input', {
    value,
    type: options.multiline ? undefined : options.type || 'text',
    name: options.name,
    attrs: {
      autocomplete: options.autocomplete || 'off',
      ...(options.required ? { required: 'required' } : {}),
      ...(options.placeholder ? { placeholder: options.placeholder } : {}),
      ...(options.maxLength ? { maxlength: options.maxLength } : {}),
    },
  });
}

async function renderDictionaryList(body, repository, state, dependencies) {
  const dictionaries = await repository.listDictionaries();
  const entriesByDictionary = new Map(
    await Promise.all(
      dictionaries.map(async (dictionary) => [
        dictionary.id,
        await repository.listEntries(dictionary.id),
      ])
    )
  );
  const actions = node('div', { className: 'user-dict-actions' });
  actions.append(
    button(
      'Создать словарь',
      (event) => openDictionaryForm(event.currentTarget, repository, state, dependencies),
      { className: 'btn-primary', testId: 'create-user-dictionary' }
    ),
    button(
      'Импортировать',
      (event) => openImportWizard(event.currentTarget, repository, state, dependencies),
      { testId: 'import-user-dictionary' }
    )
  );
  body.replaceChildren(actions);
  if (!dictionaries.length) {
    body.append(
      node('div', { className: 'empty-state' }, [
        node('h2', { text: 'В словарях пока нет слов' }),
        node('p', {
          text: 'Создайте словарь вручную или импортируйте JSON, CSV либо TSV. Импорт не включает слова в обучение автоматически.',
        }),
      ])
    );
    return;
  }
  const list = node('div', { className: 'user-dict-grid' });
  for (const dictionary of dictionaries) {
    const entries = entriesByDictionary.get(dictionary.id);
    const card = node('article', { className: 'user-dict-card' });
    card.append(
      node('h2', { text: dictionary.name }),
      node('p', { className: 'muted', text: dictionary.description || 'Без описания' }),
      node('p', {
        text: `${entries.length} записей · ${entries.filter((entry) => entry.learningEnabled).length} в обучении`,
      }),
      node('time', {
        className: 'muted',
        text: `Изменён: ${new Date(dictionary.updatedAt).toLocaleDateString('ru-RU')}`,
        attrs: { datetime: dictionary.updatedAt },
      })
    );
    const cardActions = node('div', { className: 'user-dict-card-actions' });
    cardActions.append(
      button('Открыть', () => {
        view.dictionaryId = dictionary.id;
        view.page = 1;
        view.selected.clear();
        renderUserDictionaries(state, dependencies);
      }),
      button('JSON', () => {
        download(
          JSON.stringify(createUserDictionaryExport(dictionary, entries), null, 2),
          `${dictionary.name}.kotokitsu.json`,
          'application/json'
        );
      }),
      button('CSV', () => {
        download(
          exportUserDictionaryCsv(entries),
          `${dictionary.name}.csv`,
          'text/csv;charset=utf-8'
        );
      }),
      button(
        'Удалить',
        async () => {
          const learning = entries.filter((entry) => entry.learningEnabled);
          const message = learning.length
            ? `Связанных с обучением слов: ${learning.length}. Удалить словарь, карточки и прогресс?`
            : 'Удалить словарь и все его записи?';
          if (!window.confirm(message)) return;
          const result = await deleteUserDictionaryWithProgress({
            repository,
            dictionaryId: dictionary.id,
            entries,
            state,
          });
          Object.assign(state, result.state);
          await dependencies.save?.(true);
          await dependencies.refreshRuntime?.();
          renderUserDictionaries(state, dependencies);
        },
        { className: 'btn-danger' }
      )
    );
    card.append(cardActions);
    list.append(card);
  }
  body.append(list);
}

function entryMatches(entry) {
  const query = normalizeJapaneseForComparison(view.search);
  if (query && !entry.searchText.includes(query)) return false;
  if (view.tag !== 'all' && !entry.tags.includes(view.tag)) return false;
  if (view.learning === 'enabled' && !entry.learningEnabled) return false;
  if (view.learning === 'disabled' && entry.learningEnabled) return false;
  return true;
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    if (view.sort === 'writing')
      return (left.writing || left.reading).localeCompare(right.writing || right.reading, 'ja');
    if (view.sort === 'created') return left.createdAt.localeCompare(right.createdAt);
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

async function renderDictionaryEntries(body, repository, dictionary, state, dependencies) {
  const allEntries = await repository.listEntries(dictionary.id);
  const toolbar = node('div', { className: 'user-dict-toolbar' });
  toolbar.append(
    button('← Все словари', () => {
      view.dictionaryId = null;
      view.selected.clear();
      renderUserDictionaries(state, dependencies);
    }),
    node('h2', { text: dictionary.name }),
    button(
      'Добавить слово',
      (event) =>
        openEntryForm(event.currentTarget, repository, dictionary, null, state, dependencies),
      { className: 'btn-primary', testId: 'add-user-word' }
    ),
    button('Импортировать', (event) =>
      openImportWizard(event.currentTarget, repository, state, dependencies, dictionary.id)
    )
  );
  const search = textInput(view.search, { placeholder: 'Поиск по слову, значению, тегу…' });
  search.setAttribute('aria-label', 'Поиск по словарю');
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      view.search = search.value;
      view.page = 1;
      renderUserDictionaries(state, dependencies);
    }, 180);
  });
  const tags = ['all', ...new Set(allEntries.flatMap((entry) => entry.tags))];
  const tagFilter = node('select', { attrs: { 'aria-label': 'Фильтр по тегу' } });
  for (const tag of tags) {
    const option = node('option', { value: tag, text: tag === 'all' ? 'Все теги' : tag });
    option.selected = view.tag === tag;
    tagFilter.append(option);
  }
  tagFilter.addEventListener('change', () => {
    view.tag = tagFilter.value;
    view.page = 1;
    renderUserDictionaries(state, dependencies);
  });
  const learningFilter = node('select', { attrs: { 'aria-label': 'Фильтр обучения' } });
  [
    ['all', 'Все слова'],
    ['enabled', 'В обучении'],
    ['disabled', 'Не в обучении'],
  ].forEach(([value, label]) => {
    const option = node('option', { value, text: label });
    option.selected = view.learning === value;
    learningFilter.append(option);
  });
  learningFilter.addEventListener('change', () => {
    view.learning = learningFilter.value;
    view.page = 1;
    renderUserDictionaries(state, dependencies);
  });
  const sort = node('select', { attrs: { 'aria-label': 'Сортировка' } });
  [
    ['updated-desc', 'Недавно изменённые'],
    ['writing', 'По написанию'],
    ['created', 'Сначала старые'],
  ].forEach(([value, label]) => {
    const option = node('option', { value, text: label });
    option.selected = view.sort === value;
    sort.append(option);
  });
  sort.addEventListener('change', () => {
    view.sort = sort.value;
    renderUserDictionaries(state, dependencies);
  });
  const filters = node('div', { className: 'user-dict-filters' }, [
    search,
    tagFilter,
    learningFilter,
    sort,
  ]);
  const bulk = node('div', { className: 'user-dict-actions' });
  const toggleLearning = async (enabled) => {
    const entries = allEntries.filter((entry) => view.selected.has(entry.id));
    if (!entries.length) return;
    const result = await setUserEntriesLearningEnabled({
      repository,
      entries,
      enabled,
      state,
    });
    Object.assign(state, result.state);
    await dependencies.save?.(true);
    await dependencies.refreshRuntime?.();
    view.selected.clear();
    renderUserDictionaries(state, dependencies);
  };
  bulk.append(
    button('Добавить выбранные в обучение', () => toggleLearning(true)),
    button('Исключить выбранные из обучения', () => toggleLearning(false))
  );
  body.replaceChildren(toolbar, filters, bulk);
  const filtered = sortEntries(allEntries.filter(entryMatches));
  if (!allEntries.length) {
    body.append(
      node('div', { className: 'empty-state' }, [node('h3', { text: 'В словаре пока нет слов' })])
    );
    return;
  }
  if (!filtered.length) {
    body.append(
      node('div', { className: 'empty-state' }, [
        node('h3', { text: 'Не найдено подходящих записей' }),
      ])
    );
    return;
  }
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  view.page = Math.min(view.page, pageCount);
  const pageEntries = filtered.slice((view.page - 1) * PAGE_SIZE, view.page * PAGE_SIZE);
  const list = node('div', {
    className: 'user-word-list',
    attrs: { 'aria-label': 'Записи словаря' },
  });
  for (const entry of pageEntries) {
    const checkbox = node('input', {
      type: 'checkbox',
      attrs: { 'aria-label': `Выбрать ${entry.writing || entry.reading}` },
    });
    checkbox.checked = view.selected.has(entry.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) view.selected.add(entry.id);
      else view.selected.delete(entry.id);
    });
    const card = node('article', { className: 'user-word-card' });
    const content = node('div', { className: 'user-word-content' });
    content.append(
      node('h3', { text: entry.writing || entry.reading }),
      entry.reading && entry.reading !== entry.writing
        ? node('p', { className: 'user-word-reading', text: entry.reading })
        : node('span'),
      node('p', { text: entry.meanings.join('; ') }),
      node('p', {
        className: 'muted',
        text: `${entry.tags.join(' · ') || 'Без тегов'} · ${entry.learningEnabled ? 'В обучении' : 'Только в словаре'}`,
      })
    );
    const actions = node('div', { className: 'user-dict-card-actions' });
    actions.append(
      button('Изменить', (event) =>
        openEntryForm(event.currentTarget, repository, dictionary, entry, state, dependencies)
      ),
      button(
        'Удалить',
        async () => {
          // Проверяем фактическое наличие прогресса в SRS, а не только learningEnabled
          const hasProgress =
            entry.learningEnabled ||
            Object.keys(state.srs || {}).some((cardId) => {
              const { itemId } = state.srs[cardId] || {};
              return itemId === entry.id || cardId === entry.id;
            });
          if (
            !window.confirm(
              hasProgress
                ? 'Удалить запись вместе со связанными карточками и прогрессом?'
                : 'Удалить запись?'
            )
          )
            return;
          // Всегда используем deleteUserEntriesWithProgress, чтобы
          // очистить dangling SRS-ссылки даже для suspended (excluded) записей
          const result = await deleteUserEntriesWithProgress({
            repository,
            entries: [entry],
            state,
          });
          Object.assign(state, result.state);
          await dependencies.save?.(true);
          await dependencies.refreshRuntime?.();
          renderUserDictionaries(state, dependencies);
        },
        { className: 'btn-danger' }
      )
    );
    card.append(checkbox, content, actions);
    list.append(card);
  }
  body.append(list);
  const pagination = node('nav', {
    className: 'user-dict-pagination',
    attrs: { 'aria-label': 'Страницы' },
  });
  pagination.append(
    button(
      'Назад',
      () => {
        view.page -= 1;
        renderUserDictionaries(state, dependencies);
      },
      { disabled: view.page <= 1 }
    ),
    node('span', { text: `${view.page} / ${pageCount}` }),
    button(
      'Далее',
      () => {
        view.page += 1;
        renderUserDictionaries(state, dependencies);
      },
      { disabled: view.page >= pageCount }
    )
  );
  body.append(pagination);
}

function openDictionaryForm(opener, repository, state, dependencies) {
  let dirty = false;
  const modal = modalShell({
    title: 'Новый словарь',
    description: 'Слова останутся отдельными от обучения, пока вы не включите их явно.',
    opener,
    onRequestClose: () => !dirty || window.confirm('Закрыть без сохранения?'),
  });
  const name = textInput('', { name: 'dict_name', required: true, maxLength: 120 });
  const description = textInput('', { name: 'dict_description', multiline: true, maxLength: 2000 });
  const form = node('form', {
    className: 'user-dict-form',
    name: 'user-dictionary-form',
    attrs: { autocomplete: 'off', 'data-autofill': 'false' },
  });
  form.append(
    labeledControl('Название *', name),
    labeledControl('Описание', description),
    button('Создать', () => {}, { className: 'btn-primary', testId: 'save-user-dictionary' })
  );
  form.querySelector('button').type = 'submit';
  form.querySelector('button').name = 'dict_create_button';
  form.addEventListener('input', () => {
    dirty = true;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const dictionary = await repository.saveDictionary({
        name: name.value,
        description: description.value,
      });
      dirty = false;
      modal.close();
      view.dictionaryId = dictionary.id;
      await dependencies.refreshRuntime?.();
      renderUserDictionaries(state, dependencies);
    } catch (error) {
      announceAlert(error.message);
    }
  });
  modal.dialog.append(form);
}

function openEntryForm(opener, repository, dictionary, entry, state, dependencies) {
  let dirty = false;
  const modal = modalShell({
    title: entry ? 'Редактировать слово' : 'Добавить слово',
    description: 'Нужно написание или чтение и хотя бы одно значение.',
    opener,
    onRequestClose: () => !dirty || window.confirm('Закрыть без сохранения?'),
  });
  const writing = textInput(entry?.writing, { name: 'dict_writing', maxLength: 200 });
  const reading = textInput(entry?.reading, { name: 'dict_reading', maxLength: 200 });
  const meanings = textInput(entry?.meanings.join('\n'), {
    name: 'dict_meanings',
    multiline: true,
    required: true,
    maxLength: 50_000,
  });
  const alternatives = textInput(entry?.alternativeWritings.join('; '), {
    name: 'dict_alternatives',
  });
  const partOfSpeech = textInput(entry?.partOfSpeech.join(', '), { name: 'dict_part_of_speech' });
  const tags = textInput(entry?.tags.join(', '), { name: 'dict_tags' });
  const examples = textInput(
    entry?.examples.map((example) => `${example.japanese}\t${example.translation}`).join('\n'),
    { name: 'dict_examples', multiline: true }
  );
  const notes = textInput(entry?.notes, { name: 'dict_notes', multiline: true, maxLength: 10_000 });
  const source = textInput(entry?.source.label, { name: 'dict_source' });
  const form = node('form', {
    className: 'user-dict-form',
    name: 'user-dictionary-entry-form',
    attrs: { autocomplete: 'off', 'data-autofill': 'false' },
  });
  form.append(
    labeledControl('Написание', writing),
    labeledControl('Чтение', reading),
    labeledControl('Значения *', meanings, 'Одно значение на строку или через ;'),
    labeledControl('Альтернативные написания', alternatives, 'Через ;'),
    labeledControl('Части речи', partOfSpeech, 'Через запятую'),
    labeledControl('Теги', tags, 'Через запятую'),
    labeledControl(
      'Примеры',
      examples,
      'Один пример на строку: японский текст, затем Tab и перевод'
    ),
    labeledControl('Заметка', notes),
    labeledControl('Источник', source)
  );
  const submit = button('Сохранить', () => {}, {
    className: 'btn-primary',
    testId: 'save-user-word',
  });
  submit.type = 'submit';
  submit.name = 'dict_save_word_button';
  form.append(submit);
  form.addEventListener('input', () => {
    dirty = true;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const result = await updateUserEntryWithSync({
        repository,
        entry: {
          ...entry,
          dictionaryId: dictionary.id,
          writing: writing.value,
          reading: reading.value,
          meanings: normalizeMeanings(meanings.value.replaceAll('\n', ';'), { separator: ';' }),
          alternativeWritings: normalizeTags(alternatives.value, { separator: ';' }),
          partOfSpeech: normalizeTags(partOfSpeech.value, { separator: ',' }),
          tags: normalizeTags(tags.value, { separator: ',' }),
          examples: examples.value
            .split('\n')
            .filter(Boolean)
            .map((line) => {
              const [japanese = '', translation = ''] = line.split('\t');
              return { japanese, translation };
            }),
          notes: notes.value,
          source: {
            type: entry?.source.type || 'manual',
            label: source.value,
            externalId: entry?.source.externalId || null,
          },
        },
        state,
      });
      if (result.state) Object.assign(state, result.state);
      dirty = false;
      modal.close();
      await dependencies.save?.(true);
      await dependencies.refreshRuntime?.();
      renderUserDictionaries(state, dependencies);
    } catch (error) {
      announceAlert(error.issues?.[0]?.message || error.message);
    }
  });
  modal.dialog.append(form);
}

function mappingTable(fields, mapping, sampleRecord = {}) {
  const table = node('table', { className: 'user-dict-mapping' });
  table.append(
    node('caption', { text: 'Сопоставление полей файла с полями KotoKitsu' }),
    node('thead', {}, [
      node('tr', {}, [
        node('th', { text: 'Поле KotoKitsu' }),
        node('th', { text: 'Поле файла' }),
        node('th', { text: 'Пример' }),
      ]),
    ])
  );
  const tbody = node('tbody');
  for (const target of TARGET_FIELDS) {
    const canCombine = ['meanings', 'alternativeWritings', 'partOfSpeech', 'tags'].includes(target);
    const select = node('select', { attrs: { 'aria-label': `Источник для ${target}` } });
    if (canCombine) {
      select.multiple = true;
      select.size = Math.min(4, fields.length + 1);
    }
    select.append(node('option', { value: '', text: 'Не импортировать' }));
    for (const field of fields) {
      const option = node('option', { value: field, text: field });
      option.selected = Array.isArray(mapping[target])
        ? mapping[target].includes(field)
        : mapping[target] === field;
      select.append(option);
    }
    const sample = node('td', { className: 'muted' });
    const updateSample = () => {
      const selectedFields = [...select.selectedOptions]
        .map((option) => option.value)
        .filter(Boolean);
      sample.textContent = selectedFields.length
        ? selectedFields
            .map((field) => {
              const value = sampleRecord[field];
              return Array.isArray(value) ? value.join('; ') : String(value ?? '');
            })
            .join(' + ')
        : '—';
    };
    select.addEventListener('change', () => {
      const values = [...select.selectedOptions].map((option) => option.value).filter(Boolean);
      if (values.length) mapping[target] = canCombine ? values : values[0];
      else delete mapping[target];
      updateSample();
    });
    updateSample();
    tbody.append(
      node('tr', {}, [
        node('th', { text: target, attrs: { scope: 'row' } }),
        node('td', {}, [select]),
        sample,
      ])
    );
  }
  table.append(tbody);
  return table;
}

async function openImportWizard(
  opener,
  repository,
  state,
  dependencies,
  presetDictionaryId = null
) {
  const dictionaries = await repository.listDictionaries();
  const profiles = await repository.listProfiles();
  let parsed = null;
  let format = null;
  let mapping = {};
  let preview = null;
  let conflictStrategies = {};
  let selectedEntryIds = [];
  let file = null;
  let selectedProfileId = '';
  const transforms = {
    meaningSeparator: ';',
    tagSeparator: ',',
    stripHtml: true,
    useObjectKeyAsWriting: false,
  };
  const modal = modalShell({
    title: 'Импорт словаря',
    description: 'До подтверждения IndexedDB и очередь обучения не изменяются.',
    opener,
  });
  const content = node('div', { className: 'user-dict-import' });
  modal.dialog.append(content);

  const renderStepOne = () => {
    content.replaceChildren(node('h3', { text: 'Шаг 1. Выбор файла' }));
    const input = node('input', {
      type: 'file',
      attrs: { accept: '.json,.csv,.tsv,application/json,text/csv,text/tab-separated-values' },
      testId: 'dictionary-import-file',
    });
    const profileSelect = node('select', { attrs: { 'aria-label': 'Профиль импорта' } });
    profileSelect.append(node('option', { value: '', text: 'Без сохранённого профиля' }));
    profiles.forEach((profile) =>
      profileSelect.append(node('option', { value: profile.id, text: profile.name }))
    );
    const profileActions = node('div', { className: 'user-dict-actions' }, [
      profileSelect,
      button('Удалить профиль', async () => {
        if (!profileSelect.value || !window.confirm('Удалить профиль импорта?')) return;
        await repository.deleteProfile(profileSelect.value);
        modal.close();
        openImportWizard(opener, repository, state, dependencies, presetDictionaryId);
      }),
    ]);
    input.addEventListener('change', async () => {
      file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        format = detectDictionaryFormat({
          name: file.name,
          type: file.type,
          text,
          size: file.size,
        });
        const profile = profiles.find((value) => value.id === profileSelect.value);
        selectedProfileId = profileSelect.value;
        if (format === 'json') {
          // #5: Применяем collectionPath из профиля, с падением на дефолтный поиск при отсутствии пути
          const savedPath = profile?.collectionPath || null;
          let collectionPathWarning = null;
          if (savedPath) {
            try {
              parsed = parseDictionaryJson(text, { collectionPath: savedPath });
            } catch {
              parsed = parseDictionaryJson(text);
              collectionPathWarning = `Путь коллекции «${savedPath}» из профиля не найден в новом файле. Выберите коллекцию вручную.`;
            }
          } else {
            parsed = parseDictionaryJson(text);
          }
          if (collectionPathWarning) {
            announceAlert(collectionPathWarning);
          }
        } else {
          parsed = parseDelimited(text, { delimiter: format === 'tsv' ? '\t' : ',' });
        }
        const records = parsed.records || [];
        const fields = Object.keys(records[0]?.value || {});
        mapping = inferDictionaryMapping(fields);
        if (profile) {
          mapping = { ...profile.mapping };
          Object.assign(transforms, profile.transforms);
        }
        renderMapping(text);
      } catch (error) {
        announceAlert(error.message);
      }
    });
    content.append(
      profileActions,
      labeledControl('Файл JSON, CSV или TSV', input),
      node('p', {
        className: 'muted',
        text: 'Лимит: 10 МБ и 20 000 записей. CSV поддерживает quoted fields и переносы строк.',
      })
    );
  };

  const renderMapping = (sourceText) => {
    content.replaceChildren(node('h3', { text: 'Шаги 2–4. Коллекция, mapping и преобразования' }));
    content.append(
      node('p', {
        className: 'muted',
        text: `${file.name} · ${format.toUpperCase()} · ${formatFileSize(file.size)} · найдено записей: ${parsed.records.length}`,
      })
    );
    const dictionarySelect = node('select', { attrs: { 'aria-label': 'Целевой словарь' } });
    dictionarySelect.append(node('option', { value: '', text: 'Создать новый словарь' }));
    dictionaries.forEach((dictionary) => {
      const option = node('option', { value: dictionary.id, text: dictionary.name });
      option.selected = (presetDictionaryId || '') === dictionary.id;
      dictionarySelect.append(option);
    });
    const defaultDictName =
      parsed.root?.dictionary?.name ||
      file?.name.replace(/\.[^.]+$/u, '') ||
      'Импортированный словарь';
    const newName = textInput(defaultDictName);
    const delimiter = node('select', { attrs: { 'aria-label': 'Разделитель CSV' } });
    [
      [',', 'Запятая'],
      [';', 'Точка с запятой'],
      ['\t', 'Табуляция'],
    ].forEach(([value, label]) => delimiter.append(node('option', { value, text: label })));
    delimiter.value = format === 'tsv' ? '\t' : ',';
    if (format !== 'json') {
      delimiter.addEventListener('change', () => {
        parsed = parseDelimited(sourceText, { delimiter: delimiter.value });
        mapping = inferDictionaryMapping(Object.keys(parsed.records[0]?.value || {}));
        renderMapping(sourceText);
      });
    }
    if (format === 'json' && parsed.collections?.length > 1) {
      const collectionSelect = node('select', { attrs: { 'aria-label': 'Коллекция JSON' } });
      parsed.collections.forEach((collection) =>
        collectionSelect.append(
          node('option', {
            value: collection.path,
            text: `${collection.path || '(корень)'} — ${collection.count}`,
          })
        )
      );
      collectionSelect.value = parsed.path;
      collectionSelect.addEventListener('change', () => {
        parsed = parseDictionaryJson(sourceText, { collectionPath: collectionSelect.value });
        mapping = inferDictionaryMapping(Object.keys(parsed.records[0]?.value || {}));
        renderMapping(sourceText);
      });
      content.append(labeledControl('Коллекция JSON', collectionSelect));
    }
    content.append(
      labeledControl('Целевой словарь', dictionarySelect),
      labeledControl('Название нового словаря', newName)
    );
    if (format !== 'json') content.append(labeledControl('Разделитель колонок', delimiter));
    const fields = Object.keys(parsed.records[0]?.value || {});
    content.append(mappingTable(fields, mapping, parsed.records[0]?.value || {}));
    const meaningSeparator = textInput(transforms.meaningSeparator, { maxLength: 10 });
    const tagSeparator = textInput(transforms.tagSeparator, { maxLength: 10 });
    const stripHtml = node('input', { type: 'checkbox' });
    stripHtml.checked = transforms.stripHtml;
    const useObjectKey = node('input', { type: 'checkbox' });
    useObjectKey.checked = transforms.useObjectKeyAsWriting;
    content.append(
      labeledControl(
        '\u0420\u0430\u0437\u0434\u0435\u043b\u0438\u0442\u0435\u043b\u044c \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0439',
        meaningSeparator
      ),
      labeledControl(
        '\u0420\u0430\u0437\u0434\u0435\u043b\u0438\u0442\u0435\u043b\u044c \u0442\u0435\u0433\u043e\u0432',
        tagSeparator
      ),
      labeledControl('\u0423\u0434\u0430\u043b\u044f\u0442\u044c HTML', stripHtml),
      labeledControl(
        '\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u044c \u043a\u043b\u044e\u0447 \u043e\u0431\u044a\u0435\u043a\u0442\u0430 \u043a\u0430\u043a \u043d\u0430\u043f\u0438\u0441\u0430\u043d\u0438\u0435',
        useObjectKey
      )
    );
    content.append(
      button(
        'Показать предпросмотр',
        async () => {
          try {
            const dictionary =
              dictionaries.find((value) => value.id === dictionarySelect.value) ||
              createUserDictionaryModel({
                name: newName.value,
                description: parsed.root?.dictionary?.description || '',
                sourceType: 'import',
              });
            const existingEntries = dictionarySelect.value
              ? await repository.listEntries(dictionary.id)
              : [];
            Object.assign(transforms, {
              meaningSeparator: meaningSeparator.value,
              tagSeparator: tagSeparator.value,
              stripHtml: stripHtml.checked,
              useObjectKeyAsWriting: useObjectKey.checked,
            });
            preview = createImportPreview({
              records: parsed.records,
              mapping,
              options: {
                ...transforms,
                dictionaryId: dictionary.id,
                sourceLabel: file.name,
              },
              existingEntries,
              isStrict: Boolean(parsed.isStrict),
            });
            renderPreview(dictionary);
          } catch (error) {
            announceAlert(error.message);
          }
        },
        { className: 'btn-primary', testId: 'dictionary-import-preview' }
      )
    );
  };

  const renderPreview = (dictionary) => {
    content.replaceChildren(
      node('h3', { text: 'Шаги 5–7. Предпросмотр, конфликты и подтверждение' })
    );
    content.append(
      node('p', {
        text: `Всего: ${preview.total} · Готово: ${preview.ready} · С предупреждениями: ${preview.warningCount} · Отклонено: ${preview.rejectedCount} · Дубликатов (файл): ${preview.intraFileDuplicateCount || 0} · Дубликатов (словарь): ${preview.duplicateCount}`,
        attrs: { 'aria-live': 'polite' },
      })
    );
    if (!preview.ready) {
      content.append(
        node('div', { className: 'empty-state', text: 'Импорт завершён без допустимых записей' })
      );
    }
    const previewList = node('ol', { className: 'user-dict-preview' });
    for (const item of preview.accepted.slice(0, 20)) {
      const checkbox = node('input', {
        type: 'checkbox',
        attrs: { 'aria-label': `Добавить ${item.entry.writing || item.entry.reading} в обучение` },
      });
      checkbox.addEventListener('change', () => {
        selectedEntryIds = checkbox.checked
          ? [...selectedEntryIds, item.entry.id]
          : selectedEntryIds.filter((id) => id !== item.entry.id);
      });
      previewList.append(
        node('li', {}, [
          checkbox,
          node('span', {
            text: `✓ ${item.entry.writing || item.entry.reading}${item.entry.reading ? `【${item.entry.reading}】` : ''} — ${item.entry.meanings.join('; ')}`,
          }),
        ])
      );
    }
    for (const rejected of preview.rejected.slice(0, 20)) {
      previewList.append(node('li', { text: `✕ ${rejected.sourceIndex}: ${rejected.message}` }));
    }
    content.append(previewList);
    if (preview.rejected.length) {
      content.append(
        button('Скачать отчёт ошибок', () =>
          download(createImportErrorReport(preview), 'kotokitsu-import-errors.txt', 'text/plain')
        )
      );
    }
    const defaultConflict = node('select', {
      attrs: { 'aria-label': 'Для всех конфликтов' },
    });
    [
      ['skip', 'Пропустить'],
      ['merge', 'Объединить'],
      ['replace', 'Заменить'],
      ['separate', 'Импортировать отдельно'],
    ].forEach(([value, label]) => defaultConflict.append(node('option', { value, text: label })));
    content.append(labeledControl('Для всех конфликтов', defaultConflict));
    for (const conflict of preview.conflicts.slice(0, 100)) {
      const select = defaultConflict.cloneNode(true);
      select.setAttribute(
        'aria-label',
        `Конфликт ${conflict.incoming.writing || conflict.incoming.reading}`
      );
      select.addEventListener('change', () => {
        conflictStrategies[conflict.incoming.id] = select.value;
      });
      content.append(
        node('div', { className: 'user-dict-conflict' }, [
          node('span', { text: conflict.incoming.writing || conflict.incoming.reading }),
          select,
        ])
      );
    }
    const learningMode = node('select', { attrs: { 'aria-label': 'После импорта' } });
    [
      ['dictionary-only', 'Только импортировать в словарь'],
      ['selected', 'Добавить выбранные слова в обучение'],
      ['all', 'Добавить все допустимые слова в обучение'],
    ].forEach(([value, label]) => learningMode.append(node('option', { value, text: label })));
    const saveProfile = node('input', { type: 'checkbox' });
    const profileName = textInput(
      profiles.find((profile) => profile.id === selectedProfileId)?.name || `Профиль ${file.name}`
    );
    content.append(
      labeledControl('После импорта', learningMode),
      labeledControl('Сохранить профиль импорта', saveProfile),
      labeledControl('Название профиля', profileName)
    );
    content.append(
      button(
        'Подтвердить импорт',
        async () => {
          try {
            const result = await commitDictionaryImport({
              repository,
              dictionary,
              preview,
              conflictStrategy: defaultConflict.value,
              conflictStrategies,
              learningMode: learningMode.value,
              selectedEntryIds,
              state,
            });
            if (result.state) Object.assign(state, result.state);
            if (saveProfile.checked) {
              const existingProfile = profiles.find((profile) => profile.id === selectedProfileId);
              await repository.saveProfile(
                createImportProfile({
                  ...existingProfile,
                  name: profileName.value,
                  format,
                  collectionPath: parsed.path || null,
                  mapping,
                  transforms,
                })
              );
            }
            await dependencies.save?.(true);
            await dependencies.refreshRuntime?.();
            modal.close();
            view.dictionaryId = dictionary.id;
            announce(`Импортировано записей: ${result.imported}`);
            renderUserDictionaries(state, dependencies);
          } catch (error) {
            announceAlert(error.message);
          }
        },
        {
          className: 'btn-primary',
          testId: 'dictionary-import-commit',
          disabled: preview.ready === 0,
        }
      )
    );
  };
  renderStepOne();
}

export async function renderUserDictionaries(state, dependencies = {}, options = {}, context = {}) {
  const body = document.getElementById('user-dictionaries-body');
  if (!body) return;
  if (options.dictionaryId) view.dictionaryId = options.dictionaryId;
  if (options.search || options.entryId) view.search = options.search || options.entryId || '';
  const repository = dependencies.repository || new UserDictionaryRepository();

  try {
    let dictionary = null;
    if (view.dictionaryId) {
      dictionary = await repository.getDictionary(view.dictionaryId);
      if (!dictionary) view.dictionaryId = null;
    }

    if (context?.signal?.aborted) return;

    if (dictionary) {
      await renderDictionaryEntries(body, repository, dictionary, state, dependencies);
    } else {
      await renderDictionaryList(body, repository, state, dependencies);
    }
  } catch (error) {
    if (context?.signal?.aborted) return;
    body.replaceChildren(
      node('div', { className: 'empty-state' }, [
        node('h2', { text: 'Не удалось открыть словари' }),
        node('p', { text: error.message }),
      ])
    );
  }
}
