import React from 'react';
import { PackageOpen } from 'lucide-react';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title = 'Tidak ada data ditemukan',
  description = 'Belum ada transaksi atau catatan yang cocok dengan filter yang dipilih.',
  icon,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`p-10 flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 ${className}`}>
      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-slate-400 mb-3">
        {icon || <PackageOpen className="w-6 h-6" />}
      </div>
      <h4 className="text-sm font-bold text-slate-800 mb-1">{title}</h4>
      <p className="text-xs text-slate-500 max-w-sm mb-4 leading-relaxed">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className = 'h-4 w-full', ...props }: SkeletonProps) {
  return <div className={`animate-pulse bg-slate-200/80 rounded-lg ${className}`} {...props} />;
}

export function TableLoadingSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full space-y-3 p-4">
      <Skeleton className="h-8 w-full rounded-xl" />
      {Array.from({ length: rows }).map((_, rIdx) => (
        <div key={rIdx} className="flex gap-4 items-center">
          {Array.from({ length: cols }).map((_, cIdx) => (
            <div key={cIdx} className="flex-1">
              <Skeleton className="h-6 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
