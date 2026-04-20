'use client';

import { useEffect, useRef, useState } from 'react';
import { classNames } from '@/lib/utils';

function TooltipText({ title, whatIs, purpose, observe }) {
  return (
    <>
      <p className="text-[11px] font-semibold text-zinc-900">{title}</p>
      <p className="text-[11px] text-zinc-700 mt-1 leading-relaxed">
        <span className="font-semibold text-zinc-900">O que e:</span> {whatIs}
      </p>
      <p className="text-[11px] text-zinc-700 mt-1 leading-relaxed">
        <span className="font-semibold text-zinc-900">Para que serve:</span> {purpose}
      </p>
      <p className="text-[11px] text-zinc-700 mt-1 leading-relaxed">
        <span className="font-semibold text-zinc-900">O que observar:</span> {observe}
      </p>
    </>
  );
}

export default function EduTooltip({
  children,
  title,
  whatIs,
  purpose,
  observe,
  side = 'top',
  className,
  panelClassName,
  enabled = true,
  enableTap = true,
}) {
  if (!enabled || !title || !whatIs || !purpose || !observe) return children;

  const [tapOpen, setTapOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!tapOpen) return undefined;
    function handlePointerDown(event) {
      if (!wrapperRef.current?.contains(event.target)) {
        setTapOpen(false);
      }
    }
    function handleEscape(event) {
      if (event.key === 'Escape') setTapOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [tapOpen]);

  function handlePointerDown(event) {
    if (!enableTap) return;
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    setTapOpen((prev) => !prev);
  }

  const panelPosition = side === 'bottom'
    ? 'top-full mt-2 left-1/2 -translate-x-1/2'
    : side === 'right'
      ? 'left-full ml-2 top-1/2 -translate-y-1/2'
      : side === 'left'
        ? 'right-full mr-2 top-1/2 -translate-y-1/2'
        : 'bottom-full mb-2 left-1/2 -translate-x-1/2';

  return (
    <div
      ref={wrapperRef}
      onPointerDown={handlePointerDown}
      className={classNames('relative group/edu w-full touch-manipulation', className)}
    >
      {children}
      <div
        className={classNames(
          'absolute z-50 w-[min(320px,86vw)] rounded-xl border border-zinc-200 bg-white p-3',
          'shadow-[0_10px_28px_rgba(0,0,0,0.18)] opacity-0 translate-y-1 transition-all duration-150 pointer-events-none',
          'group-hover/edu:opacity-100 group-hover/edu:translate-y-0',
          'group-focus-within/edu:opacity-100 group-focus-within/edu:translate-y-0',
          tapOpen && 'opacity-100 translate-y-0 pointer-events-auto',
          panelPosition,
          panelClassName,
        )}
        role="tooltip"
      >
        <TooltipText title={title} whatIs={whatIs} purpose={purpose} observe={observe} />
      </div>
    </div>
  );
}
