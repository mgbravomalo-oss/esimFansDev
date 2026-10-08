import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Globe,
  Lock,
  UserCheck,
  LogOut,
  Sparkles,
  HelpCircle,
  BookOpen,
  ChevronDown,
  Sun,
  Moon,
  Clock,
  ShieldAlert
} from 'lucide-react';
import { ButterflyLogo } from './ButterflyLogo';
import { MainTab, User } from '../types';
import { useTheme } from '../context/ThemeContext';

interface NavbarProps {
  activeTab: MainTab;
  setActiveTab: (tab: MainTab) => void;
  user: User | null;
  esimsCount: number;
  onOpenAuthModal: () => void;
  onLogout: () => void;
  onOpenCompatibilityModal: () => void;
  onOpenGuideModal: () => void;
  onOpenAdvisorModal: () => void;
  onOpenAdminOrdersModal?: () => void;
  pendingOrdersCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  user,
  esimsCount,
  onOpenAuthModal,
  onLogout,
  onOpenCompatibilityModal,
  onOpenGuideModal,
  onOpenAdvisorModal,
  onOpenAdminOrdersModal,
  pendingOrdersCount = 0
}) => {
  const { theme, toggleTheme, isDark } = useTheme();

  const isAdmin = Boolean(
    user?.role === 'admin' ||
    user?.isAdmin === true ||
    user?.email?.toLowerCase().trim() === 'mgbravomalo@gmail.com' ||
    user?.email?.toLowerCase().includes('admin') ||
    user?.email?.toLowerCase().trim() === 'admin@wappa.io'
  );

  const [isMobileSearchActive, setIsMobileSearchActive] = useState(false);

  useEffect(() => {
    const handleSearchState = (e: any) => {
      setIsMobileSearchActive(Boolean(e.detail?.active));
    };
    window.addEventListener('app:mobile-search-state', handleSearchState);
    return () => window.removeEventListener('app:mobile-search-state', handleSearchState);
  }, []);

  const handleMyEsimsClick = () => {
    if (!user) {
      onOpenAuthModal();
    } else {
      setActiveTab('myesims');
    }
  };

  return (
    <header className={`bg-white dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 shadow-xs backdrop-blur-md transition-colors duration-200 ${
      isMobileSearchActive ? 'hidden md:block' : 'block'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Left: Brand Logo & Main Nav */}
          <div className="flex items-center gap-8">
            <button
              onClick={() => setActiveTab('store')}
              className="flex items-center gap-2.5 text-left group focus:outline-none"
            >
              <ButterflyLogo size="md" className="group-hover:scale-105" />
              <div>
                <div className="flex items-center gap-1.5 leading-tight">
                  <span className="font-extrabold text-sm text-slate-900 dark:text-white tracking-tight">eSIM</span>
                  <span className="font-bold text-sm text-cyan-600 dark:text-cyan-400 tracking-tight">Global</span>
                </div>
                <span className="text-[10px] text-slate-400 dark:text-slate-400 font-mono tracking-widest block uppercase">Travel Data Hub</span>
              </div>
            </button>

            {/* Nav Tabs */}
            <nav className="hidden md:flex items-center gap-1">
              <button
                onClick={() => setActiveTab('store')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'store'
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                Destinos &amp; Tienda
              </button>

              <button
                onClick={handleMyEsimsClick}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === 'myesims'
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Mis eSIMs</span>
                {user && (
                  <span className="ml-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500 dark:bg-emerald-400 text-white dark:text-slate-950">
                    {esimsCount}
                  </span>
                )}
              </button>

              <button
                onClick={onOpenCompatibilityModal}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                Compatibilidad
              </button>

              <button
                onClick={onOpenGuideModal}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                Instalación
              </button>

              <button
                onClick={onOpenAdvisorModal}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/60 transition-colors flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>Asistente IA</span>
              </button>

              {isAdmin && (
                <button
                  onClick={() => setActiveTab('admin')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeTab === 'admin'
                      ? 'bg-purple-700 dark:bg-purple-600 text-white shadow-xs'
                      : 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/50 border border-purple-200 dark:border-purple-800/60 shadow-2xs'
                  }`}
                  title="Panel de Administración Completo"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Administración</span>
                  {pendingOrdersCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black flex items-center justify-center animate-pulse">
                      {pendingOrdersCount}
                    </span>
                  )}
                </button>
              )}
            </nav>
          </div>

          {/* Right: Theme Toggle & User State / Authentication */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 transition-all duration-200 flex items-center gap-1.5"
              title={isDark ? 'Cambiar a modo Claro' : 'Cambiar a modo Oscuro'}
              aria-label="Toggle theme"
            >
              {isDark ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400 animate-spin-once" />
                  <span className="hidden lg:inline text-xs font-medium text-slate-300">Claro</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-indigo-600" />
                  <span className="hidden lg:inline text-xs font-medium text-slate-600">Oscuro</span>
                </>
              )}
            </button>

            {!user ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={onOpenAuthModal}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-all hover:scale-102"
                >
                  <UserCheck className="w-3.5 h-3.5 text-emerald-400 dark:text-white" />
                  <span>Identificarse</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                
                {/* User details badge */}
                <div className="flex items-center gap-2.5 pl-2 py-1 pr-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl">
                  <img
                    src={user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                    alt={user.name}
                    className="w-7 h-7 rounded-full object-cover border border-slate-300 dark:border-slate-600"
                  />
                  <div className="text-left hidden sm:block">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight">
                      {user.name}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                      Saldo: <strong className="text-emerald-700 dark:text-emerald-400">${(user.walletBalanceEUR || 0).toFixed(2)}</strong>
                    </div>
                  </div>
                </div>

                {/* Logout Button */}
                <button
                  onClick={onLogout}
                  className="p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-slate-700/80 hover:border-rose-200 dark:hover:border-rose-800 transition-colors"
                  title="Cerrar sesión (Modo Invitado)"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Mobile Navigation bar */}
        <div className="flex md:hidden items-center justify-around py-2.5 border-t border-slate-100 dark:border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('store')}
            className={`font-semibold py-1 px-2.5 rounded-lg ${
              activeTab === 'store'
                ? 'bg-slate-900 dark:bg-slate-800 text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Tienda
          </button>
          <button
            onClick={handleMyEsimsClick}
            className={`font-semibold py-1 px-2.5 rounded-lg flex items-center gap-1 ${
              activeTab === 'myesims'
                ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <span>Mis eSIMs</span>
            {user ? <span className="font-bold text-emerald-400">({esimsCount})</span> : <Lock className="w-2.5 h-2.5" />}
          </button>
          <button
            onClick={onOpenCompatibilityModal}
            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            Compatibilidad
          </button>
          <button
            onClick={onOpenGuideModal}
            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            Guía
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`font-semibold py-1 px-2 rounded-lg ${
                activeTab === 'admin'
                  ? 'bg-purple-700 dark:bg-purple-600 text-white'
                  : 'text-purple-600 dark:text-purple-400 hover:text-purple-700'
              }`}
            >
              Admin
            </button>
          )}
        </div>

      </div>
    </header>
  );
};
