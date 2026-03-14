import { STORAGE_KEYS } from '../constants';

/* ==================== LOCAL STORAGE ==================== */
export const localStorage_utils = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error(`Error reading from localStorage: ${key}`, error);
      return null;
    }
  },

  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error(`Error writing to localStorage: ${key}`, error);
    }
  },

  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing from localStorage: ${key}`, error);
    }
  },

  clear: (): void => {
    try {
      localStorage.clear();
    } catch (error) {
      console.error('Error clearing localStorage', error);
    }
  },

  getJSON: <T>(key: string): T | null => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error(`Error parsing JSON from localStorage: ${key}`, error);
      return null;
    }
  },

  setJSON: <T>(key: string, value: T): void => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error saving JSON to localStorage: ${key}`, error);
    }
  },
};

/* ==================== SESSION STORAGE ==================== */
export const sessionStorage_utils = {
  getItem: (key: string): string | null => {
    try {
      return sessionStorage.getItem(key);
    } catch (error) {
      console.error(`Error reading from sessionStorage: ${key}`, error);
      return null;
    }
  },

  setItem: (key: string, value: string): void => {
    try {
      sessionStorage.setItem(key, value);
    } catch (error) {
      console.error(`Error writing to sessionStorage: ${key}`, error);
    }
  },

  removeItem: (key: string): void => {
    try {
      sessionStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing from sessionStorage: ${key}`, error);
    }
  },

  clear: (): void => {
    try {
      sessionStorage.clear();
    } catch (error) {
      console.error('Error clearing sessionStorage', error);
    }
  },

  getJSON: <T>(key: string): T | null => {
    try {
      const item = sessionStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error(`Error parsing JSON from sessionStorage: ${key}`, error);
      return null;
    }
  },

  setJSON: <T>(key: string, value: T): void => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error saving JSON to sessionStorage: ${key}`, error);
    }
  },
};

/* ==================== AUTH STORAGE ==================== */
export const authStorage = {
  getToken: (): string | null => {
    return localStorage_utils.getItem(STORAGE_KEYS.AUTH_TOKEN);
  },

  setToken: (token: string): void => {
    localStorage_utils.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
  },

  removeToken: (): void => {
    localStorage_utils.removeItem(STORAGE_KEYS.AUTH_TOKEN);
  },

  getUser: () => {
    return localStorage_utils.getJSON(STORAGE_KEYS.USER);
  },

  setUser: (user: any): void => {
    localStorage_utils.setJSON(STORAGE_KEYS.USER, user);
  },

  removeUser: (): void => {
    localStorage_utils.removeItem(STORAGE_KEYS.USER);
  },

  clearAuth: (): void => {
    authStorage.removeToken();
    authStorage.removeUser();
  },
};

/* ==================== CART STORAGE ==================== */
export const cartStorage = {
  getCart: () => {
    return localStorage_utils.getJSON(STORAGE_KEYS.CART);
  },

  setCart: (cart: any): void => {
    localStorage_utils.setJSON(STORAGE_KEYS.CART, cart);
  },

  clearCart: (): void => {
    localStorage_utils.removeItem(STORAGE_KEYS.CART);
  },
};
