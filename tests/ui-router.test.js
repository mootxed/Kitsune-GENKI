import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initRouter, nav, getCurrentRoute } from '../ui/router.js';
import { Router } from '../router.js';

describe('ui/router.js initRouter integration', () => {
  let userDictHandler;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="srs-tabs-container">
        <button class="lib-tab" data-tab="repetition">Повторение</button>
        <button class="lib-tab" data-tab="user-dictionaries">Словари</button>
      </div>
      <section class="screen hidden" id="screen-home"></section>
      <section class="screen hidden" id="screen-srs"></section>
      <section class="screen hidden" id="screen-user-dictionaries"></section>
    `;

    userDictHandler = vi.fn();
  });

  it('initRouter() returns a Router instance', () => {
    const instance = initRouter({
      home: vi.fn(),
      srs: vi.fn(),
      'user-dictionaries': userDictHandler,
    });

    expect(instance).toBeDefined();
    expect(instance).toBeInstanceOf(Router);
    expect(window.router).toBe(instance);
  });

  it('click on user-dictionaries tab calls router.navigate and opens screen-user-dictionaries without exception', () => {
    const routerInstance = initRouter({
      home: vi.fn(),
      srs: vi.fn(),
      'user-dictionaries': userDictHandler,
    });

    expect(() => {
      routerInstance.navigate('user-dictionaries');
    }).not.toThrow();

    expect(userDictHandler).toHaveBeenCalledTimes(1);
    expect(getCurrentRoute()).toBe('user-dictionaries');

    const screen = document.getElementById('screen-user-dictionaries');
    expect(screen.classList.contains('hidden')).toBe(false);
  });

  it('nav("user-dictionaries") function works correctly', () => {
    initRouter({
      home: vi.fn(),
      srs: vi.fn(),
      'user-dictionaries': userDictHandler,
    });

    nav('user-dictionaries');
    expect(userDictHandler).toHaveBeenCalledTimes(1);
    expect(getCurrentRoute()).toBe('user-dictionaries');
  });
});
