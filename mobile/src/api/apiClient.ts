import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';

const defaultApiUrl = Platform.select({
  android: 'http://10.0.2.2:5000',
  ios: 'http://localhost:5000',
  default: 'http://localhost:5000',
});

const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim() || defaultApiUrl;
const AUTH_TOKEN_KEY = '@apartment-management/auth-token';

export async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(AUTH_TOKEN_KEY);
}

export async function setAuthToken(token: string): Promise<void> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new Error('Không thể lưu token rỗng.');
  }

  await AsyncStorage.setItem(AUTH_TOKEN_KEY, normalizedToken);
}

export async function clearAuthToken(): Promise<void> {
  await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
}

export const apiClient = axios.create({
  baseURL: apiUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await getAuthToken();
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }

    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await clearAuthToken();
    }

    return Promise.reject(error);
  }
);
