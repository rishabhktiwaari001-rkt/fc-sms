import { AuthUser } from '@fc-sms/types';

export function getToken(): string | null {
  return localStorage.getItem('fc_token');
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem('fc_user');
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthUser; } catch { return null; }
}

export function setSession(token: string, user: AuthUser) {
  localStorage.setItem('fc_token', token);
  localStorage.setItem('fc_user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('fc_token');
  localStorage.removeItem('fc_user');
}

export function isLoggedIn(): boolean {
  return !!getToken();
}
