import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openSenseiDictionaryDialog } from '../ui/sensei-dictionary.js';

describe('Sensei Dictionary Form Markup (Chrome password prompt prevention)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders dictionary form with non-login attributes and explicit input names', async () => {
    const repository = {
      listDictionaries: vi
        .fn()
        .mockResolvedValue([{ id: 'personal', name: 'Личный словарь', kind: 'personal' }]),
    };
    const token = {
      kanji: '猫',
      writing: '猫',
      reading: 'ねこ',
      meanings: ['кошка'],
      partOfSpeech: ['n'],
    };
    const sentence = {
      tokens: [{ kanji: '猫', writing: '猫' }],
      translation: 'Кошка спящая',
    };

    await openSenseiDictionaryDialog({
      repository,
      token,
      sentence,
    });

    const form = document.querySelector('form.sensei-dictionary-form');
    expect(form).not.toBeNull();
    expect(form.getAttribute('autocomplete')).toBe('off');
    expect(form.getAttribute('name')).toBe('sensei-dictionary-form');
    expect(form.getAttribute('data-autofill')).toBe('false');

    const inputs = form.querySelectorAll('input');
    inputs.forEach((input) => {
      expect(input.getAttribute('autocomplete')).toBe('off');
      expect(input.type).toBe('text');
      expect(input.name).toBeTruthy();
      expect(input.name).toMatch(/^dict_/);
    });

    const select = form.querySelector('select');
    expect(select).not.toBeNull();
    expect(select.name).toBe('dict_target_id');
    expect(select.getAttribute('autocomplete')).toBe('off');

    const textareas = form.querySelectorAll('textarea');
    textareas.forEach((textarea) => {
      expect(textarea.getAttribute('autocomplete')).toBe('off');
      expect(textarea.name).toBeTruthy();
      expect(textarea.name).toMatch(/^dict_/);
    });

    const submitBtn = form.querySelector('button[type="submit"]');
    expect(submitBtn).not.toBeNull();
    expect(submitBtn.name).toBe('dict_save');

    const cancelBtn = form.querySelector('button[type="button"]');
    expect(cancelBtn).not.toBeNull();
    expect(cancelBtn.name).toBe('dict_cancel');
  });
});
