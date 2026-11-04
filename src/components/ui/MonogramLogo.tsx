import type { FC } from 'react';

interface LogoProps {
  className?: string;
}

export const MonogramLogo: FC<LogoProps> = ({ className = 'w-5 h-5' }) => {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="wh-logo-gradient" x1="4" y1="6" x2="28" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="0.5" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      {/* Precision architectural 'W' & 'H' warehouse monogram */}
      <path
        d="M5 9L9 23L13.5 13L18 23L22 9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Distinct H vertical pillar & crossbar connector */}
      <path
        d="M27 9V23"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M22 16H27"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="13.5" cy="8" r="1.75" fill="currentColor" />
    </svg>
  );
};

interface BrandProps {
  compact?: boolean;
  subtitle?: string;
  theme?: 'light' | 'dark';
  badgeText?: string;
  animated?: boolean;
}

export const MonogramBrand: FC<BrandProps> = ({
  compact = false,
  subtitle = 'Warehouse Command Center',
  theme = 'light',
  badgeText = 'WH',
  animated = false,
}) => {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative group shrink-0">
        {animated && (
          <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-indigo-500 via-cyan-400 to-indigo-600 opacity-60 blur-xs animate-pulse" />
        )}
        <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-cyan-400 p-[1.5px] shadow-lg shadow-indigo-600/25">
          <div className="w-full h-full bg-[#080c16] rounded-[10px] flex items-center justify-center text-indigo-400 group-hover:text-indigo-300 transition-colors">
            <MonogramLogo className="w-4 h-4" />
          </div>
        </div>
      </div>
      {!compact && (
        <div className="flex flex-col min-w-0">
          <span
            className={`font-black tracking-tight text-[13px] leading-tight flex items-center gap-1.5 ${
              theme === 'dark' ? 'text-white' : 'text-slate-900'
            }`}
          >
            <span>DASHBOARD</span>
            <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-black tracking-widest uppercase">
              {badgeText}
            </span>
          </span>
          {subtitle && (
            <span
              className={`text-[10px] font-semibold tracking-wider uppercase truncate ${
                theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

