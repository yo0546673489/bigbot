"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useWhatsAppGroupsStore } from '@/store/whatsappGroupsStore';
import { WhatsAppGroup } from '@/types/whatsapp-group';
import MainLayout from "@/components/layout/MainLayout";
import toast from 'react-hot-toast';

function EditGroupModal({ group, onClose, onSave }: { group: WhatsAppGroup; onClose: () => void; onSave: (data: { name: string; description: string }) => Promise<void> }) {
  const [name, setName] = useState(group.name || '');
  const [description, setDescription] = useState(group.description || '');
  const [saving, setSaving] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave({ name, description }); onClose(); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">עריכת קבוצה</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2E7D32]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תיאור</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2E7D32]" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="flex-1 py-2 bg-[#2E7D32] text-white rounded-lg font-medium hover:bg-[#1B5E20] disabled:opacity-50">{saving ? 'שומר...' : 'שמור'}</button>
            <button type="button" onClick={onClose} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200">ביטול</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function WhatsAppGroupsClient() {
  const [filters, setFilters] = useState({ search: '', sortBy: 'createdAt' });
  const [editGroup, setEditGroup] = useState<WhatsAppGroup | null>(null);

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
    updateGroup,
    deleteGroup,
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
        <div className="bg-white shadow rounded-xl p-6">
          <h2 className="text-2xl font-bold text-gray-900">קבוצות וואטסאפ ({total})</h2>
          <p className="mt-1 text-sm text-gray-500">
            ניהול קבוצות וואטסאפ
          </p>
        </div>

        <div className="bg-white shadow rounded-xl p-6">
          {/* Search and filters */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
              <div className="md:col-span-2">
                <input
                  type="text"
                  placeholder="חפש קבוצה..."
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
                ייצוא לאקסל
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
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    שם
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    תיאור
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    חברים
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    פעולות
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading && page === 1 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                      טוען...
                    </td>
                  </tr>
                ) : !whatsappGroups?.length ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                      לא נמצאו קבוצות
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
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditGroup(whatsappGroup)}
                            className="p-1 text-[#2E7D32] hover:text-[#1B5E20]"
                            title="ערוך קבוצה"
                          >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm(`למחוק את הקבוצה "${whatsappGroup.name}"?`)) return;
                              try {
                                await deleteGroup(whatsappGroup._id);
                                toast.success('הקבוצה נמחקה');
                              } catch { toast.error('שגיאה במחיקת קבוצה'); }
                            }}
                            className="p-1 text-red-400 hover:text-red-600"
                            title="מחק קבוצה"
                          >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
                {isFetchingMore && (
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                      טוען עוד...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editGroup && (
        <EditGroupModal
          group={editGroup}
          onClose={() => setEditGroup(null)}
          onSave={async (data) => {
            await updateGroup(editGroup._id, data);
            toast.success('הקבוצה עודכנה');
          }}
        />
      )}
    </MainLayout>
  );
} 