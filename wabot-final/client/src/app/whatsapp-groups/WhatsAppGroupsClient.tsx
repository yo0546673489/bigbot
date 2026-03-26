"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useWhatsAppGroupsStore } from '@/store/whatsappGroupsStore';
import { WhatsAppGroup } from '@/types/whatsapp-group';
import MainLayout from "@/components/layout/MainLayout";
import toast from 'react-hot-toast';

export function WhatsAppGroupsClient() {
  const [filters, setFilters] = useState({
    search: '',
    sortBy: 'createdAt',
  });

  let timerDebounce: NodeJS.Timeout;

  const {
    items: whatsappGroups,
    total,
    page,
    limit,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    loading,
    error,
    fetchWhatsAppGroups,
    setPage,
    setLimit,
    clearError,
  } = useWhatsAppGroupsStore();

  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [resetList, setResetList] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Dynamically calculate table max height based on window height
  const [tableMaxHeight, setTableMaxHeight] = useState<string>('400px');
  useEffect(() => {
    function updateTableHeight() {
      // Example: leave 300px for header/filters, min 200px
      const h = Math.max(window.innerHeight - 300, 200);
      setTableMaxHeight(`${h}px`);
    }
    updateTableHeight();
    window.addEventListener('resize', updateTableHeight);
    return () => window.removeEventListener('resize', updateTableHeight);
  }, []);

  // Fetch on mount or filter change (reset list)
  useEffect(() => {
    fetchWhatsAppGroups({
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
    fetchWhatsAppGroups({
      page,
      limit,
      ...filters,
      append: true
    }).finally(() => setIsFetchingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleSearch = (value: string) => {
    if (timerDebounce) {
      clearTimeout(timerDebounce);
    }
    timerDebounce = setTimeout(() => {
      setFilters(prev => ({
        ...prev,
        search: value
      }));
      setResetList(true);
    }, 800);
  };

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || loading || isFetchingMore || !hasNextPage) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop - clientHeight < 150) {
      setPage(page + 1);
    }
  }, [loading, isFetchingMore, hasNextPage, setPage]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);


  if (error) {
    toast.error(error);
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900">WhatsApp Groups({total})</h2>
          <p className="mt-1 text-sm text-gray-500">
            WhatsApp groups.
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          {/* Search and filters */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
              <div className="md:col-span-2">
                <input
                  type="text"
                  placeholder="Search groups..."
                  className="w-full px-4 py-2 border rounded-md text-gray-900"
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
              <div className="md:col-span-2"></div>
              <button
                onClick={() => window.open('/api/whatsapp-groups/export/all', '_blank')}
                className="flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                title="Export to Excel"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export Excel
              </button>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Members
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading && page === 1 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : !whatsappGroups?.length ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                      No WhatsApp groups found
                    </td>
                  </tr>
                ) : (
                  whatsappGroups.map((whatsappGroup: WhatsAppGroup) => (
                    <tr key={whatsappGroup._id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {whatsappGroup.name || ''}
                        </div>
                      </td>
                      <td className="px-6 py-4 max-w-[500px]">
                        <div className="text-sm text-gray-900">{whatsappGroup.description}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {whatsappGroup.participantsCount}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
                {isFetchingMore && (
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                      Loading more...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainLayout>
  );
} 