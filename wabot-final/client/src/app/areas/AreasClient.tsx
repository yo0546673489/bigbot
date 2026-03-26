"use client";

import MainLayout from '@/components/layout/MainLayout';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAreasStore } from '@/store/areasStore';
import toast from 'react-hot-toast';
import { SupportArea, AreaShortcut, RelatedArea } from '@/services/areasService';
import { IoChevronDown } from "react-icons/io5";
import DeleteConfirmationModal from "@/components/common/DeleteConfirmationModal";
import { SupportAreaModal, ShortcutModal, RelatedAreaModal } from '@/components/areas';

export function AreasClient() {
  const {
    support, shortcuts, related,
    fetchSupport, fetchShortcuts, fetchRelated,
    addSupport, editSupport, removeSupport,
    addShortcut, editShortcut, removeShortcut,
    upsertRelated, editRelated, removeRelated,
    clearError,
  } = useAreasStore();

  const [activeTab, setActiveTab] = useState<'support' | 'shortcuts' | 'related'>('support');

  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(10);
  const [page, setPage] = useState(1);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [tableMaxHeight, setTableMaxHeight] = useState<string>('400px');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [modalData, setModalData] = useState<Partial<SupportArea | AreaShortcut | RelatedArea> & { relatedString?: string }>({});

  // Delete confirmation modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; type: 'support' | 'shortcut' | 'related'; name: string } | null>(null);

  useEffect(() => {
    function updateTableHeight() {
      const h = Math.max(window.innerHeight - 340, 300);
      setTableMaxHeight(`${h}px`);
    }
    updateTableHeight();
    window.addEventListener('resize', updateTableHeight);
    return () => window.removeEventListener('resize', updateTableHeight);
  }, []);

  useEffect(() => {
    const params = { page: 1, limit, search, append: false };
    if (activeTab === 'support') fetchSupport(params);
    if (activeTab === 'shortcuts') fetchShortcuts(params);
    if (activeTab === 'related') fetchRelated(params);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, search, limit]);

  useEffect(() => {
    if (page === 1) return;
    const params = { page, limit, search, append: true };
    setIsFetchingMore(true);
    const p = activeTab === 'support' ? fetchSupport(params)
      : activeTab === 'shortcuts' ? fetchShortcuts(params)
        : fetchRelated(params);
    p.finally(() => setIsFetchingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    const s = activeTab === 'support' ? support : activeTab === 'shortcuts' ? shortcuts : related;
    if (!container || s.loading || isFetchingMore || !s.hasNextPage) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop - clientHeight < 150) {
      setPage(prev => prev + 1);
    }
  }, [activeTab, support, shortcuts, related, isFetchingMore]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const openAddModal = () => {
    setModalMode('add');
    setModalData({});
    setIsModalOpen(true);
  };

  const openEditModal = (item: SupportArea | AreaShortcut | RelatedArea) => {
    setModalMode('edit');
    if (activeTab === 'support') {
      setModalData({ _id: item._id, name: (item as SupportArea).name });
    } else if (activeTab === 'shortcuts') {
      setModalData({ _id: item._id, shortName: (item as AreaShortcut).shortName, fullName: (item as AreaShortcut).fullName });
    } else if (activeTab === 'related') {
      setModalData({ _id: item._id, main: (item as RelatedArea).main, relatedString: (item as RelatedArea).related.join(', ') });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalData({});
  };

  const openDeleteModal = (item: SupportArea | AreaShortcut | RelatedArea, type: 'support' | 'shortcut' | 'related') => {
    let name = '';
    if (type === 'support') {
      name = (item as SupportArea).name;
    } else if (type === 'shortcut') {
      name = (item as AreaShortcut).shortName;
    } else if (type === 'related') {
      name = (item as RelatedArea).main;
    }
    
    setItemToDelete({ id: item._id, type, name });
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setItemToDelete(null);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    
    try {
      if (itemToDelete.type === 'support') {
        await removeSupport(itemToDelete.id);
        toast.success('Support area deleted successfully');
      } else if (itemToDelete.type === 'shortcut') {
        await removeShortcut(itemToDelete.id);
        toast.success('Shortcut deleted successfully');
      } else if (itemToDelete.type === 'related') {
        await removeRelated(itemToDelete.id);
        toast.success('Related area deleted successfully');
      }
    } catch (error) {
      toast.error('Failed to delete item');
    } finally {
      closeDeleteModal();
    }
  };

  const handleSupportSubmit = async (data: Partial<SupportArea>) => {
    try {
      if (modalMode === 'add' && data.name) {
        await addSupport(data.name);
        toast.success('Added support area');
      } else if (modalMode === 'edit' && data._id && data.name) {
        await editSupport(data._id, data.name);
        toast.success('Updated support area');
      }
    } catch (error) {
      toast.error('Operation failed');
    }
  };

  const handleShortcutSubmit = async (data: Partial<AreaShortcut>) => {
    try {
      if (modalMode === 'add' && data.shortName && data.fullName) {
        await addShortcut(data.shortName, data.fullName);
        toast.success('Added shortcut');
      } else if (modalMode === 'edit' && data._id) {
        await editShortcut(data._id, { shortName: data.shortName, fullName: data.fullName });
        toast.success('Updated shortcut');
      }
    } catch (error) {
      toast.error('Operation failed');
    }
  };

  const handleRelatedSubmit = async (data: Partial<RelatedArea> & { relatedString?: string }) => {
    try {
      if (modalMode === 'add' && data.main && data.relatedString) {
        const relatedArr = data.relatedString.split(',').map(s => s.trim()).filter(Boolean);
        await upsertRelated(data.main, relatedArr);
        toast.success('Saved related areas');
      } else if (modalMode === 'edit' && data._id && data.main && data.relatedString) {
        const relatedArr = data.relatedString.split(',').map(s => s.trim()).filter(Boolean);
        await editRelated(data._id, { main: data.main, related: relatedArr });
        toast.success('Updated related areas');
      }
    } catch (error) {
      toast.error('Operation failed');
    }
  };

  const tabState = activeTab === 'support' ? support : activeTab === 'shortcuts' ? shortcuts : related;

  if (tabState.error) {
    toast.error(tabState.error);
    clearError();
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900">Areas Management</h2>
          <p className="mt-1 text-sm text-gray-500">Manage support areas, shortcuts and related areas.</p>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            <button className={`px-4 py-2 rounded ${activeTab === 'support' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`} onClick={() => setActiveTab('support')}>Support</button>
            <button className={`px-4 py-2 rounded ${activeTab === 'shortcuts' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`} onClick={() => setActiveTab('shortcuts')}>Shortcuts</button>
            <button className={`px-4 py-2 rounded ${activeTab === 'related' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`} onClick={() => setActiveTab('related')}>Related</button>
          </div>

          {/* Search and controls */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
            <input className="px-3 py-2 border rounded text-gray-900" placeholder="Search..." onChange={e => setSearch(e.target.value)} />
            <div className="relative">
              <select 
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer pr-10"
                value={limit} 
                onChange={e => setLimit(parseInt(e.target.value))}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                <IoChevronDown className="h-4 w-4" />
              </div>
            </div>
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Add New
            </button>
          </div>

          {/* Table */}
          <div ref={scrollContainerRef} style={{ overflowY: 'auto', maxHeight: tableMaxHeight }} className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {activeTab === 'support' && (<>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </>)}
                  {activeTab === 'shortcuts' && (<>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Short</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Full</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </>)}
                  {activeTab === 'related' && (<>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Main</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Related</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </>)}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {activeTab === 'support' && support.items.map((item, index) => (
                  <tr key={`support-${item._id}-${index}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex gap-2">
                        <button onClick={() => openEditModal(item)} className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">Edit</button>
                        <button onClick={() => openDeleteModal(item, 'support')} className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {activeTab === 'shortcuts' && shortcuts.items.map((item, index) => (
                  <tr key={`shortcut-${item._id}-${index}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.shortName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.fullName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex gap-2">
                        <button onClick={() => openEditModal(item)} className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">Edit</button>
                        <button onClick={() => openDeleteModal(item, 'shortcut')} className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {activeTab === 'related' && related.items.map((item, index) => (
                  <tr key={`related-${item._id}-${index}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.main}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{item.related.join(', ')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex gap-2">
                        <button onClick={() => openEditModal(item)} className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">Edit</button>
                        <button onClick={() => openDeleteModal(item, 'related')} className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {tabState.loading && page === 1 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-center text-gray-500">Loading...</td>
                  </tr>
                )}
                {isFetchingMore && (
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-center text-gray-500">Loading more...</td>
                  </tr>
                )}
                {!tabState.loading && !tabState.items.length && (
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-center text-gray-500">No data</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modals */}
        {activeTab === 'support' && (
          <SupportAreaModal
            isOpen={isModalOpen}
            onClose={closeModal}
            mode={modalMode}
            initialData={modalData}
            onSubmit={handleSupportSubmit}
          />
        )}
        {activeTab === 'shortcuts' && (
          <ShortcutModal
            isOpen={isModalOpen}
            onClose={closeModal}
            mode={modalMode}
            initialData={modalData}
            onSubmit={handleShortcutSubmit}
          />
        )}
        {activeTab === 'related' && (
          <RelatedAreaModal
            isOpen={isModalOpen}
            onClose={closeModal}
            mode={modalMode}
            initialData={modalData}
            onSubmit={handleRelatedSubmit}
          />
        )}

        {/* Delete Confirmation Modal */}
        <DeleteConfirmationModal
          isOpen={isDeleteModalOpen}
          onClose={closeDeleteModal}
          onConfirm={handleDeleteConfirm}
          title="Confirm Deletion"
          description="Are you sure you want to delete"
          itemName={itemToDelete?.name}
          itemIdentifier={itemToDelete?.id || ''}
          confirmButtonText="Delete"
          cancelButtonText="Cancel"
        />
      </div>
    </MainLayout>
  );
} 