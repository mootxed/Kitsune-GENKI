import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Router } from '../router.js';

describe('Router minigame cleanup logic', () => {
  let router;

  beforeEach(() => {
    document.body.innerHTML = `
      <section class="screen hidden" id="screen-home"></section>
      <section class="screen hidden" id="screen-profile"></section>
      <section class="screen hidden" id="screen-word-search"></section>
      <section class="screen hidden" id="screen-crossword"></section>
    `;
    router = new Router();
    window.cleanupWordSearch = vi.fn();
    window.cleanupCrossword = vi.fn();
  });

  afterEach(() => {
    delete window.cleanupWordSearch;
    delete window.cleanupCrossword;
  });

  it('does NOT call minigame cleanup when navigating between non-minigame screens', () => {
    router.navigate('home');
    expect(router.currentScreen).toBe('home');

    window.cleanupWordSearch.mockClear();
    window.cleanupCrossword.mockClear();

    router.navigate('profile');

    expect(window.cleanupWordSearch).not.toHaveBeenCalled();
    expect(window.cleanupCrossword).not.toHaveBeenCalled();
  });

  it('calls cleanupWordSearch when leaving word-search screen', () => {
    router.navigate('word-search');
    expect(router.currentScreen).toBe('word-search');

    window.cleanupWordSearch.mockClear();
    window.cleanupCrossword.mockClear();

    router.navigate('home');

    expect(window.cleanupWordSearch).toHaveBeenCalledTimes(1);
    expect(window.cleanupCrossword).not.toHaveBeenCalled();
  });

  it('calls cleanupCrossword when leaving crossword screen', () => {
    router.navigate('crossword');
    expect(router.currentScreen).toBe('crossword');

    window.cleanupWordSearch.mockClear();
    window.cleanupCrossword.mockClear();

    router.navigate('home');

    expect(window.cleanupCrossword).toHaveBeenCalledTimes(1);
    expect(window.cleanupWordSearch).not.toHaveBeenCalled();
  });

  it('does NOT call cleanupWordSearch when staying on or re-navigating to word-search', () => {
    router.navigate('word-search');
    window.cleanupWordSearch.mockClear();

    router.navigate('word-search');
    expect(window.cleanupWordSearch).not.toHaveBeenCalled();
  });
});

describe('Router screen visibility and invariant logic', () => {
  let router;
  let onboardingScreen, homeScreen, planScreen;

  beforeEach(() => {
    document.body.innerHTML = `
      <section class="screen hidden" id="screen-onboarding"></section>
      <section class="screen hidden" id="screen-home"></section>
      <section class="screen hidden" id="screen-plan"></section>
    `;
    router = new Router();
    onboardingScreen = document.getElementById('screen-onboarding');
    homeScreen = document.getElementById('screen-home');
    planScreen = document.getElementById('screen-plan');
  });

  it('correctly toggles screen visibility and maintains exactly one visible screen', () => {
    router.navigate('onboarding');

    expect(onboardingScreen.classList.contains('hidden')).toBe(false);
    expect(homeScreen.classList.contains('hidden')).toBe(true);
    expect(planScreen.classList.contains('hidden')).toBe(true);
    expect(document.querySelectorAll('.screen:not(.hidden)').length).toBe(1);

    router.navigate('home');

    expect(homeScreen.classList.contains('hidden')).toBe(false);
    expect(onboardingScreen.classList.contains('hidden')).toBe(true);
    expect(planScreen.classList.contains('hidden')).toBe(true);
    expect(document.querySelectorAll('.screen:not(.hidden)').length).toBe(1);

    router.navigate('plan');

    expect(planScreen.classList.contains('hidden')).toBe(false);
    expect(onboardingScreen.classList.contains('hidden')).toBe(true);
    expect(homeScreen.classList.contains('hidden')).toBe(true);
    expect(document.querySelectorAll('.screen:not(.hidden)').length).toBe(1);
  });
});
