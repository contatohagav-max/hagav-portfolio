import { classNames } from '@/lib/utils';

export default function EmptyState({ icon: Icon, title, description, className }) {
  return (
    <div className={classNames('flex flex-col items-center justify-center py-20 text-center', className)}>
      {Icon && (
        <div className="w-12 h-12 rounded-xl bg-hagav-muted/30 border border-hagav-border flex items-center justify-center mb-4">
          <Icon size={22} className="text-hagav-gray" />
        </div>
      )}
      <p className="text-sm font-medium text-hagav-light mb-1">{title}</p>
      {description && <p className="text-xs text-hagav-gray max-w-xs">{description}</p>}
    </div>
  );
}
