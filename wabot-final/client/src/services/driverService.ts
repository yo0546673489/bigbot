import { Driver } from '@/store/driversStore';
import { api } from '@/lib/api';
import axios from 'axios';

export interface GetDriversParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  clothing?: string;
  language?: string;
  isApproved?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface GetDriversResponse {
  data: Driver[];
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

export async function getDrivers(params: GetDriversParams): Promise<GetDriversResponse> {
  const queryParams = new URLSearchParams();
  
  // Add all parameters to query string
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      queryParams.append(key, value.toString());
    }
  });

  try {
    const response = await api.get(`/api/drivers?${queryParams.toString()}`);
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || 'Failed to fetch drivers');
    }
    throw error;
  }
}

export async function updateDriver(phone: string, data: { name?: string; vehicle?: string; clothing?: string; isApproved?: boolean; isActive?: boolean; ignorePayment?: boolean }): Promise<Driver> {
  try {
    const response = await api.patch(`/api/drivers/${phone}`, data);
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
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
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || 'Failed to send message');
    }
    throw error;
  }
}

export async function approveDriver(phone: string): Promise<{ success: boolean }> {
  try {
    const response = await api.post(`/api/drivers/${phone}/approve`, {});
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || 'Failed to send approval message');
    }
    throw error;
  }
}

export async function deleteDriver(phone: string): Promise<{ success: boolean }> {
  try {
    const response = await api.delete(`/api/drivers/${phone}`);
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || 'Failed to delete driver');
    }
    throw error;
  }
} 