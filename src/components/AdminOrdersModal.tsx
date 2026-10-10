import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  Clock,
  CheckCircle,
  XCircle,
  Smartphone,
  CreditCard,
  Zap,
  RefreshCw,
  Search,
  Filter,
  Check,
  AlertTriangle,
  QrCode,
  Calendar,
  ExternalLink,
  ShieldAlert,
  ToggleLeft,
  ToggleRight,
  Trash2
} from 'lucide-react';
import { Order, User, UserEsim } from '../types';
import { CountryFlag } from './CountryFlag';
import { realtimeSync } from '../utils/realtimeSync';

interface AdminOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onOrderApproved?: (approvedOrder: Order, generatedEsim: UserEsim) => void;
  onViewQrModal?: (esim: UserEsim) => void;
}

export const AdminOrdersModal: React.FC<AdminOrdersModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onOrderApproved,
  onViewQrModal
}) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending_approval' | 'approved' | 'rejected'>('pending_approval');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // System settings state
  const [isTestMode, setIsTestMode] = useState<boolean>(true);
  const [requireAdminApproval, setRequireAdminApproval] = useState<boolean>(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const fetchOrdersAndSettings = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch settings
      const settingsRes = await fetch('/api/admin/settings');
      if (settingsRes.ok) {
        const sData = await settingsRes.json();
        if (sData.success && sData.settings) {
          setIsTestMode(sData.settings.isTestMode ?? true);
          setRequireAdminApproval(sData.settings.requireAdminApproval ?? true);
        }
      }

      // 2. Fetch orders
      const userEmail = currentUser?.email || 'mgbravomalo@gmail.com';
      const ordersRes = await fetch(`/api/orders?email=${encodeURIComponent(userEmail)}&isAdmin=true`);
      if (ordersRes.ok) {
        const oData = await ordersRes.json();
        if (oData.success && Array.isArray(oData.orders)) {
          setOrders(oData.orders);
        }
      }
    } catch (err: any) {
      console.warn('Error fetching admin orders:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchOrdersAndSettings();
    }
  }, [isOpen]);

  const handleToggleTestMode = async () => {
    setIsSavingSettings(true);
    const newMode = !isTestMode;
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isTestMode: newMode,
          adminEmail: currentUser?.email || 'mgbravomalo@gmail.com',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsTestMode(newMode);
        setActionFeedback(
          newMode
            ? '🧪 Modo de Pruebas Activado: Todas las transacciones son simuladas (sin compras al mayorista).'
            : '⚠️ Modo Producción Mayorista Activado: Las órdenes aprobadas se enviarán a eSIM Access API.'
        );
      }
    } catch (err: any) {
      setActionFeedback(`Error: ${err.message}`);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleToggleRequireApproval = async () => {
    setIsSavingSettings(true);
    const newSetting = !requireAdminApproval;
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requireAdminApproval: newSetting,
          adminEmail: currentUser?.email || 'mgbravomalo@gmail.com',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRequireAdminApproval(newSetting);
        setActionFeedback(
          newSetting
            ? '🔒 Aprobación Manual Activada: Cada compra requerirá autorización manual por el administrador.'
            : '⚡ Aprobación Instantánea: Las compras se autorizan y emiten la eSIM de inmediato en modo prueba.'
        );
      }
    } catch (err: any) {
      setActionFeedback(`Error: ${err.message}`);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleApproveOrder = async (order: Order) => {
    setActionInProgressId(order.id);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail: currentUser?.email || 'mgbravomalo@gmail.com',
          forceWholesaler: !isTestMode,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setActionFeedback(`✅ Pedido ${order.orderNumber} Aprobado con éxito. eSIM asignada a ${order.userEmail}.`);
        
        // Update local state
        setOrders(prev =>
          prev.map(o => (o.id === order.id ? { ...o, status: 'approved', generatedEsim: data.esim } : o))
        );

        // Broadcast to all tabs/devices immediately
        realtimeSync.broadcastLocalApproval(data.order || order, data.esim);

        if (onOrderApproved && data.esim) {
          onOrderApproved(data.order || order, data.esim);
        }
      } else {
        setActionFeedback(`❌ Error al aprobar: ${data.error}`);
      }
    } catch (err: any) {
      setActionFeedback(`❌ Error de conexión: ${err.message}`);
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleRejectOrder = async (order: Order) => {
    if (!window.confirm(`¿Estás seguro de que deseas rechazar el pedido ${order.orderNumber}?`)) {
      return;
    }

    setActionInProgressId(order.id);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail: currentUser?.email || 'mgbravomalo@gmail.com',
          reason: 'Rechazado manualmente en panel de pruebas',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setActionFeedback(`🚫 Pedido ${order.orderNumber} marcado como Rechazado.`);
        setOrders(prev =>
          prev.map(o => (o.id === order.id ? { ...o, status: 'rejected' } : o))
        );
      } else {
        setActionFeedback(`❌ Error al rechazar: ${data.error}`);
      }
    } catch (err: any) {
      setActionFeedback(`❌ Error: ${err.message}`);
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleDeleteOrder = async (order: Order) => {
    if (!window.confirm(`¿Deseas eliminar este pedido (${order.orderNumber}) de ${order.country}? Si ya tenía eSIM emitida, también se retirará para permitir pruebas limpias.`)) {
      return;
    }

    setActionInProgressId(order.id);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail: currentUser?.email || 'mgbravomalo@gmail.com',
        }),
      });

      const data = await res.json();
      if (data.success || res.status === 404) {
        setActionFeedback(`🗑️ Pedido ${order.orderNumber} y perfil asociado eliminados con éxito.`);
        setOrders(prev => prev.filter(o => o.id !== order.id && o.orderNumber !== order.orderNumber && (o as any)._id !== order.id));
        realtimeSync.broadcastLocalDelete(order.id);
        window.dispatchEvent(new CustomEvent('app:order_approved_refresh'));
      } else {
        setActionFeedback(`❌ Error al eliminar: ${data.error}`);
      }
    } catch (err: any) {
      setActionFeedback(`❌ Error: ${err.message}`);
    } finally {
      setActionInProgressId(null);
    }
  };

  if (!isOpen) return null;

  const filteredOrders = orders.filter(o => {
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchNumber = o.orderNumber?.toLowerCase().includes(q);
      const matchUser = o.userEmail?.toLowerCase().includes(q) || o.userName?.toLowerCase().includes(q);
      const matchPlan = o.country?.toLowerCase().includes(q) || o.planName?.toLowerCase().includes(q);
      return matchNumber || matchUser || matchPlan;
    }
    return true;
  });

  const pendingCount = orders.filter(o => o.status === 'pending_approval').length;
  const approvedCount = orders.filter(o => o.status === 'approved').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full p-6 shadow-2xl relative overflow-y-auto max-h-[92vh] text-slate-900 dark:text-white flex flex-col gap-4">
        
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center justify-center shadow-xs">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Panel de Pedidos &amp; Aprobaciones</h2>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                  Control Administrador
                </span>
                {pendingCount > 0 && (
                  <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 animate-pulse">
                    {pendingCount} Pendiente{pendingCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Autoriza transacciones de prueba, simula pasarelas de pago y emite perfiles eSIM sin costo mayorista.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Protection Controls (Test Mode & Manual Approval Switch) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl">
          
          {/* Switch 1: Test Mode (Fake) vs Real Wholesaler */}
          <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isTestMode ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  {isTestMode ? 'Modo de Pruebas (Fake)' : 'Modo Producción Mayorista'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isTestMode
                  ? 'Protección activa: CERO cobros en eSIM Access. Perfiles eSIM simulados.'
                  : 'Atención: Las compras aprobadas comprarán eSIMs reales con saldo mayorista.'}
              </p>
            </div>

            <button
              onClick={handleToggleTestMode}
              disabled={isSavingSettings}
              className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                isTestMode
                  ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                  : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Alternar Modo de Pruebas"
            >
              {isTestMode ? <ToggleRight className="w-7 h-7 text-emerald-600 dark:text-emerald-400" /> : <ToggleLeft className="w-7 h-7 text-slate-400" />}
            </button>
          </div>

          {/* Switch 2: Require Manual Approval vs Auto-Approve */}
          <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  {requireAdminApproval ? 'Aprobación Manual por Administrador' : 'Aprobación Instantánea'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {requireAdminApproval
                  ? 'Cada compra se queda en espera hasta que hagas clic en "Aprobar y Emitir".'
                  : 'Las compras se autorizan y generan la eSIM inmediatamente sin intervención.'}
              </p>
            </div>

            <button
              onClick={handleToggleRequireApproval}
              disabled={isSavingSettings}
              className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                requireAdminApproval
                  ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50'
                  : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Alternar Aprobación Manual"
            >
              {requireAdminApproval ? <ToggleRight className="w-7 h-7 text-amber-500" /> : <ToggleLeft className="w-7 h-7 text-slate-400" />}
            </button>
          </div>

        </div>

        {/* Feedback Message */}
        {actionFeedback && (
          <div className="p-3 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-medium flex items-center justify-between gap-2 animate-in fade-in duration-200 shadow-md">
            <span>{actionFeedback}</span>
            <button
              onClick={() => setActionFeedback(null)}
              className="text-slate-400 hover:text-white text-xs underline ml-2 shrink-0"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto no-scrollbar">
            <button
              onClick={() => setFilterStatus('pending_approval')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 ${
                filterStatus === 'pending_approval'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>Pendientes ({pendingCount})</span>
            </button>

            <button
              onClick={() => setFilterStatus('approved')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 ${
                filterStatus === 'approved'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <CheckCircle className="w-3 h-3" />
              <span>Aprobados ({approvedCount})</span>
            </button>

            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                filterStatus === 'all'
                  ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              Todos ({orders.length})
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por orden, email o país..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-transparent focus:border-purple-500 focus:outline-none"
              />
            </div>

            <button
              onClick={fetchOrdersAndSettings}
              disabled={isLoading}
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
              title="Recargar pedidos"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-purple-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Orders List */}
        <div className="space-y-3 min-h-[220px]">
          {isLoading && orders.length === 0 ? (
            <div className="p-10 text-center text-slate-400 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-purple-500" />
              <p className="text-xs font-medium">Cargando pedidos registrados...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-10 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <Clock className="w-8 h-8 mx-auto text-slate-400" />
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                No hay pedidos en esta categoría
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                {filterStatus === 'pending_approval'
                  ? 'No hay ninguna orden pendiente de autorización en este momento. Cuando un usuario compre una eSIM, aparecerá aquí.'
                  : 'No se encontraron órdenes con el filtro seleccionado.'}
              </p>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const isProcessingThis = actionInProgressId === order.id;

              return (
                <div
                  key={order.id || order.orderNumber}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-xl p-4 shadow-2xs transition-all space-y-3"
                >
                  {/* Order Top Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700">
                        {order.orderNumber}
                      </span>

                      {order.status === 'pending_approval' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          <Clock className="w-3 h-3 text-amber-500" />
                          <span>Pendiente de Aprobación</span>
                        </span>
                      )}

                      {order.status === 'approved' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle className="w-3 h-3 text-emerald-500" />
                          <span>Aprobado / Emitida</span>
                        </span>
                      )}

                      {order.status === 'rejected' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                          <XCircle className="w-3 h-3 text-rose-500" />
                          <span>Rechazado</span>
                        </span>
                      )}

                      {order.isTestMode ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                          Sandbox Fake
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300/40">
                          <Zap className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                          <span>eSIM Access Real</span>
                        </span>
                      )}
                    </div>

                    <div className="text-right text-[11px] text-slate-400 font-mono">
                      <span>{order.createdAt ? new Date(order.createdAt).toLocaleString('es-ES') : 'Reciente'}</span>
                    </div>
                  </div>

                  {/* Order Details Body */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    
                    {/* Customer */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-200/70 dark:border-slate-700/70">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                        Cliente / Titular
                      </span>
                      <div className="font-bold text-slate-900 dark:text-white truncate">
                        {order.userName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                        {order.userEmail}
                      </div>
                    </div>

                    {/* Destination & Plan */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-200/70 dark:border-slate-700/70">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                        Destino &amp; Paquete
                      </span>
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <CountryFlag flag={order.flag} countryCode={order.countryCode} countryName={order.country} size="sm" rounded="sm" />
                        <span>{order.country}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {order.planName} · {order.durationDays} días
                      </div>
                    </div>

                    {/* Payment & Amount */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-200/70 dark:border-slate-700/70 flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-400">
                          Método de Pago
                        </span>
                        <span className="font-bold text-sm text-emerald-700 dark:text-emerald-400 font-mono">
                          ${order.pricePaid.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                        {order.paymentMethod === 'gpay' ? (
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-slate-900 dark:text-white">GPay</span>
                            <span className="text-slate-400 font-mono">({order.paymentDetails?.cardLast4 || '4242'})</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                            <span>Tarjeta •••• {order.paymentDetails?.cardLast4 || '4242'}</span>
                          </div>
                        )}
                        <span className="text-[9px] px-1 py-0.2 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded font-bold">
                          Cobro Simulado
                        </span>
                      </div>
                    </div>

                  </div>

                  {/* Actions Bar */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {order.status === 'pending_approval' ? (
                        <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Requiere tu aprobación para emitir la eSIM al cliente</span>
                        </span>
                      ) : order.status === 'approved' && order.generatedEsim ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-emerald-700 dark:text-emerald-400">
                            ICCID: <strong>{order.generatedEsim.iccid}</strong>
                          </span>
                          {order.generatedEsim.providerStatus && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                              Mayorista: {order.generatedEsim.providerStatus}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span>Estado: {order.status}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {order.status === 'pending_approval' && (
                        <>
                          <button
                            onClick={() => handleRejectOrder(order)}
                            disabled={isProcessingThis}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-600 hover:text-rose-600 dark:text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            Rechazar
                          </button>

                          <button
                            onClick={() => handleApproveOrder(order)}
                            disabled={isProcessingThis}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-all active:scale-95 disabled:opacity-50"
                          >
                            {isProcessingThis ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Emitiendo...</span>
                              </>
                            ) : (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Aprobar y Emitir eSIM</span>
                              </>
                            )}
                          </button>
                        </>
                      )}

                      {order.status === 'approved' && order.generatedEsim && (
                        <button
                          onClick={() => {
                            if (onViewQrModal) onViewQrModal(order.generatedEsim);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold shadow-xs transition-colors"
                        >
                          <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Ver Código QR</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteOrder(order)}
                        disabled={isProcessingThis}
                        title="Eliminar pedido y limpiar eSIM de prueba"
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
};
