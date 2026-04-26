'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, width = 'max-w-lg', bodyClassName = '' }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      {/* Panel */}
      <div className={`modal-panel ${width}`}>
        {/* Header */}
        <div className="modal-head">
          <h2 className="text-base font-semibold text-hagav-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-hagav-gray hover:text-hagav-white p-2 rounded-lg hover:bg-hagav-muted/40 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        {/* Body */}
        <div className={`modal-body ${bodyClassName}`.trim()}>{children}</div>
      </div>
    </div>
  );
}
