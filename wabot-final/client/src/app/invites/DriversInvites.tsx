"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { InvitationStatus, useDriversInvitesStore } from '@/store/driversInvites';
import type { DriversInvites } from '@/store/driversInvites';
import MainLayout from "@/components/layout/MainLayout";
import MessageModal from "@/components/drivers/MessageModal";
import DeleteConfirmationModal from "@/components/common/DeleteConfirmationModal";
import toast from 'react-hot-toast';
import debounce from 'lodash/debounce';
import { IoChevronDown } from "react-icons/io5";

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
      // Example: leave 350px for header/filters, min 250px
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
          <div className="bg-white shadow rounded-xl p-6">
            <h2 className="text-2xl font-bold text-gray-900">הזמנות ({total})</h2>
            <p className="mt-1 text-sm text-gray-500">
              ניהול הזמנות
            </p>
          </div>

          <div className="bg-white shadow rounded-xl p-6">
            {/* Search and filters */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
                {/* Search phone number */}
                <input
                  type="text"
                  placeholder="חפש מספר טלפון..."
                  className="w-full px-4 py-2 border rounded-md text-gray-900"
                  onChange={(e) => handleSearch(e.target.value)}
                />

                {/* Approval Status Filter */}
                <div className="relative">
                  <select
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#2E7D32] focus:border-[#2E7D32] appearance-none cursor-pointer pr-10"
                    value={filters.isInvited}
                    onChange={(e) => handleFilterChange('isInvited', e.target.value)}
                  >
                    <option value="">כל הסטטוסים</option>
                    <option value="true">הוזמן</option>
                    <option value="false">לא הוזמן</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                    <IoChevronDown className="h-4 w-4" />
                  </div>
                </div>

                {/* Add phone number aligned right */}
                <div className="flex items-center gap-2 md:col-span-2 md:col-start-4 ms-auto">
                  <button
                    type="button"
                    onClick={() => setIsBulkModalOpen(true)}
                    className="text-white bg-[#2E7D32] hover:bg-[#1B5E20] focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5 dark:bg-[#2E7D32] dark:hover:bg-[#1B5E20] focus:outline-none dark:focus:ring-green-800"
                  >
                    הוסף טלפון
                  </button>
                  <button
                    onClick={() => window.open('/api/invitations/export/all', '_blank')}
                    className="flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    title="Export to Excel"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    ייצוא לאקסל
                  </button>
                </div>
              </div>
            </div>

            {/* Drivers table */}
            <div
              className="overflow-x-auto"
              ref={scrollContainerRef}
              style={{ overflowY: 'auto', maxHeight: tableMaxHeight }}
            >
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      טלפון
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      סטטוס
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      עודכן
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      פעולות
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading && page === 1 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                        טוען...
                      </td>
                    </tr>
                  ) : !drivers.length ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
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
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${driver.status === InvitationStatus.INVITED ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                            }`}>
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
                              className="p-1 text-gray-400 hover:text-gray-500"
                              title="שלח הודעה">
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                              </svg>
                            </button>
                            {/* delete driver */}
                            <button
                              onClick={() => {
                                setDriverToDelete(driver);
                                setIsDeleteModalOpen(true);
                              }}
                              className="p-1 text-gray-400 hover:text-gray-500"
                              title="מחק מספר">
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                            {/* {driver.status !== InvitationStatus.INVITED && <button
                              onClick={() => handleInviteChange(driver.phone)}
                              className={`px-3 py-1 rounded-md bg-green-100 text-red-800 hover:bg-red-200`}>
                              Send invite
                            </button>} */}
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