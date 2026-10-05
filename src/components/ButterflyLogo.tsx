import React from 'react';

interface ButterflyLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | number;
  animated?: boolean;
}

export const ButterflyLogo: React.FC<ButterflyLogoProps> = ({
  className = '',
  size = 'md',
  animated = true
}) => {
  // Determine width/height classes or inline style
  let dimClass = 'w-9 h-9'; // Default same size as the previous green logo (36x36px)
  let svgDimClass = 'w-7 h-7';

  if (typeof size === 'number') {
    dimClass = '';
  } else if (size === 'sm') {
    dimClass = 'w-6 h-6';
    svgDimClass = 'w-5 h-5';
  } else if (size === 'lg') {
    dimClass = 'w-12 h-12';
    svgDimClass = 'w-9 h-9';
  }

  const customStyle = typeof size === 'number' ? { width: size, height: size } : undefined;

  return (
    <div
      style={customStyle}
      className={`relative ${dimClass} rounded-xl bg-gradient-to-tr from-slate-950 via-slate-900 to-cyan-950 dark:from-slate-950 dark:via-slate-900 dark:to-cyan-900/90 border border-cyan-500/30 flex items-center justify-center shadow-xs shadow-cyan-950/40 group-hover:scale-105 group-hover:border-cyan-400/60 transition-all duration-300 overflow-hidden shrink-0 ${className}`}
      title="eSIM Global"
    >
      {/* Ambient background glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-transparent to-blue-500/10 pointer-events-none" />

      {/* Butterfly SVG */}
      <svg
        viewBox="0 0 220 135"
        className={`${svgDimClass} relative z-10 drop-shadow-[0_0_8px_rgba(34,211,238,0.7)] group-hover:scale-110 transition-transform duration-300`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="logo-blue-wing-grad" x1="1" y1="0.5" x2="0" y2="0.5">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="60%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id="logo-indigo-wing-grad" x1="0" y1="0.5" x2="1" y2="0.5">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="60%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
          <filter id="wing-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <style>{`
          @keyframes gentle-wing-flap {
            0%, 100% { transform: scaleX(1); }
            50% { transform: scaleX(0.82); }
          }
          .b-wing-left {
            transform-origin: 110px 65px;
            ${animated ? 'animation: gentle-wing-flap 2.2s ease-in-out infinite;' : ''}
          }
          .b-wing-right {
            transform-origin: 110px 65px;
            ${animated ? 'animation: gentle-wing-flap 2.2s ease-in-out infinite;' : ''}
          }
        `}</style>

        {/* Left Wing (Cyan to Blue Gradient) */}
        <g className="b-wing-left">
          <path
            fill="url(#logo-blue-wing-grad)"
            d="M 110 65 C 110 65, 90 5, 30 5 C 0 5, 15 65, 60 65 C 15 65, 5 125, 35 125 C 85 125, 110 65, 110 65 Z"
          />
          {/* Veins */}
          <path
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.4"
            opacity="0.65"
            strokeLinecap="round"
            d="M 110 65 Q 70 40 35 15 M 110 65 Q 60 65 25 65 M 110 65 Q 70 90 40 115"
          />
        </g>

        {/* Right Wing (Blue to Indigo Gradient) */}
        <g className="b-wing-right">
          <path
            fill="url(#logo-indigo-wing-grad)"
            d="M 110 65 C 110 65, 130 5, 190 5 C 220 5, 205 65, 160 65 C 205 65, 225 125, 185 125 C 135 125, 110 65, 110 65 Z"
          />
          {/* Veins */}
          <path
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.4"
            opacity="0.65"
            strokeLinecap="round"
            d="M 110 65 Q 150 40 185 15 M 110 65 Q 160 65 195 65 M 110 65 Q 150 90 180 115"
          />
        </g>

        {/* Antennas */}
        <path
          d="M 109 38 Q 98 16 88 18"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="88" cy="18" r="2.5" fill="#22d3ee" />

        <path
          d="M 111 38 Q 122 16 132 18"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="132" cy="18" r="2.5" fill="#818cf8" />

        {/* Body (Glowing sleek white pill with soft shadow) */}
        <rect
          x="108"
          y="36"
          width="4"
          height="58"
          rx="2"
          fill="#ffffff"
          stroke="#cbd5e1"
          strokeWidth="0.8"
        />
      </svg>
    </div>
  );
};
