import { EsimPlan, Destination } from '../types';

/**
 * Interface representing the exact raw package schema provided by eSIM Access / provider database.
 */
export interface EsimAccessRawPackage {
  _id?: any;
  packageCode: string;
  name: string;
  description?: string;
  locationCode: string;
  locationName: string;
  volume: number;
  dataAmount?: number;
  dataDisplay?: string;
  dataType?: number;
  dataTypeName?: string;
  isUnlimited?: boolean;
  duration: number;
  durationUnit?: string;
  price: number;        // Wholesale cost in USD
  retailPrice: number;  // Recommended retail price in USD
  currency?: string;
  speed?: string;
  apn?: string;
  voiceStatus?: string;
  smsStatus?: number;
  operatorList?: Array<{ name?: string; operatorName?: string; networkType?: string }>;
  fupPolicy?: string;
  fupDailyAllowance?: string;
  fupSpeedThrottling?: string;
  activationPolicy?: string;
  preInstallValidity?: string;
  status?: string;
  slug?: string;
  favorite?: boolean;
  [key: string]: any;
}

/**
 * Generates an appropriate emoji flag or regional globe icon from a location code.
 */
export function getCountryFlag(code?: string): string {
  if (!code) return '🌐';
  const clean = code.toUpperCase().trim();
  
  if (clean === 'GL' || clean === 'GLOBAL' || clean === 'WORLD') return '🌐';
  if (clean === 'EU' || clean.startsWith('EU-')) return '🇪🇺';
  if (clean.startsWith('NA-') || clean === 'NA') return '🌎';
  if (clean.startsWith('SA-') || clean.startsWith('LATAM')) return '🌎';
  if (clean.startsWith('AS-') || clean === 'APAC') return '🌏';
  if (clean.startsWith('AF-') || clean === 'AFR') return '🌍';
  if (clean.startsWith('ME-') || clean === 'GULF') return '🌍';
  if (clean === 'UK') return '🇬🇧';

  if (clean.length === 2 && /^[A-Z]{2}$/.test(clean)) {
    try {
      const codePoints = [...clean].map(c => 0x1F1E6 + c.charCodeAt(0) - 65);
      return String.fromCodePoint(...codePoints);
    } catch {
      return '🌍';
    }
  }

  return '🌐';
}

/**
 * Normalizes location codes and names to the application's standard regions.
 */
export function normalizeRegion(
  locationCode?: string,
  locationName?: string
): 'local' | 'regional' | 'global' {
  const code = (locationCode || '').toUpperCase().trim();
  const name = (locationName || '').toLowerCase().trim();

  if (code === 'GL' || code === 'GLOBAL' || name.includes('global') || name.includes('worldwide') || name === 'global') {
    return 'global';
  }
  if (
    code.includes('-') ||
    code.startsWith('NA') ||
    code.startsWith('EU') ||
    code.startsWith('AS') ||
    code.startsWith('SA') ||
    name.includes('america') ||
    name.includes('europa') ||
    name.includes('europe') ||
    name.includes('asia') ||
    name.includes('latam') ||
    name.includes('caribbean') ||
    name.includes('regional')
  ) {
    return 'regional';
  }
  return 'local';
}

/**
 * Maps a single eSIM Access package to the application's EsimPlan model.
 */
export function transformEsimAccessToPlan(
  raw: EsimAccessRawPackage,
  usdToEurRate: number = 0.92
): EsimPlan {
  // 1. Calculate GB capacity
  const bytesInGB = 1024 * 1024 * 1024;
  let dataAmountGB = 1;
  
  if (raw.volume && raw.volume > 0) {
    dataAmountGB = Math.round((raw.volume / bytesInGB) * 100) / 100;
  } else if (raw.dataAmount && raw.dataAmount > 0) {
    dataAmountGB = Math.round((raw.dataAmount / bytesInGB) * 100) / 100;
  } else if (raw.dataDisplay) {
    const match = raw.dataDisplay.match(/([\d.]+)\s*GB/i);
    if (match) dataAmountGB = parseFloat(match[1]);
  }

  // 2. Operators list
  let operatorsStr = 'Principales redes locales 5G / 4G';
  if (Array.isArray(raw.operatorList) && raw.operatorList.length > 0) {
    const ops = raw.operatorList
      .map(op => (typeof op === 'string' ? op : op.name || op.operatorName))
      .filter(Boolean);
    if (ops.length > 0) {
      operatorsStr = ops.join(' / ');
    }
  }

  // 3. Price calculation with currency conversion
  const retailUSD = raw.retailPrice || (raw.price ? raw.price * 1.5 : 5.0);
  const priceEUR = Number((retailUSD * usdToEurRate).toFixed(2));
  const originalPriceEUR = Number((priceEUR * 1.25).toFixed(2));

  // 4. Unlimited flag
  const isUnlimited = 
    raw.isUnlimited === true || 
    raw.isUnlimited === 'true' as any || 
    raw.volume === -1 || 
    raw.dataAmount === -1 ||
    raw.duration === 1;

  // 5. Country name formatting
  let countryName = raw.locationName || 'Destino Internacional';
  if (raw.locationCode === 'NA-3' && (raw.locationName === 'Global' || !raw.locationName)) {
    countryName = 'Norteamérica (EE.UU., Canadá y México)';
  }

  // 6. Network 5G capability
  const network5G = (raw.speed || '').toUpperCase().includes('5G');

  // 7. Plan ID
  const id = raw.packageCode || raw.slug || (raw._id ? String(raw._id) : `plan-${raw.locationCode}-${dataAmountGB}gb`);

  return {
    id,
    name: raw.name || raw.description || `${countryName} ${dataAmountGB} GB`,
    country: countryName,
    countryCode: (raw.locationCode || 'GL').toUpperCase().trim(),
    flag: getCountryFlag(raw.locationCode),
    region: normalizeRegion(raw.locationCode, raw.locationName),
    dataAmountGB: isUnlimited ? 999 : dataAmountGB,
    isUnlimited,
    validityDays: raw.duration || 7,
    priceEUR,
    originalPriceEUR,
    operator: operatorsStr,
    network5G,
    apn: raw.apn || 'globaldata',
    tetheringSupported: true,
    voiceAndSms: raw.voiceStatus !== 'No soportado' && (raw.smsStatus ?? 2) !== 2,
    coverageDetails: isUnlimited && raw.fupPolicy
      ? `FUP: ${raw.dataDisplay || `${dataAmountGB} GB/Día`} a máxima velocidad 5G/4G por día. Al superarlo, datos ilimitados a velocidad reducida de ${raw.fupPolicy} hasta el reseteo automático a las 00:00 UTC.`
      : (raw.fupPolicy || raw.activationPolicy || 'Conexión automática a la red de destino al aterrizar.'),
    popular: Boolean(raw.favorite),
    fupPolicy: raw.fupPolicy || (isUnlimited ? '512 Kbps' : undefined),
    fupDailyAllowance: isUnlimited ? (raw.dataDisplay || `${dataAmountGB} GB/Día`) : undefined,
    fupSpeedThrottling: raw.fupPolicy || (isUnlimited ? '512 Kbps' : undefined),
    fupResetInterval: isUnlimited ? 'Cada 24 horas (00:00 UTC)' : 'Vigencia del paquete',
  };
}

/**
 * Transforms an array of eSIM Access raw packages into an array of application EsimPlan objects.
 */
export function transformEsimAccessCollection(
  rawPackages: EsimAccessRawPackage[],
  usdToEurRate: number = 0.92
): EsimPlan[] {
  if (!Array.isArray(rawPackages)) return [];
  return rawPackages.map(pkg => transformEsimAccessToPlan(pkg, usdToEurRate));
}

/**
 * Builds catalog destinations dynamically grouped from an array of eSIM Access plans.
 */
export function buildDestinationsFromPlans(plans: EsimPlan[]): Destination[] {
  const destMap = new Map<string, Destination>();

  for (const plan of plans) {
    const code = plan.countryCode.toUpperCase();
    if (!destMap.has(code)) {
      destMap.set(code, {
        id: `dest-${code.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name: plan.country,
        code: plan.countryCode,
        flag: plan.flag,
        region: plan.region === 'regional' ? 'americas' : (plan.region === 'global' ? 'global' : 'americas'),
        regionLabel: plan.region === 'regional' ? 'Regional' : (plan.region === 'global' ? 'Global' : 'Local'),
        startingPriceEUR: plan.priceEUR,
        popular: Boolean(plan.popular),
        topOperators: [plan.operator],
        plansCount: 1,
      });
    } else {
      const existing = destMap.get(code)!;
      existing.plansCount++;
      if (plan.priceEUR < existing.startingPriceEUR) {
        existing.startingPriceEUR = plan.priceEUR;
      }
    }
  }

  return Array.from(destMap.values());
}
