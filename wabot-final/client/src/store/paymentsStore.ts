import axios, { AxiosError } from 'axios';
import { create } from 'zustand';
import { getPayments, updatePayment, deletePayment as deletePaymentService } from '@/services/paymentService';
import { Payment } from '@/types/payment';

interface PaymentsState {
  items: Payment[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  loading: boolean;
  error: string | null;
  fetchPayments: (params: { page?: number; limit?: number; search?: string; status?: string; method?: string; isRecurring?: string; sortBy?: string; sortOrder?: 'asc' | 'desc', append?: boolean }) => Promise<void>;
  updatePaymentStatus: (id: string, status: Payment['status']) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  clearError: () => void;
}

export const usePaymentsStore = create<PaymentsState>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  limit: 10,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
  loading: false,
  error: null,

  fetchPayments: async (params) => {
    set({ loading: true, error: null });
    try {
      const { append, ...restParams } = params;
      const response = await getPayments(restParams);
      set((state) => ({
        items: append ? [...state.items, ...response.data] : response.data,
        total: response.total,
        page: response.page,
        limit: response.limit,
        totalPages: response.totalPages,
        hasNextPage: response.hasNextPage,
        hasPreviousPage: response.hasPreviousPage,
        loading: false,
      }));
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        set({ loading: false, error: error.response?.data?.message || 'Failed to fetch payments' });
      } else {
        set({ loading: false, error: 'Failed to fetch payments' });
      }
    }
  },

  updatePaymentStatus: async (id, status) => {
    set({ loading: true, error: null });
    try {
      const response = await updatePayment(id, { status });
      set((state) => ({
        items: state.items.map((payment) =>
          payment._id === response._id ? { ...payment, ...response } : payment
        ),
        loading: false,
      }));
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        set({ loading: false, error: error.response?.data?.message || 'Failed to update payment status' });
      } else {
        set({ loading: false, error: 'Failed to update payment status' });
      }
    }
  },

  deletePayment: async (id) => {
    set({ loading: true, error: null });
    try {
      await deletePaymentService(id);
      set((state) => ({
        items: state.items.filter((payment) => payment._id !== id),
        loading: false,
      }));
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        set({ loading: false, error: error.response?.data?.message || 'Failed to delete payment' });
      } else {
        set({ loading: false, error: 'Failed to delete payment' });
      }
    }
  },

  setPage: (page) => set({ page }),
  setLimit: (limit) => set({ limit }),
  clearError: () => set({ error: null }),
})); 