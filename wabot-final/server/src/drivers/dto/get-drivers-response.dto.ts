import { Driver } from '../schemas/driver.schema';

export class PaginatedDriversResponse {
  data: Driver[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
} 