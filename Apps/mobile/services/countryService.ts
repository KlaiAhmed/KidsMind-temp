export interface CountryOption {
  code: string;
  name: string;
  flag: string;
}

export interface DetectedCountry {
  code: string;
  name: string;
}

const REST_COUNTRIES_ENDPOINT = 'https://restcountries.com/v3.1/all?fields=name,cca2,flag';
const IP_GEOLOCATION_ENDPOINT = 'https://ipapi.co/json/';
const COUNTRY_REQUEST_TIMEOUT_MS = 7000;
const GEOLOCATION_REQUEST_TIMEOUT_MS = 5000;
const ISO_ALPHA2_PATTERN = /^[A-Z]{2}$/;

export const COMMON_COUNTRY_CODES = [
  'US',
  'CA',
  'GB',
  'FR',
  'DE',
  'ES',
  'IT',
  'AE',
  'SA',
  'EG',
  'MA',
  'TN',
  'IN',
  'JP',
  'AU',
  'NZ',
] as const;

// Countries not yet supported - remove when services are available
export const BLOCKED_COUNTRIES = ['IL'] as const;

const FALLBACK_COUNTRIES: CountryOption[] = [
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'EG', name: 'Egypt', flag: '🇪🇬' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'MA', name: 'Morocco', flag: '🇲🇦' },
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'TN', name: 'Tunisia', flag: '🇹🇳' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
];

let countryCache: CountryOption[] | null = null;
let countryFetchPromise: Promise<CountryOption[]> | null = null;

function toCountryFlag(alpha2Code: string): string {
  const normalizedCode = alpha2Code.trim().toUpperCase();

  if (!ISO_ALPHA2_PATTERN.test(normalizedCode)) {
    return '🏳️';
  }

  const baseCodePoint = 0x1f1e6;
  return normalizedCode
    .split('')
    .map((char) => String.fromCodePoint(baseCodePoint + char.charCodeAt(0) - 65))
    .join('');
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function sortCountries(countries: CountryOption[]): CountryOption[] {
  return [...countries].sort((left, right) =>
    left.name.localeCompare(right.name, 'en', { sensitivity: 'base' })
  );
}

function normalizeCountry(input: unknown): CountryOption | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }

  const record = input as {
    cca2?: unknown;
    flag?: unknown;
    name?: { common?: unknown } | null;
  };

  const code = typeof record.cca2 === 'string' ? record.cca2.trim().toUpperCase() : '';
  const name = typeof record.name?.common === 'string' ? record.name.common.trim() : '';

  if (!ISO_ALPHA2_PATTERN.test(code) || !name) {
    return null;
  }

  const flag = typeof record.flag === 'string' && record.flag.trim().length > 0
    ? record.flag.trim()
    : toCountryFlag(code);

  return {
    code,
    name,
    flag,
  };
}

async function fetchCountriesFromApi(): Promise<CountryOption[]> {
  const payload = await fetchJsonWithTimeout(REST_COUNTRIES_ENDPOINT, COUNTRY_REQUEST_TIMEOUT_MS);

  if (!Array.isArray(payload)) {
    throw new Error('Countries payload must be an array');
  }

  const countryMap = new Map<string, CountryOption>();

  for (const entry of payload) {
    const normalizedCountry = normalizeCountry(entry);

    if (!normalizedCountry) {
      continue;
    }

    countryMap.set(normalizedCountry.code, normalizedCountry);
  }

  if (countryMap.size === 0) {
    throw new Error('Countries payload was empty after normalization');
  }

  return sortCountries(Array.from(countryMap.values()));
}

export async function getCountryOptions(): Promise<CountryOption[]> {
  if (countryCache) {
    return countryCache;
  }

  if (countryFetchPromise) {
    return countryFetchPromise;
  }

  countryFetchPromise = (async () => {
    try {
      const allCountries = await fetchCountriesFromApi();
      // Filter out blocked countries
      countryCache = allCountries.filter(
        (country) => !BLOCKED_COUNTRIES.includes(country.code as typeof BLOCKED_COUNTRIES[number])
      );
      return countryCache;
    } catch {
      countryCache = sortCountries(FALLBACK_COUNTRIES);
      // Also filter blocked countries from fallback
      countryCache = countryCache.filter(
        (country) => !BLOCKED_COUNTRIES.includes(country.code as typeof BLOCKED_COUNTRIES[number])
      );
      return countryCache;
    } finally {
      countryFetchPromise = null;
    }
  })();

  return countryFetchPromise;
}

export async function detectCountryByIp(): Promise<DetectedCountry | null> {
  try {
    const payload = await fetchJsonWithTimeout(IP_GEOLOCATION_ENDPOINT, GEOLOCATION_REQUEST_TIMEOUT_MS);

    if (typeof payload !== 'object' || payload === null) {
      return null;
    }

    const record = payload as {
      country_code?: unknown;
      country_name?: unknown;
    };

    const code = typeof record.country_code === 'string' ? record.country_code.trim().toUpperCase() : '';

    if (!ISO_ALPHA2_PATTERN.test(code)) {
      return null;
    }

    const name = typeof record.country_name === 'string' ? record.country_name.trim() : '';

    return {
      code,
      name,
    };
  } catch {
    return null;
  }
}
