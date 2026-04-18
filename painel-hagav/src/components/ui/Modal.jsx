'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, width = 'max-w-lg' }) {
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
      <div className={`relative w-full ${width} bg-hagav-dark border border-hagav-border rounded-2xl shadow-modal animate-slide-up overflow-hidden`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-hagav-border">
          <h2 className="text-base font-semibold text-hagav-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-hagav-gray hover:text-hagav-white p-1.5 rounded-lg hover:bg-hagav-muted/40 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        {/* Body */}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
