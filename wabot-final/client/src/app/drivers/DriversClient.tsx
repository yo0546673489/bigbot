"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { useDriversStore } from '@/store/driversStore';
import type { Driver } from '@/store/driversStore';
import MainLayout from "@/components/layout/MainLayout";
import MessageModal from "@/components/drivers/MessageModal";
import EditDriverModal from "@/components/drivers/EditDriverModal";
import DeleteConfirmationModal from "@/components/common/DeleteConfirmationModal";
import toast from 'react-hot-toast';
import debounce from 'lodash/debounce';
import { CATEGORY_BUTTONS_IDS, CLOTHING_BUTTONS_IDS } from '@/common/constants';
import { Search, Pencil, Trash2, Send, MessageSquare, Check, X } from 'lucide-react';
import { getWhatsappStatus, sendWhatsappPairingCode } from '@/lib/api';

function useWhatsappStatus() {
  const [statusMap, setStatusMap] = useState<{ [phone: string]: boolean }>({});
  useEffect(() => {
    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const data = await getWhatsappStatus();
        if (!isMounted) return;
        const map: { [phone: string]: boolean } = {};
        data.forEach((item: { phone: string, isHealthy: boolean }) => {
          map[item.phone] = item.isHealthy;
        });
        setStatusMap(map);
      } catch (e) {}
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);
  return statusMap;
}

export function DriversClient() {
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [isSendNotifyModalOpen, setIsSendNotifyModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [driverToDelete, setDriverToDelete] = useState<Driver | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [driverToEdit, setDriverToEdit] = useState<Driver | null>(null);
  const [filters, setFilters] = useState({
    category: '',
    clothing: '',
    language: '',
    isApproved: '',
  });
  const [pairingLoading, setPairingLoading] = useState<{ [phone: string]: boolean }>({});
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Dynamically calculate table max height based on window height
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

  const {
    items: drivers,
    total,
    page,
    limit,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    loading,
    error,
    fetchDrivers,
    sendApprovalMessage,
    deleteDriver,
    updateDriverIgnorePayment,
    updateDriverFull,
    setPage,
    setLimit,
    clearError,
  } = useDriversStore();

  const typedDrivers: Driver[] = drivers;
  const whatsappStatus = useWhatsappStatus();

  // Fetch on mount or filter change (reset list)
  useEffect(() => {
    fetchDrivers({
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
    fetchDrivers({
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

  const handleApproveChange = (phone: string) => {
    sendApprovalMessage(phone)
      .then(() => {
        toast.success("סטטוס הנהג עודכן בהצלחה");
      })
      .catch((error: unknown) => {
        if (error && typeof error === 'object' && 'message' in error) {
          toast.error((error as { message: string }).message || "שגיאה בעדכון סטטוס");
        } else {
          toast.error("שגיאה בעדכון סטטוס");
        }
      });
  };

  const handleOpenMessageModal = (driver: Driver) => {
    setSelectedDriver(driver);
    setIsMessageModalOpen(true);
  };

  const handleCloseMessageModal = () => {
    setSelectedDriver(null);
    setIsMessageModalOpen(false);
  };

  const handleCloseSendNotifyModal = () => {
    setIsSendNotifyModalOpen(false);
  };

  const handleDeleteDriver = (phone: string) => {
    deleteDriver(phone)
      .then(() => {
        toast.success("המשתמש נמחק בהצלחה");
      })
      .catch((error: unknown) => {
        if (error && typeof error === 'object' && 'message' in error) {
          toast.error((error as { message: string }).message || "שגיאה במחיקת משתמש");
        } else {
          toast.error("שגיאה במחיקת משתמש");
        }
      });
  };

  const handleIgnorePaymentChange = (phone: string, value: boolean) => {
    updateDriverIgnorePayment(phone, value)
      .then(() => {
        toast.success('סטטוס תשלום עודכן בהצלחה');
      })
      .catch((error: unknown) => {
        if (error && typeof error === 'object' && 'message' in error) {
          toast.error((error as { message: string }).message || 'שגיאה בעדכון סטטוס תשלום');
        } else {
          toast.error('שגיאה בעדכון סטטוס תשלום');
        }
      });
  };

  const handleSendPairingCode = async (phone: string) => {
    setPairingLoading((prev) => ({ ...prev, [phone]: true }));
    try {
      const res = await sendWhatsappPairingCode(phone);
      if (res.success) {
        toast.success('קוד חיבור נשלח בהצלחה!');
      } else {
        toast.error(res.message || 'שגיאה בשליחת קוד חיבור');
      }
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'message' in e) {
        toast.error((e as { message: string }).message || 'שגיאה בשליחת קוד חיבור');
      } else {
        toast.error('שגיאה בשליחת קוד חיבור');
      }
    } finally {
      setPairingLoading((prev) => ({ ...prev, [phone]: false }));
    }
  };

  if (error) {
    toast.error(typeof error === 'string' ? error : 'An error occurred');
    clearError();
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="bb-page-header">
          <h2 className="text-2xl font-bold text-gray-900">משתמשים ({total})</h2>
          <p className="mt-1 text-sm text-gray-500">ניהול משתמשים וסטטוס</p>
        </div>

        <div className="bb-card">
          {/* Search and filters */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="חפש משתמש..."
                  className="bb-search pr-10"
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
              {/* Category Filter */}
              <select
                className="bb-search"
                value={filters.category}
                onChange={(e) => handleFilterChange('category', e.target.value)}
              >
                <option value="">כל הקטגוריות</option>
                {CATEGORY_BUTTONS_IDS.map((category) => (
                  <option key={category} value={category}>
                    {category
                      .replace('category', '')
                      .replace(/([A-Z])/g, ' $1')
                      .trim()}
                  </option>
                ))}
              </select>
              {/* Clothing Filter */}
              <select
                className="bb-search"
                value={filters.clothing}
                onChange={(e) => handleFilterChange('clothing', e.target.value)}
              >
                <option value="">כל סוגי הלבוש</option>
                {CLOTHING_BUTTONS_IDS.map((clothing) => (
                  <option key={clothing} value={clothing}>
                    {clothing
                      .replace('clothing', '')
                      .replace(/([A-Z])/g, ' $1')
                      .trim()}
                  </option>
                ))}
              </select>
              {/* Approval Status Filter */}
              <select
                className="bb-search"
                value={filters.isApproved}
                onChange={(e) => handleFilterChange('isApproved', e.target.value)}
              >
                <option value="">כל הסטטוסים</option>
                <option value="true">מאושר</option>
                <option value="false">ממתין</option>
              </select>
              {/* Send notification button */}
              <button
                onClick={() => setIsSendNotifyModalOpen(true)}
                className="bb-btn bb-btn-primary inline-flex items-center justify-center gap-2"
              >
                <MessageSquare className="h-4 w-4" />
                <span>שלח הודעה</span>
              </button>
            </div>
          </div>

          {/* Drivers table */}
          <div
            className="overflow-x-auto mt-6"
            ref={scrollContainerRef}
            style={{ overflowY: 'auto', maxHeight: tableMaxHeight }}
          >
            <table className="bb-table">
              <thead>
                <tr>
                  <th className="text-right">שם</th>
                  <th className="text-right">טלפון</th>
                  <th className="text-right">רכב</th>
                  <th className="text-right">סטטוס</th>
                  <th className="text-right">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {loading && page === 1 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      טוען...
                    </td>
                  </tr>
                ) : !drivers.length ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      לא נמצאו משתמשים
                    </td>
                  </tr>
                ) : (
                  typedDrivers.map((driver) => (
                    <tr key={driver._id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 flex items-center">
                          <span
                            className="pr-2"
                            title={whatsappStatus[driver.phone] ? 'מחובר לוואטסאפ' : 'לא מחובר לוואטסאפ'}
                            style={{ color: whatsappStatus[driver.phone] ? '#2E7D32' : '#9CA3AF', fontSize: 23 }}
                          >
                            ●
                          </span>
                          <div className="flex-1 flex flex-col">
                            <span className="text-sm font-medium text-gray-900">{driver.name}</span>
                            <span className="text-xs text-gray-500">{new Date(driver.createdAt).toLocaleString()}</span>
                          </div>
                          {!whatsappStatus[driver.phone] && (
                            <button
                              className="bb-btn text-xs !py-1 !px-2 bg-[#E8F5E9] text-[#2E7D32] hover:bg-green-200"
                              disabled={pairingLoading[driver.phone]}
                              onClick={() => handleSendPairingCode(driver.phone)}
                              title="שלח קוד חיבור"
                            >
                              {pairingLoading[driver.phone] ? 'שולח...' : 'שלח קוד חיבור'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{driver.phone}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-500">{driver.vehicle}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`bb-badge ${
                          driver.isApproved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {driver.isApproved ? 'מאושר' : 'ממתין'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                          {/* Approve / Reject */}
                          <button
                            onClick={() => handleApproveChange(driver.phone)}
                            className={`p-1.5 rounded-md transition-colors ${
                              driver.isApproved
                                ? 'text-red-500 hover:bg-red-50'
                                : 'text-[#2E7D32] hover:bg-[#E8F5E9]'
                            }`}
                            title={driver.isApproved ? 'דחה' : 'אשר'}
                          >
                            {driver.isApproved ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                          </button>
                          {/* Edit driver */}
                          <button
                            onClick={() => { setDriverToEdit(driver); setIsEditModalOpen(true); }}
                            className="p-1.5 text-gray-400 hover:text-[#2E7D32] transition-colors"
                            title="ערוך"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {/* Send message */}
                          <button
                            onClick={() => handleOpenMessageModal(driver)}
                            className="p-1.5 text-gray-400 hover:text-[#2E7D32] transition-colors"
                            title="שלח הודעה"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                          {/* Delete driver */}
                          <button
                            onClick={() => {
                              setDriverToDelete(driver);
                              setIsDeleteModalOpen(true);
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                            title="מחק"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          {/* Ignore payment toggle */}
                          <label
                            className="inline-flex items-center cursor-pointer"
                            title={driver.ignorePayment ? 'תשלום מבוטל' : 'תשלום פעיל'}
                          >
                            <input
                              type="checkbox"
                              className="hidden peer"
                              checked={!!driver.ignorePayment}
                              onChange={e => handleIgnorePaymentChange(driver.phone, e.target.checked)}
                              id={`ignore-payment-switch-${driver.phone}`}
                            />
                            <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2E7D32]"></div>
                          </label>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
                {isFetchingMore && (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      טוען עוד...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Edit Driver Modal */}
        <EditDriverModal
          isOpen={isEditModalOpen}
          driver={driverToEdit}
          onClose={() => { setIsEditModalOpen(false); setDriverToEdit(null); }}
          onSave={async (phone, data) => {
            await updateDriverFull(phone, data);
            toast.success('המשתמש עודכן בהצלחה');
          }}
        />

        {/* Message Modal */}
        {selectedDriver && (
          <MessageModal
            isOpen={isMessageModalOpen}
            onClose={handleCloseMessageModal}
            driverPhone={selectedDriver.phone}
            driverName={selectedDriver.name}
          />
        )}

        {/* Delete Confirmation Modal */}
        {driverToDelete && (
          <DeleteConfirmationModal
            isOpen={isDeleteModalOpen}
            onClose={() => {
              setDriverToDelete(null);
              setIsDeleteModalOpen(false);
            }}
            onConfirm={() => {
              handleDeleteDriver(driverToDelete.phone);
              setDriverToDelete(null);
              setIsDeleteModalOpen(false);
            }}
            title="מחיקת משתמש"
            description="האם אתה בטוח שברצונך למחוק"
            itemName={driverToDelete.name}
            itemIdentifier={driverToDelete.phone}
          />
        )}
        {/* Send Notify Modal */}
        {isSendNotifyModalOpen && (
          <MessageModal
            isOpen={isSendNotifyModalOpen}
            onClose={handleCloseSendNotifyModal}
            driverName={'כל המשתמשים'}
          />
        )}
      </div>
    </MainLayout>
  );
}
