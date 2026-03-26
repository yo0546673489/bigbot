export interface Payment {
  _id: string;
  status: 'paid' | 'pending' | 'failed';
  clientPhone: string;
  clientName?: string;
  clientEmail?: string;
  productName: string;
  sum: string;
  method: 'payBox' | 'creditCard';
  isRecurring: boolean;
  startDate: string;
  endDate: string;
  nextPaymentDate?: number;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  paymentsNum?: string;
  cardSuffix?: string;
  cardExpDate?: string;
} 