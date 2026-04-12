import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';

interface PhonesBulkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (phones: string[]) => Promise<void>;
}

export default function PhonesBulkModal({ isOpen, onClose, onSubmit }: PhonesBulkModalProps) {
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phones = input
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    setIsSubmitting(true);
    try {
      await onSubmit(phones);
      setInput('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bb-modal-overlay" onClick={onClose}>
      <div className="bb-modal" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-900">הוספת מספרים</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="phones" className="block text-sm font-medium text-gray-700 mb-1">
              הזן מספרי טלפון מופרדים בפסיקים
            </label>
            <textarea
              id="phones"
              className="bb-search resize-none"
              rows={4}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="לדוגמה: 972501234567, 972507654321, ..."
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="bb-btn bb-btn-ghost flex-1"
              disabled={isSubmitting}
            >
              ביטול
            </button>
            <button
              type="submit"
              className="bb-btn bb-btn-primary flex-1 inline-flex items-center justify-center gap-2"
              disabled={isSubmitting}
            >
              <Plus className="h-4 w-4" />
              {isSubmitting ? 'מוסיף...' : 'הוסף טלפונים'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
