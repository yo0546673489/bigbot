import axios, { AxiosError } from 'axios';
import { create } from 'zustand';
import { getDrivers, updateDriver, approveDriver, deleteDriver as deleteDriverService } from '@/services/driverService';

export interface Driver {
  _id: string;
  name: string;
  phone: string;
  id: string;
  vehicle: string;
  clothing: string;
  isApproved: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  ignorePayment?: boolean;
}

interface DriversState {
  items: Driver[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  loading: boolean;
  error: string | null;
  fetchDrivers: (params: { page?: number; limit?: number; search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc', append?: boolean }) => Promise<void>;
  updateDriverStatus: (phone: string, isApproved: boolean) => Promise<void>;
  sendApprovalMessage: (phone: string) => Promise<void>;
  deleteDriver: (phone: string) => Promise<void>;
  updateDriverIgnorePayment: (phone: string, ignorePayment: boolean) => Promise<void>;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  clearError: () => void;
}

export const useDriversStore = create<DriversState>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  limit: 10,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
  loading: false,
  error: null,

  fetchDrivers: async (params) => {
    set({ loading: true, error: null });
    try {
      const { append, ...restParams } = params;
      const response = await getDrivers(restParams);
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
        set({ loading: false, error: error.response?.data?.message || 'Failed to fetch drivers' });
      } else {
        set({ loading: false, error: 'Failed to fetch drivers' });
      }
    }
  },

  updateDriverStatus: async (phone, isApproved) => {
    set({ loading: true, error: null });
    try {
      const response = await updateDriver(phone, { isApproved });
      set((state) => ({
        items: state.items.map((driver) =>
          driver.phone === response.phone ? { ...driver, ...response } : driver
        ),
        loading: false,
      }));
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        set({ loading: false, error: error.response?.data?.message || 'Failed to update driver status' });
      } else {
        set({ loading: false, error: 'Failed to update driver status' });
      }
    }
  },

  sendApprovalMessage: async (phone) => {
    set({ loading: true, error: null });
    try {
      const response = await approveDriver(phone);
      set((state) => ({
        items: state.items.map((driver) =>
          driver.phone === phone ? { ...driver, ...response } : driver
        ),
        loading: false,
      }));
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        set({ loading: false, error: error.response?.data?.message || 'Failed to send approval message' });
      } else {
        set({ loading: false, error: 'Failed to send approval message' });
      }
    }
  },

  deleteDriver: async (phone) => {
    set({ loading: true, error: null });
    try {
      await deleteDriverService(phone);
      set((state) => ({
        items: state.items.filter((driver) => driver.phone !== phone),
        loading: false,
      }));
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        set({ loading: false, error: error.response?.data?.message || 'Failed to delete driver' });
      } else {
        set({ loading: false, error: 'Failed to delete driver' });
      }
    }
  },

  updateDriverIgnorePayment: async (phone, ignorePayment) => {
    set({ loading: true, error: null });
    try {
      const response = await updateDriver(phone, { ignorePayment });
      set((state) => ({
        items: state.items.map((driver) =>
          driver.phone === response.phone ? { ...driver, ...response } : driver
        ),
        loading: false,
      }));
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        set({ loading: false, error: error.response?.data?.message || 'Failed to update ignore payment' });
      } else {
        set({ loading: false, error: 'Failed to update ignore payment' });
      }
    }
  },

  setPage: (page) => set({ page }),
  setLimit: (limit) => set({ limit }),
  clearError: () => set({ error: null }),
})); 