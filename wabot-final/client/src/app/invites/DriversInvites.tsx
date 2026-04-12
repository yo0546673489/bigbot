"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { InvitationStatus, useDriversInvitesStore } from '@/store/driversInvites';
import type { DriversInvites } from '@/store/driversInvites';
import MainLayout from "@/components/layout/MainLayout";
import MessageModal from "@/components/drivers/MessageModal";
import DeleteConfirmationModal from "@/components/common/DeleteConfirmationModal";
import toast from 'react-hot-toast';
import debounce from 'lodash/debounce';
import { Search, Trash2, Send, Plus, Download } from 'lucide-react';

import PhonesBulkModal from '@/components/drivers/PhonesBulkModal';
import moment from 'moment-timezone';

export function DriversInvites() {
  const [selectedDriver, setSelectedDriver] = useState<DriversInvites | null>(null);
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [driverToDelete, setDriverToDelete] = useState<DriversInvites | null>(null);
  const [filters, setFilters] = useState({
    isInvited: '',
  });
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

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
    fetchDriversInvites,
    sendInviteMessage,
    addDriversInvite,
    deleteDriver,
    setPage,
    setLimit,
    clearError,
  } = useDriversInvitesStore();

  const typedDrivers: DriversInvites[] = drivers;

  const [defaultCountryCode, setDefaultCountryCode] = useState('972'); // default fallback

  useEffect(() => {
    const userLang = navigator.language || navigator.languages[0];
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (userLang.includes('vi') || timeZone.includes('Ho_Chi_Minh') || timeZone.includes('Saigon')) {
      setDefaultCountryCode('84');
    } else if (userLang.includes('he') || timeZone.includes('Jerusalem')) {
      setDefaultCountryCode('972');
    }
  }, []);

  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [resetList, setResetList] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Fetch on mount or filter change (reset list)
  useEffect(() => {
    fetchDriversInvites({
      page: 1,
      limit,
      ...filters,
      append: false
    });
    setPage(1);
    setResetList(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, limit]);

  // Fetch more when page changes (but not on filter reset)
  useEffect(() => {
    if (page === 1 || resetList) return;
    setIsFetchingMore(true);
    fetchDriversInvites({
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
        setResetList(true);
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

  const handleInviteChange = (phone: string) => {
    sendInviteMessage(phone);
  };

  const handleOpenMessageModal = (driver: DriversInvites) => {
    setSelectedDriver(driver);
    setIsMessageModalOpen(true);
  };

  const handleCloseMessageModal = () => {
    setSelectedDriver(null);
    setIsMessageModalOpen(false);
  };

  const handleDeleteDriver = async (phone: string) => {
    await deleteDriver(phone);
  };

  const handleBulkPhones = async (phones: string[]) => {
    const listPhoneValid = [];
    for (const phone of phones) {
      const trimmedPhone = phone.trim();
      if (!/^(972|84)\d{7,15}$/.test(trimmedPhone)) {
        toast.error(`מספר לא תקין: ${trimmedPhone}`);
        continue;
      }
      listPhoneValid.push(trimmedPhone);
    }
    if (!listPhoneValid.length) {
      toast.error('לא הוזנו מספרי טלפון תקינים');
      return;
    }
    await addDriversInvite(listPhoneValid).then(() => {
      toast.success('הטלפונים נוספו בהצלחה');
      fetchDriversInvites({
        page,
        limit,
        ...filters
      });
    });
  };

  if (error) {
    toast.error(typeof error === 'string' ? error : 'An error occurred');
    clearError();
  }

  return (
    <>
      <PhonesBulkModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onSubmit={handleBulkPhones}
      />
      <MainLayout>
        <div className="space-y-6">
          {/* Page Header */}
          <div className="bb-page-header">
            <h2 className="text-2xl font-bold text-gray-900">הזמנות ({total})</h2>
            <p className="mt-1 text-sm text-gray-500">ניהול הזמנות</p>
          </div>

          <div className="bb-card">
            {/* Search and filters */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {/* Search phone number */}
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="חפש מספר טלפון..."
                    className="bb-search pr-10"
                    onChange={(e) => handleSearch(e.target.value)}
                  />
                </div>

                {/* Approval Status Filter */}
                <select
                  className="bb-search"
                  value={filters.isInvited}
                  onChange={(e) => handleFilterChange('isInvited', e.target.value)}
                >
                  <option value="">כל הסטטוסים</option>
                  <option value="true">הוזמן</option>
                  <option value="false">לא הוזמן</option>
                </select>

                {/* Spacer */}
                <div className="hidden md:block"></div>

                {/* Add phone number + Export */}
                <div className="flex items-center gap-2 md:col-span-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsBulkModalOpen(true)}
                    className="bb-btn bb-btn-primary inline-flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    הוסף טלפון
                  </button>
                  <button
                    onClick={() => window.open('/api/invitations/export/all', '_blank')}
                    className="bb-btn bb-btn-ghost inline-flex items-center gap-2"
                    title="Export to Excel"
                  >
                    <Download className="h-4 w-4" />
                    ייצוא לאקסל
                  </button>
                </div>
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
                    <th className="text-right">טלפון</th>
                    <th className="text-right">סטטוס</th>
                    <th className="text-right">עודכן</th>
                    <th className="text-right">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && page === 1 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                        טוען...
                      </td>
                    </tr>
                  ) : !drivers.length ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                        לא נמצאו הזמנות
                      </td>
                    </tr>
                  ) : (
                    typedDrivers.map((driver) => (
                      <tr key={driver._id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">{driver.phone}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`bb-badge ${driver.status === InvitationStatus.INVITED ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {driver.status === InvitationStatus.INVITED ? 'הוזמן' : 'מזמין...'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">
                            {(() => {
                              if (!driver.updatedAt) return '';
                              return moment(driver.updatedAt).format('YYYY/MM/DD HH:mm:ss');
                            })()}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleOpenMessageModal(driver)}
                              className="p-1.5 text-gray-400 hover:text-[#2E7D32] transition-colors"
                              title="שלח הודעה"
                            >
                              <Send className="h-4 w-4" />
                            </button>
                            {/* delete driver */}
                            <button
                              onClick={() => {
                                setDriverToDelete(driver);
                                setIsDeleteModalOpen(true);
                              }}
                              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                              title="מחק מספר"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                  {isFetchingMore && (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                        טוען עוד...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Message Modal */}
          {selectedDriver && (
            <MessageModal
              isOpen={isMessageModalOpen}
              onClose={handleCloseMessageModal}
              driverPhone={selectedDriver.phone}
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
              title="מחיקה"
              description="האם אתה בטוח שברצונך למחוק"
              itemIdentifier={driverToDelete.phone}
            />
          )}
        </div>
      </MainLayout>
    </>
  );
}
