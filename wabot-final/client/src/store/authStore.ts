import { create } from 'zustand';
import { loginUser } from '@/lib/api';
import { setAuthToken, removeAuthToken } from '@/utils/auth';

export interface User {
  id: string;
  name: string;
  email: string;
  // Add any other fields your user object has
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  logout: () => void;
  setError: (error: string | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  loading: false,
  error: null,
  login: async (credentials) => {
    set({ loading: true, error: null });
    try {
      const data = await loginUser(credentials);
      setAuthToken(data.token);
      set({ user: data.user, isAuthenticated: true, loading: false, error: null });
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'message' in error) {
        set({ error: (error as { message: string }).message, loading: false });
      } else {
        set({ error: 'Login failed', loading: false });
      }
      throw error;
    }
  },
  logout: () => {
    removeAuthToken();
    set({ user: null, isAuthenticated: false, loading: false, error: null });
  },
  setError: (error) => set({ error }),
})); 