import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const API_BASE_KEY = 'api_base_url';
const TOKEN_KEY = 'auth_token';

/** URL from app.json extra.apiUrl — used as the default when no override is stored. */
const CONFIG_API_URL: string =
  (Constants.expoConfig?.extra as Record<string, string> | undefined)?.apiUrl ??
  'https://api.102photo.trip360.vn';

export async function getApiBase(): Promise<string> {
  const stored = await AsyncStorage.getItem(API_BASE_KEY);
  return stored ?? CONFIG_API_URL;
}

export async function setApiBase(url: string): Promise<void> {
  const trimmed = url.trim().replace(/\/$/, '');
  await AsyncStorage.setItem(API_BASE_KEY, trimmed);
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  return AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  return AsyncStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const base = await getApiBase();
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(`${base}${path}`, { ...options, headers });
}

export async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    const msg = (err as Record<string, Record<string, string>>)?.error?.message
      ?? String(res.status);
    throw new Error(msg);
  }
  const json = await res.json() as { data: T };
  return json.data;
}
