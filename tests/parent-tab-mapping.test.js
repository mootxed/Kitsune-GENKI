/* tests/parent-tab-mapping.test.js */
import { describe, it, expect } from 'vitest';
import { getParentTab, resolveActiveNavigationTab } from '../router.js';

describe('Router Parent Tab Mapping and Single Active Tab Resolution', () => {
  it('1. Maps nested routes to parent navigation tabs correctly', () => {
    expect(getParentTab('dictionary')).toBe('srs');
    expect(getParentTab('user-dictionaries')).toBe('srs');
    expect(getParentTab('word-details')).toBe('srs');
    expect(getParentTab('word-details', 'dictionary')).toBe('srs');

    expect(getParentTab('ai-story')).toBe('sensei');
    expect(getParentTab('crossword')).toBe('sensei');
    expect(getParentTab('word-search')).toBe('sensei');

    expect(getParentTab('story')).toBe('library');
    expect(getParentTab('course')).toBe('library');
    expect(getParentTab('chapter')).toBe('library');

    expect(getParentTab('quests')).toBe('profile');
    expect(getParentTab('statistics')).toBe('profile');
    expect(getParentTab('settings')).toBe('profile');
    expect(getParentTab('shop')).toBe('profile');
    expect(getParentTab('dev-tools')).toBe('profile');

    expect(getParentTab('plan')).toBe('home');
    expect(getParentTab('home')).toBe('home');
    expect(getParentTab('srs')).toBe('srs');
  });

  it('2. Resolves single direct tab on desktop when direct tab is visible', () => {
    document.body.innerHTML = `
      <div class="sidebar">
        <button class="tab" data-nav="srs">SRS</button>
        <button class="tab" data-nav="dictionary">Dictionary</button>
      </div>
    `;

    const activeTab = resolveActiveNavigationTab('dictionary');
    expect(activeTab).not.toBeNull();
    expect(activeTab.dataset.nav).toBe('dictionary');
  });

  it('3. Resolves parent tab on mobile when direct tab is hidden', () => {
    document.body.innerHTML = `
      <div class="mobile-bottom-nav">
        <button class="tab" data-nav="srs">SRS</button>
        <button class="tab hidden" data-nav="dictionary">Dictionary</button>
      </div>
    `;

    const activeTab = resolveActiveNavigationTab('dictionary');
    expect(activeTab).not.toBeNull();
    expect(activeTab.dataset.nav).toBe('srs');
  });
});
