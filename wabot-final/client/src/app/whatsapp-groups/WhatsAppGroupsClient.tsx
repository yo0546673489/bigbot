"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useWhatsAppGroupsStore } from '@/store/whatsappGroupsStore';
import { WhatsAppGroup } from '@/types/whatsapp-group';
import MainLayout from "@/components/layout/MainLayout";
import toast from 'react-hot-toast';
import { Search, Pencil, Trash2, Download, X } from 'lucide-react';

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
    <div className="bb-modal-overlay" onClick={onClose}>
      <div className="bb-modal" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-900">עריכת קבוצה</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם</label>
            <input value={name} onChange={e => setName(e.target.value)} className="bb-search" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תיאור</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="bb-search resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="bb-btn bb-btn-primary flex-1">
              {saving ? 'שומר...' : 'שמור'}
            </button>
            <button type="button" onClick={onClose} className="bb-btn bb-btn-ghost flex-1">
              ביטול
            </button>
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
        {/* Page Header */}
        <div className="bb-page-header">
          <h2 className="text-2xl font-bold text-gray-900">קבוצות וואטסאפ ({total})</h2>
          <p className="mt-1 text-sm text-gray-500">ניהול קבוצות וואטסאפ</p>
        </div>

        <div className="bb-card">
          {/* Search and filters */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="md:col-span-2 relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="חפש קבוצה..."
                  className="bb-search pr-10"
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
              <div className="md:col-span-2"></div>
              <button
                onClick={() => window.open('/api/whatsapp-groups/export/all', '_blank')}
                className="bb-btn bb-btn-ghost inline-flex items-center justify-center gap-2"
                title="Export to Excel"
              >
                <Download className="h-4 w-4" />
                ייצוא לאקסל
              </button>
            </div>
          </div>

          {/* Groups table */}
          <div
            className="overflow-x-auto mt-6"
            ref={scrollContainerRef}
            style={{ overflowY: 'auto', maxHeight: tableMaxHeight }}
          >
            <table className="bb-table">
              <thead>
                <tr>
                  <th className="text-right">שם</th>
                  <th className="text-right">תיאור</th>
                  <th className="text-right">חברים</th>
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
                ) : !whatsappGroups?.length ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
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
                            className="p-1.5 text-gray-400 hover:text-[#2E7D32] transition-colors"
                            title="ערוך קבוצה"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm(`למחוק את הקבוצה "${whatsappGroup.name}"?`)) return;
                              try {
                                await deleteGroup(whatsappGroup._id);
                                toast.success('הקבוצה נמחקה');
                              } catch { toast.error('שגיאה במחיקת קבוצה'); }
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                            title="מחק קבוצה"
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
