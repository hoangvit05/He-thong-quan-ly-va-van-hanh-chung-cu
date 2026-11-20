import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import { createTokenStore } from './tokenStore';
import { API_ENDPOINTS } from './endpoints';

const defaultApiUrl = Platform.select({
  android: 'http://10.0.2.2:5000',
  ios: 'http://localhost:5000',
  default: 'http://localhost:5000',
});
export const tokenStore = createTokenStore(AsyncStorage);
export async function getAuthToken() { return (await tokenStore.snapshot()).token; }
export async function setAuthToken(token: string) { await tokenStore.set(token); }
export async function clearAuthToken() { await tokenStore.clear(); }

interface SessionRequest extends InternalAxiosRequestConfig {
  sessionVersion?: number;
}
export const apiClient = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL?.trim() || defaultApiUrl,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});
apiClient.interceptors.request.use(async (config: SessionRequest) => {
  // A failed login must never revoke a different authenticated request's session.
  if (config.url === API_ENDPOINTS.AUTH.LOGIN) {
    config.headers.delete('Authorization');
    return config;
  }
  const snapshot = await tokenStore.snapshot();
  if (snapshot.token) {
    config.headers.set('Authorization', 'Bearer ' + snapshot.token);
    config.sessionVersion = snapshot.version;
  }
  return config;
});
apiClient.interceptors.response.use(response => response, async (error: AxiosError) => {
  const config = error.config as SessionRequest | undefined;
  if (error.response?.status === 401 && config?.sessionVersion !== undefined) {
    try {
      await tokenStore.clear(config.sessionVersion);
    } catch {
      return Promise.reject(new Error('Phiên đã kết thúc nhưng chưa xóa được phiên lưu trên máy. Hãy thử đăng xuất lại.'));
    }
  }
  return Promise.reject(error);
});
