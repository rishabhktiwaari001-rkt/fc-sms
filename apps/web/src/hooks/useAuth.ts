import { createContext, useContext } from 'react';
import { AuthUser } from '@fc-sms/types';
import { getUser, getToken, setSession, clearSession } from '../lib/auth';
import { api } from '../lib/api';

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => void;
  isLoggedIn: boolean;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  login: async () => {},
  logout: () => {},
  isLoggedIn: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function createAuthValue(
  forceUpdate: () => void
): AuthContextValue {
  const user = getUser();
  const token = getToken();

  const login = async (phone: string, password: string) => {
    const res = await api.post('/auth/login', { phone, password });
    const { token: t, user: u } = res.data.data;
    setSession(t, u);
    forceUpdate();
  };

  const logout = () => {
    clearSession();
    window.location.href = '/login';
  };

  return {
    user,
    token,
    login,
    logout,
    isLoggedIn: !!token,
  };
}
