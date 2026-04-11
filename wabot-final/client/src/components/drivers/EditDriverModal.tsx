"use client";

import { useState, useEffect } from 'react';
import type { Driver } from '@/store/driversStore';

interface Props {
  isOpen: boolean;
  driver: Driver | null;
  onClose: () => void;
  onSave: (phone: string, data: { name: string; vehicle: string; clothing: string }) => Promise<void>;
}

export default function EditDriverModal({ isOpen, driver, onClose, onSave }: Props) {
  const [name, setName] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [clothing, setClothing] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (driver) {
      setName(driver.name || '');
      setVehicle(driver.vehicle || '');
      setClothing(driver.clothing || '');
    }
  }, [driver]);

  if (!isOpen || !driver) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(driver.phone, { name, vehicle, clothing });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">עריכת נהג — {driver.phone}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="שם הנהג"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">רכב</label>
            <input
              type="text"
              value={vehicle}
              onChange={e => setVehicle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="סוג רכב"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">לבוש</label>
            <input
              type="text"
              value={clothing}
              onChange={e => setClothing(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="לבוש"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'שומר...' : 'שמור'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
            >
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
