import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Search, 
  Globe, 
  Flame, 
  Shield, 
  Wifi, 
  Zap, 
  Check, 
  ArrowRight, 
  ArrowLeft,
  Smartphone, 
  Sparkles, 
  X, 
  Database, 
  Loader2, 
  RefreshCw, 
  Infinity as InfinityIcon,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  AlertCircle,
  Gauge,
  RotateCcw,
  Info
} from 'lucide-react';
import { Destination, EsimPlan } from '../types';
import { DESTINATIONS as FALLBACK_DESTINATIONS, ESIM_PLANS as FALLBACK_PLANS, resolveDestinationCoveredCountries } from '../data/esimData';
import { scrollSearchToTopSlow } from '../utils/scrollHelper';
import { CountryFlag } from './CountryFlag';
import {
  getCachedDestinations,
  setCachedDestinations,
  isDestinationsCacheFresh,
  getCachedPlansForCountry,
  setCachedPlansForCountry,
  prefetchPlansForCountry,
  prefetchInitialDestinations,
} from '../utils/catalogCache';

// Search aliases: dialing prefixes (e.g. "57", "+57" -> CO) and famous cities (e.g. "quito" -> EC, "cancun" -> MX)
const CATALOG_SEARCH_ALIASES: Record<string, string> = {
  // International dialing codes
  '57': 'CO', '+57': 'CO', '0057': 'CO',
  '593': 'EC', '+593': 'EC', '00593': 'EC',
  '52': 'MX', '+52': 'MX', '0052': 'MX',
  '34': 'ES', '+34': 'ES', '0034': 'ES',
  '1': 'US', '+1': 'US', '001': 'US',
  '54': 'AR', '+54': 'AR',
  '56': 'CL', '+56': 'CL',
  '51': 'PE', '+51': 'PE',
  '58': 'VE', '+58': 'VE',
  '506': 'CR', '+506': 'CR',
  '507': 'PA', '+507': 'PA',
  '502': 'GT', '+502': 'GT',
  '503': 'SV', '+503': 'SV',
  '504': 'HN', '+504': 'HN',
  '505': 'NI', '+505': 'NI',
  '591': 'BO', '+591': 'BO',
  '595': 'PY', '+595': 'PY',
  '598': 'UY', '+598': 'UY',
  '55': 'BR', '+55': 'BR',
  '33': 'FR', '+33': 'FR',
  '39': 'IT', '+39': 'IT',
  '49': 'DE', '+49': 'DE',
  '44': 'GB', '+44': 'GB',
  '351': 'PT', '+351': 'PT',
  '41': 'CH', '+41': 'CH',
  '81': 'JP', '+81': 'JP',
  '82': 'KR', '+82': 'KR',
  '86': 'CN', '+86': 'CN',
  '90': 'TR', '+90': 'TR',
  '971': 'AE', '+971': 'AE',
  '62': 'ID', '+62': 'ID',
  '66': 'TH', '+66': 'TH',
  '61': 'AU', '+61': 'AU',
  // Famous cities
  'quito': 'EC', 'guayaquil': 'EC', 'cuenca': 'EC', 'galapagos': 'EC', 'manta': 'EC',
  'bogota': 'CO', 'bogotá': 'CO', 'medellin': 'CO', 'medellín': 'CO', 'cartagena': 'CO', 'cali': 'CO', 'barranquilla': 'CO',
  'cancun': 'MX', 'cancún': 'MX', 'cdmx': 'MX', 'guadalajara': 'MX', 'monterrey': 'MX', 'tulum': 'MX', 'playadelcarmen': 'MX',
  'madrid': 'ES', 'barcelona': 'ES', 'valencia': 'ES', 'sevilla': 'ES', 'malaga': 'ES', 'málaga': 'ES', 'ibiza': 'ES', 'mallorca': 'ES',
  'paris': 'FR', 'parís': 'FR', 'niza': 'FR', 'lyon': 'FR',
  'roma': 'IT', 'milan': 'IT', 'milán': 'IT', 'venecia': 'IT', 'florencia': 'IT',
  'nuevayork': 'US', 'newyork': 'US', 'miami': 'US', 'orlando': 'US', 'losangeles': 'US',
  'tokio': 'JP', 'tokyo': 'JP', 'kioto': 'JP', 'kyoto': 'JP', 'osaka': 'JP',
  'buenosaires': 'AR', 'cordoba': 'AR', 'córdoba': 'AR', 'mendoza': 'AR', 'bariloche': 'AR',
  'santiago': 'CL', 'valparaiso': 'CL', 'valparaíso': 'CL',
  'lima': 'PE', 'cusco': 'PE', 'cuzco': 'PE', 'arequipa': 'PE',
  'londres': 'GB', 'london': 'GB',
  'berlin': 'DE', 'berlín': 'DE', 'munich': 'DE', 'múnich': 'DE',
  'estambul': 'TR', 'istanbul': 'TR',
  'bangkok': 'TH', 'phuket': 'TH',
  'dubai': 'AE', 'dubaí': 'AE', 'dubaï': 'AE', 'abudhabi': 'AE',
  'amsterdam': 'NL', 'ámsterdam': 'NL', 'lisboa': 'PT', 'porto': 'PT', 'oporto': 'PT',
  'zurich': 'CH', 'zúrich': 'CH', 'ginebra': 'CH', 'atenas': 'GR', 'bali': 'ID'
};

/**
 * Normaliza una cadena para búsquedas insensibles a mayúsculas, espacios y acentos/diacríticos
 */
const normalizeSearchText = (str: string = ''): string => {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');
};

/**
 * Detecta si un destino es multipaís
 */
const isDestinationMultiCountry = (dest: Destination): boolean => {
  if (dest.isMultiCountry) return true;
  if (typeof dest.coveredCountriesCount === 'number' && dest.coveredCountriesCount > 1) return true;
  if (dest.coveredCountries && dest.coveredCountries.length > 1) return true;
  return false;
};

/**
 * Obtiene el total de países cubiertos por el destino
 */
const getDestinationCountryCount = (dest: Destination): number => {
  if (typeof dest.coveredCountriesCount === 'number' && dest.coveredCountriesCount > 0) {
    return dest.coveredCountriesCount;
  }
  if (dest.coveredCountries && dest.coveredCountries.length > 0) {
    return dest.coveredCountries.length;
  }
  if (dest.isMultiCountry) return 2;
  return 1;
};

/**
 * Obtiene el código de país asociado a un alias
 */
const getMatchedAliasCountry = (query: string): string | undefined => {
  const clean = query.trim().toLowerCase().replace(/\s+/g, '');
  const norm = normalizeSearchText(query);
  if (CATALOG_SEARCH_ALIASES[clean]) return CATALOG_SEARCH_ALIASES[clean];
  if (CATALOG_SEARCH_ALIASES[norm]) return CATALOG_SEARCH_ALIASES[norm];
  for (const [key, countryCode] of Object.entries(CATALOG_SEARCH_ALIASES)) {
    if (normalizeSearchText(key) === norm) {
      return countryCode;
    }
  }
  return undefined;
};

interface DestinationsCatalogProps {
  onSelectPlanForPurchase: (plan: EsimPlan) => void;
  onOpenAdvisor: () => void;
  catalogCloseTrigger?: number;
}

type SortOption = 'popular' | 'name_asc' | 'price_asc' | 'plans_desc';
type ViewMode = 'grid' | 'list';

export const DestinationsCatalog: React.FC<DestinationsCatalogProps> = ({
  onSelectPlanForPurchase,
  onOpenAdvisor,
  catalogCloseTrigger
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('popular');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(12);
  const [activeDestination, setActiveDestination] = useState<Destination | null>(null);

  // Modo búsqueda enfocada en móviles: oculta todo para dar máximo espacio a los resultados
  const [isMobileSearchActive, setIsMobileSearchActive] = useState<boolean>(false);
  const mobileSearchActivatedAtRef = React.useRef<number>(0);

  const handleExitMobileSearch = () => {
    setIsMobileSearchActive(false);
    setSearchTerm('');
    const input = document.getElementById('catalog-search-input') as HTMLInputElement | null;
    if (input) input.blur();
  };

  const handleSelectDestination = (dest: Destination) => {
    // Si la búsqueda móvil acaba de activarse hace menos de 450ms, ignorar clic sintético del navegador
    if (Date.now() - mobileSearchActivatedAtRef.current < 450) {
      return;
    }
    setActiveDestination(dest);
  };

  // Hover & Touch Predictive Prefetcher (Mouse hover & mobile finger touch)
  const hoverPrefetchTimeoutRef = useRef<Record<string, any>>({});

  const handleDestinationHoverStart = useCallback((dest: Destination) => {
    if (!dest || !dest.code) return;
    const code = dest.code;
    
    // Clear any pending cancellation
    if (hoverPrefetchTimeoutRef.current[code]) {
      clearTimeout(hoverPrefetchTimeoutRef.current[code]);
    }

    // 45ms intentional hover debounce to avoid flurries during fast cursor swiping
    hoverPrefetchTimeoutRef.current[code] = setTimeout(() => {
      prefetchPlansForCountry(code);
      delete hoverPrefetchTimeoutRef.current[code];
    }, 45);
  }, []);

  const handleDestinationHoverEnd = useCallback((dest: Destination) => {
    if (!dest || !dest.code) return;
    const code = dest.code;
    if (hoverPrefetchTimeoutRef.current[code]) {
      clearTimeout(hoverPrefetchTimeoutRef.current[code]);
      delete hoverPrefetchTimeoutRef.current[code];
    }
  }, []);

  const handleDestinationTouchStart = useCallback((dest: Destination) => {
    if (!dest || !dest.code) return;
    // On mobile touch, trigger immediately on touchstart so network request is in-flight before touchend/click
    prefetchPlansForCountry(dest.code);
  }, []);

  // Broadcast search state for Navbar and FAB to collapse on mobile
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('app:mobile-search-state', {
        detail: { active: isMobileSearchActive },
      })
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent('app:mobile-search-state', {
          detail: { active: false },
        })
      );
    };
  }, [isMobileSearchActive]);

  // Tecla Escape para salir de búsqueda móvil
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileSearchActive) {
        setIsMobileSearchActive(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileSearchActive]);

  // Close destination modal if triggered by parent or global close event
  useEffect(() => {
    if (catalogCloseTrigger && catalogCloseTrigger > 0) {
      setActiveDestination(null);
    }
  }, [catalogCloseTrigger]);

  useEffect(() => {
    const handleCloseAll = () => {
      setActiveDestination(null);
    };
    window.addEventListener('app:close-all-modals', handleCloseAll);
    return () => window.removeEventListener('app:close-all-modals', handleCloseAll);
  }, []);

  // Dynamic MongoDB Atlas data with instant cache initialization
  const initialCache = getCachedDestinations();
  const [destinations, setDestinations] = useState<Destination[]>(() => initialCache?.destinations || FALLBACK_DESTINATIONS);
  const [totalAtlasPlans, setTotalAtlasPlans] = useState<number>(() => initialCache?.totalPlans || (FALLBACK_DESTINATIONS.length * 5));
  const [isLoadingDestinations, setIsLoadingDestinations] = useState<boolean>(() => !initialCache);
  const [isDbConnected, setIsDbConnected] = useState<boolean | null>(() => initialCache?.isDbConnected ?? null);
  const [dbStatusDetails, setDbStatusDetails] = useState<{
    databaseName?: string;
    hasUriConfigured?: boolean;
    totalPlans?: number;
    totalDestinations?: number;
    host?: string;
    diagnostics?: {
      isVercel?: boolean;
      uriDetectedPrefix?: string;
      uriLength?: number;
      dbNameEnv?: string;
      activeCollection?: string;
      lastError?: string | null;
    };
    error?: string | null;
  } | null>(() => initialCache?.databaseName ? { databaseName: initialCache.databaseName, totalPlans: initialCache.totalPlans, totalDestinations: initialCache.destinations.length } : null);
  
  // Destination plans loader
  const [destinationPlans, setDestinationPlans] = useState<EsimPlan[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState<boolean>(false);
  const [selectedPlanFilter, setSelectedPlanFilter] = useState<'all' | 'unlimited' | 'standard' | 'high_data'>('all');

  // Multi-country coverage state in modal
  const [showCountriesList, setShowCountriesList] = useState<boolean>(true);
  const [countrySearchTerm, setCountrySearchTerm] = useState<string>('');

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedRegion, sortBy, itemsPerPage]);

  const handleRegionHover = useCallback((region: string) => {
    let destsToPrefetch: Destination[] = [];
    if (region === 'popular') {
      destsToPrefetch = destinations.filter(d => d.popular).slice(0, 4);
    } else if (region !== 'all') {
      destsToPrefetch = destinations.filter(d => d.region === region).slice(0, 4);
    }
    if (destsToPrefetch.length > 0) {
      prefetchInitialDestinations(destsToPrefetch.map(d => d.code));
    }
  }, [destinations]);

  // Fetch all destinations from MongoDB Atlas (with Stale-While-Revalidate caching)
  useEffect(() => {
    let isMounted = true;

    async function loadCatalog(forceBackground = false) {
      const hasFreshCache = isDestinationsCacheFresh();
      
      // If we already have fresh cache within TTL, don't execute any network requests
      if (hasFreshCache && !forceBackground) {
        if (isMounted) setIsLoadingDestinations(false);
        return;
      }

      try {
        // Only show spinner if there is zero cached data
        if (!initialCache && !getCachedDestinations()) {
          setIsLoadingDestinations(true);
        }

        const destRes = await fetch('/api/destinations').catch(() => null);

        let dynamicDests: Destination[] | null = null;
        let isConnected = true;
        let totalPlansCount = 0;
        let dbName: string | undefined;

        if (destRes && destRes.ok) {
          const contentType = destRes.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const destData = await destRes.json();
            if (destData.success && Array.isArray(destData.destinations) && destData.destinations.length > 0) {
              dynamicDests = destData.destinations;
            }
            if (destData.isDbConnected !== undefined) {
              isConnected = Boolean(destData.isDbConnected);
            }
            if (destData.totalPlans) {
              totalPlansCount = destData.totalPlans;
            }
            if (destData.databaseName) {
              dbName = destData.databaseName;
              setDbStatusDetails(prev => ({
                ...prev,
                databaseName: destData.databaseName,
                totalPlans: destData.totalPlans,
                totalDestinations: destData.count,
              }));
            }
          }
        }

        if (isMounted) {
          if (dynamicDests && dynamicDests.length > 0) {
            setDestinations(dynamicDests);
            // Save to persistent client cache
            setCachedDestinations({
              destinations: dynamicDests,
              totalPlans: totalPlansCount,
              databaseName: dbName,
              isDbConnected: isConnected,
            });
          }
          setIsDbConnected(isConnected);
          if (totalPlansCount > 0) {
            setTotalAtlasPlans(totalPlansCount);
          }

          // If database is disconnected, lazily fetch detailed diagnostics in background without blocking initial render
          if (!isConnected) {
            fetch('/api/db/status')
              .then(res => res.json())
              .then(statusObj => {
                if (isMounted && statusObj) {
                  setIsDbConnected(Boolean(statusObj.isConnected));
                  setDbStatusDetails({
                    databaseName: statusObj.databaseName,
                    hasUriConfigured: statusObj.hasUriConfigured,
                    totalPlans: statusObj.totalPlans,
                    totalDestinations: statusObj.totalDestinations,
                    host: statusObj.host,
                    diagnostics: statusObj.diagnostics,
                    error: statusObj.error,
                  });
                }
              })
              .catch(() => {});
          }
        }
      } catch (err) {
        console.warn('Error loading dynamic destinations from MongoDB:', err);
        if (isMounted) {
          setIsDbConnected(false);
        }
      } finally {
        if (isMounted) setIsLoadingDestinations(false);
      }
    }

    loadCatalog();

    const handleReloadCatalog = () => {
      loadCatalog(true);
    };

    window.addEventListener('app:catalog-cache-cleared', handleReloadCatalog);
    window.addEventListener('app:database-switched', handleReloadCatalog);

    return () => {
      isMounted = false;
      window.removeEventListener('app:catalog-cache-cleared', handleReloadCatalog);
      window.removeEventListener('app:database-switched', handleReloadCatalog);
    };
  }, []);

  // Idle prefetch for the top popular destinations on initial load
  useEffect(() => {
    if (destinations && destinations.length > 0) {
      const topCodes = destinations.slice(0, 6).map(d => d.code);
      prefetchInitialDestinations(topCodes);
    }
  }, [destinations]);

  // Fetch plans when opening a destination modal (with instant per-country cache)
  useEffect(() => {
    if (!activeDestination) {
      setDestinationPlans([]);
      setCountrySearchTerm('');
      return;
    }

    setShowCountriesList(true);
    setCountrySearchTerm('');

    const code = activeDestination.code;
    const cachedPlans = getCachedPlansForCountry(code);
    
    // If cached plans exist, use them immediately with 0ms delay and no loading spinner
    if (cachedPlans && cachedPlans.length > 0) {
      setDestinationPlans(cachedPlans);
      setIsLoadingPlans(false);
      return;
    }

    let isMounted = true;
    async function loadPlansForDest(targetCode: string) {
      setIsLoadingPlans(true);
      try {
        const res = await fetch(`/api/plans?countryCode=${encodeURIComponent(targetCode)}&_t=${Date.now()}`);
        const data = await res.json();
        if (isMounted) {
          const isTargetNotVe = targetCode.toUpperCase() !== 'VE';
          const validPlans = (data.success && Array.isArray(data.plans))
            ? (isTargetNotVe ? data.plans.filter((p: EsimPlan) => p.countryCode !== 'VE' && p.country !== 'Venezuela') : data.plans)
            : [];

          if (validPlans.length > 0) {
            setDestinationPlans(validPlans);
            // Save to per-country client cache
            setCachedPlansForCountry(targetCode, validPlans);

            // Enrich activeDestination with coveredCountries if available in plans
            const planWithCoverage = validPlans.find(
              (p: EsimPlan) => Array.isArray(p.coveredCountries) && p.coveredCountries.length > 0
            );
            if (planWithCoverage && (!activeDestination?.coveredCountries || activeDestination.coveredCountries.length === 0)) {
              setActiveDestination(prev => prev ? {
                ...prev,
                isMultiCountry: true,
                coveredCountriesCount: planWithCoverage.coveredCountries?.length || prev.coveredCountriesCount,
                coveredCountries: planWithCoverage.coveredCountries
              } : null);
            }
          } else if (FALLBACK_PLANS[targetCode.toUpperCase()]) {
            const fallback = FALLBACK_PLANS[targetCode.toUpperCase()];
            setDestinationPlans(fallback);
            setCachedPlansForCountry(targetCode, fallback);
          } else {
            const fallback = generateFallbackPlans(activeDestination!);
            setDestinationPlans(fallback);
            setCachedPlansForCountry(targetCode, fallback);
          }
        }
      } catch {
        if (isMounted) {
          const fallback = FALLBACK_PLANS[targetCode.toUpperCase()] || generateFallbackPlans(activeDestination!);
          setDestinationPlans(fallback);
        }
      } finally {
        if (isMounted) setIsLoadingPlans(false);
      }
    }

    loadPlansForDest(code);
    return () => { isMounted = false; };
  }, [activeDestination?.code]);

  // Helper for generating dynamic fallback if needed
  function generateFallbackPlans(dest: Destination): EsimPlan[] {
    const code = dest.code;
    return [
      {
        id: `plan-${code.toLowerCase()}-1gb`,
        name: `${dest.name} Básico 1 GB`,
        country: dest.name,
        countryCode: code,
        flag: dest.flag,
        region: 'local',
        dataAmountGB: 1,
        isUnlimited: false,
        validityDays: 7,
        priceEUR: dest.startingPriceEUR || 4.5,
        operator: dest.topOperators[0] || 'Red Local 5G',
        network5G: true,
        apn: 'globaldata',
        voiceAndSms: false,
        tetheringSupported: true,
        coverageDetails: 'Cobertura nacional en alta velocidad con entrega instantánea.',
      },
      {
        id: `plan-${code.toLowerCase()}-5gb`,
        name: `${dest.name} Estándar 5 GB`,
        country: dest.name,
        countryCode: code,
        flag: dest.flag,
        region: 'local',
        dataAmountGB: 5,
        isUnlimited: false,
        validityDays: 30,
        priceEUR: Number(((dest.startingPriceEUR || 4.5) * 2.2).toFixed(2)),
        operator: dest.topOperators[0] || 'Red Local 5G',
        network5G: true,
        apn: 'globaldata',
        voiceAndSms: false,
        tetheringSupported: true,
        coverageDetails: 'Paquete recomendado para viajes de 2 a 4 semanas.',
        popular: true,
      },
    ];
  }

  // Handler for selecting region tags: clears search term so it is not taken into account
  const handleSelectRegion = (region: string) => {
    setSelectedRegion(region);
    setSearchTerm('');
  };

  // Desplaza suave y lentamente la pantalla lo más arriba posible (dejando el buscador al tope de la vista)
  const scrollToSearchTop = (duration = 800) => {
    scrollSearchToTopSlow(duration);
  };

  // Filtered and Sorted destinations list
  const sortedAndFilteredDestinations = useMemo(() => {
    // Normalizar término de búsqueda sin acentos ni signos diacríticos
    const normSearch = normalizeSearchText(searchTerm);
    const cleanSearch = searchTerm.replace(/\s+/g, '').toLowerCase();
    // No tomar en cuenta el campo búsqueda cuando se selecciona un tag específico (popular, europa, asia, etc.)
    const isTagSelected = selectedRegion !== 'all';

    const filtered = destinations.filter(dest => {
      if (!isTagSelected && normSearch) {
        const nameNorm = normalizeSearchText(dest.name);
        const codeNorm = normalizeSearchText(dest.code);
        const regionNorm = normalizeSearchText(dest.regionLabel);
        const matchedAliasCountry = getMatchedAliasCountry(searchTerm);
        const matchesAlias = matchedAliasCountry ? dest.code.toUpperCase() === matchedAliasCountry : false;
        
        const matchesCountryCoverage = Boolean(dest.coveredCountries?.some(c => {
          const cNameNorm = normalizeSearchText(c.name);
          const cCodeNorm = normalizeSearchText(c.code);
          return (
            cNameNorm.includes(normSearch) ||
            cCodeNorm.includes(normSearch) ||
            (c.operators && c.operators.some(op => normalizeSearchText(op).includes(normSearch)))
          );
        }));

        const matchesSearch =
          matchesAlias ||
          nameNorm.includes(normSearch) ||
          codeNorm.includes(normSearch) ||
          regionNorm.includes(normSearch) ||
          matchesCountryCoverage ||
          dest.topOperators.some(op => normalizeSearchText(op).includes(normSearch)) ||
          dest.name.replace(/\s+/g, '').toLowerCase().includes(cleanSearch) ||
          dest.code.replace(/\s+/g, '').toLowerCase().includes(cleanSearch);

        if (!matchesSearch) return false;
      }

      // Region Filter
      if (selectedRegion === 'popular' && !dest.popular) return false;
      if (selectedRegion !== 'all' && selectedRegion !== 'popular') {
        const destReg = (dest.region || '').replace('-', '_');
        const selReg = selectedRegion.replace('-', '_');
        if (destReg !== selReg) return false;
      }

      return true;
    });

    // Sorting: 1. Destinos individuales PRIMERO, luego los multipaís ordenados por número de países
    return filtered.sort((a, b) => {
      const aIsMulti = isDestinationMultiCountry(a);
      const bIsMulti = isDestinationMultiCountry(b);

      // Requisito 2: Destinos individuales PRIMERO, luego los multipaís
      if (!aIsMulti && bIsMulti) return -1;
      if (aIsMulti && !bIsMulti) return 1;

      // Requisito 2: Los multipaís ordenados por número de países (menor a mayor cobertura)
      if (aIsMulti && bIsMulti) {
        const aCount = getDestinationCountryCount(a);
        const bCount = getDestinationCountryCount(b);
        if (aCount !== bCount) {
          return aCount - bCount;
        }
      }

      // Si hay término de búsqueda activo, priorizar coincidencia exacta o por inicio de nombre/código
      if (normSearch) {
        const aExact = normalizeSearchText(a.name) === normSearch || normalizeSearchText(a.code) === normSearch;
        const bExact = normalizeSearchText(b.name) === normSearch || normalizeSearchText(b.code) === normSearch;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        const aStarts = normalizeSearchText(a.name).startsWith(normSearch) || normalizeSearchText(a.code).startsWith(normSearch);
        const bStarts = normalizeSearchText(b.name).startsWith(normSearch) || normalizeSearchText(b.code).startsWith(normSearch);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
      }

      // Criterio de ordenamiento secundario
      if (sortBy === 'popular') {
        if (a.popular && !b.popular) return -1;
        if (!a.popular && b.popular) return 1;
        return b.plansCount - a.plansCount;
      }
      if (sortBy === 'name_asc') {
        return a.name.localeCompare(b.name, 'es');
      }
      if (sortBy === 'price_asc') {
        return a.startingPriceEUR - b.startingPriceEUR;
      }
      if (sortBy === 'plans_desc') {
        return b.plansCount - a.plansCount;
      }
      return 0;
    });
  }, [destinations, searchTerm, selectedRegion, sortBy]);

  // Pagination calculation
  const totalItems = sortedAndFilteredDestinations.length;
  const isAllShown = itemsPerPage >= 999;
  const totalPages = isAllShown ? 1 : Math.ceil(totalItems / itemsPerPage);
  const paginatedDestinations = useMemo(() => {
    if (isAllShown) return sortedAndFilteredDestinations;
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedAndFilteredDestinations.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedAndFilteredDestinations, currentPage, itemsPerPage, isAllShown]);

  // Idle prefetch for the first visible destinations on screen (top 4 cards)
  useEffect(() => {
    if (paginatedDestinations && paginatedDestinations.length > 0) {
      const visibleCodes = paginatedDestinations.slice(0, 4).map(d => d.code);
      prefetchInitialDestinations(visibleCodes);
    }
  }, [paginatedDestinations]);

  // Filter plans inside active destination modal
  const filteredModalPlans = useMemo(() => {
    if (selectedPlanFilter === 'unlimited') {
      return destinationPlans.filter(p => p.isUnlimited);
    }
    if (selectedPlanFilter === 'standard') {
      return destinationPlans.filter(p => !p.isUnlimited && p.dataAmountGB <= 10);
    }
    if (selectedPlanFilter === 'high_data') {
      return destinationPlans.filter(p => !p.isUnlimited && p.dataAmountGB > 10);
    }
    return destinationPlans;
  }, [destinationPlans, selectedPlanFilter]);

  // Multi-country coverage for active destination modal
  const effectiveCoveredCountries = useMemo(() => {
    if (!activeDestination) return [];
    if (Array.isArray(activeDestination.coveredCountries) && activeDestination.coveredCountries.length > 0) {
      return activeDestination.coveredCountries;
    }
    const planWithCountries = destinationPlans.find(
      p => Array.isArray(p.coveredCountries) && p.coveredCountries.length > 0
    );
    if (planWithCountries?.coveredCountries && planWithCountries.coveredCountries.length > 0) {
      return planWithCountries.coveredCountries;
    }
    return resolveDestinationCoveredCountries(activeDestination);
  }, [activeDestination, destinationPlans]);

  const isMultiCountryDestination = useMemo(() => {
    if (!activeDestination) return false;
    return Boolean(
      activeDestination.isMultiCountry ||
      effectiveCoveredCountries.length > 1 ||
      (activeDestination.coveredCountriesCount && activeDestination.coveredCountriesCount > 1) ||
      (activeDestination.code && (activeDestination.code.includes('-') || ['EU', 'GL', 'LATAM', 'ASIA', 'AFRICA'].includes(activeDestination.code))) ||
      (activeDestination.name && (
        activeDestination.name.toLowerCase().includes('países') ||
        activeDestination.name.toLowerCase().includes('regional') ||
        activeDestination.name.toLowerCase().includes('global') ||
        activeDestination.name.toLowerCase().includes('multidestino')
      ))
    );
  }, [activeDestination, effectiveCoveredCountries]);

  const filteredCoveredCountries = useMemo(() => {
    if (!countrySearchTerm.trim()) return effectiveCoveredCountries;
    const term = countrySearchTerm.toLowerCase().trim();
    const normTerm = normalizeSearchText(countrySearchTerm);
    return effectiveCoveredCountries.filter(c =>
      c.name.toLowerCase().includes(term) ||
      normalizeSearchText(c.name).includes(normTerm) ||
      c.code.toLowerCase().includes(term) ||
      normalizeSearchText(c.code).includes(normTerm) ||
      (c.operators && c.operators.some(op => op.toLowerCase().includes(term) || normalizeSearchText(op).includes(normTerm)))
    );
  }, [effectiveCoveredCountries, countrySearchTerm]);

  return (
    <div className={isMobileSearchActive ? 'space-y-2 sm:space-y-6' : 'space-y-6'}>
      
      {/* Hero Banner with Search */}
      <div className={`text-white shadow-md relative overflow-hidden transition-all duration-200 ${
        isMobileSearchActive
          ? 'bg-slate-900/98 dark:bg-slate-950/98 rounded-2xl p-2.5 sm:p-8 sticky top-0 z-30 -mx-1 sm:mx-0 backdrop-blur-md border border-slate-700/80 shadow-xl'
          : 'bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 rounded-3xl p-4 sm:p-8 pt-4 pb-5 sm:py-8'
      }`}>
        
        {/* Subtle grid pattern overlay */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px]" />

        <div className="relative z-10 max-w-3xl">
          {/* Badges: hidden on mobile during focused search */}
          <div className={`flex flex-wrap items-center gap-2 mb-2 sm:mb-3 ${isMobileSearchActive ? 'hidden md:flex' : 'flex'}`}>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Sin roaming ni tarjetas SIM físicas</span>
            </div>
            {isLoadingDestinations ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-semibold animate-pulse">
                <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
                <span>Sincronizando con MongoDB Atlas...</span>
              </div>
            ) : isDbConnected ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <Database className="w-3 h-3 text-emerald-400" />
                <span>{destinations.length} Destinos</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <Database className="w-3 h-3 text-amber-400" />
                <span>Catálogo Local ({destinations.length} Destinos de muestra)</span>
              </div>
            )}
          </div>

          {/* Title and subtitle: hidden on mobile during focused search */}
          <h1 className={`text-xl sm:text-3xl font-extrabold tracking-tight text-white ${isMobileSearchActive ? 'hidden md:block' : 'block'}`}>
            eSIMs Internacionales para Viajar Conectado
          </h1>
          <p className={`text-slate-300 text-xs sm:text-sm mt-1.5 sm:mt-2 leading-relaxed ${isMobileSearchActive ? 'hidden md:block' : 'block'}`}>
            Conexión 5G/4G inmediata en {destinations.length} destinos. Escanea el código QR y empieza a navegar al instante.
          </p>

          {/* Search bar inside hero (Unified single input, never unmounts) */}
          <div id="catalog-search-container" className={`flex items-center gap-2 ${isMobileSearchActive ? 'mt-0' : 'mt-3.5 sm:mt-5'}`}>
            
            {/* Back button visible on mobile when search is active */}
            {isMobileSearchActive && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleExitMobileSearch();
                }}
                className="md:hidden p-2 text-slate-300 hover:text-white rounded-xl active:scale-95 flex items-center justify-center shrink-0 cursor-pointer bg-slate-800 border border-slate-700"
                aria-label="Volver y salir de la búsqueda"
                title="Volver"
              >
                <ArrowLeft className="w-4 h-4 text-emerald-400" />
              </button>
            )}

            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="catalog-search-input"
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchTerm(val);
                  if (val.trim() && selectedRegion !== 'all') {
                    setSelectedRegion('all');
                  }
                }}
                onFocus={() => {
                  mobileSearchActivatedAtRef.current = Date.now();
                  setIsMobileSearchActive(true);
                  scrollSearchToTopSlow(250);
                }}
                onClick={() => {
                  mobileSearchActivatedAtRef.current = Date.now();
                  setIsMobileSearchActive(true);
                }}
                placeholder=""
                aria-label="Busca por país o código (ej. Japón, España, Estados Unidos, Tailandia, EU, MX, +34, +57...)"
                className="w-full pl-9 pr-8 py-2.5 bg-slate-800/90 dark:bg-slate-900/90 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-400 transition-all relative z-10"
              />

              {/* Animated ticker helper text scrolling smoothly towards the left, taking advantage of the full field with soft edge fading */}
              {!searchTerm && (
                <div
                  aria-hidden="true"
                  className="absolute left-8 right-2 top-0 bottom-0 flex items-center pointer-events-none overflow-hidden select-none z-20 [mask-image:linear-gradient(to_right,transparent,black_8px,black_calc(100%-8px),transparent)] [-webkit-mask-image:linear-gradient(to_right,transparent,black_8px,black_calc(100%-8px),transparent)]"
                >
                  <div className="animate-marquee-left text-xs text-slate-300 dark:text-slate-400 font-medium">
                    <span className="flex items-center gap-3 pr-6 shrink-0">
                      <span>Busca por país o código (ej. Japón, España, Estados Unidos, Tailandia, EU, MX, +34, +57...)</span>
                      <span className="text-emerald-400 text-[9px]">●</span>
                    </span>
                    <span className="flex items-center gap-3 pr-6 shrink-0">
                      <span>Busca por país o código (ej. Japón, España, Estados Unidos, Tailandia, EU, MX, +34, +57...)</span>
                      <span className="text-emerald-400 text-[9px]">●</span>
                    </span>
                  </div>
                </div>
              )}

              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 z-30"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Cancel button on mobile when search active */}
            {isMobileSearchActive && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleExitMobileSearch();
                }}
                className="md:hidden text-xs font-semibold text-emerald-400 hover:text-emerald-300 px-2.5 py-2 rounded-xl bg-slate-800/90 border border-slate-700/80 shrink-0 cursor-pointer active:scale-95"
              >
                Cancelar
              </button>
            )}

            {/* AI Advisor Button: discreetly next to search, blinking in yellow */}
            <button
              type="button"
              onClick={onOpenAdvisor}
              title="Pregúntale al Asistente IA de Viajes qué plan necesitas"
              aria-label="Abrir Asistente IA de Viajes"
              className={`items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2.5 rounded-xl bg-slate-900/90 dark:bg-slate-950/90 border border-amber-400/70 hover:border-amber-300 text-amber-300 hover:text-amber-200 text-xs font-bold transition-all shrink-0 cursor-pointer active:scale-95 animate-blink-yellow shadow-[0_0_12px_rgba(251,191,36,0.35)] ${
                isMobileSearchActive ? 'hidden md:flex' : 'flex'
              }`}
            >
              {/* Blinking yellow beacon */}
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-90" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400 shadow-[0_0_8px_#fbbf24]" />
              </span>

              <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-amber-400/40 animate-pulse shrink-0" />
              <span className="hidden sm:inline tracking-tight font-bold">Asistente IA</span>
              <span className="sm:hidden text-[11px] font-bold">IA</span>
            </button>
          </div>
        </div>
      </div>

      {/* Vercel / Connection Diagnostic Banner if using Local Fallback */}
      {!isLoadingDestinations && isDbConnected === false && (
        <div className={`rounded-2xl border border-amber-300/60 dark:border-amber-700/50 bg-amber-50/90 dark:bg-amber-950/40 p-4 text-xs text-amber-900 dark:text-amber-200 shadow-xs flex flex-col sm:flex-row items-start gap-3 ${
          isMobileSearchActive ? 'hidden md:flex' : 'flex'
        }`}>
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div className="font-bold text-sm text-amber-900 dark:text-amber-300 flex items-center gap-2">
              <span>Operando en Modo Catálogo Local de Respaldo</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200">
                13 Destinos de Respaldo (65 Planes)
              </span>
            </div>
            
            {/* Live diagnostic insight from server */}
            {dbStatusDetails?.diagnostics && (
              <div className="p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-amber-300/50 dark:border-amber-800/50 font-mono text-[11px] space-y-1.5">
                <div className="font-bold text-amber-800 dark:text-amber-300">Diagnóstico del servidor:</div>
                <div className="text-slate-700 dark:text-slate-300">
                  • <strong>Entorno de ejecución:</strong> {dbStatusDetails.diagnostics.isVercel ? 'Vercel Serverless' : 'Servidor Node.js'}
                </div>
                <div className="text-slate-700 dark:text-slate-300">
                  • <strong>Variable MONGODB_URI:</strong> {dbStatusDetails.diagnostics.uriDetectedPrefix || 'NO CONFIGURADA EN VERCEL'} {dbStatusDetails.diagnostics.uriLength ? `(${dbStatusDetails.diagnostics.uriLength} caracteres)` : ''}
                </div>
                <div className="text-slate-700 dark:text-slate-300">
                  • <strong>Base de datos objetivo:</strong> plan (Colección: {dbStatusDetails.diagnostics.activeCollection || 'esim_packages'})
                </div>
                {dbStatusDetails.error && (
                  <div className="text-red-600 dark:text-red-400 font-semibold">
                    • <strong>Detalle del error:</strong> {dbStatusDetails.error}
                  </div>
                )}
              </div>
            )}

            <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-xs">
              Para mostrar el catálogo completo de <strong>3.046 planes</strong> y <strong>150+ destinos</strong> en Vercel, configura las variables de entorno en tu panel de Vercel.
            </p>

            <div className="pt-1 text-slate-700 dark:text-slate-300 space-y-2 text-xs">
              {dbStatusDetails?.diagnostics?.isVercel ? (
                <div>
                  <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">
                    💡 Pasos para activar los 3.046 planes en Vercel:
                  </p>
                  <ol className="list-decimal list-inside pl-1 space-y-1.5 text-[11px]">
                    <li>Ve a tu proyecto en <strong>Vercel &gt; Settings &gt; Environment Variables</strong>.</li>
                    <li>Agrega <code className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 font-mono">MONGODB_URI</code> con tu enlace de conexión de MongoDB Atlas.</li>
                    <li>Agrega <code className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 font-mono">MONGODB_DB_NAME</code> con el valor <code className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 font-mono">plan</code></li>
                    <li>En MongoDB Atlas, ve a <strong>Network Access</strong> y verifica que la IP <code className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 font-mono">0.0.0.0/0</code> esté permitida.</li>
                    <li>Ve a <strong>Deployments</strong> en Vercel, pulsa los 3 puntos del último despliegue y selecciona <strong>Redeploy</strong>.</li>
                  </ol>
                </div>
              ) : (
                <div>
                  <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">
                    💡 Solución en entorno local:
                  </p>
                  <ol className="list-decimal list-inside pl-1 space-y-1 text-[11px]">
                    <li>En la carpeta raíz del proyecto, crea o edita el archivo <code className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 font-mono">.env</code></li>
                    <li>Configura <code className="font-mono">MONGODB_URI=mongodb+srv://...</code> y <code className="font-mono">MONGODB_DB_NAME=plan</code></li>
                    <li>Reinicia el servidor con <code className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-mono">npm run dev</code>.</li>
                  </ol>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Region Filter Chips (Hidden on mobile when focused search is active) */}
      <div className={`space-y-3 ${isMobileSearchActive ? 'hidden md:block' : 'block'}`}>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => handleSelectRegion('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              selectedRegion === 'all'
                ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            Todos ({destinations.length})
          </button>
          <button
            onClick={() => handleSelectRegion('popular')}
            onMouseEnter={() => handleRegionHover('popular')}
            onTouchStart={() => handleRegionHover('popular')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
              selectedRegion === 'popular'
                ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            <span>Populares</span>
          </button>
          <button
            onClick={() => handleSelectRegion('europe')}
            onMouseEnter={() => handleRegionHover('europe')}
            onTouchStart={() => handleRegionHover('europe')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              selectedRegion === 'europe'
                ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            🇪🇺 Europa
          </button>
          <button
            onClick={() => handleSelectRegion('asia')}
            onMouseEnter={() => handleRegionHover('asia')}
            onTouchStart={() => handleRegionHover('asia')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              selectedRegion === 'asia'
                ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            🇯🇵 Asia
          </button>
          <button
            onClick={() => handleSelectRegion('americas')}
            onMouseEnter={() => handleRegionHover('americas')}
            onTouchStart={() => handleRegionHover('americas')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              selectedRegion === 'americas'
                ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            🌎 América
          </button>
          <button
            onClick={() => handleSelectRegion('middle_east')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              selectedRegion === 'middle_east'
                ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            🕌 Medio Oriente
          </button>
          <button
            onClick={() => handleSelectRegion('africa')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              selectedRegion === 'africa'
                ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            🌍 África
          </button>
          <button
            onClick={() => handleSelectRegion('global')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              selectedRegion === 'global'
                ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            🌐 Global Pass
          </button>
        </div>
      </div>

      {/* Micro-resumen en móvil durante búsqueda enfocada */}
      {isMobileSearchActive && (
        <div className="flex md:hidden items-center justify-between px-2 py-1 mt-0 mb-1 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
          <span>
            <strong className="text-slate-900 dark:text-white font-bold">{sortedAndFilteredDestinations.length}</strong> {sortedAndFilteredDestinations.length === 1 ? 'destino encontrado' : 'destinos encontrados'}
          </span>
          {searchTerm ? (
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold truncate max-w-[160px]">
              "{searchTerm}"
            </span>
          ) : (
            <span className="text-slate-400 text-[11px]">Todos los países</span>
          )}
        </div>
      )}

      {/* Destinations Content (Grid or List) */}
      {isLoadingDestinations ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-xs flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 animate-spin mb-3" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Cargando planes y destinos desde MongoDB Atlas...</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Sincronizando catálogo en vivo.</p>
        </div>
      ) : sortedAndFilteredDestinations.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center shadow-xs">
          <Globe className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No encontramos destinos para tu búsqueda</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {searchTerm ? `No hay resultados para "${searchTerm}".` : 'Prueba cambiando los filtros seleccionados.'}
          </p>
          <button
            onClick={() => { setSearchTerm(''); setSelectedRegion('all'); }}
            className="mt-3 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
          >
            Ver todos los destinos
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW: Clean, modern cards with calm, deliberate spacing and guaranteed flag visibility */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginatedDestinations.map((dest) => (
            <div
              key={dest.id}
              onClick={() => handleSelectDestination(dest)}
              onMouseEnter={() => handleDestinationHoverStart(dest)}
              onMouseLeave={() => handleDestinationHoverEnd(dest)}
              onTouchStart={() => handleDestinationTouchStart(dest)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-xl p-4 shadow-2xs hover:shadow-sm transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                {/* Header row */}
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <CountryFlag flag={dest.flag} countryCode={dest.code} countryName={dest.name} size="lg" className="shrink-0 drop-shadow-xs" />
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                        {dest.name}
                      </h3>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-slate-400 block truncate">
                          {dest.regionLabel} • {dest.code}
                        </span>
                        {(dest.isMultiCountry || (dest.coveredCountries && dest.coveredCountries.length > 1) || (dest.coveredCountriesCount && dest.coveredCountriesCount > 1)) && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-200/60 dark:border-emerald-800/60">
                            <Globe className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                            <span>{dest.coveredCountriesCount || dest.coveredCountries?.length} países</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {dest.popularBadge && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
                      {dest.popularBadge}
                    </span>
                  )}
                </div>

                {/* Operator chips */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-slate-400 font-semibold">Redes:</span>
                  {dest.topOperators.slice(0, 2).map((op, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium truncate max-w-[120px]"
                    >
                      {op}
                    </span>
                  ))}
                  {dest.topOperators.length > 2 && (
                    <span className="text-[10px] text-slate-400">+{dest.topOperators.length - 2}</span>
                  )}
                </div>
              </div>

              {/* Price & Action */}
              <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-semibold">Desde</span>
                  <span className="text-sm font-extrabold text-slate-900 dark:text-white font-mono">
                    ${dest.startingPriceEUR.toFixed(2)}
                  </span>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 group-hover:bg-emerald-600 dark:group-hover:bg-emerald-600 text-white text-xs font-semibold transition-colors shadow-2xs">
                  <span>{dest.plansCount} {dest.plansCount === 1 ? 'Plan' : 'Planes'}</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* LIST VIEW: Compact, streamlined table/list rows for easy scanning */
        <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 shadow-2xs overflow-hidden ${isMobileSearchActive ? 'mt-2.5 sm:mt-0' : 'mt-0'}`}>
          {paginatedDestinations.map((dest) => (
            <div
              key={dest.id}
              onClick={() => handleSelectDestination(dest)}
              onMouseEnter={() => handleDestinationHoverStart(dest)}
              onMouseLeave={() => handleDestinationHoverEnd(dest)}
              onTouchStart={() => handleDestinationTouchStart(dest)}
              className="p-3.5 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <CountryFlag flag={dest.flag} countryCode={dest.code} countryName={dest.name} size="lg" className="shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                      {dest.name}
                    </h3>
                    <span className="text-[10px] font-bold text-slate-400 font-mono">({dest.code})</span>
                    {(dest.isMultiCountry || (dest.coveredCountries && dest.coveredCountries.length > 1) || (dest.coveredCountriesCount && dest.coveredCountriesCount > 1)) && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <Globe className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>Multi-país ({dest.coveredCountriesCount || dest.coveredCountries?.length} países)</span>
                      </span>
                    )}
                    {dest.popularBadge && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        {dest.popularBadge}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <span>{dest.regionLabel}</span>
                    <span>•</span>
                    <span className="truncate">Redes: {dest.topOperators.join(', ')}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                <div className="text-left sm:text-right">
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-semibold">Desde</span>
                  <span className="text-sm font-extrabold text-slate-900 dark:text-white font-mono">
                    ${dest.startingPriceEUR.toFixed(2)}
                  </span>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 group-hover:bg-emerald-600 dark:group-hover:bg-emerald-600 text-white text-xs font-semibold transition-colors shadow-2xs">
                  <span>Ver {dest.plansCount} {dest.plansCount === 1 ? 'Plan' : 'Planes'}</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {!isAllShown && totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 pb-6 border-t border-slate-200/60 dark:border-slate-800 pt-6 animate-fade-in shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium text-center sm:text-left">
            Mostrando <strong className="text-slate-800 dark:text-slate-200">{Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)}</strong> - <strong className="text-slate-800 dark:text-slate-200">{Math.min(currentPage * itemsPerPage, totalItems)}</strong> de <strong className="text-slate-800 dark:text-slate-200">{totalItems}</strong> destinos
          </div>

          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            {/* First Page */}
            {currentPage > 2 && (
              <button
                onClick={() => {
                  setCurrentPage(1);
                  scrollSearchToTopSlow(300);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition-colors shadow-2xs"
                title="Primera página"
              >
                « Primera
              </button>
            )}

            {/* Previous */}
            <button
              onClick={() => {
                setCurrentPage(prev => Math.max(prev - 1, 1));
                scrollSearchToTopSlow(300);
              }}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold transition-colors shadow-2xs"
            >
              Anterior
            </button>
            
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
              const isNearCurrent = Math.abs(pageNum - currentPage) <= 1;
              const isEdgePage = pageNum === 1 || pageNum === totalPages;
              
              if (!isNearCurrent && !isEdgePage) {
                if (pageNum === 2 || pageNum === totalPages - 1) {
                  return (
                    <span key={`ellipsis-${pageNum}`} className="px-1 text-slate-400 dark:text-slate-500 text-xs font-bold select-none">
                      ...
                    </span>
                  );
                }
                return null;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => {
                    setCurrentPage(pageNum);
                    scrollSearchToTopSlow(300);
                  }}
                  className={`min-w-[34px] h-8.5 px-2 rounded-lg text-xs font-bold transition-all ${
                    currentPage === pageNum
                      ? 'bg-emerald-600 text-white shadow-xs scale-105'
                      : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:scale-102'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            {/* Next */}
            <button
              onClick={() => {
                setCurrentPage(prev => Math.min(prev + 1, totalPages));
                scrollSearchToTopSlow(300);
              }}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold transition-colors shadow-2xs"
            >
              Siguiente
            </button>

            {/* Last Page */}
            {currentPage < totalPages - 1 && (
              <button
                onClick={() => {
                  setCurrentPage(totalPages);
                  scrollSearchToTopSlow(300);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition-colors shadow-2xs"
                title="Última página"
              >
                Última ({totalPages}) »
              </button>
            )}
          </div>

          {/* Page size selector */}
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Mostrar:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 cursor-pointer shadow-2xs"
            >
              <option value={12}>12 por pág.</option>
              <option value={24}>24 por pág.</option>
              <option value={48}>48 por pág.</option>
              <option value={999}>Todos</option>
            </select>
          </div>
        </div>
      )}

      {/* Destination Plan Selector Modal / Drawer */}
      {activeDestination && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-xl relative overflow-hidden text-slate-900 dark:text-slate-100 max-h-[90vh] flex flex-col">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <CountryFlag flag={activeDestination.flag} countryCode={activeDestination.code} countryName={activeDestination.name} size="2xl" rounded="md" className="shadow-xs" />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{activeDestination.name} ({activeDestination.code})</h2>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      5G / 4G LTE
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Operadores: {activeDestination.topOperators.join(' • ')}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setActiveDestination(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Multi-Country Coverage Section */}
            {isMultiCountryDestination && (
              <div className="mt-3 mb-1 rounded-xl border border-emerald-200/80 dark:border-emerald-800/60 bg-gradient-to-r from-emerald-50/60 via-teal-50/40 to-emerald-50/60 dark:from-emerald-950/40 dark:via-slate-900 dark:to-emerald-950/40 p-3.5 shadow-2xs shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 flex items-center justify-center shrink-0 text-emerald-700 dark:text-emerald-300">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                          Países con cobertura en este paquete
                        </h3>
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-600 text-white font-mono shadow-2xs">
                          {effectiveCoveredCountries.length > 0 ? `${effectiveCoveredCountries.length} países` : (activeDestination.coveredCountriesCount ? `${activeDestination.coveredCountriesCount} países` : 'Multi-país')}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                        Conéctate automáticamente en cualquiera de ellos con la misma eSIM sin cambiar de SIM ni roaming
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowCountriesList(prev => !prev)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-white/80 dark:bg-slate-800/80 hover:bg-emerald-100/70 dark:hover:bg-slate-700 border border-emerald-200/80 dark:border-emerald-700 transition-colors flex items-center gap-1.5 shrink-0 shadow-2xs"
                  >
                    <span>{showCountriesList ? 'Ocultar países' : 'Ver países'}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showCountriesList ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {showCountriesList && (
                  <div className="mt-3 pt-3 border-t border-emerald-200/60 dark:border-emerald-800/50 space-y-2.5">
                    {effectiveCoveredCountries.length > 6 && (
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={countrySearchTerm}
                          onChange={(e) => setCountrySearchTerm(e.target.value)}
                          placeholder={`Buscar entre los ${effectiveCoveredCountries.length} países cubiertos...`}
                          className="w-full pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 shadow-2xs"
                        />
                        {countrySearchTerm && (
                          <button
                            type="button"
                            onClick={() => setCountrySearchTerm('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}

                    {effectiveCoveredCountries.length === 0 ? (
                      <div className="p-3 bg-white/70 dark:bg-slate-900/70 rounded-lg text-xs text-slate-600 dark:text-slate-300 text-center space-y-1">
                        <div className="font-semibold text-emerald-800 dark:text-emerald-400">Cobertura Regional y Multi-País</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Este paquete incluye cobertura automática en todas las redes locales 5G/4G del territorio y países miembros de la región seleccionada.
                        </div>
                      </div>
                    ) : filteredCoveredCountries.length === 0 ? (
                      <div className="p-3 bg-white/70 dark:bg-slate-900/70 rounded-lg text-xs text-slate-400 text-center">
                        No se encontró ningún país cubierto con "{countrySearchTerm}".
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-44 overflow-y-auto pr-1">
                        {filteredCoveredCountries.map((c) => (
                          <div
                            key={c.code}
                            className="flex items-center gap-2 p-1.5 px-2 bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-lg text-xs hover:border-emerald-400 transition-colors shadow-2xs"
                          >
                            <CountryFlag flag={c.flag} countryCode={c.code} countryName={c.name} size="md" rounded="sm" className="shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-slate-800 dark:text-slate-200 truncate flex items-center justify-between gap-1">
                                <span className="truncate">{c.name}</span>
                                <span className="text-[9px] font-mono text-slate-400 uppercase shrink-0 font-bold">{c.code}</span>
                              </div>
                              {c.operators && c.operators.length > 0 && (
                                <span className="text-[10px] text-slate-400 truncate block">
                                  {c.operators.slice(0, 2).join(', ')}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {effectiveCoveredCountries.length > 0 && (
                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 px-0.5 pt-1">
                        <span>Mostrando {filteredCoveredCountries.length} de {effectiveCoveredCountries.length} países incluidos</span>
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">Cobertura garantizada Tier 1</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Plan Filter Sub-tabs */}
            <div className="pt-3 pb-1 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
              <button
                onClick={() => setSelectedPlanFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  selectedPlanFilter === 'all'
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                Todos ({destinationPlans.length})
              </button>
              <button
                onClick={() => setSelectedPlanFilter('unlimited')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  selectedPlanFilter === 'unlimited'
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <InfinityIcon className="w-3.5 h-3.5 text-emerald-500" />
                <span>Ilimitados ({destinationPlans.filter(p => p.isUnlimited).length})</span>
              </button>
              <button
                onClick={() => setSelectedPlanFilter('standard')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  selectedPlanFilter === 'standard'
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                1 - 10 GB
              </button>
              <button
                onClick={() => setSelectedPlanFilter('high_data')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  selectedPlanFilter === 'high_data'
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                +10 GB
              </button>
            </div>

            {/* Plan Cards inside Modal */}
            <div className="py-4 overflow-y-auto max-h-[60vh] pr-1">
              {isLoadingPlans ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-7 h-7 animate-spin text-emerald-600 dark:text-emerald-400 mb-2" />
                  <span className="text-xs">Consultando planes disponibles en vivo...</span>
                </div>
              ) : filteredModalPlans.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  No hay planes en este filtro para este destino.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredModalPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className={`border rounded-xl p-3.5 flex flex-col justify-between transition-all ${
                        plan.isUnlimited
                          ? 'border-emerald-500 bg-gradient-to-b from-emerald-50/40 dark:from-emerald-950/40 to-white dark:to-slate-900 shadow-xs'
                          : plan.popular
                          ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20 shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div>
                        {/* Top Header Row with Title and Badge (Flex layout prevents overlapping) */}
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 min-w-0">
                            {plan.isUnlimited ? (
                              <>
                                <InfinityIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span className="text-emerald-800 dark:text-emerald-300 font-extrabold text-sm truncate">Datos Ilimitados</span>
                              </>
                            ) : (
                              <span className="text-sm">{plan.dataAmountGB} GB</span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {plan.isUnlimited && (
                              <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-700 text-white shadow-2xs flex items-center gap-0.5 tracking-tight uppercase">
                                <InfinityIcon className="w-2.5 h-2.5" /> Ilimitado
                              </span>
                            )}
                            {plan.popular && !plan.isUnlimited && (
                              <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-600 text-white shadow-2xs tracking-tight uppercase">
                                Popular
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-xs text-slate-600 dark:text-slate-300 font-medium line-clamp-1">
                          {plan.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {plan.isUnlimited
                            ? `Precio base por día (elige tus días) • Red ${plan.operator}`
                            : `Válido por ${plan.validityDays} días • Red ${plan.operator}`}
                        </div>

                        {/* FUP Specifications Breakdown for Unlimited Plans */}
                        {plan.isUnlimited && (
                          <div className="mt-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] space-y-1.5">
                            <div className="flex items-center justify-between font-semibold text-emerald-900 dark:text-emerald-300">
                              <span className="flex items-center gap-1">
                                <Zap className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                <span>Cuota 5G: <strong>{plan.fupDailyAllowance || `${plan.dataAmountGB === 999 ? '1 GB' : plan.dataAmountGB} /Día`}</strong></span>
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-600/20 text-emerald-800 dark:text-emerald-300 rounded font-mono font-bold">
                                FUP {plan.fupSpeedThrottling || plan.fupPolicy || '512 Kbps'}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <RotateCcw className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                              <span>Reinicio 5G: {plan.fupResetInterval || 'Cada 24 horas (00:00 UTC)'}</span>
                            </div>
                            <p className="text-[10px] text-emerald-800/80 dark:text-emerald-300/80 leading-tight pt-0.5 border-t border-emerald-500/20">
                              <strong>¿Qué es FUP?</strong> Datos 100% ilimitados. Navegas a máxima velocidad 5G hasta tu cuota diaria; si la superas, sigues conectado sin corte a {plan.fupSpeedThrottling || plan.fupPolicy ? `${plan.fupSpeedThrottling || plan.fupPolicy}` : 'velocidad limitada'} hasta el reinicio nocturno.
                            </p>
                          </div>
                        )}

                        <div className="mt-2.5 space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                          {isMultiCountryDestination && (
                            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold">
                              <Globe className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>Válido en los {effectiveCoveredCountries.length || plan.coveredCountriesCount || 'todos los'} países del paquete</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>{plan.network5G ? '5G Ultra Low-Latency' : '4G LTE Alta Velocidad'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>Compartir datos (Tethering / Hotspot)</span>
                          </div>
                          {plan.coverageDetails && (
                            <div className="flex items-start gap-1.5 pt-0.5 text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                              <Info className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                              <span className="line-clamp-2">{plan.coverageDetails}</span>
                            </div>
                          )}
                          {(plan.supportTopUpType === 1 || plan.isReloadable === false) && (
                            <div className="flex items-start gap-1.5 pt-1 text-[10.5px] text-amber-800 dark:text-amber-300 leading-tight bg-amber-50 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-200/70 dark:border-amber-900/40">
                              <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                              <span>
                                <strong>Sin opción de recarga:</strong> Al agotar los días para los que se contrata esta eSIM (o su saldo), debes comprar una nueva eSIM para seguir navegando.
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-semibold">
                            {plan.isUnlimited ? 'Precio / Día' : 'Precio'}
                          </span>
                          <span className="text-sm font-extrabold text-slate-900 dark:text-white font-mono">
                            ${plan.priceEUR.toFixed(2)}
                            {plan.isUnlimited && <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400"> /día</span>}
                          </span>
                        </div>

                        <button
                          onClick={() => {
                            const enrichedPlan: EsimPlan = {
                              ...plan,
                              isMultiCountry: isMultiCountryDestination,
                              coveredCountriesCount: effectiveCoveredCountries.length || plan.coveredCountriesCount,
                              coveredCountries: effectiveCoveredCountries.length > 0 ? effectiveCoveredCountries : plan.coveredCountries
                            };
                            onSelectPlanForPurchase(enrichedPlan);
                            setActiveDestination(null);
                          }}
                          className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-xs"
                        >
                          Seleccionar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

