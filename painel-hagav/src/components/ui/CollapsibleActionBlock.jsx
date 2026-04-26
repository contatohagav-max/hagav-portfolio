'use client';

import { ChevronDown } from 'lucide-react';

export default function CollapsibleActionBlock({
  title,
  description,
  collapsed = false,
  onToggle,
  children,
  contentClassName = '',
}) {
  return (
    <div className="orcamento-action-block">
      <div className="orcamento-action-head flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="orcamento-action-kicker">{title}</p>
          {!collapsed && description ? (
            <p className="orcamento-action-caption">{description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="btn-ghost btn-sm shrink-0"
          aria-expanded={!collapsed}
        >
          <span>{collapsed ? 'Expandir' : 'Recolher'}</span>
          <ChevronDown
            size={13}
            className={`transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
          />
        </button>
      </div>
      {!collapsed ? (
        <div className={contentClassName}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
