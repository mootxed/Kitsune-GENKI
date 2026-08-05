import { describe, it, expect, beforeEach } from 'vitest';
import { renderSensei, setChatHistory, getChatHistory, md } from '../ui/chat.js';

describe('AI Chat History Restoration', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="sensei-body"></div>
    `;
    setChatHistory([]);
  });

  it('setChatHistory updates internal chatHistory', () => {
    const history = [
      { role: 'user', content: 'Что такое kanji?' },
      { role: 'assistant', content: 'Кандзи — это иероглифы.' },
    ];
    setChatHistory(history);
    expect(getChatHistory()).toEqual([
      expect.objectContaining({ role: 'user', text: 'Что такое kanji?' }),
      expect.objectContaining({ role: 'assistant', text: 'Кандзи — это иероглифы.' }),
    ]);
  });

  it('renderSensei syncs chatHistory from state.chatHistory if provided', () => {
    const state = {
      chatHistory: [
        { role: 'user', content: 'Привет' },
        { role: 'assistant', content: 'Здравствуйте!' },
      ],
      settings: {},
    };
    const deps = { save: () => {} };

    renderSensei(state, deps);

    expect(getChatHistory()).toEqual(state.chatHistory);
    const body = document.getElementById('sensei-body');
    expect(body.textContent).toContain('Привет');
    expect(body.textContent).toContain('Здравствуйте!');
  });

  it('renderSensei shows starter actions if chatHistory is empty', () => {
    const state = {
      chatHistory: [],
      settings: {},
    };
    const deps = { save: () => {} };

    renderSensei(state, deps);

    const body = document.getElementById('sensei-body');
    expect(body.querySelector('[data-testid="sensei-starter"]')).not.toBeNull();
    expect(body.textContent).toContain('Объяснить слово');
    expect(body.textContent).toContain('Создать историю');
    expect(body.textContent).toContain('Задать свободный вопрос');
  });
});

describe('Markdown Link Sanitization', () => {
  it('allows safe https and http links', () => {
    const htmlHttps = md('[Google](https://google.com)');
    expect(htmlHttps).toContain(
      '<a href="https://google.com/" target="_blank" rel="noopener noreferrer">Google</a>'
    );

    const htmlHttp = md('[Example](http://example.com)');
    expect(htmlHttp).toContain(
      '<a href="http://example.com/" target="_blank" rel="noopener noreferrer">Example</a>'
    );
  });

  it('allows safe mailto links', () => {
    const htmlMailto = md('[Mail](mailto:user@example.com)');
    expect(htmlMailto).toContain(
      '<a href="mailto:user@example.com" target="_blank" rel="noopener noreferrer">Mail</a>'
    );
  });

  it('blocks dangerous javascript:, data:, and vbscript: links', () => {
    const htmlJs = md('[Click me](javascript:alert(1))');
    expect(htmlJs).not.toContain('<a href=');
    expect(htmlJs).toContain('Click me');

    const htmlData = md('[Data URI](data:text/html,<script>alert(1)</script>)');
    expect(htmlData).not.toContain('<a href=');
    expect(htmlData).toContain('Data URI');

    const htmlVb = md('[VBScript](vbscript:msgbox)');
    expect(htmlVb).not.toContain('<a href=');
    expect(htmlVb).toContain('VBScript');
  });
});
