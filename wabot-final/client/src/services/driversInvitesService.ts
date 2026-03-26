import { DriversInvites } from '@/store/driversInvites';
import { api } from '@/lib/api';
import { isAxiosError } from 'axios';

export interface GetDriversInvitesParams {
  page?: number;
  limit?: number;
  search?: string;
  isInvited?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface GetDriversInvitesResponse {
  data: DriversInvites[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface SendMessageResponse {
  success: boolean;
  message: string;
}

export async function getDriversInvites(params: GetDriversInvitesParams): Promise<GetDriversInvitesResponse> {
  const queryParams = new URLSearchParams();

  // Add all parameters to query string
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      queryParams.append(key, value.toString());
    }
  });

  try {
    const response = await api.get(`/api/invitations?${queryParams.toString()}`);
    return response.data;
  } catch (error: unknown) {
    if (isAxiosError(error)) {
      throw new Error(error.response?.data?.message || 'Failed to fetch drivers');
    }
    throw error;
  }
}

export async function updateDriverInvite(phone: string, data: { isInvited?: boolean }): Promise<DriversInvites> {
  try {
    const response = await api.patch(`/api/invitations/${phone}`, data);
    return response.data;
  } catch (error: unknown) {
    if (isAxiosError(error)) {
      throw new Error(error.response?.data?.message || 'Failed to update driver');
    }
    throw error;
  }
}

export async function sendMessage(phone: string, message: string): Promise<SendMessageResponse> {
  try {
    const response = await api.post(`/api/drivers/${phone}/message`, { message });
    return response.data;
  } catch (error: unknown) {
    if (isAxiosError(error)) {
      throw new Error(error.response?.data?.message || 'Failed to send message');
    }
    throw error;
  }
}

export async function addDriverInvite(phones: string[]): Promise<DriversInvites[]> {
  try {
    const response = await api.post(`/api/invitations`, { phones });
    return response.data;
  } catch (error: unknown) {
    if (isAxiosError(error)) {
      throw new Error(error.response?.data?.message || 'Failed to send approval message');
    }
    throw error;
  }
}

export async function inviteDriver(phone: string): Promise<{ success: boolean }> {
  try {
    const response = await api.get(`/api/invitations/${phone}/invite`);
    return response.data;
  } catch (error: unknown) {
    if (isAxiosError(error)) {
      throw new Error(error.response?.data?.message || 'Failed to send approval message');
    }
    throw error;
  }
}

export async function deleteInvitation(phone: string): Promise<{ success: boolean }> {
  try {
    const response = await api.delete(`/api/invitations/${phone}`);
    return response.data;
  } catch (error: unknown) {
    if (isAxiosError(error)) {
      throw new Error(error.response?.data?.message || 'Failed to delete driver');
    }
    throw error;
  }
} 