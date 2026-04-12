"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePaymentsStore } from '@/store/paymentsStore';
import { Payment } from '@/types/payment';
import MainLayout from "@/components/layout/MainLayout";
import DeleteConfirmationModal from "@/components/common/DeleteConfirmationModal";
import toast from 'react-hot-toast';
import debounce from 'lodash/debounce';
import { IoChevronDown } from "react-icons/io5";
import moment from 'moment-timezone';

export function PaymentsClient() {
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [resetList, setResetList] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [tableMaxHeight, setTableMaxHeight] = useState<string>('400px');
  useEffect(() => {
    function updateTableHeight() {
      const h = Math.max(window.innerHeight - 300, 300);
      setTableMaxHeight(`${h}px`);
    }
    updateTableHeight();
    window.addEventListener('resize', updateTableHeight);
    return () => window.removeEventListener('resize', updateTableHeight);
  }, []);
  const [filters, setFilters] = useState({
    status: '',
    method: '',
    isRecurring: '',
  });

  const {
    items: payments,
    total,
    page,
    limit,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    loading,
    error,
    fetchPayments,
    updatePaymentStatus,
    deletePayment,
    setPage,
    setLimit,
    clearError,
  } = usePaymentsStore();

  // Fetch on mount or filter change (reset list)
  useEffect(() => {
    fetchPayments({
      page: 1,
      limit,
      ...filters,
      append: false
    });
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, limit]);

  // Fetch more when page changes (but not on filter reset)
  useEffect(() => {
    if (page === 1) return;
    setIsFetchingMore(true);
    fetchPayments({
      page,
      limit,
      ...filters,
      append: true
    }).finally(() => setIsFetchingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleFilterChange = (filterName: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
  };

  const debouncedSearch = useCallback(
    (value: string) => {
      const debouncedFn = debounce((searchValue: string) => {
        setFilters(prev => ({
          ...prev,
          search: searchValue
        }));
      }, 300);
      debouncedFn(value);
    },
    []
  );

  const handleSearch = (value: string) => {
    debouncedSearch(value);
  };

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || loading || isFetchingMore || !hasNextPage) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop - clientHeight < 150) {
      setPage(page + 1);
    }
  }, [loading, isFetchingMore, hasNextPage, setPage, page]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleStatusChange = (id: string, status: Payment['status']) => {
    updatePaymentStatus(id, status)
      .then(() => {
        toast.success("סטטוס תשלום עודכן בהצלחה");
      })
      .catch((error) => {
        toast.error(error.message || "שגיאה בעדכון סטטוס תשלום");
      });
  };

  const handleDeletePayment = (id: string) => {
    deletePayment(id)
      .then(() => {
        toast.success("התשלום נמחק בהצלחה");
      })
      .catch((error) => {
        toast.error(error.message || "שגיאה במחיקת תשלום");
      });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount: string) => {
    return amount ? `${parseFloat(amount).toFixed(2)}₪` : '0₪';
  };

  const getStatusColor = (status: Payment['status']) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getMethodColor = (method: Payment['method']) => {
    switch (method) {
      case 'payBox':
        return 'bg-blue-100 text-blue-800';
      case 'creditCard':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (error) {
    toast.error(error);
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="bg-white shadow rounded-xl p-6">
          <h2 className="text-2xl font-bold text-gray-900">תשלומים ({total})</h2>
          <p className="mt-1 text-sm text-gray-500">
            ניהול תשלומים
          </p>
        </div>

        <div className="bg-white shadow rounded-xl p-6">
          {/* Search and filters */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              <input
                type="text"
                placeholder="חפש תשלום..."
                className="w-full px-4 py-2 border rounded-md text-gray-900"
                onChange={(e) => handleSearch(e.target.value)}
              />

              {/* Status Filter */}
              <div className="relative">
                <select
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#2E7D32] focus:border-[#2E7D32] appearance-none cursor-pointer pr-10"
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                >
                  <option value="">כל הסטטוסים</option>
                  <option value="paid">שולם</option>
                  <option value="pending">ממתין</option>
                  <option value="failed">נכשל</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                  <IoChevronDown className="h-4 w-4" />
                </div>
              </div>

              {/* Method Filter */}
              <div className="relative">
                <select
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#2E7D32] focus:border-[#2E7D32] appearance-none cursor-pointer pr-10"
                  value={filters.method}
                  onChange={(e) => handleFilterChange('method', e.target.value)}
                >
                  <option value="">כל השיטות</option>
                  <option value="creditCard">כרטיס אשראי</option>
                  <option value="bit">Bit</option>
                  <option value="payBox">PayBox</option>
                  <option value="bankTransfer">העברה בנקאית</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                  <IoChevronDown className="h-4 w-4" />
                </div>
              </div>

              {/* Recurring Filter */}
              <div className="relative">
                <select
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#2E7D32] focus:border-[#2E7D32] appearance-none cursor-pointer pr-10"
                  value={filters.isRecurring}
                  onChange={(e) => handleFilterChange('isRecurring', e.target.value)}
                >
                  <option value="">כל הסוגים</option>
                  <option value="true">מנוי</option>
                  <option value="false">חד פעמי</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                  <IoChevronDown className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>

          {/* Payments table */}
          <div
            className="overflow-x-auto mt-6"
            ref={scrollContainerRef}
            style={{ overflowY: 'auto', maxHeight: tableMaxHeight }}
          >
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    שם/טלפון
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    מוצר
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    סכום
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    סטטוס
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    שיטה
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    תאריך
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    פעולות
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading && page === 1 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
                      טוען...
                    </td>
                  </tr>
                ) : !payments.length ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
                      לא נמצאו תשלומים
                    </td>
                  </tr>
                ) : (
                  payments.map((payment: Payment) => (
                    <tr key={payment._id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {payment.clientName || ''}
                        </div>
                        <div className="text-sm text-gray-500">{payment.clientPhone}</div>
                        {payment.clientEmail && (
                          <div className="text-sm text-gray-500">{payment.clientEmail}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{payment.productName}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {formatCurrency(payment.sum)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(payment.status)}`}>
                          {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getMethodColor(payment.method)}`}>
                          {payment.method === 'payBox' ? 'PayBox' : 'Credit Card'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{moment(payment.startDate).format('MM/DD/YYYY HH:mm')}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setPaymentToDelete(payment);
                              setIsDeleteModalOpen(true);
                            }}
                            className="p-1 text-gray-400 hover:text-gray-500"
                            title="מחק תשלום"
                          >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                          {payment.status === 'pending' && <button
                            onClick={() => handleStatusChange(payment._id, 'paid')}
                            className={`px-3 py-1 rounded-md bg-green-100 text-green-800 hover:bg-green-200`}
                          >
                            סמן כשולם
                          </button>}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
                {isFetchingMore && (
                  <tr>
                    <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
                      טוען עוד...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>


        </div>

        {/* Delete Confirmation Modal */}
        {paymentToDelete && (
          <DeleteConfirmationModal
            isOpen={isDeleteModalOpen}
            onClose={() => {
              setPaymentToDelete(null);
              setIsDeleteModalOpen(false);
            }}
            onConfirm={() => {
              handleDeletePayment(paymentToDelete._id);
              setPaymentToDelete(null);
              setIsDeleteModalOpen(false);
            }}
            title="מחיקת תשלום"
            description="האם אתה בטוח שברצונך למחוק את התשלום של"
            itemName={paymentToDelete.clientName || 'N/A'}
            itemIdentifier={paymentToDelete.clientPhone}
          />
        )}
      </div>
    </MainLayout>
  );
} 