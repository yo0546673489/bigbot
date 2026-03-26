export type VehicleType = 'sedan' | 'suv' | 'van' | 'station';
export type ClothingType = 'formal' | 'casual' | 'uniform' | 'home_driver';

export interface Driver {
  _id: string;
  name: string;
  phone: string;
  id: string;
  vehicleType: VehicleType;
  vehicleNumber: string;
  clothing: ClothingType;
  driverPhoto: string;
  driverLicense: string;
  vehicleLicense: string;
  drivingAreas: string[];
  isApproved: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedDriversResponse {
  data: Driver[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface GetDriversParams {
  search?: string;
  vehicleType?: VehicleType;
  clothing?: ClothingType;
  isApproved?: boolean;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
} 