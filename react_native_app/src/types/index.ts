export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  token?: string;
  role?: 'user' | 'admin';
}

export interface EsimPackage {
  id: string;
  dataGB: number;
  durationDays: number;
  priceEUR: number;
  isUnlimited?: boolean;
  packageCode?: string;
}

export interface DestinationPlan {
  id: string;
  name: string;
  isoCode: string;
  flagEmoji: string;
  region: string;
  packages: EsimPackage[];
  networks?: string[];
  has5G?: boolean;
}

export interface UserEsim {
  id: string;
  iccid: string;
  orderNo?: string;
  destinationName: string;
  destinationCode: string;
  flagEmoji?: string;
  totalDataGB: number;
  usedDataGB: number;
  status: 'active' | 'in_use' | 'depleted' | 'expired' | 'pending';
  providerStatus?: string;
  smdpStatus?: string;
  isUnlimited: boolean;
  qrCodeUrl?: string;
  ac?: string; // LPA Activation Code (LPA:1$smdp.address$matchingId)
  smdpAddress?: string;
  matchingId?: string;
  expiryDate: string;
  remainingDays?: number;
  durationDays?: number;
  deviceBrand?: string;
  deviceModel?: string;
  deviceType?: string;
}
