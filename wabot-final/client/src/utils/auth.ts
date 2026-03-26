import Cookies from 'js-cookie';
import { AUTH_CONFIG } from '../common/constants';

const isBrowser = typeof window !== 'undefined';

export const setAuthToken = (token: string) => {
  if (isBrowser) {
    localStorage.setItem(AUTH_CONFIG.tokenKey, token);
  }
  Cookies.set(AUTH_CONFIG.tokenKey, token, { expires: AUTH_CONFIG.tokenExpiry });
};

export const getAuthToken = (): string | null => {
  if (!isBrowser) {
    return Cookies.get(AUTH_CONFIG.tokenKey) || null;
  }
  return localStorage.getItem(AUTH_CONFIG.tokenKey) || Cookies.get(AUTH_CONFIG.tokenKey) || null;
};

export const removeAuthToken = () => {
  if (isBrowser) {
    localStorage.removeItem(AUTH_CONFIG.tokenKey);
  }
  Cookies.remove(AUTH_CONFIG.tokenKey);
};

export const isAuthenticated = () => {
  return !!getAuthToken();
}; 