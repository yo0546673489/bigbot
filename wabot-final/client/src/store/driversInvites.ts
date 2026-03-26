import axios, { AxiosError } from 'axios';
import { create } from 'zustand';
import { getDriversInvites, updateDriverInvite, inviteDriver, deleteInvitation as deleteDriverService, addDriverInvite } from '@/services/driversInvitesService';

export enum InvitationStatus {
  PENDING = 'pending',
  INVITED = 'invited',
}

export interface DriversInvites {
  _id: string;
  phone: string;
  id: string;
  status: InvitationStatus;
  createdAt: string;
  updatedAt: string;
}

interface DriversInvitesState {
  items: DriversInvites[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  loading: boolean;
  error: string | null;
  fetchDriversInvites: (params: { page?: number; limit?: number; search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc'; append?: boolean }) => Promise<void>;
  updateDriverInvite: (phone: string, isInvited: boolean) => Promise<void>;
  sendInviteMessage: (phone: string) => Promise<void>;
  addDriversInvite: (phones: string[]) => Promise<void>;
  deleteDriver: (phone: string) => Promise<void>;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  clearError: () => void;
}

export const useDriversInvitesStore = create<DriversInvitesState>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  limit: 10,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
  loading: false,
  error: null,

  fetchDriversInvites: async (params) => {
    set({ loading: true, error: null });
    try {
      const { append, ...fetchParams } = params;
      const response = await getDriversInvites(fetchParams);
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

  updateDriverInvite: async (phone, isInvited) => {
    set({ loading: true, error: null });
    try {
      const response = await updateDriverInvite(phone, { isInvited });
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

  sendInviteMessage: async (phone) => {
    set({ loading: true, error: null });
    try {
      const response = await inviteDriver(phone);
      set((state) => ({
        items: state.items.map((driver) =>
          driver.phone === phone ? { ...driver, ...response } : driver
        ),
        loading: false,
      }));
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        set({ loading: false, error: error.response?.data?.message || 'Failed to send invite' });
      } else {
        set({ loading: false, error: 'Failed to send invite message' });
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

  addDriversInvite: async (phones: string[]) => {
    set({ loading: true, error: null });
    try {
      const data = await addDriverInvite(phones);
      set((state) => ({
        loading: false,
      }));
    } catch (error: unknown) {
      console.log(error);
      if (axios.isAxiosError(error)) {
        set({ loading: false, error: error.response?.data?.message || 'Failed to add driver' });
      } else {
        set({ loading: false, error: 'Failed to add driver' });
      }
    }
  },

  setPage: (page) => set({ page }),
  setLimit: (limit) => set({ limit }),
  clearError: () => set({ error: null }),
})); 