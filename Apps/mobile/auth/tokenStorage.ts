import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const REFRESH_TOKEN_KEY = 'kidsmind.refresh_token';
const ONBOARDING_KEY = 'kidsmind.onboarding';
let inMemoryRefreshToken: string | null = null;
let inMemoryOnboarding: string | null = null;

function hasSecureStoreMethods(): boolean {
  return (
    typeof SecureStore.getItemAsync === 'function' &&
    typeof SecureStore.setItemAsync === 'function' &&
    typeof SecureStore.deleteItemAsync === 'function'
  );
}

function getWebLocalStorage(): Storage | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }

  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

async function setFallbackToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    const storage = getWebLocalStorage();
    if (storage) {
      storage.setItem(REFRESH_TOKEN_KEY, token);
    }
    inMemoryRefreshToken = token;
    return;
  }

  inMemoryRefreshToken = token;
}

async function getFallbackToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    const storage = getWebLocalStorage();
    if (storage) {
      const value = storage.getItem(REFRESH_TOKEN_KEY);
      inMemoryRefreshToken = value;
      return value;
    }
  }

  return inMemoryRefreshToken;
}

async function clearFallbackToken(): Promise<void> {
  if (Platform.OS === 'web') {
    const storage = getWebLocalStorage();
    if (storage) {
      storage.removeItem(REFRESH_TOKEN_KEY);
    }
  }

  inMemoryRefreshToken = null;
}

export async function saveRefreshToken(token: string): Promise<void> {
  if (hasSecureStoreMethods()) {
    try {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
      return;
    } catch {
      // Fallback covers web and non-native environments where SecureStore is unavailable.
    }
  }

  await setFallbackToken(token);
}

export async function getRefreshToken(): Promise<string | null> {
  if (hasSecureStoreMethods()) {
    try {
      return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    } catch {
      // Fallback covers web and non-native environments where SecureStore is unavailable.
    }
  }

  return getFallbackToken();
}

export async function clearRefreshToken(): Promise<void> {
  if (hasSecureStoreMethods()) {
    try {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      return;
    } catch {
      // Fallback covers web and non-native environments where SecureStore is unavailable.
    }
  }

  await clearFallbackToken();
}

export async function saveOnboardingFlag(hasChildProfile: boolean): Promise<void> {
  const value = hasChildProfile ? 'true' : 'false';
  if (hasSecureStoreMethods()) {
    try {
      await SecureStore.setItemAsync(ONBOARDING_KEY, value);
      inMemoryOnboarding = value;
      return;
    } catch {
      // Fallback
    }
  }
  if (Platform.OS === 'web') {
    const storage = getWebLocalStorage();
    if (storage) {
      storage.setItem(ONBOARDING_KEY, value);
    }
  }
  inMemoryOnboarding = value;
}

export async function getOnboardingFlag(): Promise<boolean | null> {
  if (hasSecureStoreMethods()) {
    try {
      const value = await SecureStore.getItemAsync(ONBOARDING_KEY);
      if (value !== null) {
        inMemoryOnboarding = value;
        return value === 'true';
      }
    } catch {
      // Fallback
    }
  }
  if (Platform.OS === 'web') {
    const storage = getWebLocalStorage();
    if (storage) {
      const value = storage.getItem(ONBOARDING_KEY);
      if (value !== null) {
        inMemoryOnboarding = value;
        return value === 'true';
      }
    }
  }
  if (inMemoryOnboarding !== null) {
    return inMemoryOnboarding === 'true';
  }
  return null;
}

export async function clearOnboardingFlag(): Promise<void> {
  if (hasSecureStoreMethods()) {
    try {
      await SecureStore.deleteItemAsync(ONBOARDING_KEY);
      inMemoryOnboarding = null;
      return;
    } catch {
      // Fallback
    }
  }
  if (Platform.OS === 'web') {
    const storage = getWebLocalStorage();
    if (storage) {
      storage.removeItem(ONBOARDING_KEY);
    }
  }
  inMemoryOnboarding = null;
}