import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { DestinationsCatalog } from './components/DestinationsCatalog';
import { SmartMobileFab } from './components/SmartMobileFab';
import { EsimPlan, MainTab, User, UserEsim } from './types';
import { DEMO_USER_ESIMS } from './data/esimData';
import { Shield, Sparkles, UserCheck, Smartphone, CheckCircle, Wifi } from 'lucide-react';
import { scrollSearchToTopSlow, smoothScrollToSlow } from './utils/scrollHelper';

// Static imports instead of dynamic lazy loading to resolve dynamic chunk loading failures completely
import { MyEsimsView } from './components/MyEsimsView';
import { AuthModal } from './components/AuthModal';
import { CheckoutModal } from './components/CheckoutModal';
import { DeviceCompatibilityModal } from './components/DeviceCompatibilityModal';
import { InstallationGuideModal } from './components/InstallationGuideModal';
import { AiTravelAdvisorModal } from './components/AiTravelAdvisorModal';
import { AdminOrdersModal } from './components/AdminOrdersModal';
import { AdminDashboardView } from './components/AdminDashboardView';
import { AdminAiDiagnosticModal } from './components/AdminAiDiagnosticModal';
import { InteractivePhoneDialerModal } from './components/InteractivePhoneDialerModal';
import { ButterflyLogo } from './components/ButterflyLogo';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { getNotificationDeepLinkParams } from './utils/flutterBridge';
import { realtimeSync } from './utils/realtimeSync';

export default function App() {
  // 1. Initial user state with local persistence (Guest mode by default if none)
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('wappa_user_session');
      if (saved) {
        const parsed = JSON.parse(saved);
        const emailLower = (parsed.email || '').toLowerCase().trim();
        const isAdminUser =
          parsed.role === 'admin' ||
          parsed.isAdmin === true ||
          emailLower === 'mgbravomalo@gmail.com' ||
          emailLower.includes('admin') ||
          emailLower === 'admin@wappa.io';
        return {
          ...parsed,
          role: isAdminUser ? 'admin' : (parsed.role || 'user'),
          isAdmin: isAdminUser,
        };
      }
      return null;
    } catch {
      return null;
    }
  });
  const [activeTab, setActiveTab] = useState<MainTab>('store');

  // User's loaded eSIMs list with instant cache recovery
  const [userEsims, setUserEsims] = useState<UserEsim[]>(() => {
    try {
      const savedUser = localStorage.getItem('wappa_user_session');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        const userKey = (parsed.email || parsed.id || '').toLowerCase();
        const cached = localStorage.getItem(`wappa_user_esims_${userKey}`);
        if (cached) {
          const parsedCached = JSON.parse(cached);
          if (Array.isArray(parsedCached)) {
            return parsedCached;
          }
        }
      }
    } catch {}
    return [];
  });
  const [isLoadingUserEsims, setIsLoadingUserEsims] = useState(false);

  // Modals state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authRedirectReason, setAuthRedirectReason] = useState<string>(
    'Para acceder a "Mis eSIMs" y gestionar tus perfiles QR de conexión'
  );
  const [selectedPlanForPurchase, setSelectedPlanForPurchase] = useState<EsimPlan | null>(null);
  const [returnToCheckoutPlan, setReturnToCheckoutPlan] = useState<EsimPlan | null>(null);
  const [isCompatibilityModalOpen, setIsCompatibilityModalOpen] = useState(false);
  const [isPhoneDialerOpen, setIsPhoneDialerOpen] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [isAdvisorModalOpen, setIsAdvisorModalOpen] = useState(false);
  const [isAdminOrdersModalOpen, setIsAdminOrdersModalOpen] = useState(false);
  const [isAdminDiagnosticOpen, setIsAdminDiagnosticOpen] = useState(false);
  const [pendingOrdersCount, setPendingOrdersCount] = useState<number>(0);
  const [catalogModalCloseKey, setCatalogModalCloseKey] = useState(0);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Elegant Splash Screen animation states (Butterfly & curtain reveal)
  const [showSplash, setShowSplash] = useState(true);
  const [fadeSplash, setFadeSplash] = useState(false);
  const [isFlyingAway, setIsFlyingAway] = useState(false);

  useEffect(() => {
    // Stage 1: Butterfly flies in the center
    const timer1 = setTimeout(() => {
      // Stage 2: Butterfly flies away up
      setIsFlyingAway(true);
    }, 1800);

    // Stage 3: Curtain raises
    const timer2 = setTimeout(() => {
      setFadeSplash(true);
    }, 2200);

    // Stage 4: Splash component completely removed from DOM
    const timer3 = setTimeout(() => {
      setShowSplash(false);
    }, 3100);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  const isAdmin = Boolean(
    user?.role === 'admin' ||
    user?.isAdmin === true ||
    user?.email?.toLowerCase().trim() === 'mgbravomalo@gmail.com' ||
    user?.email?.toLowerCase().includes('admin') ||
    user?.email?.toLowerCase().trim() === 'admin@wappa.io'
  );

  const fetchPendingOrdersCount = async () => {
    if (!user || !user.isAdmin || !user.token) {
      setPendingOrdersCount(0);
      return;
    }
    try {
      const res = await fetch('/api/admin/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.success && typeof data.pendingOrdersCount === 'number') {
          setPendingOrdersCount(data.pendingOrdersCount);
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchPendingOrdersCount();
    // Fallback ligero cada 60s (los eventos realtime ya notifican instantáneamente)
    const interval = setInterval(fetchPendingOrdersCount, 60000);
    return () => clearInterval(interval);
  }, [user]);

  // ⚡ Real-Time Push Events Listener (SSE + BroadcastChannel)
  useEffect(() => {
    if (user?.email) {
      realtimeSync.connect(user.email);
    } else {
      realtimeSync.disconnect();
    }

    const unsubscribeApproval = realtimeSync.onOrderApproved((approvedOrder, newEsim) => {
      const userEmailLower = (user?.email || '').toLowerCase().trim();
      const orderEmailLower = (approvedOrder.userEmail || '').toLowerCase().trim();
      const isRecipient =
        (user?.id && user.id === approvedOrder.userId) ||
        (userEmailLower && orderEmailLower === userEmailLower) ||
        user?.isAdmin;

      if (isRecipient) {
        setUserEsims((prev) => {
          const alreadyExists = prev.some((e) => e.id === newEsim.id || e.iccid === newEsim.iccid);
          if (alreadyExists) return prev;
          const updated = [newEsim, ...prev];
          try {
            localStorage.setItem(`wappa_user_esims_${userEmailLower || user?.id}`, JSON.stringify(updated));
          } catch {}
          return updated;
        });

        if (user) {
          fetchUserEsims(user, true);
        }

        showToast(`🎉 ¡Tu pedido #${approvedOrder.orderNumber} ha sido aprobado! Tu eSIM ya está disponible.`);
        window.dispatchEvent(new CustomEvent('app:order_approved_refresh'));
      }

      fetchPendingOrdersCount();
    });

    const unsubscribeCreated = realtimeSync.onOrderCreated(() => {
      fetchPendingOrdersCount();
    });

    const unsubscribeDeleted = realtimeSync.onOrderDeleted((data?: any) => {
      const deletedId = typeof data === 'string' ? data : data?.orderId || data?.id;
      const deletedOrderNumber = typeof data === 'object' ? data?.orderNumber : undefined;
      const deletedIccid = typeof data === 'object' ? data?.iccid : undefined;
      const deletedEsimId = typeof data === 'object' ? data?.esimId : undefined;

      setUserEsims(prev => {
        const filtered = prev.filter(e => {
          if (deletedIccid && e.iccid === deletedIccid) return false;
          if (deletedEsimId && e.id === deletedEsimId) return false;
          if (deletedId && (e.id === deletedId || (e as any).orderId === deletedId)) return false;
          if (deletedOrderNumber && ((e as any).orderNumber === deletedOrderNumber || (e as any).orderNo === deletedOrderNumber)) return false;
          return true;
        });
        const userKey = (user?.email || user?.id || '').toLowerCase();
        if (userKey) {
          try {
            localStorage.setItem(`wappa_user_esims_${userKey}`, JSON.stringify(filtered));
          } catch {}
        }
        return filtered;
      });

      if (user) {
        fetchUserEsims(user, true);
      }
      fetchPendingOrdersCount();
      window.dispatchEvent(new CustomEvent('app:order_approved_refresh'));
    });

    return () => {
      unsubscribeApproval();
      unsubscribeCreated();
      unsubscribeDeleted();
      realtimeSync.disconnect();
    };
  }, [user?.id, user?.email]);

  // 🔄 Smart Silent Auto-Sync: Guarantees updates appear seamlessly without manual refresh
  useEffect(() => {
    if (!user) return;

    const silentSyncCheck = async () => {
      try {
        const queryEmail = user.email ? `?email=${encodeURIComponent(user.email)}` : '';
        const res = await fetch(`/api/user/${encodeURIComponent(user.id)}/esims${queryEmail}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.esims)) {
            setUserEsims((prev) => {
              const hasDifferences =
                data.esims.length !== prev.length ||
                data.esims.some((e: any) => !prev.some((p) => p.id === e.id || p.iccid === e.iccid));

              if (hasDifferences) {
                const brandNew = data.esims.find((e: any) => !prev.some((p) => p.id === e.id || p.iccid === e.iccid));
                if (brandNew && prev.length > 0) {
                  showToast(`🎉 ¡eSIM para ${brandNew.country} activada y lista para instalar!`);
                  window.dispatchEvent(new CustomEvent('app:order_approved_refresh'));
                }
                const userKey = (user.email || user.id || '').toLowerCase();
                try {
                  localStorage.setItem(`wappa_user_esims_${userKey}`, JSON.stringify(data.esims));
                } catch {}
                return data.esims;
              }
              return prev;
            });
          }
        }
      } catch {}
    };

    // Sincronizar automáticamente solo cuando el usuario regresa a la pestaña (focus)
    const handleFocusSync = () => {
      if (document.visibilityState === 'visible') {
        silentSyncCheck();
        fetchPendingOrdersCount();
      }
    };

    window.addEventListener('focus', handleFocusSync);
    document.addEventListener('visibilitychange', handleFocusSync);
    window.addEventListener('app:order_approved_refresh', silentSyncCheck);

    return () => {
      window.removeEventListener('focus', handleFocusSync);
      document.removeEventListener('visibilitychange', handleFocusSync);
      window.removeEventListener('app:order_approved_refresh', silentSyncCheck);
    };
  }, [user?.id, user?.email]);

  useEffect(() => {
    let offlineTimer: any = null;

    const handleOnline = () => {
      if (offlineTimer) clearTimeout(offlineTimer);
      setIsOffline(false);
    };

    const handleOffline = () => {
      // Esperar 3.5 segundos continuos sin conexión para evitar falsos positivos por microcortes
      if (offlineTimer) clearTimeout(offlineTimer);
      offlineTimer = setTimeout(() => {
        setIsOffline(true);
      }, 3500);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      if (offlineTimer) clearTimeout(offlineTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Handle Flutter Push Notification Deep Linking (e.g. ?route=/my-esims or ?tab=myesims&iccid=8910...)
  useEffect(() => {
    const deepLink = getNotificationDeepLinkParams();
    if (deepLink) {
      if (deepLink.route?.includes('my-esims') || deepLink.route?.includes('myesims') || deepLink.iccid) {
        setActiveTab('myesims');
      }
    }

    const handleNavigateTab = (e: any) => {
      const tab = e?.detail?.tab;
      if (tab === 'myesims' || tab === 'store' || tab === 'admin') {
        setActiveTab(tab);
      }
    };

    window.addEventListener('wappa_navigate_tab', handleNavigateTab);
    window.addEventListener('flutter_deep_link', handleNavigateTab);

    return () => {
      window.removeEventListener('wappa_navigate_tab', handleNavigateTab);
      window.removeEventListener('flutter_deep_link', handleNavigateTab);
    };
  }, []);

  // Cerrar cualquier modal abierto y enfocar de inmediato el campo de búsqueda
  const handleCloseAllModalsAndSearch = () => {
    // 1. Cerrar todos los modales principales
    setIsAuthModalOpen(false);
    setSelectedPlanForPurchase(null);
    setIsCompatibilityModalOpen(false);
    setIsGuideModalOpen(false);
    setIsAdvisorModalOpen(false);

    // 2. Cerrar el modal de destino del catálogo y notificar por evento global
    setCatalogModalCloseKey(prev => prev + 1);
    window.dispatchEvent(new CustomEvent('app:close-all-modals'));

    // 3. Asegurarse de estar en la pestaña de tienda/catálogo
    if (activeTab !== 'store') {
      setActiveTab('store');
    }

    // 4. Enfocar el input de búsqueda y correr lentamente la pantalla lo más arriba posible
    const tryFocusSearch = (attemptsLeft = 6) => {
      const searchInput = document.getElementById('catalog-search-input') as HTMLInputElement | null;
      if (searchInput) {
        scrollSearchToTopSlow(800);
        searchInput.focus();
      } else if (attemptsLeft > 0) {
        setTimeout(() => tryFocusSearch(attemptsLeft - 1), 60);
      } else {
        smoothScrollToSlow(0, 800);
      }
    };

    setTimeout(() => tryFocusSearch(), 80);
  };

  // Success Toast notification
  const [notification, setNotification] = useState<string | null>(null);

  const showToast = (message: string) => {
    setNotification(message);
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Función centralizada para cargar eSIMs del usuario con soporte de caché persistente
  const fetchUserEsims = async (targetUser: User, silent: boolean = false) => {
    if (!targetUser) return;
    if (!silent) setIsLoadingUserEsims(true);
    try {
      const queryEmail = targetUser.email ? `?email=${encodeURIComponent(targetUser.email)}` : '';
      const res = await fetch(`/api/user/${encodeURIComponent(targetUser.id)}/esims${queryEmail}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.esims)) {
        setUserEsims(data.esims);
        const userKey = (targetUser.email || targetUser.id || '').toLowerCase();
        try {
          localStorage.setItem(`wappa_user_esims_${userKey}`, JSON.stringify(data.esims));
        } catch {}
      }
    } catch (err) {
      console.warn('Error al obtener eSIMs del usuario:', err);
    } finally {
      setIsLoadingUserEsims(false);
    }
  };

  // 🔄 Carga automática al iniciar o cuando cambia el usuario (Persistencia de sesión)
  useEffect(() => {
    if (!user) {
      setUserEsims([]);
      return;
    }

    const userKey = (user.email || user.id || '').toLowerCase();

    // 1. Cargar caché inmediatamente si el estado está vacío
    try {
      const cached = localStorage.getItem(`wappa_user_esims_${userKey}`);
      if (cached) {
        const parsedCached = JSON.parse(cached);
        if (Array.isArray(parsedCached) && parsedCached.length > 0) {
          setUserEsims(prev => (prev.length === 0 ? parsedCached : prev));
        }
      }
    } catch {}

    // 2. Traer las eSIMs actualizadas de la base de datos (silencioso si ya tenemos caché)
    fetchUserEsims(user, userEsims.length > 0);

    // 3. Sincronizar usuario con backend Atlas
    fetch('/api/auth/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user }),
    })
      .then(r => r.json())
      .then(syncData => {
        if (syncData.success && syncData.user) {
          const synced = syncData.user;
          const emailLower = (synced.email || user.email || '').toLowerCase().trim();
          const isAdminUser =
            synced.role === 'admin' ||
            synced.isAdmin === true ||
            emailLower === 'mgbravomalo@gmail.com' ||
            emailLower.includes('admin') ||
            emailLower === 'admin@wappa.io';
          const mergedUser: User = {
            ...user,
            ...synced,
            token: synced.token || user.token,
            role: isAdminUser ? 'admin' : (synced.role || 'user'),
            isAdmin: isAdminUser,
          };
          setUser(mergedUser);
          try {
            localStorage.setItem('wappa_user_session', JSON.stringify(mergedUser));
          } catch {}
        }
      })
      .catch(err => console.warn('Background session sync error:', err));
  }, [user?.id, user?.email]);

  // When user logs in
  const handleLogin = async (authenticatedUser: User) => {
    const emailLower = (authenticatedUser.email || '').toLowerCase().trim();
    const isAdminUser =
      authenticatedUser.role === 'admin' ||
      authenticatedUser.isAdmin === true ||
      emailLower === 'mgbravomalo@gmail.com' ||
      emailLower.includes('admin') ||
      emailLower === 'admin@wappa.io';

    const fullUser: User = {
      ...authenticatedUser,
      role: isAdminUser ? 'admin' : (authenticatedUser.role || 'user'),
      isAdmin: isAdminUser,
    };

    setUser(fullUser);
    try {
      localStorage.setItem('wappa_user_session', JSON.stringify(fullUser));
    } catch {}

    const userKey = (fullUser.email || fullUser.id || '').toLowerCase();
    try {
      const cached = localStorage.getItem(`wappa_user_esims_${userKey}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setUserEsims(parsed);
        }
      }
    } catch {}

    // If user was in the middle of purchasing a plan, smoothly restore checkout modal
    if (returnToCheckoutPlan) {
      const pendingPlan = returnToCheckoutPlan;
      setReturnToCheckoutPlan(null);
      setIsAuthModalOpen(false);
      // Small pause for smooth modal transition
      setTimeout(() => {
        setSelectedPlanForPurchase(pendingPlan);
        showToast(`Usuario validado como ${authenticatedUser.name}. Puedes continuar con tu compra.`);
      }, 300);
    } else {
      setActiveTab('myesims');
      showToast(`Sesión iniciada como ${authenticatedUser.name}${isAdminUser ? ' (Administrador)' : ''}. Bienvenido a tu panel de eSIMs.`);
    }

    // Async sync with MongoDB Atlas backend & reload eSIMs
    await fetchUserEsims(fullUser, false);
  };

  // When user logs out -> returns to guest mode
  const handleLogout = () => {
    const userKey = (user?.email || user?.id || '').toLowerCase();
    setUser(null);
    try {
      localStorage.removeItem('wappa_user_session');
      if (userKey) {
        localStorage.removeItem(`wappa_user_esims_${userKey}`);
      }
    } catch {}
    setUserEsims([]);
    setActiveTab('store');
    showToast('Has cerrado sesión. Modo invitado activado.');
  };

  // When guest attempts to go to My eSIMs
  const handleRequestMyEsims = () => {
    if (!user) {
      setAuthRedirectReason('Para acceder a "Mis eSIMs" y ver tus códigos QR de instalación');
      setIsAuthModalOpen(true);
    } else {
      setActiveTab('myesims');
      fetchUserEsims(user, false);
    }
  };

  // Refrescar automáticamente con el proveedor al cambiar a la pestaña Mis eSIMs
  useEffect(() => {
    if (activeTab === 'myesims' && user) {
      fetchUserEsims(user, false);
    }
  }, [activeTab]);

  // Purchase completion
  const handleSuccessPurchase = async (newEsim: UserEsim, identifiedUser: User) => {
    setUser(identifiedUser);
    setUserEsims(prev => {
      const filtered = prev.filter(e => e.id !== newEsim.id && e.iccid !== newEsim.iccid);
      const updated = [newEsim, ...filtered];
      const userKey = (identifiedUser.email || identifiedUser.id || '').toLowerCase();
      try {
        localStorage.setItem(`wappa_user_esims_${userKey}`, JSON.stringify(updated));
      } catch {}
      return updated;
    });
    setActiveTab('myesims');
    showToast(`¡eSIM para ${newEsim.country} generada con éxito! Ya puedes ver tu código QR.`);

    // Persist to MongoDB Atlas
    try {
      await fetch('/api/user/esims/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEsim, user: identifiedUser }),
      });
      // Sincronizar en segundo plano
      fetchUserEsims(identifiedUser, true);
    } catch (err) {
      console.warn('Could not persist purchase to MongoDB:', err);
    }
  };

  // Top Up eSIM
  const handleTopUpEsim = async (esimId: string, addedGB: number, price: number, packageCode?: string) => {
    const actualPackageCode = packageCode || `TOPUP_SPAIN_${addedGB}GB`;

    // Optimistically update local state
    setUserEsims(prev => {
      const updated = prev.map(item => {
        if (item.id === esimId) {
          return {
            ...item,
            totalDataGB: item.totalDataGB + addedGB,
            topupCount: (item.topupCount || 0) + 1,
            status: item.status === 'depleted' || item.status === 'expired' ? 'active' : item.status
          };
        }
        return item;
      });
      if (user) {
        const userKey = (user.email || user.id || '').toLowerCase();
        try {
          localStorage.setItem(`wappa_user_esims_${userKey}`, JSON.stringify(updated));
        } catch {}
      }
      return updated;
    });

    showToast(`Se han añadido +${addedGB} GB a tu eSIM con éxito.`);

    // Persist to MongoDB Atlas
    try {
      const res = await fetch('/api/user/esims/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ esimId, packageCode: actualPackageCode }),
      });
      const data = await res.json();
      if (data.success && data.esim) {
        // Sync with real DB state
        setUserEsims(prev => prev.map(item => item.id === esimId ? { ...item, ...data.esim } : item));
      } else if (data.success === false) {
        showToast(`Error al procesar recarga: ${data.error}`);
      }
    } catch (err) {
      console.warn('Could not persist topup to MongoDB:', err);
    }
  };

  return (
    <div className="min-h-dvh-screen bg-slate-100/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      
      {/* Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          if (tab === 'myesims' && !user) {
            handleRequestMyEsims();
          } else {
            setActiveTab(tab);
          }
        }}
        user={user}
        esimsCount={userEsims.length}
        onOpenAuthModal={() => {
          setAuthRedirectReason('Identifícate para sincronizar tus eSIMs y saldo');
          setIsAuthModalOpen(true);
        }}
        onLogout={handleLogout}
        onOpenCompatibilityModal={() => setIsCompatibilityModalOpen(true)}
        onOpenGuideModal={() => setIsGuideModalOpen(true)}
        onOpenAdvisorModal={() => setIsAdvisorModalOpen(true)}
        onOpenAdminOrdersModal={() => setIsAdminOrdersModalOpen(true)}
        pendingOrdersCount={pendingOrdersCount}
      />

      {/* Guest Notice Bar (if unauthenticated) */}
      {!user && (
        <div className="hidden sm:block bg-slate-900 dark:bg-slate-900/90 text-slate-200 text-xs px-4 py-2 border-b border-slate-800">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                <strong>Modo Exploración:</strong> Navegando como invitado. Tus compras y códigos QR se guardarán al identificarte.
              </span>
            </div>
            <button
              onClick={() => {
                setAuthRedirectReason('Para acceder a "Mis eSIMs" y activar perfiles');
                setIsAuthModalOpen(true);
              }}
              className="text-emerald-400 hover:text-emerald-300 font-bold underline transition-colors"
            >
              ¿Ya tienes eSIMs? Identifícate aquí →
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-2 sm:pt-6 pb-6">
        <div className={activeTab === 'store' ? 'block' : 'hidden'}>
          <DestinationsCatalog
            onSelectPlanForPurchase={(plan) => setSelectedPlanForPurchase(plan)}
            onOpenAdvisor={() => setIsAdvisorModalOpen(true)}
            catalogCloseTrigger={catalogModalCloseKey}
          />
        </div>

        {activeTab === 'myesims' && user && (
          <MyEsimsView
            user={user}
            esims={userEsims}
            isLoading={isLoadingUserEsims}
            onRefresh={() => {
              if (user) fetchUserEsims(user, true);
              fetchPendingOrdersCount();
            }}
            onNavigateToStore={() => setActiveTab('store')}
            onTopUpEsim={handleTopUpEsim}
            onOpenAdminOrdersModal={() => setIsAdminOrdersModalOpen(true)}
            pendingOrdersCount={pendingOrdersCount}
          />
        )}

        {activeTab === 'admin' && user && (
          <AdminDashboardView
            currentUser={user}
            onRefreshGlobal={() => {
              if (user) fetchUserEsims(user, true);
              fetchPendingOrdersCount();
            }}
            pendingOrdersCount={pendingOrdersCount}
            onOpenAiDiagnosticModal={() => setIsAdminDiagnosticOpen(true)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-6 text-xs text-slate-500 dark:text-slate-400 mt-12 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ButterflyLogo size="sm" />
            <span className="font-semibold text-slate-700 dark:text-slate-200">eSIM Global Hub</span>
            <span className="dark:text-slate-400">• Conectividad internacional 5G / 4G sin roaming</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <button onClick={() => setIsCompatibilityModalOpen(true)} className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Teléfonos Compatibles
            </button>
            <button onClick={() => setIsGuideModalOpen(true)} className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Instrucciones de Instalación
            </button>
            <button onClick={() => setIsAdvisorModalOpen(true)} className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Asistente IA
            </button>
          </div>
        </div>
      </footer>

      {/* Smart Floating Action Button (Only in Mobile Mode) */}
      <SmartMobileFab
        activeTab={activeTab}
        setActiveTab={(tab) => {
          if (tab === 'myesims' && !user) {
            handleRequestMyEsims();
          } else {
            setActiveTab(tab);
          }
        }}
        user={user}
        esimsCount={userEsims.length}
        onOpenAuthModal={() => {
          setAuthRedirectReason('Identifícate para sincronizar tus eSIMs y saldo');
          setIsAuthModalOpen(true);
        }}
        onOpenCompatibilityModal={() => setIsCompatibilityModalOpen(true)}
        onOpenGuideModal={() => setIsGuideModalOpen(true)}
        onOpenAdvisorModal={() => setIsAdvisorModalOpen(true)}
        onScrollToSearch={handleCloseAllModalsAndSearch}
      />

      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-22 md:bottom-5 right-5 z-50 bg-slate-900 dark:bg-slate-800 text-white px-4 py-3 rounded-2xl shadow-xl border border-slate-800 dark:border-slate-700 flex items-center gap-2.5 text-xs animate-fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Global Connection Offline / Reconnecting Spinner Indicator */}
      {isOffline && (
        <div className="fixed bottom-22 md:bottom-5 left-5 z-50 bg-amber-500 text-white px-4 py-3 rounded-2xl shadow-xl border border-amber-400 flex items-center gap-3 text-xs animate-bounce">
          <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0"></div>
          <span className="font-bold">Esperando conexión de red...</span>
        </div>
      )}

      {/* Modals - Loaded statically to prevent dynamic chunk loading failures */}
      {isAuthModalOpen && (
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => {
            setIsAuthModalOpen(false);
            // If user was in the middle of purchasing a plan and canceled auth, restore checkout modal smoothly
            if (returnToCheckoutPlan) {
              const prevPlan = returnToCheckoutPlan;
              setReturnToCheckoutPlan(null);
              setTimeout(() => {
                setSelectedPlanForPurchase(prevPlan);
              }, 200);
            }
          }}
          onLogin={handleLogin}
          redirectReason={authRedirectReason}
        />
      )}

      {Boolean(selectedPlanForPurchase) && (
        <CheckoutModal
          plan={selectedPlanForPurchase}
          user={user}
          isOpen={Boolean(selectedPlanForPurchase)}
          onClose={() => {
            setSelectedPlanForPurchase(null);
            setReturnToCheckoutPlan(null);
          }}
          onSuccessPurchase={handleSuccessPurchase}
          onOrderCreatedPendingApproval={(order) => {
            fetchPendingOrdersCount();
            showToast(`¡Pedido ${order.orderNumber} registrado! En espera de aprobación manual por el administrador.`);
            setActiveTab('myesims');
          }}
          onRequireAuth={() => {
            setReturnToCheckoutPlan(selectedPlanForPurchase);
            setSelectedPlanForPurchase(null);
            setAuthRedirectReason('Para completar el pago y asociar tu eSIM a tu cuenta');
            setIsAuthModalOpen(true);
          }}
          onSelectSimilarPlan={(newPlan) => {
            setSelectedPlanForPurchase(newPlan);
          }}
        />
      )}

      {isAdminOrdersModalOpen && (
        <AdminOrdersModal
          isOpen={isAdminOrdersModalOpen}
          onClose={() => {
            setIsAdminOrdersModalOpen(false);
            fetchPendingOrdersCount();
          }}
          currentUser={user}
          onOrderApproved={(approvedOrder, newEsim) => {
            // If the approved order belongs to the currently active user, add it to their eSIMs list!
            if (user && approvedOrder.userEmail?.toLowerCase() === user.email?.toLowerCase()) {
              setUserEsims(prev => {
                const filtered = prev.filter(e => e.id !== newEsim.id && e.iccid !== newEsim.iccid);
                const updated = [newEsim, ...filtered];
                const userKey = (user.email || user.id || '').toLowerCase();
                try {
                  localStorage.setItem(`wappa_user_esims_${userKey}`, JSON.stringify(updated));
                } catch {}
                return updated;
              });
            }
            showToast(`¡Pedido ${approvedOrder.orderNumber} aprobado y eSIM emitida con éxito!`);
            fetchPendingOrdersCount();
          }}
          onViewQrModal={() => {
            setIsAdminOrdersModalOpen(false);
            setActiveTab('myesims');
          }}
        />
      )}

      {isCompatibilityModalOpen && (
        <DeviceCompatibilityModal
          isOpen={isCompatibilityModalOpen}
          onClose={() => setIsCompatibilityModalOpen(false)}
          currentUser={user}
          onOpenPhoneDialer={() => setIsPhoneDialerOpen(true)}
        />
      )}

      {isPhoneDialerOpen && (
        <InteractivePhoneDialerModal
          isOpen={isPhoneDialerOpen}
          onClose={() => setIsPhoneDialerOpen(false)}
          initialDial="*#06#"
        />
      )}

      {isGuideModalOpen && (
        <InstallationGuideModal
          isOpen={isGuideModalOpen}
          onClose={() => setIsGuideModalOpen(false)}
        />
      )}

      {isAdvisorModalOpen && (
        <AiTravelAdvisorModal
          isOpen={isAdvisorModalOpen}
          onClose={() => setIsAdvisorModalOpen(false)}
          onSelectPlan={(plan) => setSelectedPlanForPurchase(plan)}
        />
      )}

      {/* Floating Action Button for Admin: Copiloto IA de Diagnóstico */}
      {isAdmin && (
        <button
          onClick={() => setIsAdminDiagnosticOpen(true)}
          className="fixed bottom-5 left-4 z-40 px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white font-bold text-xs shadow-xl border border-slate-700/80 hover:border-emerald-500/60 hover:from-slate-850 hover:to-slate-750 transition-all flex items-center gap-2 group active:scale-95 cursor-pointer"
          title="Abrir Copiloto IA de Diagnóstico (MongoDB Atlas & eSIMAccess)"
        >
          <div className="relative flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping absolute opacity-75" />
            <span className="w-2 h-2 rounded-full bg-emerald-400 relative" />
          </div>
          <Sparkles className="w-3.5 h-3.5 text-emerald-400 group-hover:rotate-12 transition-transform" />
          <span className="hidden sm:inline text-slate-200 group-hover:text-white">Copiloto IA Diagnóstico</span>
          <span className="sm:hidden text-slate-200">Copiloto IA</span>
        </button>
      )}

      {/* Floating Modal: Copiloto IA de Diagnóstico */}
      {isAdminDiagnosticOpen && (
        <AdminAiDiagnosticModal
          isOpen={isAdminDiagnosticOpen}
          onClose={() => setIsAdminDiagnosticOpen(false)}
          currentUser={user}
        />
      )}

      {/* Intro Curtain Splash with Flying Butterfly */}
      {showSplash && (
        <div 
          className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-950 transition-all duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
            fadeSplash ? '-translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
          }`}
          style={{
            backgroundImage: 'radial-gradient(circle at center, #020617 0%, #090d16 100%)'
          }}
        >
          {/* Subtle starry back grid */}
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]" />
          
          <style>{`
            @keyframes flap-left {
              0%, 100% { transform: rotateY(0deg); }
              50% { transform: rotateY(72deg); }
            }
            @keyframes flap-right {
              0%, 100% { transform: rotateY(0deg); }
              50% { transform: rotateY(-72deg); }
            }
            @keyframes fly-in-and-hover {
              0% { transform: translate(-50%, -50%) translate(-120px, 120px) scale(0.6); opacity: 0; }
              40% { transform: translate(-50%, -50%) translate(20px, -40px) scale(1.1); opacity: 1; }
              70% { transform: translate(-50%, -50%) translate(-10px, -15px) scale(1.25); }
              100% { transform: translate(-50%, -50%) translate(0, 0) scale(1.3); }
            }
            @keyframes hover-float {
              0%, 100% { transform: translate(0, 0) rotate(0deg); }
              50% { transform: translate(-5px, -12px) rotate(4deg); }
            }
            .butterfly-container {
              perspective: 1200px;
              transform-style: preserve-3d;
              position: absolute;
              left: 50%;
              top: 45%;
            }
            .butterfly-mover {
              animation: fly-in-and-hover 1.8s cubic-bezier(0.25, 1, 0.5, 1) forwards;
            }
            .butterfly-hover {
              animation: hover-float 2s ease-in-out infinite alternate;
              animation-delay: 1.8s;
            }
            .wing-left {
              transform-origin: right center;
              animation: flap-left 0.22s infinite ease-in-out;
            }
            .wing-right {
              transform-origin: left center;
              animation: flap-right 0.22s infinite ease-in-out;
            }
            .fly-up-away {
              transition: all 500ms cubic-bezier(0.25, 1, 0.5, 1);
              transform: translate(-50%, -50%) translateY(-350px) scale(0.4) !important;
              opacity: 0;
            }
          `}</style>

          {/* Butterfly representation with high fidelity glowing wings */}
          <div className={`butterfly-container ${isFlyingAway ? 'fly-up-away' : 'butterfly-mover'}`}>
            <div className="butterfly-hover relative w-16 h-16 flex items-center justify-center">
              
              {/* Left wing SVG */}
              <svg className="wing-left w-9 h-12 absolute right-[32px] drop-shadow-[0_0_12px_rgba(34,211,238,0.7)]" viewBox="0 0 100 130">
                <path 
                  fill="url(#blue-wing-grad)" 
                  d="M 100 65 C 100 65, 80 5, 20 5 C -10 5, 5 65, 50 65 C 5 65, -15 125, 25 125 C 75 125, 100 65, 100 65 Z" 
                />
                <path 
                  fill="none" 
                  stroke="#ffffff" 
                  strokeWidth="2.5" 
                  opacity="0.6"
                  d="M 100 65 Q 60 40 25 15 M 100 65 Q 50 65 15 65 M 100 65 Q 60 90 30 115" 
                />
              </svg>

              {/* Right wing SVG */}
              <svg className="wing-right w-9 h-12 absolute left-[32px] drop-shadow-[0_0_12px_rgba(59,130,246,0.7)]" viewBox="0 0 100 130">
                <path 
                  fill="url(#indigo-wing-grad)" 
                  d="M 0 65 C 0 65, 20 5, 80 5 C 110 5, 95 65, 50 65 C 95 65, 115 125, 75 125 C 25 125, 0 65, 0 65 Z" 
                />
                <path 
                  fill="none" 
                  stroke="#ffffff" 
                  strokeWidth="2.5" 
                  opacity="0.6"
                  d="M 0 65 Q 40 40 75 15 M 0 65 Q 50 65 85 65 M 0 65 Q 40 90 70 115" 
                />
              </svg>

              {/* Butterfly Body */}
              <div className="w-1.5 h-10 bg-slate-100 rounded-full z-10 relative shadow-sm border border-slate-300/40">
                {/* Antennas */}
                <div className="absolute -top-2 -left-1 w-2.5 h-3.5 border-t border-r border-slate-300/80 rounded-tr-md transform -rotate-12"></div>
                <div className="absolute -top-2 -right-1 w-2.5 h-3.5 border-t border-l border-slate-300/80 rounded-tl-md transform rotate-12"></div>
              </div>

              {/* Gradients */}
              <svg className="absolute w-0 h-0">
                <defs>
                  <linearGradient id="blue-wing-grad" x1="1" y1="0.5" x2="0" y2="0.5">
                    <stop offset="0%" stopColor="#22d3ee" />
                    <stop offset="60%" stopColor="#06b6d4" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                  <linearGradient id="indigo-wing-grad" x1="0" y1="0.5" x2="1" y2="0.5">
                    <stop offset="0%" stopColor="#22d3ee" />
                    <stop offset="60%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                </defs>
              </svg>

            </div>
          </div>

          {/* Subtitle / Brand label */}
          <div className={`absolute bottom-16 text-center transition-all duration-[700ms] ease-out delay-[200ms] ${
            isFlyingAway ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
          }`}>
            <h1 className="text-xl font-extrabold text-white tracking-wider flex items-center justify-center gap-1.5 leading-none">
              <span>eSIM</span>
              <span className="text-cyan-400">Global</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-mono tracking-[0.2em] mt-2 uppercase">Travel Data Hub</p>
          </div>

        </div>
      )}

      {/* PWA Floating Install Button and Offline Connectivity Toast */}
      <PWAInstallButton variant="floating" />
      <OfflineIndicator />

    </div>
  );
}
