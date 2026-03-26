import { api } from '@/lib/api';
import { isAxiosError } from 'axios';

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface SupportArea { _id: string; name: string; }
export interface AreaShortcut { _id: string; shortName: string; fullName: string; }
export interface RelatedArea { _id: string; main: string; related: string[]; }

function handleError(error: unknown, fallback: string): never {
  if (isAxiosError(error)) {
    throw new Error(error.response?.data?.message || fallback);
  }
  throw error as Error;
}

// Support Areas
export async function getSupportAreas(params: PaginationParams): Promise<PaginatedResponse<SupportArea>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') query.append(k, String(v));
  });
  try {
    const res = await api.get(`/api/areas/support?${query.toString()}`);
    return res.data as PaginatedResponse<SupportArea>;
  } catch (e) {
    return handleError(e, 'Failed to fetch support areas');
  }
}

export async function createSupportArea(name: string): Promise<SupportArea> {
  try {
    const res = await api.post('/api/areas/support', { name });
    return res.data as SupportArea;
  } catch (e) { return handleError(e, 'Failed to create support area'); }
}

export async function updateSupportArea(id: string, name: string): Promise<SupportArea> {
  try {
    const res = await api.put(`/api/areas/support/${id}`, { name });
    return res.data as SupportArea;
  } catch (e) { return handleError(e, 'Failed to update support area'); }
}

export async function deleteSupportArea(id: string): Promise<boolean> {
  try {
    await api.delete(`/api/areas/support/${id}`);
    return true;
  } catch (e) { return handleError(e, 'Failed to delete support area'); }
}

// Shortcuts
export async function getShortcuts(params: PaginationParams): Promise<PaginatedResponse<AreaShortcut>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') query.append(k, String(v));
  });
  try {
    const res = await api.get(`/api/areas/shortcuts?${query.toString()}`);
    return res.data as PaginatedResponse<AreaShortcut>;
  } catch (e) { return handleError(e, 'Failed to fetch shortcuts'); }
}

export async function createShortcut(shortName: string, fullName: string): Promise<AreaShortcut> {
  try {
    const res = await api.post('/api/areas/shortcuts', { shortName, fullName });
    return res.data as AreaShortcut;
  } catch (e) { return handleError(e, 'Failed to create shortcut'); }
}

export async function updateShortcut(id: string, payload: Partial<AreaShortcut>): Promise<AreaShortcut> {
  try {
    const res = await api.put(`/api/areas/shortcuts/${id}`, payload);
    return res.data as AreaShortcut;
  } catch (e) { return handleError(e, 'Failed to update shortcut'); }
}

export async function deleteShortcut(id: string): Promise<boolean> {
  try {
    await api.delete(`/api/areas/shortcuts/${id}`);
    return true;
  } catch (e) { return handleError(e, 'Failed to delete shortcut'); }
}

// Related Areas
export async function getRelatedAreas(params: PaginationParams): Promise<PaginatedResponse<RelatedArea>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') query.append(k, String(v));
  });
  try {
    const res = await api.get(`/api/areas/related?${query.toString()}`);
    return res.data as PaginatedResponse<RelatedArea>;
  } catch (e) { return handleError(e, 'Failed to fetch related areas'); }
}

export async function upsertRelatedArea(main: string, related: string[]): Promise<RelatedArea> {
  try {
    const res = await api.post('/api/areas/related', { main, related });
    return res.data as RelatedArea;
  } catch (e) { return handleError(e, 'Failed to upsert related area'); }
}

export async function updateRelatedArea(id: string, payload: Partial<RelatedArea>): Promise<RelatedArea> {
  try {
    const res = await api.put(`/api/areas/related/${id}`, payload);
    return res.data as RelatedArea;
  } catch (e) { return handleError(e, 'Failed to update related area'); }
}

export async function deleteRelatedArea(id: string): Promise<boolean> {
  try { await api.delete(`/api/areas/related/${id}`); return true; } catch (e) { return handleError(e, 'Failed to delete related area'); }
} 