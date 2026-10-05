import AsyncStorage from '@react-native-async-storage/async-storage';
import { DestinationPlan, User, UserEsim } from '../types';

// API Base URL (Live production backend URL)
export const API_BASE_URL = 'https://ais-pre-ekngdkmv2vh66hbft47jyy-432865196074.us-east5.run.app';

const STORAGE_KEYS = {
  USER_SESSION: '@esim_user_session',
  CACHED_ESIMS: '@esim_cached_esims',
  CACHED_DESTINATIONS: '@esim_cached_destinations',
};

export const api = {
  // 1. Session Storage
  async getStoredUser(): Promise<User | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.USER_SESSION);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  async setStoredUser(user: User | null): Promise<void> {
    try {
      if (user) {
        await AsyncStorage.setItem(STORAGE_KEYS.USER_SESSION, JSON.stringify(user));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.USER_SESSION);
      }
    } catch (e) {
      console.error('Error saving user session:', e);
    }
  },

  // 2. Fetch Destinations / Countries Catalog
  async getDestinations(): Promise<DestinationPlan[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/destinations`);
      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        await AsyncStorage.setItem(STORAGE_KEYS.CACHED_DESTINATIONS, JSON.stringify(data));
        return data;
      }
      throw new Error('No destinations returned');
    } catch (err) {
      // Offline fallback: load from cached destinations
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_DESTINATIONS);
      if (cached) return JSON.parse(cached);
      return [];
    }
  },

  // 3. Fetch User eSIMs (with live sync from eSIM Access wholesale provider)
  async getUserEsims(userId: string, email: string): Promise<UserEsim[]> {
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'x-user-email': email,
      };

      const res = await fetch(`${API_BASE_URL}/api/user/${encodeURIComponent(userId)}/esims`, {
        headers,
      });

      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();

      if (Array.isArray(data)) {
        // Cache locally for offline viewing
        await AsyncStorage.setItem(STORAGE_KEYS.CACHED_ESIMS, JSON.stringify(data));
        return data;
      }
      return [];
    } catch (err) {
      console.warn('Network request failed, returning cached offline eSIMs:', err);
      // Offline fallback
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_ESIMS);
      if (cached) return JSON.parse(cached);
      return [];
    }
  },

  // 4. Query live consumption directly from backend / eSIM Access
  async refreshEsimConsumption(iccid: string): Promise<any> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/esim/consumption/${iccid}`);
      if (!res.ok) throw new Error('Failed to query consumption');
      return await res.json();
    } catch (e) {
      console.error('Error refreshing consumption:', e);
      return null;
    }
  },
};
