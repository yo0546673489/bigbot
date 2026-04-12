'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { sendMessage } from '@/services/driverService';

interface MessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  driverPhone?: string;
  driverName?: string;
}

export default function MessageModal({ isOpen, onClose, driverPhone, driverName }: MessageModalProps) {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error('נא להזין הודעה');
      return;
    }

    try {
      setIsSubmitting(true);
      await sendMessage(driverPhone || 'all', message.trim());
      toast.success('ההודעה נשלחה בהצלחה');
      setMessage('');
      onClose();
    } catch (error) {
      toast.error('שגיאה בשליחת הודעה');
      console.error('Send message error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-500/30 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            שליחת הודעה ל{driverName || driverPhone}
          </h3>
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
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
              הודעה
            </label>
            <textarea
              id="message"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#2E7D32] focus:border-[#2E7D32] text-gray-900"
              placeholder="הזן את ההודעה..."
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#2E7D32] hover:bg-[#1B5E20] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#2E7D32] disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'שולח...' : 'שלח הודעה'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 