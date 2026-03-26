"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { useDriversStore } from '@/store/driversStore';
import type { Driver } from '@/store/driversStore';
import MainLayout from "@/components/layout/MainLayout";
import MessageModal from "@/components/drivers/MessageModal";
import DeleteConfirmationModal from "@/components/common/DeleteConfirmationModal";
import toast from 'react-hot-toast';
import debounce from 'lodash/debounce';
import { CATEGORY_BUTTONS_IDS, CLOTHING_BUTTONS_IDS } from '@/common/constants';
import { IoChevronDown } from "react-icons/io5";
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
    fetchDrivers,
    sendApprovalMessage,
    deleteDriver,
    updateDriverIgnorePayment,
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
        toast.success("Driver status updated successfully");
      })
      .catch((error: unknown) => {
        if (error && typeof error === 'object' && 'message' in error) {
          toast.error((error as { message: string }).message || "Failed to update driver status");
        } else {
          toast.error("Failed to update driver status");
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
        toast.success("Driver deleted successfully");
      })
      .catch((error: unknown) => {
        if (error && typeof error === 'object' && 'message' in error) {
          toast.error((error as { message: string }).message || "Failed to delete driver");
        } else {
          toast.error("Failed to delete driver");
        }
      });
  };

  const handleIgnorePaymentChange = (phone: string, value: boolean) => {
    updateDriverIgnorePayment(phone, value)
      .then(() => {
        toast.success('Ignore Payment updated successfully');
      })
      .catch((error: unknown) => {
        if (error && typeof error === 'object' && 'message' in error) {
          toast.error((error as { message: string }).message || 'Failed to update Ignore Payment');
        } else {
          toast.error('Failed to update Ignore Payment');
        }
      });
  };

  const handleSendPairingCode = async (phone: string) => {
    setPairingLoading((prev) => ({ ...prev, [phone]: true }));
    try {
      const res = await sendWhatsappPairingCode(phone);
      if (res.success) {
        toast.success('Pairing code sent to this phone!');
      } else {
        toast.error(res.message || 'Failed to send pairing code');
      }
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'message' in e) {
        toast.error((e as { message: string }).message || 'Failed to send pairing code');
      } else {
        toast.error('Failed to send pairing code');
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
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900">Drivers({total})</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage your drivers and their status.
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          {/* Search and filters */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
              <input
                type="text"
                placeholder="Search drivers..."
                className="w-full px-4 py-2 border rounded-md text-gray-900"
                onChange={(e) => handleSearch(e.target.value)}
              />
              {/* Category Filter */}
              <div className="relative">
                <select
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer pr-10"
                  value={filters.category}
                  onChange={(e) => handleFilterChange('category', e.target.value)}
                >
                  <option value="">All Categories</option>
                  {CATEGORY_BUTTONS_IDS.map((category) => (
                    <option key={category} value={category}>
                      {category
                        .replace('category', '')
                        .replace(/([A-Z])/g, ' $1')
                        .trim()}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                  <IoChevronDown className="h-4 w-4" />
                </div>
              </div>
              {/* Clothing Filter */}
              <div className="relative">
                <select
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer pr-10"
                  value={filters.clothing}
                  onChange={(e) => handleFilterChange('clothing', e.target.value)}
                >
                  <option value="">All Clothing Types</option>
                  {CLOTHING_BUTTONS_IDS.map((clothing) => (
                    <option key={clothing} value={clothing}>
                      {clothing
                        .replace('clothing', '')
                        .replace(/([A-Z])/g, ' $1')
                        .trim()}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                  <IoChevronDown className="h-4 w-4" />
                </div>
              </div>
              {/* Approval Status Filter */}
              <div className="relative">
                <select
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer pr-10"
                  value={filters.isApproved}
                  onChange={(e) => handleFilterChange('isApproved', e.target.value)}
                >
                  <option value="">All Status</option>
                  <option value="true">Approved</option>
                  <option value="false">Pending</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                  <IoChevronDown className="h-4 w-4" />
                </div>
              </div>
              <div className="relative">
                <button
                  onClick={() => setIsSendNotifyModalOpen(true)}
                  className="flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 float-right"
                  title="Send Notify"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <span className="ml-2">Send Notify</span>
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
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vehicle
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading && page === 1 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : !drivers.length ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                      No drivers found
                    </td>
                  </tr>
                ) : (
                  typedDrivers.map((driver) => (
                    <tr key={driver._id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 flex items-center">
                          <span
                            className='pr-2'
                            title={whatsappStatus[driver.phone] ? 'Connected to WhatsApp' : 'Not connected to WhatsApp'}
                            style={{ color: whatsappStatus[driver.phone] ? 'green' : 'gray', fontSize: 23 }}
                          >
                            ●
                          </span>
                          {/* 
                            driver name and created at format YYYY-MM-DD HH:MM:SS
                            display name and created at different lines
                          */}
                          <div className='flex-1 flex flex-col'>
                            <span className='text-sm font-medium text-gray-900'>{driver.name}</span>
                            <span className='text-xs text-gray-500'>{new Date(driver.createdAt).toLocaleString()}</span>
                          </div>
                          {!whatsappStatus[driver.phone] && (
                            <button
                              className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded hover:bg-blue-200 disabled:opacity-50"
                              disabled={pairingLoading[driver.phone]}
                              onClick={() => handleSendPairingCode(driver.phone)}
                              title="Send WhatsApp Pairing Code"
                            >
                              {pairingLoading[driver.phone] ? 'Sending...' : 'Send Pair Code'}
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
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          driver.isApproved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {driver.isApproved ? 'Approved' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleApproveChange(driver.phone)}
                            className={`px-3 py-1 rounded-md ${
                              driver.isApproved 
                                ? 'bg-red-100 text-red-800 hover:bg-red-200' 
                                : 'bg-green-100 text-green-800 hover:bg-green-200'
                            }`}
                          >
                            {driver.isApproved ? 'Reject' : 'Approve'}
                          </button>
                          <button
                            onClick={() => handleOpenMessageModal(driver)}
                            className="p-1 text-gray-400 hover:text-gray-500"
                            title="Send message"
                          >
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
                            title="Delete driver"
                          >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                          <label
                            className="inline-flex items-center cursor-pointer"
                            title={driver.ignorePayment ? 'Payment Ignored' : 'Payment Not Ignored'}
                          >
                            <input
                              type="checkbox"
                              className="hidden peer"
                              checked={!!driver.ignorePayment}
                              onChange={e => handleIgnorePaymentChange(driver.phone, e.target.checked)}
                              id={`ignore-payment-switch-${driver.phone}`}
                            />
                            <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 dark:peer-checked:bg-blue-600"></div>
                          </label>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
                {isFetchingMore && (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                      Loading more...
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
            title="Delete Driver"
            description="Are you sure you want to delete"
            itemName={driverToDelete.name}
            itemIdentifier={driverToDelete.phone}
          />
        )}
        {/* Send Notify Modal */}
        {isSendNotifyModalOpen && (
          <MessageModal
            isOpen={isSendNotifyModalOpen}
            onClose={handleCloseSendNotifyModal}
            driverName={'All drivers'}
          />
        )}
      </div>
    </MainLayout>
  );
} 