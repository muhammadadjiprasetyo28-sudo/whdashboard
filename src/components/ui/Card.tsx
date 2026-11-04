import React, { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
}

export function Card({ children, className = '', hoverEffect = false, ...props }: CardProps) {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 transition-all duration-200 ${
        hoverEffect ? 'hover:shadow-md hover:border-slate-300' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  accentColor?: 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo';
  className?: string;
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  accentColor = 'blue',
  className = '',
}: KpiCardProps) {
  const accentClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  }[accentColor];

  return (
    <div className={`bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:border-slate-300 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</span>
        {icon && (
          <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 shadow-xs ${accentClasses}`}>
            {icon}
          </div>
        )}
      </div>

      <div>
        <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-none mb-1">
          {value}
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs">
          {trend && (
            <span
              className={`font-bold px-1.5 py-0.5 rounded-md ${
                trend.isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              }`}
            >
              {trend.value}
            </span>
          )}
          {subtitle && <span className="text-slate-500 font-medium truncate">{subtitle}</span>}
        </div>
      </div>
    </div>
  );
}
