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
 * In-flight prefetch promises map to prevent duplicate requests
 */
const inFlightPrefetches = new Map<string, Promise<EsimPlan[] | null>>();

/**
 * Prefetches and caches plans for a country in the background.
 * Safe, deduplicated, and silent: joins in-flight requests and avoids duplicate network hits.
 */
export async function prefetchPlansForCountry(countryCode: string): Promise<EsimPlan[] | null> {
  if (!countryCode) return null;
  const key = countryCode.toUpperCase().trim();

  // 1. If already cached and valid, return immediately
  const existing = getCachedPlansForCountry(key);
  if (existing && existing.length > 0) {
    return existing;
  }

  // 2. If a prefetch is already in flight for this country, join it
  if (inFlightPrefetches.has(key)) {
    return inFlightPrefetches.get(key)!;
  }

  // 3. Initiate background fetch
  const fetchPromise = (async () => {
    try {
      const res = await fetch(`/api/plans?countryCode=${encodeURIComponent(key)}&_t=${Date.now()}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data && data.success && Array.isArray(data.plans) && data.plans.length > 0) {
        const isTargetNotVe = key !== 'VE';
        const validPlans = isTargetNotVe
          ? data.plans.filter((p: EsimPlan) => p.countryCode !== 'VE' && p.country !== 'Venezuela')
          : data.plans;

        if (validPlans.length > 0) {
          setCachedPlansForCountry(key, validPlans);
          return validPlans;
        }
      }
      return null;
    } catch {
      return null;
    } finally {
      inFlightPrefetches.delete(key);
    }
  })();

  inFlightPrefetches.set(key, fetchPromise);
  return fetchPromise;
}

/**
 * Prefetches plans for a list of initial/popular destinations smoothly in the background
 */
export function prefetchInitialDestinations(countryCodes: string[]): void {
  if (!Array.isArray(countryCodes) || countryCodes.length === 0) return;

  const runQueue = () => {
    const queue = countryCodes.slice(0, 8); // Top 8 visible destinations
    let delay = 0;
    for (const code of queue) {
      setTimeout(() => {
        prefetchPlansForCountry(code);
      }, delay);
      delay += 250; // Stagger by 250ms so network stays buttery smooth
    }
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as any).requestIdleCallback(runQueue, { timeout: 2500 });
  } else {
    setTimeout(runQueue, 1000);
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
