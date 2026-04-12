'use client';

import { useState } from 'react';
import { X, Send } from 'lucide-react';
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
    <div className="bb-modal-overlay" onClick={onClose}>
      <div className="bb-modal" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-900">
            שליחת הודעה ל{driverName || driverPhone}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
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
              className="bb-search resize-none"
              placeholder="הזן את ההודעה..."
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="bb-btn bb-btn-ghost flex-1"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bb-btn bb-btn-primary flex-1 inline-flex items-center justify-center gap-2"
            >
              <Send className="h-4 w-4" />
              {isSubmitting ? 'שולח...' : 'שלח הודעה'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
