/* ==================== AUTH TYPES ==================== */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'manager' | 'editor' | 'viewer';
  avatar?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  remember?: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

/* ==================== ALBUM TYPES ==================== */
export interface Album {
  id: string;
  name: string;
  description?: string;
  photos: number;
  price: number;
  coverImage?: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'inactive';
}

export interface Photo {
  id: string;
  albumId: string;
  url: string;
  title?: string;
  description?: string;
  uploadedAt: string;
}

/* ==================== ORDER TYPES ==================== */
export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface Order {
  id: string;
  orderNo: string;
  items: OrderItem[];
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  shippingAddress?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  paymentMethod?: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  total: number;
  createdAt: string;
  updatedAt: string;
}

/* ==================== CART TYPES ==================== */
export interface CartItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface Cart {
  items: CartItem[];
  total: number;
  itemCount: number;
}

/* ==================== DASHBOARD TYPES ==================== */
export interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalAlbums: number;
  totalCustomers: number;
  ordersToday: number;
  revenueToday: number;
  newCustomersToday: number;
}

export interface Staff {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive';
  joinedAt: string;
}

export interface PriceTier {
  id: string;
  name: string;
  price: number;
  photos: number;
  description?: string;
  features?: string[];
}

/* ==================== API RESPONSE TYPES ==================== */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
}
