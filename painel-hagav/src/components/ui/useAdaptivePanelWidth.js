'use client';

import { useEffect, useRef, useState } from 'react';

const DESKTOP_BREAKPOINT = 1024;
const LARGE_BREAKPOINT = 1600;
const ULTRAWIDE_BREAKPOINT = 2200;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function readStoredWidth(storageKey) {
  if (typeof window === 'undefined' || !storageKey) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function resolvePresetWidth(viewportWidth, widths) {
  if (viewportWidth >= ULTRAWIDE_BREAKPOINT) {
    return widths.ultrawide ?? widths.large ?? widths.base;
  }
  if (viewportWidth >= LARGE_BREAKPOINT) {
    return widths.large ?? widths.base;
  }
  return widths.base;
}

export default function useAdaptivePanelWidth({
  storageKey,
  widths,
  minWidth = 680,
  maxWidth = 1680,
  viewportMarginDesktop = 40,
  viewportMarginMobile = 16,
  resizable = true,
}) {
  const [viewportWidth, setViewportWidth] = useState(0);
  const [storedWidth, setStoredWidth] = useState(null);
  const resizeStateRef = useRef(null);
  const maxAllowedRef = useRef(maxWidth);
  const minWidthRef = useRef(minWidth);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncViewport = () => {
      setViewportWidth(window.innerWidth);
    };

    setStoredWidth(readStoredWidth(storageKey));
    syncViewport();
    window.addEventListener('resize', syncViewport);

    return () => {
      window.removeEventListener('resize', syncViewport);
    };
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || !storageKey) return;
    try {
      if (storedWidth === null) {
        window.localStorage.removeItem(storageKey);
        return;
      }
      window.localStorage.setItem(storageKey, String(Math.round(storedWidth)));
    } catch {
      // ignore persistence issues
    }
  }, [storageKey, storedWidth]);

  const isDesktop = viewportWidth >= DESKTOP_BREAKPOINT;
  const viewportMargin = isDesktop ? viewportMarginDesktop : viewportMarginMobile;
  const recommendedWidth = resolvePresetWidth(viewportWidth || widths.base, widths);
  const maxViewportWidth = Math.max(320, (viewportWidth || widths.base) - viewportMargin);
  const safeMaxWidth = Math.min(maxWidth, maxViewportWidth);
  const safeMinWidth = Math.min(minWidth, safeMaxWidth);
  const resolvedWidth = clamp(storedWidth ?? recommendedWidth, safeMinWidth, safeMaxWidth);

  maxAllowedRef.current = safeMaxWidth;
  minWidthRef.current = safeMinWidth;

  useEffect(() => {
    if (storedWidth === null) return;
    const clampedStored = clamp(storedWidth, safeMinWidth, safeMaxWidth);
    if (clampedStored !== storedWidth) {
      setStoredWidth(clampedStored);
    }
  }, [safeMaxWidth, safeMinWidth, storedWidth]);

  useEffect(() => () => {
    if (typeof window === 'undefined') return;
    const activeState = resizeStateRef.current;
    if (activeState?.moveHandler) {
      window.removeEventListener('pointermove', activeState.moveHandler);
    }
    if (activeState?.upHandler) {
      window.removeEventListener('pointerup', activeState.upHandler);
    }
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    resizeStateRef.current = null;
  }, []);

  function resetWidth() {
    setStoredWidth(null);
  }

  function startResize(event) {
    if (!resizable || !isDesktop || typeof window === 'undefined') return;

    event.preventDefault();
    event.stopPropagation();

    const moveHandler = (moveEvent) => {
      const activeState = resizeStateRef.current;
      if (!activeState) return;

      // Panels are centered, so the width needs to change on both sides
      // for the dragged right edge to visually track the pointer.
      const delta = (moveEvent.clientX - activeState.startX) * 2;
      const nextWidth = clamp(
        activeState.startWidth + delta,
        minWidthRef.current,
        maxAllowedRef.current,
      );

      setStoredWidth(Math.round(nextWidth));
    };

    const upHandler = () => {
      window.removeEventListener('pointermove', moveHandler);
      window.removeEventListener('pointerup', upHandler);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      resizeStateRef.current = null;
    };

    resizeStateRef.current = {
      startX: event.clientX,
      startWidth: resolvedWidth,
      moveHandler,
      upHandler,
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
    window.addEventListener('pointermove', moveHandler);
    window.addEventListener('pointerup', upHandler);
  }

  return {
    panelStyle: isDesktop
      ? {
          width: `${resolvedWidth}px`,
          maxWidth: `calc(100vw - ${viewportMarginDesktop}px)`,
        }
      : undefined,
    showResizeHandle: Boolean(resizable && isDesktop),
    resizeHandleProps: {
      onPointerDown: startResize,
      onDoubleClick: resetWidth,
      title: 'Arraste para ajustar a largura. Duplo clique restaura o tamanho padrão.',
    },
  };
}
