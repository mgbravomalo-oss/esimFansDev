export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
  country?: string;
  createdAt: string;
  walletBalanceEUR?: number;
  role?: 'admin' | 'user' | string;
  isAdmin?: boolean;
  token?: string;
}

export interface DestinationCountryCoverage {
  code: string;
  name: string;
  flag: string;
  operators?: string[];
}

export interface EsimPlan {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  flag: string;
  region: 'local' | 'regional' | 'global';
  regionName?: string;
  dataAmountGB: number;
  isUnlimited: boolean;
  validityDays: number;
  preInstallValidity?: string; // Validez para instalar/activar almacenada en base de datos (ej. "180 Días")
  unusedValidTimeDays?: number;
  priceEUR: number;
  originalPriceEUR?: number;
  operator: string;
  network5G: boolean;
  apn: string;
  voiceAndSms: boolean;
  tetheringSupported: boolean;
  coverageDetails: string;
  popular?: boolean;
  costPriceEUR?: number; // Costo inicial de compra/proveedor al por mayor para auditoría
  fupPolicy?: string;
  fupDailyAllowance?: string;
  fupSpeedThrottling?: string;
  fupResetInterval?: string;
  isMultiCountry?: boolean;
  coveredCountriesCount?: number;
  coveredCountries?: DestinationCountryCoverage[];
  supportTopUpType?: number; // 1: No recargable (compra nueva eSIM), 2: Recargable por volumen, 3: Recargable diario
  isReloadable?: boolean; // false si supportTopUpType === 1
}

export interface UserEsim {
  id: string;
  iccid: string;
  planId: string;
  planName: string;
  country: string;
  countryCode: string;
  flag: string;
  operator: string;
  network5G: boolean;
  qrCodeUrl: string;
  smdpAddress: string;
  activationCode: string;
  manualCode: string;
  totalDataGB: number;
  usedDataGB: number;
  isUnlimited: boolean;
  purchaseDate: string;
  activationDate?: string;
  activationTime?: string;
  expiryDate: string;
  expiredTime?: string;
  remainingDays?: number;
  durationDays?: number;
  preInstallValidity?: string; // Período de validez almacenado en base de datos (ej. "180 Días")
  unusedValidTimeDays?: number;
  pricePaid?: number; // Precio de venta cobrado
  costPriceEUR?: number; // Costo inicial de compra/proveedor (auditoría)
  salePriceEUR?: number; // Precio de venta registrado (auditoría)
  profitEUR?: number; // Margen bruto de auditoría (salePriceEUR - costPriceEUR)
  status: 'active' | 'ready_to_install' | 'installed' | 'expired' | 'depleted' | 'canceled';
  providerStatus?: string; // e.g. 'GOT_RESOURCE', 'DOWNLOADED', 'ACTIVE', 'CANCELED'
  doubleCheckPassed?: boolean;
  doubleCheckedAt?: string;
  userId?: string;
  userEmail?: string;
  autoRenew: boolean;
  apn: string;
  orderNo?: string;
  packageCode?: string;
  provisionSource?: string;
  topupCount?: number;
  dataHistory?: { date: string; mbUsed: number }[];
  fupPolicy?: string;
  fupDailyAllowance?: string;
  fupSpeedThrottling?: string;
  fupResetInterval?: string;
  coverageDetails?: string;
  isMultiCountry?: boolean;
  coveredCountriesCount?: number;
  coveredCountries?: DestinationCountryCoverage[];
  supportTopUpType?: number;
  isReloadable?: boolean;
  eid?: string;
  installationTime?: string;
  deviceType?: string;
  deviceBrand?: string;
  deviceModel?: string;
  isTestMode?: boolean;
}

export interface PurchaseAuditLog {
  id: string;
  orderNumber?: string;
  userId: string;
  userEmail: string;
  customerName?: string;
  planId: string;
  planName: string;
  country: string;
  pricePaid: number;
  paymentMethod: string;
  iccid?: string;
  orderNo?: string;
  packageCode?: string;
  provisionSource: string;
  stage: 'initiated' | 'wholesaler_ordered' | 'double_check_passed' | 'double_check_failed' | 'completed' | 'failed';
  providerStatus?: string;
  doubleCheckStatus: {
    passed: boolean;
    providerOrderVerified: boolean;
    iccidVerified: boolean;
    acCodeVerified: boolean;
    userLinked: boolean;
    message: string;
    checkedAt: string;
  };
  steps: Array<{
    step: string;
    timestamp: string;
    status: 'ok' | 'warn' | 'error';
    details?: any;
  }>;
  errorMessage?: string;
  createdAt: string;
}

export interface Destination {
  id: string;
  name: string;
  code: string;
  flag: string;
  region: 'europe' | 'asia' | 'americas' | 'global' | 'middle_east' | 'africa';
  regionLabel: string;
  startingPriceEUR: number;
  popular: boolean;
  popularBadge?: string;
  topOperators: string[];
  plansCount: number;
  isMultiCountry?: boolean;
  coveredCountriesCount?: number;
  coveredCountries?: DestinationCountryCoverage[];
}

export interface CompatibleDevice {
  id?: string;
  _id?: string;
  brand: string;
  models: string[];
  instructions: string;
  order?: number;
  isActive?: boolean;
}

export type PaymentMethodType = 'gpay' | 'credit_card' | 'apple_pay' | 'wallet';

export interface OrderPaymentDetails {
  cardLast4?: string;
  cardBrand?: string;
  cardHolderName?: string;
  walletAccount?: string;
  transactionId?: string;
  isSimulated: boolean;
}

export interface Order {
  id: string;
  orderNumber: string; // e.g. WPA-892341
  userId: string;
  userEmail: string;
  userName: string;
  planId: string;
  planName: string;
  country: string;
  countryCode: string;
  flag: string;
  operator: string;
  network5G: boolean;
  totalDataGB: number;
  isUnlimited: boolean;
  durationDays: number;
  pricePaid: number;
  costPriceEUR?: number;
  paymentMethod: PaymentMethodType;
  paymentDetails: OrderPaymentDetails;
  status: 'pending_approval' | 'approved' | 'rejected';
  isTestMode: boolean;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectionReason?: string;
  generatedEsim?: UserEsim;
}

export type MainTab = 'store' | 'myesims' | 'compatibility' | 'guide' | 'admin';

export interface CartItem {
  plan: EsimPlan;
  quantity: number;
}

export interface DestinationWeather {
  city: string;
  country: string;
  temperatureC: number;
  condition: string;
  icon: string;
  humidity?: number;
  windKmH?: number;
  packingTip: string;
}

export interface AiClarification {
  needsClarification: boolean;
  intentType: 'question' | 'invalid_or_nonsense' | 'ambiguous' | 'greeting';
  message: string;
  suggestions: string[];
  directAnswer?: string;
  originalQuery?: string;
}

export interface TravelRecommendation {
  summary: string;
  recommendedPlan: EsimPlan;
  tips: string[];
  weather?: DestinationWeather | null;
  needsClarification?: boolean;
  clarification?: AiClarification;
  isMultiCountryTrip?: boolean;
  multiCountries?: { code: string; name: string; city?: string }[];
}
