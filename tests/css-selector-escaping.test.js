import { describe, it, expect, beforeEach } from 'vitest';
import { renderStoryRoute } from '../ui/stories.js';

describe('CSS Selector Escaping & Special Character Dataset Matching', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  const testCases = [
    { name: 'double quotes', value: 'sentence-"1"-test' },
    { name: 'single quotes', value: "token-'2'-test" },
    { name: 'backslashes', value: 'path\\to\\sentence' },
    { name: 'square brackets', value: 'item[0][id]' },
    { name: 'newlines', value: 'line1\nline2' },
    { name: 'unicode', value: '文_日本語_🇯🇵_🐱' },
  ];

  for (const tc of testCases) {
    it(`correctly matches sentenceId and tokenId containing ${tc.name} without CSS syntax errors`, async () => {
      const sentenceDiv = document.createElement('div');
      sentenceDiv.className = 'story-sentence';
      sentenceDiv.dataset.sentenceId = tc.value;
      sentenceDiv.scrollIntoView = () => {};

      const tokenSpan = document.createElement('span');
      tokenSpan.className = 'word-token';
      tokenSpan.dataset.tokenId = tc.value;

      document.body.append(sentenceDiv, tokenSpan);

      const stateMock = {
        savedNotes: [{ id: 'test-story', title: 'Test', story: [] }],
      };
      const depsMock = { nav: () => {} };

      // Call renderStoryRoute with complex options
      await renderStoryRoute(stateMock, depsMock, {
        storyId: 'test-story',
        sentenceId: tc.value,
        tokenId: tc.value,
        highlight: true,
      });

      expect(tokenSpan.classList.contains('word-token-highlighted')).toBe(true);
    });
  }
});
