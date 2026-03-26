import { Payment } from '@/types/payment';
import { api } from '@/lib/api';
import { isAxiosError } from 'axios';

export interface GetPaymentsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  method?: string;
  isRecurring?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface GetPaymentsResponse {
  data: Payment[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export async function getPayments(params: GetPaymentsParams): Promise<GetPaymentsResponse> {
  const queryParams = new URLSearchParams();
  
  // Add all parameters to query string
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      queryParams.append(key, value.toString());
    }
  });

  try {
    const response = await api.get(`/api/payment?${queryParams.toString()}`);
    return response.data;
  } catch (error: unknown) {
    if (isAxiosError(error)) {
      throw new Error(error.response?.data?.message || 'Failed to fetch payments');
    }
    throw error;
  }
}

export async function updatePayment(id: string, data: Partial<Payment>): Promise<Payment> {
  try {
    const response = await api.patch(`/api/payment/${id}`, data);
    return response.data;
  } catch (error: unknown) {
    if (isAxiosError(error)) {
      throw new Error(error.response?.data?.message || 'Failed to update payment');
    }
    throw error;
  }
}

export async function deletePayment(id: string): Promise<{ success: boolean }> {
  try {
    const response = await api.delete(`/api/payment/${id}`);
    return response.data;
  } catch (error: unknown) {
    if (isAxiosError(error)) {
      throw new Error(error.response?.data?.message || 'Failed to delete payment');
    }
    throw error;
  }
} 