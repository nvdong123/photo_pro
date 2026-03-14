/* ==================== API CONSTANTS ==================== */
export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  TIMEOUT: 10000,
  RETRY_ATTEMPTS: 3,
};

/* ==================== ROUTES ==================== */
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  ALBUMS: '/albums',
  CART: '/cart',
  CHECKOUT: '/checkout',
  DELIVERY: '/delivery',
  SUCCESS: '/success',
  FACE_SEARCH: '/face-search',
  LOOKUP: '/lookup',
  RESULTS: '/results',
  DASHBOARD: '/dashboard',
  DASHBOARD_HOME: '/dashboard',
  DASHBOARD_ALBUMS: '/dashboard/albums',
  DASHBOARD_ORDERS: '/dashboard/orders',
  DASHBOARD_REVENUE: '/dashboard/revenue',
  DASHBOARD_SETTINGS: '/dashboard/settings',
  DASHBOARD_PROFILE: '/dashboard/profile',
  DASHBOARD_STAFF: '/dashboard/staff',
  DASHBOARD_PRICING: '/dashboard/pricing',
  NOT_FOUND: '/404',
};

/* ==================== ORDER STATUS ==================== */
export const ORDER_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

export const ORDER_STATUS_COLORS = {
  pending: 'red',
  processing: 'blue',
  shipped: 'orange',
  delivered: 'green',
  cancelled: 'default',
};

export const ORDER_STATUS_LABELS = {
  pending: 'Pending',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/* ==================== ALBUM STATUS ==================== */
export const ALBUM_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
};

/* ==================== DELIVERY METHODS ==================== */
export const DELIVERY_METHODS = [
  { id: 'standard', name: 'Standard (5-7 days)', price: 5.0 },
  { id: 'express', name: 'Express (2-3 days)', price: 15.0 },
  { id: 'overnight', name: 'Overnight', price: 25.0 },
];

/* ==================== PAYMENT METHODS ==================== */
export const PAYMENT_METHODS = [
  { id: 'credit_card', name: 'Credit Card' },
  { id: 'debit_card', name: 'Debit Card' },
  { id: 'paypal', name: 'PayPal' },
  { id: 'stripe', name: 'Stripe' },
];

/* ==================== USER ROLES ==================== */
export const USER_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  EDITOR: 'editor',
  VIEWER: 'viewer',
};

/* ==================== STORAGE KEYS ==================== */
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'authToken',
  USER: 'user',
  CART: 'cart',
  THEME: 'theme',
};

/* ==================== PAGINATION ==================== */
export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZES = [10, 20, 50, 100];

/* ==================== MESSAGES ==================== */
export const MESSAGES = {
  // Success
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logged out successfully',
  DATA_SAVED: 'Data saved successfully',
  DATA_DELETED: 'Data deleted successfully',
  ACTION_SUCCESS: 'Action completed successfully',
  
  // Error
  LOGIN_FAILED: 'Login failed',
  UNAUTHORIZED: 'Unauthorized access',
  NOT_FOUND: 'Resource not found',
  SERVER_ERROR: 'Server error occurred',
  NETWORK_ERROR: 'Network error occurred',
  VALIDATION_ERROR: 'Please check your input',
  
  // Info
  CONFIRMING: 'Are you sure you want to proceed?',
  LOADING: 'Loading...',
};

/* ==================== VALIDATION RULES ==================== */
export const VALIDATION_RULES = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^[0-9-+]{10,}$/,
  ZIP_CODE: /^[0-9]{5,6}$/,
  PASSWORD_MIN_LENGTH: 6,
};

/* ==================== DEFAULT VALUES ==================== */
export const DEFAULT_VALUES = {
  TAX_RATE: 0.08,
  CURRENCY: 'USD',
  CURRENCY_SYMBOL: '$',
  LANGUAGE: 'en',
  DATE_FORMAT: 'MM/DD/YYYY',
  TIME_FORMAT: 'HH:mm:ss',
};
