import React from 'react';
import { RefreshCw, Wifi, WifiOff, AlertTriangle } from 'lucide-react';

export type NetworkDataStatus = 'live' | 'updating' | 'stale' | 'offline';

export interface NetworkStatusIndicatorProps {
  status: NetworkDataStatus;
  lastUpdated?: string | Date | number;
  onRefresh?: () => void;
  className?: string;
}

export function NetworkStatusIndicator({
  status = 'live',
  lastUpdated,
  onRefresh,
  className = '',
}: NetworkStatusIndicatorProps) {
  const formattedTime = React.useMemo(() => {
    if (!lastUpdated) {
      const now = new Date();
      return now.toTimeString().split(' ')[0];
    }
    const d = new Date(lastUpdated);
    return isNaN(d.getTime()) ? '-' : d.toTimeString().split(' ')[0];
  }, [lastUpdated]);

  const config = {
    live: {
      label: 'Live',
      dotColor: 'bg-emerald-500 shadow-emerald-500/40',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: <Wifi className="w-3 h-3 text-emerald-600" />
    },
    updating: {
      label: 'Updating',
      dotColor: 'bg-blue-500 animate-pulse',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: <RefreshCw className="w-3 h-3 text-blue-600 animate-spin" />
    },
    stale: {
      label: 'Stale (Cache)',
      dotColor: 'bg-amber-500',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: <AlertTriangle className="w-3 h-3 text-amber-600" />
    },
    offline: {
      label: 'Offline',
      dotColor: 'bg-rose-500',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      icon: <WifiOff className="w-3 h-3 text-rose-600" />
    },
  }[status];

  return (
    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-xl border text-xs font-semibold select-none ${config.badgeClass} ${className}`}>
      <span className={`w-2 h-2 rounded-full shadow-xs ${config.dotColor}`} />
      <span>{config.label}</span>
      <span className="opacity-60 text-[10px]">· {formattedTime}</span>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="ml-0.5 p-0.5 hover:opacity-80 transition-opacity focus:outline-none"
          title="Refresh Data"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
