/**
 * Scroll Position Store
 *
 * Singleton store that tracks scroll position and direction.
 * Used by NavBar and ParentLayout to stay synchronized.
 *
 * Why a store instead of a hook?
 * - Multiple components (NavBar, ParentLayout) need the same scroll state
 * - Independent hook instances can get out of sync during rAF timing
 * - This store ensures all subscribers receive updates at the same time
 */

import { useSyncExternalStore } from 'react';

const SCROLL_THRESHOLD_FOR_BACKGROUND = 20;
const SCROLL_THRESHOLD_FOR_HIDING = 80;
const MIN_SCROLL_DELTA_TO_TOGGLE = 5;

export interface ScrollState {
  scrollY: number;
  isAtPageTop: boolean;
  isHiddenByScroll: boolean;
}

type ScrollListener = () => void;

let scrollState: ScrollState = {
  scrollY: 0,
  isAtPageTop: true,
  isHiddenByScroll: false,
};

let lastScrollY = 0;
let isHidden = false;
let rafId = 0;
const listeners = new Set<ScrollListener>();

const emitChange = (): void => {
  listeners.forEach((listener) => listener());
};

const getScrollState = (): ScrollState => scrollState;

const subscribeScroll = (listener: ScrollListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const processScroll = (): void => {
  const currentY = Math.max(window.scrollY, document.documentElement.scrollTop, 0);
  const delta = currentY - lastScrollY;
  const absDelta = Math.abs(delta);
  const nearTop = currentY <= SCROLL_THRESHOLD_FOR_BACKGROUND;

  let nextHidden = isHidden;

  if (currentY <= SCROLL_THRESHOLD_FOR_HIDING) {
    nextHidden = false;
  } else if (absDelta >= MIN_SCROLL_DELTA_TO_TOGGLE) {
    nextHidden = delta > 0;
  }

  const nextState: ScrollState = {
    scrollY: currentY,
    isAtPageTop: nearTop,
    isHiddenByScroll: nextHidden,
  };

  // Only emit if state actually changed
  const hasChanged =
    scrollState.scrollY !== nextState.scrollY ||
    scrollState.isAtPageTop !== nextState.isAtPageTop ||
    scrollState.isHiddenByScroll !== nextState.isHiddenByScroll;

  if (hasChanged) {
    scrollState = nextState;
    isHidden = nextHidden;
    emitChange();
  }

  lastScrollY = currentY;
  rafId = 0;
};

const onScroll = (): void => {
  if (rafId) return;
  rafId = requestAnimationFrame(processScroll);
};

const initializeScrollListener = (): void => {
  // Initialize scroll position on first subscribe
  if (listeners.size === 1) {
    const initialY = Math.max(window.scrollY, document.documentElement.scrollTop, 0);
    lastScrollY = initialY;
    scrollState = {
      scrollY: initialY,
      isAtPageTop: initialY <= SCROLL_THRESHOLD_FOR_BACKGROUND,
      isHiddenByScroll: false,
    };
    isHidden = false;
    window.addEventListener('scroll', onScroll, { passive: true });
  }
};

const cleanupScrollListener = (): void => {
  if (listeners.size === 0) {
    window.removeEventListener('scroll', onScroll);
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    // Reset state for next mount cycle
    lastScrollY = 0;
    isHidden = false;
    scrollState = {
      scrollY: 0,
      isAtPageTop: true,
      isHiddenByScroll: false,
    };
  }
};

const subscribe = (listener: ScrollListener): (() => void) => {
  initializeScrollListener();
  const unsubscribe = subscribeScroll(listener);
  return () => {
    unsubscribe();
    cleanupScrollListener();
  };
};

/**
 * Hook to access scroll state.
 * All components using this hook receive synchronized updates.
 */
const useScrollStore = (): ScrollState => {
  return useSyncExternalStore(subscribe, getScrollState, getScrollState);
};

export const scrollStore = {
  getState: getScrollState,
  subscribe,
};

export { useScrollStore };
