import React, { useState, useMemo } from 'react';

interface CountryFlagProps {
  flag?: string; // Emoji, country code, or icon symbol (e.g. '🇪🇸', 'ES', '🌎', '🌐')
  countryCode?: string; // Optional ISO 2-letter code (e.g. 'ES', 'US', 'JP')
  countryName?: string;
  className?: string; // Additional classes for sizing/spacing
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'custom';
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  alt?: string;
  showBorder?: boolean;
  forceSvg?: boolean; // Option to force SVG rendering even on native emoji devices
}

/**
 * Converts a 2-letter ISO country code into a native Unicode flag emoji (e.g. 'ES' -> '🇪🇸')
 */
export function isoCodeToEmoji(countryCode?: string): string | null {
  if (!countryCode || typeof countryCode !== 'string') return null;
  const code = countryCode.toUpperCase().trim();
  if (code === 'GLOBAL' || code === 'WORLD') return '🌐';
  if (code === 'LATAM' || code === 'AMERICAS') return '🌎';
  if (code === 'EU') return '🇪🇺';
  if (/^[A-Z]{2}$/.test(code)) {
    const codePoints = [...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65);
    return String.fromCodePoint(...codePoints);
  }
  return null;
}

/**
 * Extracts a 2-letter ISO code from a flag emoji (e.g., '🇪🇸' -> 'ES')
 */
export function emojiToCountryCode(emoji?: string): string | null {
  if (!emoji || typeof emoji !== 'string') return null;
  const trimmed = emoji.trim();

  // Known special tokens
  if (trimmed === '🌐' || trimmed === 'GLOBAL' || trimmed.toLowerCase() === 'global') return 'GLOBAL';
  if (trimmed === '🌎' || trimmed === '🌍' || trimmed === '🌏' || trimmed === 'LATAM' || trimmed.toLowerCase() === 'latam') return 'LATAM';
  if (trimmed === '🇪🇺' || trimmed === 'EU' || trimmed.toLowerCase() === 'eu') return 'EU';

  // Check if it's already a 2-letter code
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  // Convert regional indicator pairs to ISO code
  const codePoints: number[] = [];
  for (const char of trimmed) {
    const cp = char.codePointAt(0);
    if (cp && cp >= 0x1F1E6 && cp <= 0x1F1FF) {
      codePoints.push(cp - 0x1F1E6 + 65); // 65 is 'A'
    }
  }

  if (codePoints.length === 2) {
    return String.fromCharCode(codePoints[0], codePoints[1]).toUpperCase();
  }

  return null;
}

// Cached detection of native flag emoji support
let _cachedFlagEmojiSupport: boolean | null = null;

/**
 * Detects whether the current device/browser supports native Unicode flag emojis (macOS, iOS, Android, Linux, ChromeOS).
 * Only Windows (Segoe UI Emoji) lacks national flag emoji support and requires SVG fallback.
 */
export function isFlagEmojiSupported(): boolean {
  if (_cachedFlagEmojiSupport !== null) return _cachedFlagEmojiSupport;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    _cachedFlagEmojiSupport = true;
    return true;
  }

  const ua = navigator.userAgent || '';
  
  // Windows is the only operating system that historically omits country flag emojis from its default font (Segoe UI Emoji)
  const isWindows = /Windows|Win32|Win64|Windows NT/i.test(ua);
  if (isWindows) {
    _cachedFlagEmojiSupport = false;
    return false;
  }

  // Linux, macOS, iOS, iPadOS, Android, and ChromeOS all support native emoji flags directly
  _cachedFlagEmojiSupport = true;
  return true;
}

/**
 * Smart Hybrid Country Flag component:
 * 1. On compatible devices (Apple iPhone, iPad, Mac, Android, etc.): Renders the original native emoji directly.
 * 2. On Windows / non-compatible devices: Renders crisp SVG flags via FlagCDN so no broken text or missing flags appear.
 */
export const CountryFlag: React.FC<CountryFlagProps> = ({
  flag,
  countryCode,
  countryName,
  className = '',
  size = 'md',
  rounded = 'sm',
  alt,
  showBorder = true,
  forceSvg = false,
}) => {
  const [hasError, setHasError] = useState(false);

  // Determine effective ISO code and native emoji
  const isoCode = useMemo(() => {
    return (countryCode ? countryCode.toUpperCase().trim() : null) || emojiToCountryCode(flag);
  }, [countryCode, flag]);

  const nativeEmoji = useMemo(() => {
    if (flag && (flag.length > 2 || /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(flag) || flag === '🌐' || flag === '🌎' || flag === '🌍')) {
      return flag;
    }
    return isoCodeToEmoji(isoCode || countryCode) || flag;
  }, [flag, isoCode, countryCode]);

  const nativeEmojiSupported = useMemo(() => isFlagEmojiSupported(), []);

  // Size preset mappings for SVG
  const svgSizeClasses: Record<string, string> = {
    xs: 'w-4 h-3 text-xs',
    sm: 'w-5 h-3.5 text-xs',
    md: 'w-7 h-5 text-sm',
    lg: 'w-9 h-6 text-base',
    xl: 'w-12 h-8 text-xl',
    '2xl': 'w-16 h-11 text-2xl',
    custom: '',
  };

  // Size preset mappings for Native Emoji
  const emojiSizeClasses: Record<string, string> = {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-2xl',
    xl: 'text-3xl',
    '2xl': 'text-4xl',
    custom: '',
  };

  const roundedClasses: Record<string, string> = {
    none: 'rounded-none',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full aspect-square object-cover',
  };

  // 1. If device supports native emoji and not forced to SVG, render native emoji
  if (nativeEmojiSupported && !forceSvg && nativeEmoji) {
    const chosenEmojiSize = size !== 'custom' ? emojiSizeClasses[size] || emojiSizeClasses.md : '';
    return (
      <span
        title={countryName || alt || isoCode || ''}
        className={`inline-flex items-center justify-center shrink-0 leading-none select-none font-emoji ${chosenEmojiSize} ${className}`}
      >
        {nativeEmoji}
      </span>
    );
  }

  // 2. Windows / SVG Fallback:
  const borderClass = showBorder ? 'border border-slate-300/60 dark:border-slate-600/50' : '';
  const chosenSizeClass = size !== 'custom' ? svgSizeClasses[size] || svgSizeClasses.md : '';
  const chosenRoundedClass = roundedClasses[rounded] || roundedClasses.sm;

  // Render Global/Worldwide badge
  if (isoCode === 'GLOBAL' || flag === '🌐' || flag === 'GLOBAL') {
    return (
      <span
        title={countryName || alt || 'Cobertura Global'}
        className={`inline-flex items-center justify-center shrink-0 bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-xs ${chosenSizeClass} ${chosenRoundedClass} ${className}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-[70%] h-[70%]"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </span>
    );
  }

  // Render LATAM / Regional Americas badge
  if (isoCode === 'LATAM' || flag === '🌎' || flag === 'LATAM') {
    return (
      <span
        title={countryName || alt || 'América Latina'}
        className={`inline-flex items-center justify-center shrink-0 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xs ${chosenSizeClass} ${chosenRoundedClass} ${className}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-[70%] h-[70%]"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M5.5 8.5c1.5.5 3 0 4-1.5s2.5-1 3.5 0c.8.8 2 .8 3 0" />
          <path d="M7 16c2 1.5 4 1 5-.5s2-2 4-1.5" />
          <path d="M9 12c1 0 2.5 1 3.5 1s2-.5 3-.5" />
        </svg>
      </span>
    );
  }

  // If we have a valid 2-letter ISO country code (or 'EU') and no error, render SVG flag
  if (isoCode && /^[A-Z]{2}$/.test(isoCode) && !hasError) {
    const codeLower = isoCode.toLowerCase();
    const flagUrl = `https://flagcdn.com/${codeLower}.svg`;

    return (
      <img
        src={flagUrl}
        alt={alt || countryName || `Bandera de ${isoCode}`}
        title={countryName || alt || isoCode}
        loading="lazy"
        onError={() => setHasError(true)}
        className={`inline-block shrink-0 object-cover shadow-2xs ${chosenSizeClass} ${chosenRoundedClass} ${borderClass} ${className}`}
      />
    );
  }

  // Fallback: render emoji or code
  return (
    <span
      title={countryName || alt}
      className={`inline-flex items-center justify-center shrink-0 leading-none select-none font-emoji ${className}`}
    >
      {nativeEmoji || flag || isoCode || '🌐'}
    </span>
  );
};

export default CountryFlag;
