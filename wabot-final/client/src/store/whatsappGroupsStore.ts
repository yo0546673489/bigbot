import axios, { AxiosError } from 'axios';
import { create } from 'zustand';
import { getWhatsAppGroups } from '@/services/whatsappGroupsService';
import { WhatsAppGroup } from '@/types/whatsapp-group';

interface WhatsAppGroupsState {
  items: WhatsAppGroup[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  loading: boolean;
  error: string | null;
  fetchWhatsAppGroups: (params: { 
    page?: number; 
    limit?: number; 
    search?: string; 
    status?: string; 
    method?: string; 
    isRecurring?: string; 
    sortBy?: string; 
    sortOrder?: 'asc' | 'desc'; 
    append?: boolean 
  }) => Promise<void>;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  clearError: () => void;
}

export const useWhatsAppGroupsStore = create<WhatsAppGroupsState>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  limit: 50,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
  loading: false,
  error: null,

  fetchWhatsAppGroups: async (params) => {
    set({ loading: true, error: null });
    try {
      const { append, ...fetchParams } = params;
      const response = await getWhatsAppGroups(fetchParams);
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
        set({ loading: false, error: error.response?.data?.message || 'Failed to fetch WhatsApp groups' });
      } else {
        set({ loading: false, error: 'Failed to fetch WhatsApp groups' });
      }
    }
  },
    
  setPage: (page) => set({ page }),
  setLimit: (limit) => set({ limit }),
  clearError: () => set({ error: null }),
})); 