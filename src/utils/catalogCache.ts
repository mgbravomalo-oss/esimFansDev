import { Destination, EsimPlan } from '../types';

interface CachedDestinationsPayload {
  destinations: Destination[];
  totalPlans?: number;
  databaseName?: string;
  isDbConnected?: boolean;
  timestamp: number;
}

interface CachedPlansPayload {
  plans: EsimPlan[];
  timestamp: number;
}

const DESTINATIONS_CACHE_KEY = 'wappa_catalog_destinations_v6';
const PLANS_CACHE_PREFIX = 'wappa_catalog_plans_v6_';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes max cache age
const STALE_REVALIDATE_TTL_MS = 2 * 60 * 1000; // 2 minutes before background revalidation

// In-Memory JS Heap Cache for 0ms instantaneous access within the session
let memoryDestinationsCache: CachedDestinationsPayload | null = null;
const memoryPlansCache = new Map<string, CachedPlansPayload>();

// Automatically clean up stale or contaminated legacy caches from previous versions
if (typeof window !== 'undefined') {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('wappa_catalog_') && !k.includes('_v4')) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Validates that cached plans belong to the requested country code
 */
function arePlansValidForCountry(countryCode: string, plans: EsimPlan[]): boolean {
  if (!Array.isArray(plans) || plans.length === 0) return false;
  const key = countryCode.toUpperCase().trim();
  // If the target is NOT Venezuela, but plans have Venezuela, it's contaminated cache
  if (key !== 'VE') {
    const hasWrongCountry = plans.some(p => p.countryCode === 'VE' || p.country === 'Venezuela');
    if (hasWrongCountry) return false;
  }
  return true;
}

/**
 * Retrieves cached destinations from memory or localStorage
 */
export function getCachedDestinations(): CachedDestinationsPayload | null {
  // 1. Check in-memory cache first (fastest)
  if (memoryDestinationsCache) {
    const age = Date.now() - memoryDestinationsCache.timestamp;
    if (age < CACHE_TTL_MS) {
      return memoryDestinationsCache;
    }
  }

  // 2. Check localStorage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(DESTINATIONS_CACHE_KEY);
      if (raw) {
        const parsed: CachedDestinationsPayload = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.destinations) && parsed.destinations.length > 0) {
          const age = Date.now() - (parsed.timestamp || 0);
          if (age < CACHE_TTL_MS) {
            memoryDestinationsCache = parsed;
            return parsed;
          }
        }
      }
    } catch {
      // Ignore localStorage read errors (e.g. private mode quota)
    }
  }

  return null;
}

/**
 * Saves destinations to both in-memory cache and localStorage
 */
export function setCachedDestinations(payload: {
  destinations: Destination[];
  totalPlans?: number;
  databaseName?: string;
  isDbConnected?: boolean;
}): void {
  const data: CachedDestinationsPayload = {
    destinations: payload.destinations,
    totalPlans: payload.totalPlans,
    databaseName: payload.databaseName,
    isDbConnected: payload.isDbConnected,
    timestamp: Date.now(),
  };

  memoryDestinationsCache = data;

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(DESTINATIONS_CACHE_KEY, JSON.stringify(data));
    } catch {
      // Ignore quota storage errors
    }
  }
}

/**
 * Checks if the cached destinations data is fresh or needs background revalidation
 */
export function isDestinationsCacheFresh(): boolean {
  const cached = getCachedDestinations();
  if (!cached) return false;
  const age = Date.now() - cached.timestamp;
  return age < STALE_REVALIDATE_TTL_MS;
}

/**
 * Retrieves cached plans for a specific country code
 */
export function getCachedPlansForCountry(countryCode: string): EsimPlan[] | null {
  const key = countryCode.toUpperCase().trim();
  
  // 1. Memory check
  const mem = memoryPlansCache.get(key);
  if (mem && Date.now() - mem.timestamp < CACHE_TTL_MS) {
    if (arePlansValidForCountry(key, mem.plans)) {
      return mem.plans;
    } else {
      memoryPlansCache.delete(key);
    }
  }

  // 2. LocalStorage check
  if (typeof window !== 'undefined') {
    try {
      const storageKey = `${PLANS_CACHE_PREFIX}${key}`;
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed: CachedPlansPayload = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.plans) && parsed.plans.length > 0) {
          if (Date.now() - parsed.timestamp < CACHE_TTL_MS && arePlansValidForCountry(key, parsed.plans)) {
            memoryPlansCache.set(key, parsed);
            return parsed.plans;
          } else {
            localStorage.removeItem(storageKey);
          }
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  return null;
}

/**
 * Saves plans for a specific country code in memory and localStorage
 */
export function setCachedPlansForCountry(countryCode: string, plans: EsimPlan[]): void {
  const key = countryCode.toUpperCase().trim();
  const payload: CachedPlansPayload = {
    plans,
    timestamp: Date.now(),
  };

  memoryPlansCache.set(key, payload);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${PLANS_CACHE_PREFIX}${key}`, JSON.stringify(payload));
    } catch {
      // Ignore quota storage errors
    }
  }
}

/**
 * Clear all catalog cache (e.g. after admin sync or manual refresh)
 */
export function clearCatalogCache(): void {
  memoryDestinationsCache = null;
  memoryPlansCache.clear();

  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(DESTINATIONS_CACHE_KEY);
      // Remove country plans keys
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PLANS_CACHE_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) {
        localStorage.removeItem(k);
      }
    } catch {
      // Ignore
    }

    try {
      window.dispatchEvent(new CustomEvent('app:catalog-cache-cleared'));
    } catch {
      // Ignore
    }
  }
}
