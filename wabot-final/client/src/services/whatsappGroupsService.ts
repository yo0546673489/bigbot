import { WhatsAppGroup } from '@/types/whatsapp-group';
import { api } from '@/lib/api';
import { isAxiosError } from 'axios';

export interface GetWhatsAppGroupsParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface GetWhatsAppGroupsResponse {
  data: WhatsAppGroup[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export async function updateWhatsAppGroup(groupId: string, data: { name?: string; description?: string }): Promise<WhatsAppGroup> {
  try {
    const response = await api.put(`/api/whatsapp-groups/${groupId}`, data);
    return response.data;
  } catch (error: unknown) {
    if (isAxiosError(error)) throw new Error(error.response?.data?.message || 'Failed to update group');
    throw error;
  }
}

export async function deleteWhatsAppGroup(groupId: string): Promise<void> {
  try {
    await api.delete(`/api/whatsapp-groups/${groupId}`);
  } catch (error: unknown) {
    if (isAxiosError(error)) throw new Error(error.response?.data?.message || 'Failed to delete group');
    throw error;
  }
}

export async function getWhatsAppGroups(params: GetWhatsAppGroupsParams): Promise<GetWhatsAppGroupsResponse> {
  const queryParams = new URLSearchParams();
  
  // Add all parameters to query string
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      queryParams.append(key, value.toString());
    }
  });

  try {
    const response = await api.get(`/api/whatsapp-groups?${queryParams.toString()}`);
    return response.data;
  } catch (error: unknown) {
    if (isAxiosError(error)) {
      throw new Error(error.response?.data?.message || 'Failed to fetch WhatsApp groups');
    }
    throw error;
  }
}
