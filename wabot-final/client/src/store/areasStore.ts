import { create } from 'zustand';
import { AreaShortcut, RelatedArea, SupportArea, createShortcut, createSupportArea, deleteShortcut, deleteSupportArea, getRelatedAreas, getShortcuts, getSupportAreas, updateShortcut, updateSupportArea, upsertRelatedArea, updateRelatedArea, deleteRelatedArea } from '@/services/areasService';

interface PaginationState<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  loading: boolean;
  error: string | null;
}

interface AreasState {
  support: PaginationState<SupportArea>;
  shortcuts: PaginationState<AreaShortcut>;
  related: PaginationState<RelatedArea>;
  // Support
  fetchSupport: (params: { page?: number; limit?: number; search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc'; append?: boolean }) => Promise<void>;
  addSupport: (name: string) => Promise<void>;
  editSupport: (id: string, name: string) => Promise<void>;
  removeSupport: (id: string) => Promise<void>;
  // Shortcuts
  fetchShortcuts: (params: { page?: number; limit?: number; search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc'; append?: boolean }) => Promise<void>;
  addShortcut: (shortName: string, fullName: string) => Promise<void>;
  editShortcut: (id: string, payload: Partial<AreaShortcut>) => Promise<void>;
  removeShortcut: (id: string) => Promise<void>;
  // Related
  fetchRelated: (params: { page?: number; limit?: number; search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc'; append?: boolean }) => Promise<void>;
  upsertRelated: (main: string, related: string[]) => Promise<void>;
  editRelated: (id: string, payload: Partial<RelatedArea>) => Promise<void>;
  removeRelated: (id: string) => Promise<void>;
  clearError: () => void;
}

const defaultPagination = {
  items: [], total: 0, page: 1, limit: 10, totalPages: 0, hasNextPage: false, hasPreviousPage: false, loading: false, error: null as string | null
};

// Helper function to deduplicate items by _id
const deduplicateItems = <T extends { _id: string }>(existingItems: T[], newItems: T[]): T[] => {
  const existingIds = new Set(existingItems.map(item => item._id));
  return newItems.filter(newItem => !existingIds.has(newItem._id));
};

export const useAreasStore = create<AreasState>((set, get) => ({
  support: { ...defaultPagination },
  shortcuts: { ...defaultPagination },
  related: { ...defaultPagination },

  async fetchSupport(params) {
    set(state => ({ support: { ...state.support, loading: true, error: null } }));
    try {
      const { append, ...q } = params || {};
      const res = await getSupportAreas(q);
      set(state => ({
        support: {
          ...state.support,
          items: append ? [...state.support.items, ...deduplicateItems(state.support.items, res.data)] : res.data,
          total: res.total,
          page: res.page,
          limit: res.limit,
          totalPages: res.totalPages,
          hasNextPage: res.hasNextPage,
          hasPreviousPage: res.hasPreviousPage,
          loading: false,
        }
      }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to fetch support areas';
      set(state => ({ support: { ...state.support, loading: false, error: message } }));
    }
  },

  async addSupport(name) {
    await createSupportArea(name);
    await get().fetchSupport({ page: 1, limit: get().support.limit, append: false });
  },

  async editSupport(id, name) {
    await updateSupportArea(id, name);
    await get().fetchSupport({ page: get().support.page, limit: get().support.limit, append: false });
  },

  async removeSupport(id) {
    await deleteSupportArea(id);
    await get().fetchSupport({ page: 1, limit: get().support.limit, append: false });
  },

  async fetchShortcuts(params) {
    set(state => ({ shortcuts: { ...state.shortcuts, loading: true, error: null } }));
    try {
      const { append, ...q } = params || {};
      const res = await getShortcuts(q);
      set(state => ({
        shortcuts: {
          ...state.shortcuts,
          items: append ? [...state.shortcuts.items, ...deduplicateItems(state.shortcuts.items, res.data)] : res.data,
          total: res.total,
          page: res.page,
          limit: res.limit,
          totalPages: res.totalPages,
          hasNextPage: res.hasNextPage,
          hasPreviousPage: res.hasPreviousPage,
          loading: false,
        }
      }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to fetch shortcuts';
      set(state => ({ shortcuts: { ...state.shortcuts, loading: false, error: message } }));
    }
  },

  async addShortcut(shortName, fullName) {
    await createShortcut(shortName, fullName);
    await get().fetchShortcuts({ page: 1, limit: get().shortcuts.limit, append: false });
  },

  async editShortcut(id, payload) {
    await updateShortcut(id, payload);
    await get().fetchShortcuts({ page: get().shortcuts.page, limit: get().shortcuts.limit, append: false });
  },

  async removeShortcut(id) {
    await deleteShortcut(id);
    await get().fetchShortcuts({ page: 1, limit: get().shortcuts.limit, append: false });
  },

  async fetchRelated(params) {
    set(state => ({ related: { ...state.related, loading: true, error: null } }));
    try {
      const { append, ...q } = params || {};
      const res = await getRelatedAreas(q);
      set(state => ({
        related: {
          ...state.related,
          items: append ? [...state.related.items, ...deduplicateItems(state.related.items, res.data)] : res.data,
          total: res.total,
          page: res.page,
          limit: res.limit,
          totalPages: res.totalPages,
          hasNextPage: res.hasNextPage,
          hasPreviousPage: res.hasPreviousPage,
          loading: false,
        }
      }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to fetch related areas';
      set(state => ({ related: { ...state.related, loading: false, error: message } }));
    }
  },

  async upsertRelated(main, related) {
    await upsertRelatedArea(main, related);
    await get().fetchRelated({ page: 1, limit: get().related.limit, append: false });
  },

  async editRelated(id, payload) {
    await updateRelatedArea(id, payload);
    await get().fetchRelated({ page: get().related.page, limit: get().related.limit, append: false });
  },

  async removeRelated(id) {
    await deleteRelatedArea(id);
    await get().fetchRelated({ page: 1, limit: get().related.limit, append: false });
  },

  clearError() {
    set(state => ({
      support: { ...state.support, error: null },
      shortcuts: { ...state.shortcuts, error: null },
      related: { ...state.related, error: null },
    }));
  }
})); 