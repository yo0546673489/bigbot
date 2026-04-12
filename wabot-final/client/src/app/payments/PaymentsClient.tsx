"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePaymentsStore } from '@/store/paymentsStore';
import { Payment } from '@/types/payment';
import MainLayout from "@/components/layout/MainLayout";
import DeleteConfirmationModal from "@/components/common/DeleteConfirmationModal";
import toast from 'react-hot-toast';
import debounce from 'lodash/debounce';
import { Search, Trash2, Check } from 'lucide-react';
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

  const getStatusLabel = (status: Payment['status']) => {
    switch (status) {
      case 'paid': return 'שולם';
      case 'pending': return 'ממתין';
      case 'failed': return 'נכשל';
      default: return status;
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

  const getMethodLabel = (method: Payment['method']) => {
    switch (method) {
      case 'payBox': return 'PayBox';
      case 'creditCard': return 'כרטיס אשראי';
      default: return method;
    }
  };

  if (error) {
    toast.error(error);
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="bb-page-header">
          <h2 className="text-2xl font-bold text-gray-900">תשלומים ({total})</h2>
          <p className="mt-1 text-sm text-gray-500">ניהול תשלומים</p>
        </div>

        <div className="bb-card">
          {/* Search and filters */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="חפש תשלום..."
                  className="bb-search pr-10"
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>

              {/* Status Filter */}
              <select
                className="bb-search"
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
              >
                <option value="">כל הסטטוסים</option>
                <option value="paid">שולם</option>
                <option value="pending">ממתין</option>
                <option value="failed">נכשל</option>
              </select>

              {/* Method Filter */}
              <select
                className="bb-search"
                value={filters.method}
                onChange={(e) => handleFilterChange('method', e.target.value)}
              >
                <option value="">כל השיטות</option>
                <option value="creditCard">כרטיס אשראי</option>
                <option value="bit">Bit</option>
                <option value="payBox">PayBox</option>
                <option value="bankTransfer">העברה בנקאית</option>
              </select>

              {/* Recurring Filter */}
              <select
                className="bb-search"
                value={filters.isRecurring}
                onChange={(e) => handleFilterChange('isRecurring', e.target.value)}
              >
                <option value="">כל הסוגים</option>
                <option value="true">מנוי</option>
                <option value="false">חד פעמי</option>
              </select>
            </div>
          </div>

          {/* Payments table */}
          <div
            className="overflow-x-auto mt-6"
            ref={scrollContainerRef}
            style={{ overflowY: 'auto', maxHeight: tableMaxHeight }}
          >
            <table className="bb-table">
              <thead>
                <tr>
                  <th className="text-right">שם/טלפון</th>
                  <th className="text-right">מוצר</th>
                  <th className="text-right">סכום</th>
                  <th className="text-right">סטטוס</th>
                  <th className="text-right">שיטה</th>
                  <th className="text-right">תאריך</th>
                  <th className="text-right">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {loading && page === 1 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                      טוען...
                    </td>
                  </tr>
                ) : !payments.length ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
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
                        <span className={`bb-badge ${getStatusColor(payment.status)}`}>
                          {getStatusLabel(payment.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`bb-badge ${getMethodColor(payment.method)}`}>
                          {getMethodLabel(payment.method)}
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
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                            title="מחק תשלום"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          {payment.status === 'pending' && (
                            <button
                              onClick={() => handleStatusChange(payment._id, 'paid')}
                              className="p-1.5 text-[#2E7D32] hover:bg-[#E8F5E9] rounded-md transition-colors inline-flex items-center gap-1 text-xs font-medium"
                              title="סמן כשולם"
                            >
                              <Check className="h-4 w-4" />
                              סמן כשולם
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
                {isFetchingMore && (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
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
