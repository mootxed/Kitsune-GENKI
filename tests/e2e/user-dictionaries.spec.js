import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';
import {
  completeOnboarding,
  navigateToScreen,
  waitForAppReady,
} from './helpers/reset-app-state.js';

async function createDictionary(page, name = 'Слова из визуальной новеллы') {
  await page.getByTestId('create-user-dictionary').click();
  const dialog = page.locator('.user-dict-modal');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Название *').fill(name);
  await dialog.getByLabel('Описание').fill('Личный словарь');
  await dialog.getByTestId('save-user-dictionary').click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

async function addWord(page, values = {}) {
  await page.getByTestId('add-user-word').click();
  const dialog = page.locator('.user-dict-modal');
  await dialog.getByLabel('Написание').fill(values.writing || '食べる');
  await dialog.getByLabel('Чтение').fill(values.reading || 'たべる');
  await dialog.getByLabel('Значения *').fill(values.meanings || 'есть\nкушать');
  await dialog.getByLabel('Теги').fill(values.tags || 'еда, глагол');
  await dialog.getByLabel('Примеры').fill('りんごを食べる。\tЕсть яблоко.');
  await dialog.getByTestId('save-user-word').click();
}

test.describe('User dictionaries full flow', () => {
  test.beforeEach(async ({ page }) => {
    await completeOnboarding(page);
    await navigateToScreen(page, 'user-dictionaries');
  });

  test('create, edit, search, learning toggle, export, delete and reload persistence', async ({
    page,
  }) => {
    await createDictionary(page);
    await expect(page.getByText('В словаре пока нет слов')).toBeVisible();
    await addWord(page);
    await expect(page.getByRole('heading', { name: '食べる' })).toBeVisible();
    await expect(page.getByText('есть; кушать')).toBeVisible();

    await page.getByRole('button', { name: 'Изменить' }).click();
    const editDialog = page.locator('.user-dict-modal');
    await editDialog.getByLabel('Значения *').fill('есть\nпринимать пищу');
    await editDialog.getByTestId('save-user-word').click();
    await expect(page.getByText('есть; принимать пищу')).toBeVisible();

    const entryCheckbox = page.getByRole('checkbox', { name: 'Выбрать 食べる' });
    await entryCheckbox.check();
    await page.getByRole('button', { name: 'Добавить выбранные в обучение' }).click();
    await expect(
      page.locator('.user-word-card .muted').filter({ hasText: 'В обучении' })
    ).toBeVisible();
    await page.getByLabel('Фильтр по тегу').selectOption('еда');
    await page.getByLabel('Фильтр обучения').selectOption('enabled');
    await expect(page.getByRole('heading', { name: '食べる' })).toBeVisible();
    await page.getByLabel('Фильтр по тегу').selectOption('all');
    await page.getByLabel('Фильтр обучения').selectOption('all');

    await page.getByLabel('Поиск по словарю').fill('принимать');
    await expect(page.getByRole('heading', { name: '食べる' })).toBeVisible();
    await page.getByLabel('Поиск по словарю').fill('несуществующее');
    await expect(page.getByText('Не найдено подходящих записей')).toBeVisible();
    await page.getByLabel('Поиск по словарю').fill('');

    await page.reload();
    await waitForAppReady(page);
    await navigateToScreen(page, 'user-dictionaries');
    await page.getByRole('button', { name: 'Открыть' }).click();
    await expect(page.getByRole('heading', { name: '食べる' })).toBeVisible();

    await navigateToScreen(page, 'settings');
    const fullBackupDownload = page.waitForEvent('download');
    await page.getByTestId('export-full-btn').click();
    const backupPath = await (await fullBackupDownload).path();
    expect(backupPath).toBeTruthy();

    page.once('dialog', (confirmation) => confirmation.accept());
    await page.getByTestId('reset-btn').click();
    await waitForAppReady(page);
    await navigateToScreen(page, 'settings');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByTestId('import-full-btn').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(backupPath);
    const restoreDialog = page.locator('.modal-overlay');
    await expect(
      restoreDialog.getByRole('heading', { name: 'Восстановить прогресс?' })
    ).toBeVisible();
    const reloadPromise = page.waitForEvent('load');
    await restoreDialog.getByRole('button', { name: 'Восстановить' }).click();
    await reloadPromise;
    await waitForAppReady(page);
    await navigateToScreen(page, 'user-dictionaries');
    await page.getByRole('button', { name: 'Открыть' }).click();
    await expect(page.getByRole('heading', { name: '食べる' })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '← Все словари' }).click();
    await page.getByRole('button', { name: 'JSON' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.kotokitsu.json');

    await page.getByRole('button', { name: 'Открыть' }).click();
    page.once('dialog', (confirmation) => confirmation.accept());
    await page.getByRole('button', { name: 'Удалить' }).click();
    await expect(page.getByText('В словаре пока нет слов')).toBeVisible();
    await page.getByRole('button', { name: '← Все словари' }).click();
    page.once('dialog', (confirmation) => confirmation.accept());
    await page.getByRole('button', { name: 'Удалить' }).click();
    await expect(page.getByText('В словарях пока нет слов')).toBeVisible();
  });

  test('CSV preview reports invalid rows, supports conflict merge and defaults to dictionary-only', async ({
    page,
  }) => {
    await createDictionary(page, 'CSV словарь');
    await addWord(page, { writing: '猫', reading: 'ねこ', meanings: 'кошка' });
    await page.getByRole('button', { name: 'Импортировать' }).click();
    const dialog = page.locator('.user-dict-modal');
    await dialog.getByTestId('dictionary-import-file').setInputFiles({
      name: 'words.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'word,reading,meaning,tags\n猫,ねこ,кот,животные\n犬,いぬ,собака,животные\n,,пусто,ошибка\n'
      ),
    });
    await dialog.getByTestId('dictionary-import-preview').click();
    await expect(dialog.getByText(/Всего: 3/)).toBeVisible();
    await expect(dialog.getByText(/Отклонено: 1/)).toBeVisible();
    await expect(dialog.getByText(/Дубликатов: 1/)).toBeVisible();
    await expect(dialog.getByText(/Укажите написание или чтение/)).toBeVisible();
    await dialog.getByLabel('Для всех конфликтов').selectOption('merge');
    await expect(dialog.getByLabel('После импорта')).toHaveValue('dictionary-only');
    await dialog.getByTestId('dictionary-import-commit').click();
    await expect(page.getByText('кошка; кот')).toBeVisible();
    await expect(page.getByRole('heading', { name: '犬' })).toBeVisible();
    await expect(page.getByText(/Только в словаре/).first()).toBeVisible();
  });

  test('JSON/TSV imports, keyboard focus, Escape cancellation and mobile overflow', async ({
    page,
  }) => {
    await createDictionary(page, 'Форматы');

    await page.getByRole('button', { name: 'Импортировать' }).click();
    let dialog = page.locator('.user-dict-modal');
    await dialog.getByTestId('dictionary-import-file').setInputFiles({
      name: 'words.tsv',
      mimeType: 'text/tab-separated-values',
      buffer: Buffer.from('frontValue\treadingValue\tbackValue\n水\tみず\tвода\n'),
    });
    await dialog.getByLabel('Источник для writing').selectOption('frontValue');
    await dialog.getByLabel('Источник для reading').selectOption('readingValue');
    await dialog.getByLabel('Источник для meanings').selectOption(['backValue']);
    await dialog.getByTestId('dictionary-import-preview').click();
    await dialog.getByTestId('dictionary-import-commit').click();
    await expect(page.getByRole('heading', { name: '水' })).toBeVisible();

    const importButton = page.getByRole('button', { name: 'Импортировать' });
    await importButton.focus();
    await page.keyboard.press('Enter');
    dialog = page.locator('.user-dict-modal');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(importButton).toBeFocused();

    await importButton.click();
    dialog = page.locator('.user-dict-modal');
    await dialog.getByTestId('dictionary-import-file').setInputFiles({
      name: 'words.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({ entries: [{ word: '火', reading: 'ひ', meaning: 'огонь' }] })
      ),
    });
    await dialog.getByTestId('dictionary-import-preview').click();
    await dialog.getByTestId('dictionary-import-commit').click();
    await expect(page.getByRole('heading', { name: '火' })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
