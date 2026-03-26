import axios from 'axios';
import { getAuthToken } from '@/utils/auth';
import { removeAuthToken } from '@/utils/auth';

// Create a global axios instance
export const api = axios.create({
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  withCredentials: true,
});

// Add a request interceptor to include Authorization header if token exists
api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add a response interceptor to handle 401 errors and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response &&
      error.response.status === 401 &&
      error.response.data?.message === 'Missing or invalid authorization token'
    ) {
      // Prevent redirect loop if already on login page
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        // toast.error('Your session has expired or is invalid. Please log in again.');
        removeAuthToken();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export async function loginUser(credentials: { email: string; password: string }) {
  try {
    const response = await api.post('/api/auth/login', credentials);
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || 'Failed to login');
    }
    throw new Error('Failed to login');
  }
}

export async function getWhatsappStatus(): Promise<{ phone: string; isHealthy: boolean }[]> {
  const response = await api.get('/api/waweb/whatsapp-status');
  return response.data;
}

export async function sendWhatsappPairingCode(phone: string): Promise<{ success: boolean; message?: string }> {
  const response = await api.post('/api/waweb/send-pairing-code', { phone });
  return response.data;
} 

export async function sendMessage(phone: string, message: string) {
  try {
    const response = await api.post(`/api/drivers/${phone}/message`, { message });
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || 'Failed to send message');
    }
    throw new Error('Failed to send message');
  }
}