/* tests/parent-tab-mapping.test.js */
import { describe, it, expect } from 'vitest';
import { getParentTab } from '../router.js';

describe('Router Parent Tab Mapping', () => {
  it('1. Maps nested routes to parent navigation tabs correctly', () => {
    expect(getParentTab('dictionary')).toBe('srs');
    expect(getParentTab('user-dictionaries')).toBe('srs');
    expect(getParentTab('ai-story')).toBe('sensei');
    expect(getParentTab('crossword')).toBe('sensei');
    expect(getParentTab('word-search')).toBe('sensei');
    expect(getParentTab('story')).toBe('library');
    expect(getParentTab('quests')).toBe('profile');
    expect(getParentTab('statistics')).toBe('profile');
    expect(getParentTab('settings')).toBe('profile');
    expect(getParentTab('shop')).toBe('profile');
    expect(getParentTab('home')).toBe('home');
    expect(getParentTab('srs')).toBe('srs');
  });
});
