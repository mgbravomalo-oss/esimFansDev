import React from 'react';
import { Smartphone, RefreshCw, Radio, QrCode } from 'lucide-react';

interface MyEsimsSkeletonProps {
  /**
   * Number of skeleton cards to display (default: 4)
   */
  count?: number;
  /**
   * Optional custom loading title
   */
  title?: string;
  /**
   * Optional custom loading description
   */
  description?: string;
}

export const EsimCardSkeleton: React.FC<{ index?: number; className?: string }> = ({ index = 0, className = '' }) => {
  // Stagger simulated progress widths for realistic variation
  const progressWidths = ['68%', '42%', '85%', '25%'];
  const progressWidth = progressWidths[index % progressWidths.length];

  return (
    <div
      className={`relative overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between transition-all ${className}`}
      aria-hidden="true"
    >
      {/* Moving Shimmer Wave */}
      <div
        className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/50 dark:via-slate-700/20 to-transparent pointer-events-none z-10"
      />

      <div className="space-y-4">
        {/* Card Header Skeleton */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            {/* Flag placeholder with pulse */}
            <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-300 dark:text-slate-700 shrink-0">
              <Smartphone className="w-5 h-5 opacity-40 animate-pulse" />
            </div>

            {/* Country & Plan title lines */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-28 sm:w-36 bg-slate-200 dark:bg-slate-800 rounded-md animate-pulse" />
                <div className="h-3.5 w-14 bg-emerald-100/80 dark:bg-emerald-950/60 rounded-md animate-pulse" />
              </div>
              <div className="h-3 w-44 sm:w-48 bg-slate-100 dark:bg-slate-800/60 rounded-md animate-pulse" />
            </div>
          </div>

          {/* Status Badge & Price placeholder */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div className="h-6 w-28 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/50 dark:border-emerald-800/40 animate-pulse" />
            <div className="h-3.5 w-14 bg-slate-100 dark:bg-slate-800/60 rounded-md animate-pulse mt-0.5" />
          </div>
        </div>

        {/* ICCID, Operator & Date Badges Skeleton */}
        <div className="py-1 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* ICCID pill */}
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-10 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              <div className="h-3.5 w-36 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
            </div>

            {/* Operator pill */}
            <div className="flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-slate-300 dark:text-slate-700 animate-pulse" />
              <div className="h-3 w-20 bg-slate-100 dark:bg-slate-800/70 rounded animate-pulse" />
            </div>
          </div>

          {/* Validity pill */}
          <div className="h-5 w-28 rounded-md bg-slate-100 dark:bg-slate-800/70 animate-pulse" />
        </div>

        {/* Data Usage Meter Box Skeleton */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="h-3.5 w-28 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            <div className="h-4 w-36 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          </div>

          {/* Progress bar with glowing segment */}
          <div className="w-full bg-slate-200 dark:bg-slate-700/80 rounded-full h-2.5 overflow-hidden relative">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500/50 to-emerald-400/80 dark:from-emerald-600/40 dark:to-emerald-500/70 transition-all"
              style={{ width: progressWidth }}
            />
          </div>

          <div className="flex items-center justify-between pt-0.5">
            <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700/70 rounded animate-pulse" />
            <div className="h-3 w-28 bg-slate-200 dark:bg-slate-700/70 rounded animate-pulse" />
          </div>
        </div>
      </div>

      {/* Primary Card Actions Skeleton */}
      <div className="pt-4 mt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2">
        <div className="h-8 w-24 rounded-lg bg-emerald-100/70 dark:bg-emerald-950/50 border border-emerald-200/50 dark:border-emerald-800/50 animate-pulse" />
        <div className="h-8 w-28 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800/70 animate-pulse" />
      </div>
    </div>
  );
};

export const MyEsimsSkeletonGrid: React.FC<MyEsimsSkeletonProps> = ({
  count = 4,
  title = 'Sincronizando tus eSIMs...',
  description = 'Obteniendo estado de conexión, códigos QR y balance de consumo en tiempo real.'
}) => {
  const skeletons = Array.from({ length: count }, (_, i) => i);

  return (
    <div className="space-y-4" role="status" aria-label="Cargando perfiles eSIM">
      {/* Top Subtle Syncing Indicator Banner */}
      {title && (
        <div className="bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 rounded-xl px-4 py-3 flex items-center justify-between gap-3 animate-fade-in shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping absolute opacity-75" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 relative" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-emerald-950 dark:text-emerald-200 flex items-center gap-2">
                <span>{title}</span>
                <RefreshCw className="w-3 h-3 text-emerald-600 dark:text-emerald-400 animate-spin" />
              </h4>
              <p className="text-[11px] text-emerald-800/80 dark:text-emerald-400/80 mt-0.5">
                {description}
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-white/70 dark:bg-slate-900/60 px-2.5 py-1 rounded-lg border border-emerald-200/50 dark:border-emerald-800/50">
            <QrCode className="w-3 h-3" />
            <span>Verificando Red</span>
          </div>
        </div>
      )}

      {/* Grid of Skeleton Cards */}
      <div className={skeletons.length === 1 ? "flex justify-center w-full" : "grid grid-cols-1 lg:grid-cols-2 gap-5"}>
        {skeletons.map((idx) => (
          <EsimCardSkeleton
            key={`esim-skeleton-${idx}`}
            index={idx}
            className={skeletons.length === 1 ? "w-full max-w-2xl" : ""}
          />
        ))}
      </div>
    </div>
  );
};
