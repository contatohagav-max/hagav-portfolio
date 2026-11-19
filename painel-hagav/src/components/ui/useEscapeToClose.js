import { useEffect } from 'react';

// Fecha painéis laterais/janelas com a tecla Esc.
export default function useEscapeToClose(onClose, enabled = true) {
  useEffect(() => {
    if (!enabled || typeof onClose !== 'function') return undefined;
    function handler(event) {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, enabled]);
}
