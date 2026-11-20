import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiClient, clearAuthToken, setAuthToken, tokenStore } from '../api/apiClient';
import { API_ENDPOINTS } from '../api/endpoints';
import { assertResident, Envelope, errorMessage, Resident, unwrap } from '../api/resident';

interface AuthState {
  user: Resident | null; restoring: boolean; restoreError: string;
  restore: () => Promise<void>; signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Resident | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState('');
  const sequence = useRef(0);
  const signOut = useCallback(async () => {
    sequence.current++;
    setUser(null);
    setRestoring(false);
    setRestoreError('');
    try { await clearAuthToken(); }
    catch { setRestoreError('Không xóa được phiên lưu trên máy. Hãy thử đăng xuất lại.'); }
  }, []);
  const restore = useCallback(async () => {
    const attempt = ++sequence.current;
    setRestoring(true);
    setRestoreError('');
    try {
      const snapshot = await tokenStore.snapshot();
      if (!snapshot.token) { if (sequence.current === attempt) setUser(null); return; }
      const response = await apiClient.get<Envelope<Resident>>(API_ENDPOINTS.AUTH.ME);
      const resident = unwrap(response.data);
      try { assertResident(resident); }
      catch (cause) { await clearAuthToken(); setRestoreError(errorMessage(cause)); return; }
      if (sequence.current === attempt) setUser(resident);
    } catch (cause) {
      if (sequence.current === attempt) setRestoreError(errorMessage(cause));
    } finally {
      if (sequence.current === attempt) setRestoring(false);
    }
  }, []);
  const signIn = useCallback(async (identifier: string, password: string) => {
    const attempt = ++sequence.current;
    const response = await apiClient.post<Envelope<{ token: string; user: Resident }>>(
      API_ENDPOINTS.AUTH.LOGIN, { identifier: identifier.trim(), password });
    const payload = unwrap(response.data);
    assertResident(payload.user);
    if (sequence.current !== attempt) return;
    await setAuthToken(payload.token);
    if (sequence.current === attempt) setUser(payload.user);
  }, []);
  useEffect(() => {
    const unsubscribe = tokenStore.subscribe(() => {
      sequence.current++;
      setUser(null);
      setRestoring(false);
      setRestoreError('');
    });
    void restore();
    return () => { sequence.current++; unsubscribe(); };
  }, [restore]);
  return <AuthContext.Provider value={{ user, restoring, restoreError, restore, signIn, signOut }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider is required.');
  return context;
}
