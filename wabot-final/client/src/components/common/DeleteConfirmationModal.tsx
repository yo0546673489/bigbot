import { AlertTriangle, X } from 'lucide-react';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  itemName?: string;
  itemIdentifier: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
}

export default function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  itemName,
  itemIdentifier,
  confirmButtonText = "מחק",
  cancelButtonText = "ביטול",
}: DeleteConfirmationModalProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="bb-modal-overlay" onClick={onClose}>
      <div className="bb-modal max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <AlertTriangle className="h-7 w-7 text-red-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
          <p className="text-sm text-gray-600">
            {description} {itemName ? <strong>{itemName}</strong> : ''} ({itemIdentifier})?
            <br />
            פעולה זו אינה ניתנת לביטול.
          </p>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="bb-btn bb-btn-ghost flex-1"
          >
            {cancelButtonText}
          </button>
          <button
            onClick={handleConfirm}
            className="bb-btn bb-btn-danger flex-1"
          >
            {confirmButtonText}
          </button>
        </div>
      </div>
    </div>
  );
}
