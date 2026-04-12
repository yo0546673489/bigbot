"use client";

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
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
    <div className="bb-modal-overlay" onClick={onClose}>
      <div className="bb-modal" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-900">עריכת משתמש — {driver.phone}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="bb-search"
              placeholder="שם הנהג"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">רכב</label>
            <input
              type="text"
              value={vehicle}
              onChange={e => setVehicle(e.target.value)}
              className="bb-search"
              placeholder="סוג רכב"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">לבוש</label>
            <input
              type="text"
              value={clothing}
              onChange={e => setClothing(e.target.value)}
              className="bb-search"
              placeholder="לבוש"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bb-btn bb-btn-primary flex-1"
            >
              {saving ? 'שומר...' : 'שמור'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bb-btn bb-btn-ghost flex-1"
            >
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
