import React, { useState } from 'react';

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
    <div className="fixed inset-0 bg-gray-500/30 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">הוספת מספרים</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 transition-colors"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="phones" className="block text-sm font-medium text-gray-700 mb-1">
              הזן מספרי טלפון מופרדים בפסיקים
            </label>
            <textarea
              id="phones"
              className="w-full px-3 py-2 border rounded-md text-gray-900 resize-none"
              rows={4}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="לדוגמה: 972501234567, 972507654321, ..."
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
              disabled={isSubmitting}
            >
              ביטול
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-[#2E7D32] text-white hover:bg-[#1B5E20] disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'מוסיף...' : 'הוסף טלפונים'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
