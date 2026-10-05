import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Smartphone,
  Globe,
  BookOpen,
  Search,
  X,
  User as UserIcon,
  HelpCircle,
  ArrowUp,
  Compass,
  CheckCircle2,
  ChevronRight,
  Wifi
} from 'lucide-react';
import { MainTab, User } from '../types';
import { scrollSearchToTopSlow, smoothScrollToSlow } from '../utils/scrollHelper';

interface SmartMobileFabProps {
  activeTab: MainTab;
  setActiveTab: (tab: MainTab) => void;
  user: User | null;
  esimsCount: number;
  onOpenAuthModal: () => void;
  onOpenCompatibilityModal: () => void;
  onOpenGuideModal: () => void;
  onOpenAdvisorModal: () => void;
  onScrollToSearch?: () => void;
}

export const SmartMobileFab: React.FC<SmartMobileFabProps> = ({
  activeTab,
  setActiveTab,
  user,
  esimsCount,
  onOpenAuthModal,
  onOpenCompatibilityModal,
  onOpenGuideModal,
  onOpenAdvisorModal,
  onScrollToSearch
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolledPastHero, setScrolledPastHero] = useState(false);
  const [isMobileSearchActive, setIsMobileSearchActive] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Ocultar el botón flotante durante la búsqueda enfocada en móviles
  useEffect(() => {
    const handleSearchState = (e: any) => {
      setIsMobileSearchActive(Boolean(e.detail?.active));
      if (e.detail?.active) setIsOpen(false);
    };
    window.addEventListener('app:mobile-search-state', handleSearchState);
    return () => window.removeEventListener('app:mobile-search-state', handleSearchState);
  }, []);

  // Detect scroll to offer "Volver arriba" smart action
  useEffect(() => {
    const handleScroll = () => {
      setScrolledPastHero(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleAction = (callback: () => void) => {
    callback();
    setIsOpen(false);
  };

  const handleNavigateToSearch = () => {
    // 1. Cerrar inmediatamente cualquier modal abierto antes de buscar
    window.dispatchEvent(new CustomEvent('app:close-all-modals'));

    if (activeTab !== 'store') {
      setActiveTab('store');
    }
    setIsOpen(false);

    if (onScrollToSearch) {
      onScrollToSearch();
    } else {
      const tryFocus = (attemptsLeft = 6) => {
        const searchInput = document.getElementById('catalog-search-input') as HTMLInputElement | null;
        if (searchInput) {
          scrollSearchToTopSlow(800);
          searchInput.focus();
        } else if (attemptsLeft > 0) {
          setTimeout(() => tryFocus(attemptsLeft - 1), 60);
        } else {
          smoothScrollToSlow(0, 800);
        }
      };
      setTimeout(() => tryFocus(), 80);
    }
  };

  const handleScrollToTop = () => {
    smoothScrollToSlow(0, 800);
    setIsOpen(false);
  };

  if (isMobileSearchActive) {
    return null;
  }

  return (
    <div ref={menuRef} className="block md:hidden">
      {/* Backdrop overlay when open */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-xs"
          />
        )}
      </AnimatePresence>

      {/* Floating Speed-Dial Smart Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="fixed bottom-22 right-4 left-4 z-50 max-w-sm ml-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-2xl overflow-hidden"
          >
            {/* Header / User Status Chip */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <Wifi className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {user ? user.name : 'Modo Invitado'}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    {user
                      ? `${esimsCount} eSIM${esimsCount === 1 ? '' : 's'} en tu cuenta`
                      : 'Navegación rápida móvil'}
                  </p>
                </div>
              </div>

              {!user ? (
                <button
                  id="mobile-fab-login-btn"
                  onClick={() => handleAction(onOpenAuthModal)}
                  className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
                >
                  Acceder
                </button>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  Conectado
                </span>
              )}
            </div>

            {/* Smart Action Grid */}
            <div className="grid grid-cols-2 gap-2 pt-3">
              
              {/* Action 1: Destinos / Tienda */}
              <button
                id="mobile-smart-action-store"
                onClick={() => handleAction(() => setActiveTab('store'))}
                className={`p-3 rounded-2xl flex flex-col items-start gap-1.5 text-left border transition-all ${
                  activeTab === 'store'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Globe className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold leading-tight">Destinos &amp; Planes</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Ver catálogo</span>
              </button>

              {/* Action 2: Mis eSIMs */}
              <button
                id="mobile-smart-action-myesims"
                onClick={() =>
                  handleAction(() => {
                    if (!user) onOpenAuthModal();
                    else setActiveTab('myesims');
                  })
                }
                className={`p-3 rounded-2xl flex flex-col items-start gap-1.5 text-left border transition-all ${
                  activeTab === 'myesims'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-blue-600 dark:text-blue-400 relative">
                  <Smartphone className="w-4 h-4" />
                  {esimsCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 text-[9px] font-bold text-white flex items-center justify-center">
                      {esimsCount}
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold leading-tight">Mis eSIMs</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  {user ? `${esimsCount} perfiles QR` : 'Identifícate'}
                </span>
              </button>

              {/* Action 3: Asistente IA */}
              <button
                id="mobile-smart-action-ai-advisor"
                onClick={() => handleAction(onOpenAdvisorModal)}
                className="p-3 rounded-2xl flex flex-col items-start gap-1.5 text-left bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-slate-900 border border-amber-200/60 dark:border-amber-900/40 text-slate-800 dark:text-slate-200"
              >
                <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold leading-tight text-amber-900 dark:text-amber-300">Asistente IA</span>
                <span className="text-[10px] text-amber-700/80 dark:text-amber-400/70">Recomendar plan</span>
              </button>

              {/* Action 4: Buscar País */}
              <button
                id="mobile-smart-action-search"
                onClick={handleNavigateToSearch}
                className="p-3 rounded-2xl flex flex-col items-start gap-1.5 text-left bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200"
              >
                <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Search className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold leading-tight">Buscar País</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Ir al buscador</span>
              </button>

              {/* Action 5: Compatibilidad de Móvil */}
              <button
                id="mobile-smart-action-compatibility"
                onClick={() => handleAction(onOpenCompatibilityModal)}
                className="p-3 rounded-2xl flex flex-col items-start gap-1.5 text-left bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200"
              >
                <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold leading-tight">¿Compatible?</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Comprobar modelo</span>
              </button>

              {/* Action 6: Guía de Instalación */}
              <button
                id="mobile-smart-action-guide"
                onClick={() => handleAction(onOpenGuideModal)}
                className="p-3 rounded-2xl flex flex-col items-start gap-1.5 text-left bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200"
              >
                <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <BookOpen className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold leading-tight">Guía QR</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Paso a paso</span>
              </button>
            </div>

            {/* Smart Scroll-to-top option if user scrolled down */}
            {scrolledPastHero && (
              <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  id="mobile-smart-action-scroll-top"
                  onClick={handleScrollToTop}
                  className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                  <span>Volver arriba</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Primary Floating Action Button (FAB) */}
      <motion.button
        id="mobile-smart-fab-button"
        whileTap={{ scale: 0.92 }}
        onClick={() => setIsOpen(prev => !prev)}
        className={`fixed bottom-5 right-5 z-50 w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all border ${
          isOpen
            ? 'bg-slate-900 text-white border-slate-700 rotate-90 dark:bg-slate-800'
            : 'bg-gradient-to-tr from-slate-900 via-slate-800 to-emerald-700 dark:from-emerald-600 dark:via-emerald-700 dark:to-teal-800 text-white border-white/20 shadow-emerald-950/20'
        }`}
        aria-label="Abrir menú inteligente móvil"
      >
        {isOpen ? (
          <X className="w-6 h-6 transition-transform" />
        ) : (
          <div className="relative flex items-center justify-center">
            <Compass className="w-6 h-6 text-emerald-400" />
            
            {/* Pulsing smart indicator */}
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>

            {/* Active eSIMs Badge if any */}
            {esimsCount > 0 && (
              <span className="absolute -bottom-2 -left-2 bg-emerald-500 text-slate-950 text-[9px] font-black rounded-full px-1.5 py-0.2 border border-slate-900">
                {esimsCount}
              </span>
            )}
          </div>
        )}
      </motion.button>
    </div>
  );
};
