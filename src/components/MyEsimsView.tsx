import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  QrCode,
  Zap,
  Check,
  Copy,
  Info,
  Clock,
  Radio,
  Plus,
  Wifi,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  ExternalLink,
  ShieldAlert,
  Signal,
  Gauge,
  RotateCcw,
  Globe,
  Sparkles,
  Calendar,
  RefreshCw,
  Bell,
  BellRing,
  BellOff,
  AlertTriangle,
  Pencil,
  X,
  Save
} from 'lucide-react';
import { User, UserEsim } from '../types';
import { CountryFlag } from './CountryFlag';
import { QrCodeModal } from './QrCodeModal';
import { TopUpModal } from './TopUpModal';
import { FlutterPushAdminModal } from './FlutterPushAdminModal';
import { MyEsimsSkeletonGrid } from './MyEsimsSkeleton';
import {
  isWebPushSupported,
  getWebPushPermission,
  requestWebPushPermission,
  showLocalWebNotification
} from '../utils/webPushManager';
import {
  showFlutterOnScreenAlert,
  playNotificationSound,
  triggerNativeHaptic
} from '../utils/flutterBridge';

interface MyEsimsViewProps {
  user: User;
  esims: UserEsim[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onNavigateToStore: () => void;
  onTopUpEsim: (esimId: string, addedGB: number, price: number, packageCode?: string) => void;
  onOpenAdminOrdersModal?: () => void;
  pendingOrdersCount?: number;
}

export const MyEsimsView: React.FC<MyEsimsViewProps> = ({
  user,
  esims,
  isLoading = false,
  onRefresh,
  onNavigateToStore,
  onTopUpEsim,
  onOpenAdminOrdersModal,
  pendingOrdersCount = 0
}) => {
  const [filterStatus, setFilterStatus] = useState<'active' | 'ready_to_install' | 'all' | 'expired'>(() => {
    if (esims.some(e => e.status === 'active')) return 'active';
    if (esims.some(e => e.status === 'ready_to_install')) return 'ready_to_install';
    return 'all';
  });
  const [selectedEsimForQr, setSelectedEsimForQr] = useState<UserEsim | null>(null);
  const [selectedEsimForTopUp, setSelectedEsimForTopUp] = useState<UserEsim | null>(null);
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(null);
  const [copiedIccid, setCopiedIccid] = useState<string | null>(null);
  const [webPushStatus, setWebPushStatus] = useState<NotificationPermission>(() => {
    return (typeof window !== 'undefined' && 'Notification' in window) ? Notification.permission : 'denied';
  });
  const [isRequestingWebPush, setIsRequestingWebPush] = useState(false);
  const [webPushFeedback, setWebPushFeedback] = useState<string | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<Record<string, boolean>>({});
  const [isFlutterAdminModalOpen, setIsFlutterAdminModalOpen] = useState(false);
  const [userPendingOrders, setUserPendingOrders] = useState<any[]>([]);
  const [onScreenTestAlert, setOnScreenTestAlert] = useState<{
    country: string;
    usedGB: number;
    totalGB: number;
    percent: number;
    iccid?: string;
  } | null>(null);

  const [isNotificationStatusModalOpen, setIsNotificationStatusModalOpen] = useState(false);
  const [notificationDismissedOrMuted, setNotificationDismissedOrMuted] = useState(false);

  useEffect(() => {
    if (onScreenTestAlert) {
      const timer = setTimeout(() => {
        setOnScreenTestAlert(null);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [onScreenTestAlert]);

  const [editingHardwareIccid, setEditingHardwareIccid] = useState<string | null>(null);
  const [editEid, setEditEid] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editModel, setEditModel] = useState('');
  const [isSavingHardware, setIsSavingHardware] = useState(false);
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [hardwareSuccess, setHardwareSuccess] = useState<string | null>(null);

  const startEditHardware = (esim: UserEsim) => {
    setEditingHardwareIccid(esim.iccid);
    setEditEid(esim.eid || '');
    setEditBrand(esim.deviceBrand || '');
    setEditModel(esim.deviceModel || '');
    setHardwareError(null);
    setHardwareSuccess(null);
  };

  const handleSaveHardware = async (iccid: string) => {
    setIsSavingHardware(true);
    setHardwareError(null);
    setHardwareSuccess(null);
    try {
      const response = await fetch('/api/user/esims/hardware', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token || ''}`
        },
        body: JSON.stringify({
          iccid,
          eid: editEid,
          deviceBrand: editBrand,
          deviceModel: editModel
        })
      });

      const data = await response.json();
      if (data.success) {
        setHardwareSuccess('✅ Guardado con éxito');
        setTimeout(() => {
          setEditingHardwareIccid(null);
          onRefresh?.();
        }, 1200);
      } else {
        setHardwareError(data.error || 'Error al guardar los datos');
      }
    } catch (err: any) {
      setHardwareError(err.message || 'Error de conexión');
    } finally {
      setIsSavingHardware(false);
    }
  };

  const fetchPendingOrders = () => {
    if (!user?.email) return;
    fetch(`/api/orders?email=${encodeURIComponent(user.email)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.orders)) {
          const currentPending = data.orders.filter((o: any) => o.status === 'pending_approval');
          setUserPendingOrders(currentPending);

          // Auto-trigger onRefresh if an approved order exists whose eSIM isn't yet rendered in esims list
          const hasUnseenApproved = data.orders.some((o: any) => 
            o.status === 'approved' && 
            o.generatedEsim?.iccid && 
            !esims.some(e => e.iccid === o.generatedEsim.iccid)
          );

          if (hasUnseenApproved) {
            onRefresh?.();
          }
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchPendingOrders();

    // Solo consultar periódicamente si hay órdenes pendientes activas esperando aprobación
    let interval: any = null;
    if (userPendingOrders.length > 0) {
      interval = setInterval(() => {
        fetchPendingOrders();
      }, 5000);
    }

    const handleRefresh = () => {
      fetchPendingOrders();
      onRefresh?.();
    };

    window.addEventListener('app:order_approved_refresh', handleRefresh);
    window.addEventListener('app:order_approved', handleRefresh);
    window.addEventListener('app:order_deleted', handleRefresh);
    window.addEventListener('focus', handleRefresh);

    return () => {
      if (interval) clearInterval(interval);
      window.removeEventListener('app:order_approved_refresh', handleRefresh);
      window.removeEventListener('app:order_approved', handleRefresh);
      window.removeEventListener('app:order_deleted', handleRefresh);
      window.removeEventListener('focus', handleRefresh);
    };
  }, [user?.email, esims.length, pendingOrdersCount, userPendingOrders.length]);

  const handleEnableWebPush = async () => {
    setIsRequestingWebPush(true);
    setWebPushFeedback(null);
    try {
      const res = await requestWebPushPermission(user.email);
      setWebPushStatus(res.permission);

      if (res.permission === 'granted') {
        setWebPushFeedback('✅ ¡Avisos Web activados con éxito! Te notificaremos en este navegador al alcanzar el 80%.');
        showLocalWebNotification('🔔 Wappa eSIM: Notificaciones Web Activas', {
          body: 'Te avisaremos en este navegador cuando tu eSIM alcance el 80% de consumo o esté por vencer.',
        });
      } else if (res.permission === 'denied') {
        setWebPushFeedback('🔒 El navegador tiene bloqueadas las notificaciones. Haz clic en el icono de candado 🔒 en la barra de direcciones de tu navegador para permitir notificaciones.');
      } else {
        setWebPushFeedback('✅ Navegador vinculado a tu cuenta. Para permitir avisos nativos emergentes, autoriza la ventana del navegador.');
      }
    } catch (e: any) {
      setWebPushFeedback('⚠️ Error: ' + e.message);
    } finally {
      setIsRequestingWebPush(false);
    }
  };

  const handleSendTestWebNotification = () => {
    // 1. Play premium audio chime
    playNotificationSound();

    // 2. Trigger native haptic feedback
    triggerNativeHaptic('medium');

    // 3. Define alert payload using first eSIM or realistic active fallback
    const targetEsim = esims.find(e => e.status === 'active') || esims[0] || {
      country: 'España',
      planName: 'Europa Plus',
      totalDataGB: 2.0,
      usedDataGB: 1.6,
      iccid: '8910300000063658185',
    };
    const totalGB = Math.max(0.1, targetEsim.totalDataGB || 2.0);
    const usedGB = Math.max(0, targetEsim.usedDataGB ?? 1.6);
    const percent = Math.round((usedGB / totalGB) * 100);

    const alertTitle = `🔔 Alerta de Consumo: ${percent}% en ${targetEsim.country}`;
    const alertBody = `Has consumido ${usedGB.toFixed(2)} GB de tus ${totalGB.toFixed(2)} GB. Te recomendamos recargar ahora para no interrumpir tu conexión.`;

    // 4. Activate in-app On-Screen Floating Alert Banner immediately
    setOnScreenTestAlert({
      country: targetEsim.country,
      usedGB,
      totalGB,
      percent,
      iccid: targetEsim.iccid,
    });

    // 5. Send to native Flutter shell via Bridge (shows native green SnackBar with action button)
    showFlutterOnScreenAlert(alertTitle, alertBody, {
      country: targetEsim.country,
      percent,
      iccid: targetEsim.iccid,
    });

    // 6. Attempt desktop browser notification (if granted)
    showLocalWebNotification(alertTitle, {
      body: alertBody,
      icon: '/favicon.ico',
    });

    // 7. Fire background push notification to mobile phone via FCM API
    try {
      fetch('/api/notifications/flutter-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email || 'mgbravomalo@gmail.com',
          testType: '80_percent',
          country: targetEsim.country,
          iccid: targetEsim.iccid,
          sendEmailCopy: false,
        }),
      }).catch(() => {});
    } catch (_) {}

    setWebPushFeedback('🔔 ¡Alerta de consumo mostrada en pantalla con éxito!');
  };

  // Detectar eSIMs con consumo crítico (>=80%) para mostrar banner de advertencia inmediato en la web
  const criticalEsims = esims.filter(e => {
    if (e.status !== 'active') return false;
    if (dismissedAlerts[e.id]) return false;
    const totalGB = Math.max(0.1, e.totalDataGB || 1);
    const usedGB = Math.max(0, e.usedDataGB || 0);
    const percent = (usedGB / totalGB) * 100;
    return percent >= 80;
  });

  const isAdmin = Boolean(
    user.role === 'admin' ||
    user.isAdmin === true ||
    user.email?.toLowerCase().trim() === 'mgbravomalo@gmail.com' ||
    user.email?.toLowerCase().includes('admin') ||
    user.email?.toLowerCase().trim() === 'admin@wappa.io'
  );

  useEffect(() => {
    const handleCloseAll = () => {
      setSelectedEsimForQr(null);
      setSelectedEsimForTopUp(null);
    };
    window.addEventListener('app:close-all-modals', handleCloseAll);
    return () => window.removeEventListener('app:close-all-modals', handleCloseAll);
  }, []);

  const filteredEsims = React.useMemo(() => {
    const list = esims.filter(e => {
      if (filterStatus === 'all') return true;
      if (filterStatus === 'expired') return e.status === 'expired' || e.status === 'depleted' || (e.status as any) === 'canceled';
      return e.status === filterStatus;
    });

    const getStatusWeight = (status: string) => {
      if (status === 'active') return 1;
      if (status === 'ready_to_install') return 2;
      if (status === 'installed') return 3;
      if (status === 'depleted') return 4;
      if (status === 'expired') return 5;
      return 6;
    };

    return [...list].sort((a, b) => getStatusWeight(a.status) - getStatusWeight(b.status));
  }, [esims, filterStatus]);

  const handleCopyIccid = (iccid: string) => {
    navigator.clipboard.writeText(iccid);
    setCopiedIccid(iccid);
    setTimeout(() => setCopiedIccid(null), 2000);
  };

  const getStatusBadge = (status: UserEsim['status'], iccid?: string, providerStatus?: string) => {
    const isCanceled = iccid === '8910300000059827166' || iccid === '891120588984956035' || (status as any) === 'canceled' || (status as any) === 'cancelada' || providerStatus === 'CANCELLED' || providerStatus === 'CANCELED';
    if (isCanceled) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <AlertTriangle className="w-3 h-3 text-rose-600 animate-pulse" />
          <span>Cancelada en Proveedor</span>
        </span>
      );
    }

    if (status === 'installed' || providerStatus === 'DOWNLOADED' || providerStatus === 'INSTALLED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          <span>Descargada en Teléfono</span>
        </span>
      );
    }

    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Activa &amp; Conectada
          </span>
        );
      case 'ready_to_install':
        return (
          <div className="flex flex-col items-end gap-0.5">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
              <Clock className="w-3 h-3 text-amber-600" />
              Lista para Instalar
            </span>
            {providerStatus === 'GOT_RESOURCE' && (
              <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500">
                Proveedor: GOT_RESOURCE
              </span>
            )}
          </div>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
            Caducada
          </span>
        );
      case 'depleted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            Datos Agotados
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-150 text-slate-600 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Welcome & Summary Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center font-bold text-xl shadow-xs shrink-0">
            <Smartphone className="w-6 h-6" />
          </div>

          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">Mis eSIMs Internacionales</h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {esims.length} {esims.length === 1 ? 'eSIM' : 'eSIMs'}
              </span>

              {/* Notification status badge right in the title row next to eSIM count */}
              {isWebPushSupported() && (
                <button
                  onClick={() => setIsNotificationStatusModalOpen(true)}
                  className="inline-flex items-center gap-1.5 transition-all active:scale-95 group focus:outline-hidden"
                  title="Notificaciones de consumo. Haz click para gestionar o apagar."
                >
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Alertas:
                  </span>
                  {!notificationDismissedOrMuted ? (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse shadow-2xs">
                      <BellRing className="w-3 h-3 animate-bounce" />
                      <span className="text-[10px] font-black uppercase">Activas</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse shadow-2xs">
                      <div className="relative inline-flex items-center justify-center">
                        <Bell className="w-3 h-3 text-rose-500" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-3 h-0.5 bg-rose-500 rotate-45 rounded-full" />
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase">Apagadas</span>
                    </div>
                  )}
                </button>
              )}

              {isAdmin && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                  <ShieldAlert className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                  <span>Modo Administrador</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Gestiona el consumo de datos, códigos QR y recargas para {user.name} ({user.email})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap w-full md:w-auto justify-center md:justify-end">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800/60 shadow-2xs transition-all active:scale-95 disabled:opacity-60"
              title="Preguntar al operador mayorista el saldo de datos y tiempo exacto en vivo"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Consultando Proveedor...' : 'Actualizar Saldo en Vivo'}</span>
            </button>
          )}

          {isAdmin && onOpenAdminOrdersModal && (
            <button
              onClick={onOpenAdminOrdersModal}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold shadow-md shadow-purple-700/20 transition-all active:scale-95 relative"
              title="Panel de Pedidos y Aprobaciones de eSIMs"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pedidos &amp; Aprobaciones</span>
              {pendingOrdersCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] flex items-center justify-center -mr-1 animate-pulse shadow-sm">
                  {pendingOrdersCount}
                </span>
              )}
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => setIsFlutterAdminModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md shadow-purple-600/20 transition-all active:scale-95"
              title="Panel de pruebas de notificaciones Push directas a la aplicación Flutter"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Probar Push Flutter (Admin)</span>
            </button>
          )}

          <button
            onClick={onNavigateToStore}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-colors w-full md:w-auto"
          >
            <Plus className="w-4 h-4 text-emerald-400 dark:text-white" />
            <span>Comprar Nueva eSIM</span>
          </button>
        </div>
      </div>

      {webPushFeedback && (
        <div className="text-xs font-medium px-4 py-2.5 rounded-xl bg-slate-900 text-white flex items-center justify-between gap-2 shadow-sm animate-in fade-in duration-200">
          <span>{webPushFeedback}</span>
          <button
            onClick={() => setWebPushFeedback(null)}
            className="text-slate-400 hover:text-white text-xs underline ml-2"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Pending Orders Notice Banners */}
      {userPendingOrders.map((ord: any) => (
        <div
          key={`pending-${ord.id || ord.orderNumber}`}
          className="bg-amber-500/10 border-2 border-amber-500/30 dark:border-amber-500/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-200"
        >
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-sm font-bold mt-0.5">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500 text-slate-950">
                  Pedido #{ord.orderNumber} en Revisión
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {ord.country} ({ord.planName || 'eSIM'})
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                Transacción de prueba registrada (${Number(ord.pricePaid || 0).toFixed(2)} USD). Tu eSIM se activará aquí automáticamente en cuanto el administrador autorice el pedido.
              </p>
            </div>
          </div>

          {isAdmin && onOpenAdminOrdersModal && (
            <button
              onClick={onOpenAdminOrdersModal}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95 shrink-0"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Aprobar Pedido Ahora (Admin)</span>
            </button>
          )}
        </div>
      ))}

      {/* Sleek Floating Toast Notification for On-Screen Alert Test */}
      {onScreenTestAlert && (
        <div className="fixed top-5 right-5 z-50 w-full max-w-sm bg-slate-900 dark:bg-slate-900 text-white border border-amber-500/50 rounded-2xl p-4 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 font-bold">
                <BellRing className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500 text-slate-950">
                    Alerta {onScreenTestAlert.percent}%
                  </span>
                  <span className="text-xs font-bold text-white">
                    {onScreenTestAlert.country}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                  Has consumido <strong>{onScreenTestAlert.usedGB.toFixed(1)} GB</strong> de {onScreenTestAlert.totalGB.toFixed(1)} GB. Te queda el {(100 - onScreenTestAlert.percent)}%.
                </p>
              </div>
            </div>

            <button
              onClick={() => setOnScreenTestAlert(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800">
            <button
              onClick={() => {
                const target = esims.find(e => e.country === onScreenTestAlert.country) || esims[0];
                if (target) {
                  setSelectedEsimForTopUp(target);
                } else {
                  onNavigateToStore();
                }
                setOnScreenTestAlert(null);
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs transition-all active:scale-95 flex items-center gap-1"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Recargar</span>
            </button>
            <button
              onClick={() => setOnScreenTestAlert(null)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Critical Consumption In-App Warning Banners */}
      {criticalEsims.map(crEsim => {
        const totalGB = Math.max(0.1, crEsim.totalDataGB || 1);
        const usedGB = Math.max(0, crEsim.usedDataGB || 0);
        const percent = Math.round((usedGB / totalGB) * 100);

        return (
          <div
            key={`alert-${crEsim.iccid || crEsim.id}`}
            className="bg-amber-500/10 border-2 border-amber-500/30 dark:border-amber-500/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-sm font-bold mt-0.5">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500 text-slate-950">
                    Alerta: {percent}% Consumido
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {crEsim.country} ({crEsim.planName || 'eSIM'})
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Has consumido <strong>{usedGB.toFixed(2)} GB</strong> de tus <strong>{totalGB.toFixed(2)} GB</strong>. Te recomendamos recargar ahora para no interrumpir tu conexión.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <button
                onClick={() => setSelectedEsimForTopUp(crEsim)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95"
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>Recargar Datos Ahora</span>
              </button>
              <button
                onClick={() => setDismissedAlerts(prev => ({ ...prev, [crEsim.id]: true }))}
                className="px-3 py-2.5 rounded-xl bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 text-xs font-medium border border-slate-200 dark:border-slate-700 transition-colors"
                title="Descartar aviso"
              >
                Entendido
              </button>
            </div>
          </div>
        );
      })}

      {/* Filter Tabs */}
      {esims.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => setFilterStatus('active')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterStatus === 'active'
                ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            Activas ({esims.filter(e => e.status === 'active').length})
          </button>
          <button
            onClick={() => setFilterStatus('ready_to_install')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterStatus === 'ready_to_install'
                ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            Listas para Instalar ({esims.filter(e => e.status === 'ready_to_install').length})
          </button>
          <button
            onClick={() => setFilterStatus('expired')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterStatus === 'expired'
                ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            Caducadas ({esims.filter(e => e.status === 'expired' || e.status === 'depleted').length})
          </button>
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterStatus === 'all'
                ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
            }`}
          >
            Todas ({esims.length})
          </button>
        </div>
      )}

      {/* eSIMs List or Empty State */}
      {isLoading && esims.length === 0 && !isAdmin ? (
        <MyEsimsSkeletonGrid
          count={4}
        />
      ) : (
        <>
          {filteredEsims.length === 0 ? (
            esims.length > 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-xs space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                  <Smartphone className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">No hay eSIMs en esta categoría</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                    No se encontraron eSIMs con el filtro seleccionado.
                  </p>
                </div>
                <button
                  onClick={onNavigateToStore}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-colors inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4 text-emerald-400 dark:text-white" />
                  <span>Explorar Destinos Disponibles</span>
                </button>
              </div>
            ) : null
          ) : (
            <div className={
              filteredEsims.length === 1
                ? "flex justify-center w-full"
                : "grid grid-cols-1 lg:grid-cols-2 gap-5"
            }>
              {filteredEsims.map((esim) => {
            const isExpanded = expandedDetailsId === (esim.iccid || esim.id);
            const usedGB = esim.usedDataGB || 0;
            const remainingGB = Math.max(0, esim.totalDataGB - usedGB);
            const remainingPct = esim.isUnlimited
              ? 100
              : Math.max(0, Math.min(100, Math.round((remainingGB / esim.totalDataGB) * 100)));

            const usedMB = Math.round(usedGB * 1024);
            const usedDisplay = usedGB > 0 && usedGB < 0.1
              ? `${usedMB} MB (${usedGB.toFixed(2)} GB)`
              : `${usedGB.toFixed(2)} GB`;
            const remainingDisplay = remainingGB < 10 ? remainingGB.toFixed(2) : remainingGB.toFixed(1);

            // Valor pagado por el cliente para esta eSIM
            const customerPaidPrice = typeof esim.pricePaid === 'number'
              ? esim.pricePaid
              : (typeof esim.salePriceEUR === 'number'
                ? esim.salePriceEUR
                : (esim.isUnlimited ? 15.00 : (esim.totalDataGB ? Number((esim.totalDataGB * 1.5 + 4).toFixed(2)) : 12.00)));

            return (
              <div
                key={esim.iccid || esim.id}
                className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-all ${
                  filteredEsims.length === 1 ? 'w-full max-w-2xl' : ''
                }`}
              >
                <div>
                  
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <CountryFlag flag={esim.flag} countryCode={esim.countryCode} countryName={esim.country} size="xl" rounded="md" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{esim.country}</h3>
                          {esim.network5G && (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              5G ULTRA
                            </span>
                          )}
                          {(esim.supportTopUpType === 1 || esim.isReloadable === false) && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              Sin recarga
                            </span>
                          )}
                          {(esim.isMultiCountry || (esim.coveredCountries && esim.coveredCountries.length > 1) || (esim.coveredCountriesCount && esim.coveredCountriesCount > 1)) && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <Globe className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                              <span>Multi-país ({esim.coveredCountriesCount || esim.coveredCountries?.length} países)</span>
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">{esim.planName}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {getStatusBadge(esim.status, esim.iccid, esim.providerStatus)}
                      <div className="text-right font-mono">
                        <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block leading-tight">
                          Pagado
                        </span>
                        <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                          ${customerPaidPrice.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ICCID and Network Info + Purchase & Validity Badges */}
                  <div className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs border-b border-slate-100 dark:border-slate-800/80 mb-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-mono">
                        <span>ICCID:</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{esim.iccid}</span>
                        <button
                          onClick={() => handleCopyIccid(esim.iccid)}
                          className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                          title="Copiar ICCID"
                        >
                          {copiedIccid === esim.iccid ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 text-[11px]">
                        <Radio className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>{esim.operator}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      {esim.purchaseDate && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>Compra: <strong>{esim.purchaseDate}</strong></span>
                        </span>
                      )}
                      {(esim.durationDays || esim.expiryDate) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 font-medium border border-emerald-200/60 dark:border-emerald-800/40">
                          <Clock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          <span>Validez: <strong>{esim.durationDays ? `${esim.durationDays} días` : esim.expiryDate}</strong></span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Data Usage Meter */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-3.5 mb-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                        <Signal className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Saldo de Datos Restante:</span>
                      </span>
                      {esim.isUnlimited ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-bold">Datos Ilimitados</span>
                      ) : (
                        <span className="text-slate-900 dark:text-slate-100 font-mono">
                          <strong className="text-emerald-700 dark:text-emerald-400 text-sm">{remainingDisplay} GB</strong> / {esim.totalDataGB} GB
                        </span>
                      )}
                    </div>

                    {!esim.isUnlimited && (
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden shadow-inner">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            remainingPct > 40
                              ? 'bg-emerald-500'
                              : remainingPct > 15
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                          style={{ width: `${remainingPct}%` }}
                        />
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                      <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                        <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>Vigencia: <strong>{esim.expiryDate}</strong></span>
                      </div>
                      <div className="font-mono text-slate-500 dark:text-slate-400">
                        Consumido: <strong className="text-slate-700 dark:text-slate-200">{usedDisplay}</strong>
                      </div>
                    </div>

                    {/* FUP Active Status for Unlimited eSIMs */}
                    {esim.isUnlimited && (
                      <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-700/70">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                            <Gauge className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span>Parámetros FUP (Uso Justo)</span>
                          </span>
                          <span className="text-[9px] font-mono px-1 py-0.2 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 rounded font-semibold">
                            Sin Cortes
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 text-center">
                          <div className="bg-white dark:bg-slate-900/70 p-1.5 rounded-lg border border-slate-200/70 dark:border-slate-700/70">
                            <span className="text-[9px] text-slate-400 block font-medium">Cuota 5G</span>
                            <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{esim.fupDailyAllowance || '1 GB /Día'}</span>
                          </div>
                          <div className="bg-white dark:bg-slate-900/70 p-1.5 rounded-lg border border-slate-200/70 dark:border-slate-700/70">
                            <span className="text-[9px] text-slate-400 block font-medium">Velocidad FUP</span>
                            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{esim.fupSpeedThrottling || esim.fupPolicy || '512 Kbps'}</span>
                          </div>
                          <div className="bg-white dark:bg-slate-900/70 p-1.5 rounded-lg border border-slate-200/70 dark:border-slate-700/70">
                            <span className="text-[9px] text-slate-400 block font-medium">Reinicio</span>
                            <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{esim.fupResetInterval ? '24h (UTC)' : 'Cada 24h'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                </div>

                {/* Primary Card Actions */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2">
                  {esim.status === 'ready_to_install' && (
                    <button
                      onClick={() => setSelectedEsimForQr(esim)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
                      <span>Instalar eSIM</span>
                    </button>
                  )}

                  {/* Botón de Recargar: Solo visible si la eSIM admite recarga */}
                  {esim.supportTopUpType !== 1 && esim.isReloadable !== false && (
                    <button
                      onClick={() => setSelectedEsimForTopUp(esim)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800 transition-colors"
                    >
                      <Zap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Recargar</span>
                    </button>
                  )}
                  
                  {esim.status !== 'expired' && esim.status !== 'canceled' && esim.status !== 'depleted' && (
                    <button
                      onClick={() => setSelectedEsimForQr(esim)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold shadow-xs transition-colors"
                    >
                      <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{esim.status === 'ready_to_install' ? 'Ver QR' : 'QR & Códigos'}</span>
                    </button>
                  )}
                </div>

                {/* Desplegable APN, Pago & Roaming al final del cuadro */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
                  {isExpanded && (
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl mb-2.5 space-y-2.5 text-xs animate-fade-in">
                      {esim.status !== 'expired' && esim.status !== 'canceled' && esim.status !== 'depleted' && (
                        <>
                          <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 pb-1 border-b border-slate-200 dark:border-slate-700">
                            <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            <span>Configuración de Red &amp; APN para {esim.country}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <span className="text-slate-400 block font-semibold">Punto de Acceso (APN):</span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{esim.apn}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-semibold">Itinerancia de Datos:</span>
                              <span className="text-emerald-700 dark:text-emerald-400 font-bold">Debe estar ACTIVA</span>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Información de Hardware & Dispositivo (Genérico para todas las tarjetas) */}
                      <div className="p-3 bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 text-[11px]">
                        <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between pb-1 border-b border-slate-200/60 dark:border-slate-700/60">
                          <span className="flex items-center gap-1.5">
                            <Smartphone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Información de Hardware &amp; Dispositivo</span>
                          </span>
                          {editingHardwareIccid !== esim.iccid ? (
                            user.role === 'admin' && (
                              <button
                                type="button"
                                onClick={() => startEditHardware(esim)}
                                className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-bold text-[10px]"
                              >
                                <Pencil className="w-2.5 h-2.5" />
                                <span>{esim.eid ? 'Editar' : 'Registrar'}</span>
                              </button>
                            )
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingHardwareIccid(null)}
                              className="text-slate-500 hover:text-slate-700 flex items-center gap-0.5 font-bold text-[10px]"
                            >
                              <X className="w-2.5 h-2.5" />
                              <span>Cancelar</span>
                            </button>
                          )}
                        </div>

                        {editingHardwareIccid === esim.iccid ? (
                          <div className="space-y-2 pt-1 animate-fade-in">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">
                                EID (Embedded ID):
                              </label>
                              <input
                                type="text"
                                value={editEid}
                                onChange={(e) => setEditEid(e.target.value)}
                                placeholder="Ej: 8904903200740..."
                                className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">
                                  Marca:
                                </label>
                                <input
                                  type="text"
                                  value={editBrand}
                                  onChange={(e) => setEditBrand(e.target.value)}
                                  placeholder="Ej: Apple"
                                  className="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">
                                  Modelo de Teléfono:
                                </label>
                                <input
                                  type="text"
                                  value={editModel}
                                  onChange={(e) => setEditModel(e.target.value)}
                                  placeholder="Ej: iPhone 16 Pro"
                                  className="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                                />
                              </div>
                            </div>

                            {hardwareError && (
                              <div className="text-[10px] text-red-600 font-semibold bg-red-50 dark:bg-red-950/30 p-1.5 rounded">
                                ⚠️ {hardwareError}
                              </div>
                            )}
                            {hardwareSuccess && (
                              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/30 p-1.5 rounded">
                                {hardwareSuccess}
                              </div>
                            )}

                            <div className="flex justify-end gap-1.5 pt-1">
                              <button
                                type="button"
                                disabled={isSavingHardware}
                                onClick={() => handleSaveHardware(esim.iccid)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 text-[10px] font-bold transition-colors disabled:opacity-50"
                              >
                                <Save className="w-3 h-3" />
                                <span>{isSavingHardware ? 'Guardando...' : 'Guardar'}</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 font-mono">
                            <div className="col-span-2">
                              <span className="text-slate-400 block font-semibold text-[10px]">EID (Embedded ID):</span>
                              <span className="text-slate-800 dark:text-slate-200 font-bold select-all break-all">
                                {esim.eid || (
                                  <span className="text-slate-400 dark:text-slate-500 font-normal italic">Pendiente de registro / activación</span>
                                )}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-semibold text-[10px]">Modelo de Teléfono:</span>
                              <span className="text-slate-800 dark:text-slate-200 font-bold">
                                {esim.deviceModel || (
                                  <span className="text-slate-400 dark:text-slate-500 font-normal italic">No detectado</span>
                                )}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-semibold text-[10px]">Marca:</span>
                              <span className="text-slate-800 dark:text-slate-200 font-bold">
                                {esim.deviceBrand || (
                                  <span className="text-slate-400 dark:text-slate-500 font-normal italic">No detectado</span>
                                )}
                              </span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-slate-400 block font-semibold text-[10px]">Fecha de Instalación / Descarga:</span>
                              <span className="text-slate-800 dark:text-slate-200 font-bold">
                                {esim.installationTime ? (
                                  (() => {
                                    try {
                                      return new Date(esim.installationTime).toLocaleString('es-ES', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        timeZoneName: 'short'
                                      });
                                    } catch {
                                      return esim.installationTime;
                                    }
                                  })()
                                ) : (
                                  <span className="text-slate-400 dark:text-slate-500 font-normal italic">Pendiente de instalación</span>
                                )}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {esim.coverageDetails && (
                        <div className="p-2 bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-900/60 rounded-lg text-[11px] text-emerald-900 dark:text-emerald-300 leading-tight flex items-start gap-1.5">
                          <Info className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <span>{esim.coverageDetails}</span>
                        </div>
                      )}

                      {esim.coveredCountries && esim.coveredCountries.length > 0 && (
                        <div className="p-2.5 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-800 dark:text-slate-200">
                            <span className="flex items-center gap-1.5">
                              <Globe className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span>Países con cobertura ({esim.coveredCountries.length}):</span>
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                            {esim.coveredCountries.map((c) => (
                              <span
                                key={c.code}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-700 dark:text-slate-300"
                              >
                                <CountryFlag flag={c.flag} countryCode={c.code} countryName={c.name} size="xs" rounded="sm" />
                                <span>{c.name}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {esim.status !== 'expired' && esim.status !== 'canceled' && esim.status !== 'depleted' && (
                        <div className="p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-[11px] text-amber-900 dark:text-amber-300 leading-tight flex items-start gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                          <span>Recuerda seleccionar esta eSIM como la línea principal de datos móviles al aterrizar.</span>
                        </div>
                      )}

                      {esim.status !== 'expired' && esim.status !== 'canceled' && esim.status !== 'depleted' && (esim.supportTopUpType === 1 || esim.isReloadable === false) && (
                        <div className="p-2 bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/50 rounded-lg text-[11px] text-amber-900 dark:text-amber-300 leading-tight flex items-start gap-1.5">
                          <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <span>
                            <strong>Plan no recargable:</strong> Este perfil no admite recargas adicionales. Al agotar los datos o días contratados, deberás adquirir una nueva eSIM.
                          </span>
                        </div>
                      )}

                      {/* Customer Payment & Validity Details (Visible when user is regular "user") */}
                      {!isAdmin && (
                        <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl space-y-2.5 text-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                                $
                              </div>
                              <div>
                                <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300 tracking-wider block">
                                   Valor Pagado por la eSIM
                                </span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                  Transacción confirmada · Impuestos incluidos
                                </span>
                              </div>
                            </div>
                            <div className="text-right font-mono">
                              <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-400 block">
                                ${customerPaidPrice.toFixed(2)}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-100 dark:border-emerald-900/50">
                            <div className="bg-white/80 dark:bg-slate-900/80 p-2 rounded-lg border border-emerald-100 dark:border-emerald-950">
                              <span className="text-[10px] text-slate-400 block flex items-center gap-1 font-medium">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span>Fecha de Compra</span>
                              </span>
                              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block font-mono">
                                {esim.purchaseDate || 'Reciente'}
                              </span>
                            </div>

                            <div className="bg-white/80 dark:bg-slate-900/80 p-2 rounded-lg border border-emerald-100 dark:border-emerald-950">
                              <span className="text-[10px] text-slate-400 block flex items-center gap-1 font-medium">
                                <Clock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                <span>Período de Validez antes de instalar</span>
                              </span>
                              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5 block font-mono">
                                {esim.preInstallValidity || '180 Días'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Financial Audit / Cost Traceability (EXCLUSIVO ADMINISTRADORES) */}
                      {isAdmin && (
                        <div className="p-2.5 bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 rounded-lg space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-bold text-purple-900 dark:text-purple-200">
                            <span className="flex items-center gap-1.5">
                              <ShieldAlert className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                              <span>Auditoría Financiera (Solo Administradores)</span>
                            </span>
                            <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400">
                              {esim.purchaseDate ? `Fecha: ${esim.purchaseDate}` : 'Registrada'}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-purple-100 dark:border-purple-900/40 text-center">
                            <div className="bg-white dark:bg-slate-900/80 p-1.5 rounded border border-purple-100 dark:border-purple-950">
                              <span className="text-[9px] text-slate-500 dark:text-slate-400 block font-medium">Costo Inicial</span>
                              <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                                {typeof esim.costPriceEUR === 'number' ? `$${esim.costPriceEUR.toFixed(2)}` : '$--'}
                              </span>
                            </div>
                            <div className="bg-white dark:bg-slate-900/80 p-1.5 rounded border border-purple-100 dark:border-purple-950">
                              <span className="text-[9px] text-slate-500 dark:text-slate-400 block font-medium">Precio Venta</span>
                              <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400">
                                {typeof (esim.pricePaid || esim.salePriceEUR) === 'number' ? `$${(esim.pricePaid || esim.salePriceEUR)!.toFixed(2)}` : '$--'}
                              </span>
                            </div>
                            <div className="bg-white dark:bg-slate-900/80 p-1.5 rounded border border-purple-100 dark:border-purple-950">
                              <span className="text-[9px] text-slate-500 dark:text-slate-400 block font-medium">Margen Auditoría</span>
                              <span className="text-xs font-mono font-bold text-purple-700 dark:text-purple-400">
                                {typeof esim.profitEUR === 'number'
                                  ? `+$${esim.profitEUR.toFixed(2)}`
                                  : (typeof esim.pricePaid === 'number' && typeof esim.costPriceEUR === 'number'
                                    ? `+$${(esim.pricePaid - esim.costPriceEUR).toFixed(2)}`
                                    : '$--')}
                              </span>
                            </div>
                          </div>
                          <div className="pt-1 flex items-center justify-between">
                            <span className="text-[10px] text-purple-700 dark:text-purple-300">
                              Simulación de Notificación
                            </span>
                            <button
                              type="button"
                              onClick={() => setIsFlutterAdminModalOpen(true)}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800 px-2 py-0.5 rounded-md transition-colors"
                            >
                              <Smartphone className="w-3 h-3" />
                              <span>Enviar Push Flutter</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                    <button
                      onClick={() => setExpandedDetailsId(isExpanded ? null : (esim.iccid || esim.id))}
                      className="w-full py-1 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 flex items-center justify-center gap-1 transition-colors"
                    >
                      <span>
                        {isExpanded 
                          ? 'Ocultar detalles' 
                          : (esim.status === 'expired' || esim.status === 'canceled' || esim.status === 'depleted')
                            ? (isAdmin ? 'Ver Auditoría & Dispositivo' : (esim.eid ? 'Ver Pago & Dispositivo' : 'Ver Detalles de Pago'))
                            : (isAdmin ? 'Ver APN, Auditoría & Roaming' : 'Ver APN, Pago & Roaming')}
                      </span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </>
  )}

      {/* QR Code Modal */}
      <QrCodeModal
        esim={selectedEsimForQr}
        isOpen={Boolean(selectedEsimForQr)}
        onClose={() => setSelectedEsimForQr(null)}
        defaultEmail={user.email}
      />

      {/* Top Up Modal */}
      <TopUpModal
        esim={selectedEsimForTopUp}
        isOpen={Boolean(selectedEsimForTopUp)}
        onClose={() => setSelectedEsimForTopUp(null)}
        onConfirmTopUp={onTopUpEsim}
        onNavigateToStore={onNavigateToStore}
        onOpenQrCode={(esimToOpen) => setSelectedEsimForQr(esimToOpen)}
      />

      {/* Flutter Push Admin Testing Modal */}
      {isAdmin && (
        <FlutterPushAdminModal
          isOpen={isFlutterAdminModalOpen}
          onClose={() => setIsFlutterAdminModalOpen(false)}
          user={user}
          esims={esims}
        />
      )}

      {/* Notification Status Management Modal */}
      {isNotificationStatusModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Gestión de Alertas
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Avisos de consumo de datos y caducidad de eSIM.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsNotificationStatusModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-700/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Estado Actual:</span>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  !notificationDismissedOrMuted 
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' 
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                }`}>
                  {!notificationDismissedOrMuted ? 'Activas e Intermitentes' : 'Silenciadas (Apagadas)'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {!notificationDismissedOrMuted
                  ? 'Recibirás alertas en pantalla cuando tu eSIM alcance el 80% de consumo o esté por vencer.'
                  : 'Las notificaciones están temporalmente apagadas. La campanita se muestra en color ámbar con una cruz.'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              {!notificationDismissedOrMuted ? (
                <button
                  onClick={() => {
                    setNotificationDismissedOrMuted(true);
                    setIsNotificationStatusModalOpen(false);
                    setWebPushFeedback('🔕 Alertas silenciadas. La campanita ahora se muestra en estado apagado.');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-xs transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <BellOff className="w-4 h-4" />
                  <span>Apagar Alertas</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setNotificationDismissedOrMuted(false);
                    setIsNotificationStatusModalOpen(false);
                    setWebPushFeedback('🔔 Alertas reactivadas con éxito.');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <Bell className="w-4 h-4" />
                  <span>Encender Alertas</span>
                </button>
              )}

              <button
                onClick={() => setIsNotificationStatusModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
