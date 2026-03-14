import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import mockDataJson from '../data/mockData.json';

// Configure API base URL - can be changed based on environment
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const USE_MOCK_DATA = true; // Set to false to use real API

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/**
 * Generic API request handler
 */
export const apiRequest = async <T>(
  method: 'get' | 'post' | 'put' | 'delete' | 'patch',
  endpoint: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<T> => {
  try {
    const response = await api[method]<T>(endpoint, data || undefined, config);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Mock data support
export const mockData = mockDataJson;

/**
 * Data Service - with mock data support
 */
export const dataService = {
  getBusinessInfo: async (): Promise<any> => {
    if (USE_MOCK_DATA) return mockData.business as any;
    return apiRequest('get', '/business');
  },

  getAlbums: async (): Promise<any[]> => {
    if (USE_MOCK_DATA) return mockData.albums as any[];
    return apiRequest('get', '/albums') as Promise<any[]>;
  },

  getPhotos: async(albumId?: number): Promise<any[]> => {
    if (USE_MOCK_DATA) {
      if (albumId) {
        const album = (mockData.albums as any[]).find(a => a.id === albumId);
        if (album) {
          const photos = (mockData.photos as any)[album.category as keyof typeof mockData.photos];
          return (photos || []) as any[];
        }
        return [] as any[];
      }
      return Object.values(mockData.photos as any).flat() as any[];
    }
    const q = albumId ? `?albumId=${albumId}` : '';
    return apiRequest('get', `/photos${q}`) as Promise<any[]>;
  },

  getPricing: async (): Promise<any> => {
    if (USE_MOCK_DATA) return mockData.pricing as any;
    return apiRequest('get', '/pricing');
  },

  getOrders: async (): Promise<any[]> => {
    if (USE_MOCK_DATA) return mockData.orders as any[];
    return apiRequest('get', '/orders') as Promise<any[]>;
  },

  searchOrder: async (code: string, phone: string): Promise<any> => {
    if (USE_MOCK_DATA) {
      return ((mockData.orders as any[]).find(o => o.code === code && o.phone === phone) || null) as any;
    }
    return apiRequest('get', `/orders/search?code=${code}&phone=${phone}`);
  },

  getStatistics: async (): Promise<any> => {
    if (USE_MOCK_DATA) return mockData.statistics as any;
    return apiRequest('get', '/statistics');
  },

  getSettings: async (): Promise<any> => {
    if (USE_MOCK_DATA) return mockData.settings as any;
    return apiRequest('get', '/settings');
  },

  getDashboardOrders: async (): Promise<any[]> => {
    if (USE_MOCK_DATA) return (mockData as any).orders as any[];
    return apiRequest('get', '/dashboard/orders') as Promise<any[]>;
  },

  getAlbumStats: async (): Promise<any[]> => {
    if (USE_MOCK_DATA) return (mockData as any).albumStats as any[];
    return apiRequest('get', '/dashboard/album-stats') as Promise<any[]>;
  },

  getStaffStats: async (): Promise<any[]> => {
    if (USE_MOCK_DATA) return (mockData as any).staffStats as any[];
    return apiRequest('get', '/dashboard/staff-stats') as Promise<any[]>;
  },

  getCoupons: async (): Promise<any[]> => {
    if (USE_MOCK_DATA) return (mockData as any).coupons as any[];
    return apiRequest('get', '/coupons') as Promise<any[]>;
  },

  getStaff: async (): Promise<any[]> => {
    if (USE_MOCK_DATA) return (mockData as any).staff as any[];
    return apiRequest('get', '/staff') as Promise<any[]>;
  },
};

/**
 * Authentication API calls
 */
export const authAPI = {
  login: (credentials: { email: string; password: string }) =>
    apiRequest('post', '/auth/login', credentials),
  logout: () => apiRequest('post', '/auth/logout'),
  getCurrentUser: () => apiRequest('get', '/auth/me'),
};

/**
 * Albums API calls
 */
export const albumsAPI = {
  getAll: (params?: { page?: number; limit?: number }) =>
    apiRequest('get', '/albums', undefined, { params }),
  getById: (id: string) => apiRequest('get', `/albums/${id}`),
  create: (data: unknown) => apiRequest('post', '/albums', data),
  update: (id: string, data: unknown) => apiRequest('put', `/albums/${id}`, data),
  delete: (id: string) => apiRequest('delete', `/albums/${id}`),
};

/**
 * Cart API calls
 */
export const cartAPI = {
  getCart: () => apiRequest('get', '/cart'),
  addToCart: (data: unknown) => apiRequest('post', '/cart', data),
  updateCart: (data: unknown) => apiRequest('put', '/cart', data),
  removeFromCart: (itemId: string) => apiRequest('delete', `/cart/${itemId}`),
  clearCart: () => apiRequest('delete', '/cart'),
};

/**
 * Orders API calls
 */
export const ordersAPI = {
  getAll: (params?: { page?: number; limit?: number; status?: string }) =>
    apiRequest('get', '/orders', undefined, { params }),
  getById: (id: string) => apiRequest('get', `/orders/${id}`),
  create: (data: unknown) => apiRequest('post', '/orders', data),
  updateStatus: (id: string, status: string) =>
    apiRequest('patch', `/orders/${id}/status`, { status }),
  trackOrder: (id: string) => apiRequest('get', `/orders/${id}/tracking`),
};

/**
 * Users API calls
 */
export const usersAPI = {
  getProfile: () => apiRequest('get', '/users/profile'),
  updateProfile: (data: unknown) => apiRequest('put', '/users/profile', data),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    apiRequest('put', '/users/change-password', data),
};

/**
 * Dashboard Analytics API calls
 */
export const dashboardAPI = {
  getStats: () => apiRequest('get', '/dashboard/stats'),
  getRevenue: (params?: { startDate?: string; endDate?: string }) =>
    apiRequest('get', '/dashboard/revenue', undefined, { params }),
  getOrders: (params?: { page?: number; limit?: number }) =>
    apiRequest('get', '/dashboard/orders', undefined, { params }),
  getStaff: (params?: { page?: number; limit?: number }) =>
    apiRequest('get', '/dashboard/staff', undefined, { params }),
};

export default api;
