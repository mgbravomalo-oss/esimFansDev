import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Share2, PlusSquare, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'nav' | 'floating' | 'banner' | 'compact';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'floating',
  className = '',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isMobileSearchActive, setIsMobileSearchActive] = useState(false);

  // Check for Flutter WebView (often indicated by 'Flutter' in User Agent)
  const isInFlutterWebView = typeof navigator !== 'undefined' && navigator.userAgent.includes('Flutter');

  React.useEffect(() => {
    const handleSearchState = (e: any) => {
      setIsMobileSearchActive(Boolean(e.detail?.active));
    };
    window.addEventListener('app:mobile-search-state', handleSearchState);
    return () => window.removeEventListener('app:mobile-search-state', handleSearchState);
  }, []);

  // If already running in standalone mode (already installed), or during mobile focused search, or in Flutter WebView, hide completely
  if (isInstalled || dismissed || isInFlutterWebView || (isMobileSearchActive && (variant === 'floating' || variant === 'banner'))) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (isInstallable) {
      try {
        setIsInstalling(true);
        await install();
      } finally {
        setIsInstalling(false);
      }
    } else {
      // Fallback for browsers without beforeinstallprompt or desktop Safari
      setShowIOSModal(true);
    }
  };

  return (
    <>
      {/* 1. Nav button variant (Clean & subtle) */}
      {variant === 'nav' && (
        <button
          onClick={handleInstallClick}
          disabled={isInstalling}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-700/70 transition-all active:scale-95 cursor-pointer ${className}`}
          title="Instalar App en tu pantalla de inicio"
        >
          <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="hidden sm:inline">Instalar</span>
        </button>
      )}

      {/* 2. Compact button for mobile menu or modal */}
      {variant === 'compact' && (
        <button
          onClick={handleInstallClick}
          className={`flex items-center gap-2 px-3 py-2 w-full rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-slate-800 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all ${className}`}
        >
          <Smartphone className="w-4 h-4 text-emerald-500" />
          <span>Instalar como App en tu teléfono</span>
        </button>
      )}

      {/* 3. Botón Flotante Estilo Tarjeta con Lucesita */}
      {(variant === 'floating' || variant === 'banner') && (
        <div className={`fixed bottom-5 left-4 z-45 animate-fade-in flex items-center ${className}`}>
          <div className="group relative flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-xl border border-slate-700/80 hover:border-emerald-500/60 transition-all duration-200">
            <button
              onClick={handleInstallClick}
              disabled={isInstalling}
              className="flex items-center gap-2 text-xs font-bold cursor-pointer focus:outline-none text-white"
              title="Instalar aplicación en tu dispositivo"
            >
              {/* Icono con lucesita (LED) integrada */}
              <div className="relative w-4 h-4 flex items-center justify-center shrink-0">
                <Download className="w-4 h-4 text-emerald-400" />
                {/* Lucesita (LED) pulsante */}
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>

              <div className="text-[11px] font-bold tracking-wide">
                {isInstalling ? 'Instalando...' : 'Instalar App'}
              </div>
            </button>

            {/* Botón X miniatura para descartar */}
            <button
              onClick={() => setDismissed(true)}
              className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition-colors ml-1 cursor-pointer"
              aria-label="Cerrar botón"
              title="Ocultar"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Step-by-step Modal for iOS and guide */}
      {showIOSModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in"
          onClick={() => setShowIOSModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Instalar en la pantalla</h3>
                  <p className="text-xs text-slate-500">eSIM Global en tu dispositivo</p>
                </div>
              </div>
              <button
                onClick={() => setShowIOSModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 pt-2">
              {isIOS ? (
                <>
                  <div className="flex items-start gap-3 bg-slate-100 dark:bg-slate-800 p-3 rounded-xl border border-slate-300 dark:border-slate-700">
                    <div className="w-7 h-7 rounded-lg bg-emerald-700 text-white flex items-center justify-center text-xs font-bold shrink-0">
                      1
                    </div>
                    <div className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                      Toca el botón <strong className="text-black dark:text-white inline-flex items-center gap-1">Compartir <Share2 className="w-3.5 h-3.5 inline text-emerald-700 dark:text-emerald-400" /></strong> en la barra de tu navegador (Safari o Chrome).
                    </div>
                  </div>

                  <div className="flex items-start gap-3 bg-slate-100 dark:bg-slate-800 p-3 rounded-xl border border-slate-300 dark:border-slate-700">
                    <div className="w-7 h-7 rounded-lg bg-emerald-700 text-white flex items-center justify-center text-xs font-bold shrink-0">
                      2
                    </div>
                    <div className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                      Baja y pulsa en <strong className="text-black dark:text-white inline-flex items-center gap-1">Añadir a pantalla de inicio <PlusSquare className="w-3.5 h-3.5 inline text-emerald-700 dark:text-emerald-400" /></strong>.
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-3 bg-slate-100 dark:bg-slate-800 p-3 rounded-xl border border-slate-300 dark:border-slate-700">
                  <div className="w-7 h-7 rounded-lg bg-emerald-700 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    1
                  </div>
                  <div className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                    Haz clic en el <strong className="text-black dark:text-white">menú de tres puntos (⋮)</strong> en la esquina superior derecha de tu navegador y selecciona <strong className="text-black dark:text-white">"Instalar eSIM Global..."</strong> o "Instalar aplicación".
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 bg-emerald-50 dark:bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800/40">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                <span>La app se abrirá en una ventana dedicada para un acceso más rápido.</span>
              </div>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-bold transition-all cursor-pointer"
            >
              ¡Entendido!
            </button>
          </div>
        </div>
      )}
    </>
  );
};
