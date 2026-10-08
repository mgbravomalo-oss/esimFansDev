import React, { useState, useEffect } from 'react';
import {
  Shield,
  Database,
  Users,
  ShoppingBag,
  Cpu,
  CheckCircle,
  XCircle,
  Trash2,
  Play,
  RefreshCw,
  Sliders,
  Search,
  Filter,
  Globe,
  Wifi,
  Settings,
  AlertTriangle,
  Clock,
  ExternalLink,
  Eye,
  Mail,
  Zap,
  ChevronDown,
  ChevronUp,
  Server,
  Smartphone,
  FileText,
  Sparkles,
  Copy,
  Check,
  X,
  Loader2,
  Cloud
} from 'lucide-react';
import { Order, User, UserEsim } from '../types';
import { CountryFlag } from './CountryFlag';
import { realtimeSync } from '../utils/realtimeSync';
import { clearCatalogCache } from '../utils/catalogCache';

interface AdminDashboardViewProps {
  currentUser: User | null;
  onRefreshGlobal?: () => void;
  pendingOrdersCount?: number;
  onOpenAiDiagnosticModal?: () => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  currentUser,
  onRefreshGlobal,
  pendingOrdersCount = 0,
  onOpenAiDiagnosticModal
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'status' | 'orders' | 'customers' | 'esims' | 'cron' | 'audit' | 'lookup' | 'logs'>('status');

  // Audit State
  const [auditData, setAuditData] = useState<any>(null);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [updatingStatusIccid, setUpdatingStatusIccid] = useState<string | null>(null);

  // ICCID Lookup State
  const [lookupIccid, setLookupIccid] = useState('');
  const [isLoadingLookup, setIsLoadingLookup] = useState(false);
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Purchase Audit Logs State
  const [purchaseLogs, setPurchaseLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [logFilterStage, setLogFilterStage] = useState<'all' | 'completed' | 'double_check_failed'>('all');
  
  // Database status
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [isDualWriteEnabled, setIsDualWriteEnabled] = useState<boolean>(false);
  const [isTogglingDualWrite, setIsTogglingDualWrite] = useState<boolean>(false);

  // Orders
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending_approval' | 'approved' | 'rejected'>('all');
  const [orderSearch, setOrderSearch] = useState('');
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // Customers
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [customerEsims, setCustomerEsims] = useState<Record<string, UserEsim[]>>({});
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isLoadingCustomerDetails, setIsLoadingCustomerDetails] = useState<string | null>(null);

  // eSIM Inventory
  const [esims, setEsims] = useState<UserEsim[]>([]);
  const [esimSearch, setEsimSearch] = useState('');
  const [esimFilter, setEsimFilter] = useState<'all' | 'real' | 'simulated'>('all');
  const [isLoadingEsims, setIsLoadingEsims] = useState(false);

  // Maintenance & Cron
  const [cronReport, setCronReport] = useState<any>(null);
  const [isExecutingCron, setIsExecutingCron] = useState(false);

  // General System settings
  const [isTestMode, setIsTestMode] = useState<boolean>(true);
  const [requireAdminApproval, setRequireAdminApproval] = useState<boolean>(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Active Cloud Infrastructure state (Google Cloud Run vs Azure vs Vercel vs Sandbox)
  const [infraInfo, setInfraInfo] = useState<any>(null);
  const [isLoadingInfra, setIsLoadingInfra] = useState<boolean>(false);
  const [showInfraModal, setShowInfraModal] = useState<boolean>(false);

  // Action status feedback
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Custom inline confirmations (prevent window.confirm/prompt failures inside iframes)
  const [confirmingSync, setConfirmingSync] = useState(false);
  const [confirmingSeed, setConfirmingSeed] = useState(false);
  const [confirmingDeleteOrderId, setConfirmingDeleteOrderId] = useState<string | null>(null);
  const [confirmingDeleteEsimIccid, setConfirmingDeleteEsimIccid] = useState<string | null>(null);
  const [confirmingClearAllEsims, setConfirmingClearAllEsims] = useState(false);
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [selectedEsimForDetails, setSelectedEsimForDetails] = useState<UserEsim | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const showFeedback = (message: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 5000);
  };

  const adminEmail = currentUser?.email || 'mgbravomalo@gmail.com';

  // Sombreado léxico de fetch para inyectar automáticamente credenciales y token de seguridad del administrador
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    init = init || {};
    init.headers = init.headers || {};

    if (adminEmail) {
      if (init.headers instanceof Headers) {
        if (!init.headers.has('x-admin-email')) {
          init.headers.set('x-admin-email', adminEmail);
        }
      } else if (Array.isArray(init.headers)) {
        const hasAdminHeader = init.headers.some(([k]) => k.toLowerCase() === 'x-admin-email');
        if (!hasAdminHeader) {
          init.headers.push(['x-admin-email', adminEmail]);
        }
      } else {
        (init.headers as Record<string, string>)['x-admin-email'] = adminEmail;
      }
    }

    if (currentUser?.token) {
      if (init.headers instanceof Headers) {
        if (!init.headers.has('Authorization')) {
          init.headers.set('Authorization', `Bearer ${currentUser.token}`);
        }
      } else if (Array.isArray(init.headers)) {
        const hasAuth = init.headers.some(([k]) => k.toLowerCase() === 'authorization');
        if (!hasAuth) {
          init.headers.push(['Authorization', `Bearer ${currentUser.token}`]);
        }
      } else {
        const keys = Object.keys(init.headers);
        const hasAuth = keys.some(k => k.toLowerCase() === 'authorization');
        if (!hasAuth) {
          init.headers = {
            ...init.headers,
            'Authorization': `Bearer ${currentUser.token}`
          };
        }
      }
    }
    return window.fetch(input, init);
  };

  // Database switcher state
  const [activeDbProvider, setActiveDbProvider] = useState<'mongo' | 'd1'>('mongo');
  const [isSwitchingDb, setIsSwitchingDb] = useState(false);
  const [dbProofData, setDbProofData] = useState<any>(null);
  const [isLoadingProof, setIsLoadingProof] = useState(false);

  // --------------------------------------------------
  // DATA FETCHING
  // --------------------------------------------------

  const handleVerifyDatabaseOrigin = async () => {
    setIsLoadingProof(true);
    try {
      const res = await fetch('/api/admin/database-proof');
      const data = await res.json();
      setDbProofData(data);
      showFeedback('Certificado de origen de datos verificado con éxito', 'success');
    } catch {
      showFeedback('Error al consultar prueba de origen de datos', 'error');
    } finally {
      setIsLoadingProof(false);
    }
  };

  const handleSwitchDatabase = async (provider: 'mongo' | 'd1') => {
    if (isSwitchingDb || provider === activeDbProvider) return;
    setIsSwitchingDb(true);
    try {
      const res = await fetch('/api/admin/active-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveDbProvider(provider);
        setDbStatus(data.status);
        clearCatalogCache();
        try {
          window.dispatchEvent(new CustomEvent('app:database-switched', { detail: { provider } }));
        } catch {}
        showFeedback(data.message || `Base de datos cambiada a ${provider === 'mongo' ? 'MongoDB Atlas' : 'Cloudflare D1'}`, 'success');
        if (onRefreshGlobal) {
          onRefreshGlobal();
        }
      } else {
        showFeedback(data.error || 'Error al cambiar de base de datos', 'error');
      }
    } catch {
      showFeedback('Error de conexión al cambiar el proveedor de base de datos', 'error');
    } finally {
      setIsSwitchingDb(false);
    }
  };

  const handleToggleDualWrite = async (enabled: boolean) => {
    if (isTogglingDualWrite || enabled === isDualWriteEnabled) return;
    setIsTogglingDualWrite(true);
    try {
      const res = await fetch('/api/admin/dual-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (data.success) {
        setIsDualWriteEnabled(enabled);
        setDbStatus(data.status);
        showFeedback(data.message, 'success');
      } else {
        showFeedback(data.error || 'Error al cambiar modo de sincronización', 'error');
      }
    } catch {
      showFeedback('Error de red al actualizar la sincronización dual', 'error');
    } finally {
      setIsTogglingDualWrite(false);
    }
  };

  const fetchDbStatus = async () => {
    setIsLoadingDb(true);
    try {
      const res = await fetch('/api/db/status');
      if (res.ok) {
        const data = await res.json();
        setDbStatus(data);
        if (data.activeProvider) {
          setActiveDbProvider(data.activeProvider);
        }
        if (typeof data.dualWriteEnabled === 'boolean') {
          setIsDualWriteEnabled(data.dualWriteEnabled);
        }
        if (data.success && data.settings) {
          setIsTestMode(Boolean(data.settings.isTestMode));
          setRequireAdminApproval(Boolean(data.settings.requireAdminApproval));
        }
      }
    } catch (err: any) {
      console.warn('Error fetching db status:', err);
    } finally {
      setIsLoadingDb(false);
    }
  };

  const fetchInfrastructure = async (openModal = false) => {
    setIsLoadingInfra(true);
    try {
      const res = await fetch('/api/admin/infrastructure');
      if (res.ok) {
        const data = await res.json();
        setInfraInfo(data);
        if (openModal) {
          setShowInfraModal(true);
        }
      }
    } catch (err: any) {
      console.warn('Error fetching infrastructure:', err);
    } finally {
      setIsLoadingInfra(false);
    }
  };

  const fetchOrders = async () => {
    setIsLoadingOrders(true);
    try {
      const res = await fetch(`/api/orders?email=${encodeURIComponent(adminEmail)}&isAdmin=true`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.orders)) {
          setOrders(data.orders);
        }
      }
    } catch (err: any) {
      console.warn('Error fetching orders:', err);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const fetchCustomers = async () => {
    setIsLoadingCustomers(true);
    try {
      const res = await fetch('/api/customers');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.customers)) {
          setCustomers(data.customers);
        }
      }
    } catch (err: any) {
      console.warn('Error fetching customers:', err);
    } finally {
      setIsLoadingCustomers(false);
    }
  };

  const fetchIccidLookup = async (targetIccid?: string) => {
    const searchIccid = (targetIccid || lookupIccid || '').trim();
    if (!searchIccid) {
      setLookupError('Por favor ingresa un ICCID válido');
      return;
    }

    setIsLoadingLookup(true);
    setLookupError(null);
    setLookupResult(null);

    try {
      const emailParam = currentUser?.email || 'mgbravomalo@gmail.com';
      const response = await fetch(`/api/admin/iccid-lookup?adminEmail=${encodeURIComponent(emailParam)}&iccid=${encodeURIComponent(searchIccid)}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Error ${response.status} en la consulta`);
      }
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'No se pudo obtener información del ICCID');
      }
      setLookupResult(data);
    } catch (err: any) {
      console.error('Error lookup ICCID:', err);
      setLookupError(err.message || 'Error desconocido al consultar el ICCID');
    } finally {
      setIsLoadingLookup(false);
    }
  };

  const fetchPurchaseLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const emailParam = currentUser?.email || 'mgbravomalo@gmail.com';
      const res = await fetch(`/api/admin/purchase-logs?adminEmail=${encodeURIComponent(emailParam)}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.logs)) {
          setPurchaseLogs(data.logs);
        }
      }
    } catch (err) {
      console.warn('Error fetching purchase logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const fetchAllEsims = async () => {
    setIsLoadingEsims(true);
    try {
      const res = await fetch(`/api/admin/esims?adminEmail=${encodeURIComponent(adminEmail)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.esims)) {
          setEsims(data.esims);
        }
      }
    } catch (err: any) {
      console.warn('Error fetching eSIM inventory:', err);
    } finally {
      setIsLoadingEsims(false);
    }
  };

  const handleFetchCustomerDetails = async (customer: any) => {
    if (expandedCustomerId === customer.id) {
      setExpandedCustomerId(null);
      return;
    }

    setExpandedCustomerId(customer.id);
    if (customerEsims[customer.id]) return; // Already fetched

    setIsLoadingCustomerDetails(customer.id);
    try {
      const queryEmail = customer.email ? `?email=${encodeURIComponent(customer.email)}` : '';
      const res = await fetch(`/api/user/${encodeURIComponent(customer.id)}/esims${queryEmail}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.esims)) {
          setCustomerEsims(prev => ({ ...prev, [customer.id]: data.esims }));
        }
      }
    } catch (err) {
      console.warn('Error fetching customer esims:', err);
    } finally {
      setIsLoadingCustomerDetails(null);
    }
  };

  // --------------------------------------------------
  // CONFIGURATION ACTIONS
  // --------------------------------------------------

  const handleUpdateSettings = async (updates: { isTestMode?: boolean; requireAdminApproval?: boolean }) => {
    setIsSavingSettings(true);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('auth_token') || '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-admin-email': adminEmail,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/admin/settings?adminEmail=${encodeURIComponent(adminEmail)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...updates,
          adminEmail,
        }),
      });
      const data = await res.json();
      if (data.success && data.settings) {
        setIsTestMode(Boolean(data.settings.isTestMode));
        setRequireAdminApproval(Boolean(data.settings.requireAdminApproval));
        if (updates.isTestMode !== undefined) {
          showFeedback(
            data.settings.isTestMode
              ? '🧪 Modo de Pruebas (Simulado): Transacciones ficticias sin cargo real activadas.'
              : '🚀 Modo Producción Real: Solicitudes se enviarán al mayorista eSIM Access.'
          );
        }
        if (updates.requireAdminApproval !== undefined) {
          showFeedback(
            data.settings.requireAdminApproval
              ? '🔒 Aprobación Manual: Cada eSIM comprada requerirá aprobación administrativa para activarse.'
              : '⚡ Aprobación Directa: eSIMs se activan e instalan automáticamente en modo de prueba.'
          );
        }
      } else if (data.success) {
        if (updates.isTestMode !== undefined) {
          setIsTestMode(updates.isTestMode);
        }
        if (updates.requireAdminApproval !== undefined) {
          setRequireAdminApproval(updates.requireAdminApproval);
        }
      } else {
        showFeedback(data.error || 'No se pudieron actualizar los ajustes.', 'error');
      }
    } catch (err: any) {
      showFeedback(`Error: ${err.message}`, 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSeedCompatibleDevices = async () => {
    setActionInProgressId('seed_devices');
    try {
      const res = await fetch('/api/compatible-devices/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true, adminEmail }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback('📱 Base de datos de dispositivos compatibles re-sembrada con éxito.');
        fetchDbStatus();
      } else {
        showFeedback(data.error || 'Error al sembrar dispositivos.', 'error');
      }
    } catch (err: any) {
      showFeedback(`Error: ${err.message}`, 'error');
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleImportEsimAccessPackages = async () => {
    setActionInProgressId('sync_catalog');
    try {
      const res = await fetch('/api/esimaccess/sync-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback(`✅ Catálogo sincronizado: ${data.synchronizedCount || 3064} paquetes eSIM actualizados.`);
        fetchDbStatus();
      } else {
        showFeedback(data.error || 'Error al sincronizar catálogo con eSIM Access.', 'error');
      }
    } catch (err: any) {
      showFeedback(`Error: ${err.message}`, 'error');
    } finally {
      setActionInProgressId(null);
    }
  };

  // --------------------------------------------------
  // ORDER ACTIONS
  // --------------------------------------------------

  const handleApproveOrder = async (orderId: string, orderNumber: string) => {
    setActionInProgressId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail,
          forceWholesaler: !isTestMode,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showFeedback(`🎉 Pedido #${orderNumber} aprobado y eSIM emitida con éxito.`);
        
        // Update local orders list
        setOrders(prev =>
          prev.map(o => (o.id === orderId ? { ...o, status: 'approved', generatedEsim: data.esim } : o))
        );

        // Notify other windows/tabs in real-time
        realtimeSync.broadcastLocalApproval(data.order || { id: orderId }, data.esim);

        if (onRefreshGlobal) onRefreshGlobal();
      } else {
        showFeedback(data.error || 'Error al aprobar el pedido.', 'error');
      }
    } catch (err: any) {
      showFeedback(`Error: ${err.message}`, 'error');
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleRejectOrder = async (orderId: string, orderNumber: string, reason: string) => {
    const finalReason = reason.trim() || 'Rechazado manualmente en panel de pruebas';
    setActionInProgressId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail,
          reason: finalReason,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showFeedback(`🚫 Pedido #${orderNumber} rechazado con éxito.`);
        
        // Update local orders list
        setOrders(prev =>
          prev.map(o => (o.id === orderId ? { ...o, status: 'rejected', rejectionReason: finalReason } : o))
        );

        if (onRefreshGlobal) onRefreshGlobal();
      } else {
        showFeedback(data.error || 'Error al rechazar el pedido.', 'error');
      }
    } catch (err: any) {
      showFeedback(`Error: ${err.message}`, 'error');
    } finally {
      setActionInProgressId(null);
      setRejectingOrderId(null);
      setRejectionReasonInput('');
    }
  };

  const handleDeleteOrder = async (orderId: string, orderNumber: string) => {
    setActionInProgressId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}?adminEmail=${encodeURIComponent(adminEmail)}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        showFeedback(`🗑️ Pedido #${orderNumber} eliminado permanentemente.`);
        setOrders(prev => prev.filter(o => o.id !== orderId));
        if (onRefreshGlobal) onRefreshGlobal();
      } else {
        showFeedback(data.error || 'Error al eliminar el pedido.', 'error');
      }
    } catch (err: any) {
      showFeedback(`Error: ${err.message}`, 'error');
    } finally {
      setActionInProgressId(null);
      setConfirmingDeleteOrderId(null);
    }
  };

  // --------------------------------------------------
  // eSIM INVENTORY ACTIONS
  // --------------------------------------------------

  const handleDeleteEsim = async (esimId: string, iccid: string) => {
    setActionInProgressId(esimId);
    try {
      const res = await fetch(`/api/admin/esims/${iccid}?adminEmail=${encodeURIComponent(adminEmail)}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        showFeedback(`🗑️ eSIM ${iccid} eliminada con éxito del inventario.`);
        setEsims(prev => prev.filter(e => e.id !== esimId && e.iccid !== iccid));
        if (onRefreshGlobal) onRefreshGlobal();
      } else {
        showFeedback(data.error || 'Error al eliminar eSIM.', 'error');
      }
    } catch (err: any) {
      showFeedback(`Error: ${err.message}`, 'error');
    } finally {
      setActionInProgressId(null);
      setConfirmingDeleteEsimIccid(null);
    }
  };

  const handleClearAllEsims = async () => {
    setActionInProgressId('clear-all-esims');
    try {
      const res = await fetch(`/api/admin/esims-clear-all?adminEmail=${encodeURIComponent(adminEmail)}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        showFeedback('🗑️ Se ha vaciado todo el inventario de eSIMs y limpiado los perfiles de usuario.');
        setEsims([]);
        if (onRefreshGlobal) onRefreshGlobal();
      } else {
        showFeedback(data.error || 'Error al vaciar eSIMs.', 'error');
      }
    } catch (err: any) {
      showFeedback(`Error: ${err.message}`, 'error');
    } finally {
      setActionInProgressId(null);
      setConfirmingClearAllEsims(false);
    }
  };

  const handleSyncAllEsimStatuses = async () => {
    setActionInProgressId('sync-all-esims');
    try {
      const res = await fetch('/api/admin/esims/sync-all', {
        method: 'POST',
      });

      const data = await res.json();
      if (data.success) {
        showFeedback(`✅ ${data.message || 'Sincronización de eSIMs completada.'}`);
        await fetchAllEsims();
        if (onRefreshGlobal) onRefreshGlobal();
      } else {
        showFeedback(data.error || 'Error al sincronizar eSIMs.', 'error');
      }
    } catch (err: any) {
      showFeedback(`Error: ${err.message}`, 'error');
    } finally {
      setActionInProgressId(null);
    }
  };

  // --------------------------------------------------
  // CRON MAINTENANCE ACTIONS
  // --------------------------------------------------

  const handleRunMaintenanceCheck = async () => {
    setIsExecutingCron(true);
    setCronReport(null);
    try {
      const res = await fetch(`/api/notifications/run-consumption-check?adminEmail=${encodeURIComponent(adminEmail)}`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setCronReport(data);
        showFeedback('🔄 Ciclo de mantenimiento y monitoreo ejecutado con éxito.');
      } else {
        const data = await res.json();
        showFeedback(data.error || 'Error al ejecutar ciclo de consumo.', 'error');
      }
    } catch (err: any) {
      showFeedback(`Error: ${err.message}`, 'error');
    } finally {
      setIsExecutingCron(false);
    }
  };

  // --------------------------------------------------
  // PROVIDER AUDIT ACTIONS
  // --------------------------------------------------

  const fetchAuditData = async () => {
    setIsLoadingAudit(true);
    try {
      const res = await fetch(`/api/admin/audit-provider?adminEmail=${encodeURIComponent(adminEmail)}`);
      if (res.ok) {
        const data = await res.json();
        setAuditData(data);
        if (data.success) {
          showFeedback('📋 Auditoría con el proveedor sincronizada y cargada correctamente.');
        } else {
          showFeedback(data.error || 'Error al cargar auditoría.', 'error');
        }
      } else {
        try {
          const errData = await res.json();
          showFeedback(errData.error || 'Error al consultar auditoría con el proveedor.', 'error');
        } catch {
          showFeedback('Error al consultar auditoría con el proveedor.', 'error');
        }
      }
    } catch (err: any) {
      showFeedback(`Error: ${err.message}`, 'error');
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const handleUpdateEsimStatus = async (iccid: string, status: string) => {
    setUpdatingStatusIccid(iccid);
    try {
      const res = await fetch(`/api/admin/esims/${iccid}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminEmail }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback(`✅ Estado de la eSIM cambiada a "${status}" con éxito.`);
        if (activeSubTab === 'esims') fetchAllEsims();
        if (activeSubTab === 'audit') fetchAuditData();
        if (onRefreshGlobal) onRefreshGlobal();
      } else {
        showFeedback(data.error || 'Error al cambiar estado de la eSIM.', 'error');
      }
    } catch (err: any) {
      showFeedback(`Error: ${err.message}`, 'error');
    } finally {
      setUpdatingStatusIccid(null);
    }
  };

  // --------------------------------------------------
  // INITIAL LOAD & SUB-TAB HANDLERS
  // --------------------------------------------------

  useEffect(() => {
    fetchDbStatus();
    fetchInfrastructure();
  }, []);

  useEffect(() => {
    if (activeSubTab === 'orders') fetchOrders();
    if (activeSubTab === 'customers') fetchCustomers();
    if (activeSubTab === 'esims') fetchAllEsims();
    if (activeSubTab === 'audit') fetchAuditData();
  }, [activeSubTab]);

  // Filters & Searches
  const filteredOrders = orders.filter(o => {
    const matchesFilter = orderFilter === 'all' || o.status === orderFilter;
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.userEmail.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.userName.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.country.toLowerCase().includes(orderSearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.email.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.phone && c.phone.includes(customerSearch))
  );

  const filteredEsims = esims.filter(e => {
    const matchesSearch =
      e.iccid.includes(esimSearch) ||
      e.userEmail.toLowerCase().includes(esimSearch.toLowerCase()) ||
      e.country.toLowerCase().includes(esimSearch.toLowerCase());
    const matchesFilter =
      esimFilter === 'all' ||
      (esimFilter === 'real' && e.provisionSource === 'esimaccess_api') ||
      (esimFilter === 'simulated' && e.provisionSource !== 'esimaccess_api');
    return matchesSearch && matchesFilter;
  });

  const salePriceUSD = typeof selectedEsimForDetails?.pricePaid === 'number' ? selectedEsimForDetails.pricePaid : (selectedEsimForDetails?.salePriceEUR || 0);
  const costPriceUSD = typeof selectedEsimForDetails?.costPriceEUR === 'number' ? selectedEsimForDetails.costPriceEUR : 0;
  const profitUSD = typeof selectedEsimForDetails?.profitEUR === 'number' ? selectedEsimForDetails.profitEUR : (salePriceUSD - costPriceUSD);

  const renderEsimStatusBadge = (status: string, size: 'sm' | 'md' = 'sm') => {
    const norm = (status || '').toLowerCase().trim();
    
    if (norm === 'active' || norm === 'activa') {
      return (
        <span className={`inline-flex items-center gap-1.5 font-bold uppercase rounded-full tracking-wider ${size === 'sm' ? 'text-[9px] px-2.5 py-0.5' : 'text-[10px] px-3 py-1'} bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/80 shadow-3xs`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Activa</span>
        </span>
      );
    }
    
    if (norm === 'ready_to_install' || norm === 'got_resource' || norm === 'nueva qr' || norm === 'para instalar') {
      return (
        <span className={`inline-flex items-center gap-1.5 font-bold uppercase rounded-full tracking-wider ${size === 'sm' ? 'text-[9px] px-2.5 py-0.5' : 'text-[10px] px-3 py-1'} bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 border border-sky-300 dark:border-sky-700/80 shadow-3xs`}>
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
          <span>Nueva QR / Lista</span>
        </span>
      );
    }
    
    if (norm === 'expired' || norm === 'used_expired' || norm === 'expirada') {
      return (
        <span className={`inline-flex items-center gap-1.5 font-bold uppercase rounded-full tracking-wider ${size === 'sm' ? 'text-[9px] px-2.5 py-0.5' : 'text-[10px] px-3 py-1'} bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-300 dark:border-purple-700/80 shadow-3xs`}>
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
          <span>Expirada</span>
        </span>
      );
    }
    
    if (norm === 'canceled' || norm === 'cancel' || norm === 'cancelada') {
      return (
        <span className={`inline-flex items-center gap-1.5 font-bold uppercase rounded-full tracking-wider ${size === 'sm' ? 'text-[9px] px-2.5 py-0.5' : 'text-[10px] px-3 py-1'} bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300 dark:border-rose-700/80 shadow-3xs`}>
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          <span>Cancelada</span>
        </span>
      );
    }

    if (norm === 'suspended' || norm === 'disabled' || norm === 'suspendida') {
      return (
        <span className={`inline-flex items-center gap-1.5 font-bold uppercase rounded-full tracking-wider ${size === 'sm' ? 'text-[9px] px-2.5 py-0.5' : 'text-[10px] px-3 py-1'} bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-700/80 shadow-3xs`}>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          <span>Suspendida</span>
        </span>
      );
    }
    
    return (
      <span className={`inline-flex items-center gap-1.5 font-bold uppercase rounded-full ${size === 'sm' ? 'text-[9px] px-2.5 py-0.5' : 'text-[10px] px-3 py-1'} bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700`}>
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
        <span>{status || 'Desconocido'}</span>
      </span>
    );
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-900/40 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 md:p-6 shadow-xs min-h-[600px] flex flex-col space-y-6">
      
      {/* Upper Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center justify-center font-bold">
            <Shield className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              Panel de Control Administrativo
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Operaciones del sistema, base de datos MongoDB Atlas, auditoría de transacciones y cron de alertas.
            </p>
          </div>
        </div>

        {/* Global stats summary & Copiloto IA button */}
        <div className="flex items-center gap-3 flex-wrap self-start sm:self-auto">
          {onOpenAiDiagnosticModal && (
            <button
              onClick={onOpenAiDiagnosticModal}
              className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all active:scale-95"
              title="Abrir Copiloto IA de Diagnóstico"
            >
              <Sparkles className="w-3.5 h-3.5 fill-current" />
              <span>Copiloto IA Diagnóstico</span>
            </button>
          )}

          {dbStatus?.database && (
            <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 px-3.5 rounded-2xl shadow-2xs">
              <span className={`w-2 h-2 rounded-full ${dbStatus.isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <div className="text-left font-mono">
                <span className="text-[9px] text-slate-400 block uppercase font-sans">Base de datos</span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {dbStatus.isConnected ? dbStatus.databaseName : 'No conectada'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Feedback Toast / Alert */}
      {feedback && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-3 border ${
          feedback.type === 'success'
            ? 'bg-emerald-50/95 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
            : 'bg-rose-50/95 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
        } animate-fade-in`}>
          {feedback.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <AlertTriangle className="w-4 h-4 text-rose-500" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-slate-200 dark:border-slate-800 pb-2.5">
        <button
          onClick={() => setActiveSubTab('status')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeSubTab === 'status'
              ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Configuración &amp; DB</span>
        </button>

        <button
          onClick={() => setActiveSubTab('orders')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 relative ${
            activeSubTab === 'orders'
              ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Gestión de Pedidos</span>
          {pendingOrdersCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black flex items-center justify-center animate-pulse shadow-sm">
              {pendingOrdersCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('customers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeSubTab === 'customers'
              ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Directorio de Clientes</span>
        </button>

        <button
          onClick={() => setActiveSubTab('esims')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeSubTab === 'esims'
              ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Wifi className="w-4 h-4" />
          <span>Inventario de eSIMs</span>
        </button>

        <button
          onClick={() => setActiveSubTab('cron')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeSubTab === 'cron'
              ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>Ciclo Cron &amp; Alertas</span>
        </button>

        <button
          onClick={() => setActiveSubTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeSubTab === 'audit'
              ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Shield className="w-4 h-4 text-purple-500" />
          <span>Auditoría de Proveedor</span>
        </button>

        <button
          onClick={() => setActiveSubTab('lookup')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeSubTab === 'lookup'
              ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Search className="w-4 h-4 text-amber-500" />
          <span>Consulta Unificada ICCID</span>
        </button>

        <button
          onClick={() => {
            setActiveSubTab('logs');
            fetchPurchaseLogs();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeSubTab === 'logs'
              ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <FileText className="w-4 h-4 text-emerald-500" />
          <span>Logs de Compra &amp; Doble Check</span>
        </button>
      </div>

      {/* -------------------------------------------------- */}
      {/* SUB-TAB: Configuración & DB */}
      {/* -------------------------------------------------- */}
      {activeSubTab === 'status' && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            
            {/* Connection Diagnostics Card */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-500" />
                <span>Estado de la Infraestructura</span>
              </h2>
              
              {isLoadingDb ? (
                <div className="py-8 text-center flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 text-emerald-500 animate-spin" />
                  <span className="text-xs text-slate-500 font-medium">Diagnosticando conexión a Atlas...</span>
                </div>
              ) : dbStatus ? (
                <div className="space-y-4">
                  {/* Database Switcher Segmented Slider */}
                  <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Database className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            Base de Datos Activa en Uso
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Desliza para alternar la fuente de datos entre MongoDB Atlas y Cloudflare D1
                        </p>
                      </div>

                      {/* Sliding Toggle Control */}
                      <div className="inline-flex p-1 bg-slate-200/90 dark:bg-slate-950 rounded-xl border border-slate-300 dark:border-slate-800 select-none shadow-inner shrink-0">
                        <button
                          type="button"
                          disabled={isSwitchingDb}
                          onClick={() => handleSwitchDatabase('mongo')}
                          className={`relative z-10 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                            activeDbProvider === 'mongo'
                              ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${dbStatus?.availableProviders?.mongo ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          <span>MongoDB Atlas</span>
                        </button>

                        <button
                          type="button"
                          disabled={isSwitchingDb}
                          onClick={() => handleSwitchDatabase('d1')}
                          className={`relative z-10 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                            activeDbProvider === 'd1'
                              ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${dbStatus?.availableProviders?.d1 ? 'bg-amber-500' : 'bg-slate-400'}`} />
                          <span>Cloudflare D1</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60">
                      <span className="text-slate-500 dark:text-slate-400">
                        Fuente activa:{' '}
                        <strong className="text-slate-800 dark:text-slate-200 font-mono">
                          {activeDbProvider === 'mongo' ? 'MongoDB Atlas (plan.esim_packages)' : 'Cloudflare D1 (esim_plans)'}
                        </strong>
                      </span>
                      {isSwitchingDb ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold animate-pulse text-[11px]">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Cambiando de base de datos...
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">
                          Cambio en caliente instantáneo
                        </span>
                      )}
                    </div>

                    {/* Dual-Write vs Single Database Mode Toggle */}
                    <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              ⚡ Sincronización &amp; Modo de Escritura
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isDualWriteEnabled 
                                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                            }`}>
                              {isDualWriteEnabled ? 'Dual (Ambas BDs)' : 'Solo BD Activa'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {isDualWriteEnabled
                              ? 'Cada orden o cliente se guarda en MongoDB Atlas y Cloudflare D1 simultáneamente (Ideal para Vercel).'
                              : 'Actualizaciones ÚNICAMENTE en la base de datos activa. No abre sockets hacia Mongo (Ideal para Cloudflare Workers / Edge).'}
                          </p>
                        </div>

                        {/* Toggle Pill */}
                        <div className="inline-flex p-1 bg-slate-200/90 dark:bg-slate-950 rounded-xl border border-slate-300 dark:border-slate-800 select-none shadow-inner shrink-0">
                          <button
                            type="button"
                            disabled={isTogglingDualWrite}
                            onClick={() => handleToggleDualWrite(false)}
                            className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                              !isDualWriteEnabled
                                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                            title="Solo escribe en la base de datos activa. Seguro para entornos Cloudflare Workers"
                          >
                            <Shield className="w-3.5 h-3.5" />
                            <span>Solo Activa</span>
                          </button>

                          <button
                            type="button"
                            disabled={isTogglingDualWrite}
                            onClick={() => handleToggleDualWrite(true)}
                            className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                              isDualWriteEnabled
                                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                            title="Escribe simultáneamente en MongoDB Atlas y Cloudflare D1"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isTogglingDualWrite ? 'animate-spin' : ''}`} />
                            <span>Ambas (Dual)</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Live Verification Trigger */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                      <div className="space-y-0.5">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                          🔬 Auditor de Origen en Tiempo Real
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                          Ejecuta un ping directo al motor seleccionado y valida la cabecera HTTP <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-900 text-[9px]">X-Database-Engine</code>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleVerifyDatabaseOrigin}
                        disabled={isLoadingProof}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 shrink-0"
                      >
                        {isLoadingProof ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Consultando motor...</span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-3.5 h-3.5" />
                            <span>Comprobar Origen en Vivo</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Live Proof Result Card */}
                    {dbProofData && (
                      <div className="p-3.5 bg-white dark:bg-slate-950 rounded-xl border-2 border-emerald-500/40 dark:border-emerald-500/30 space-y-2.5 animate-fade-in text-xs font-mono">
                        <div className="flex items-center justify-between border-b border-slate-150 dark:border-slate-800 pb-2">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-sans">
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                            Certificado de Consulta en Vivo
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Latencia: <strong>{dbProofData.latencyMs} ms</strong>
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase">Motor de Datos:</span>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {dbProofData.engine}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase">Tabla / Colección Física:</span>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {dbProofData.tableOrCollection}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase">Total Planes Verificados:</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              {dbProofData.stats?.totalPlans} paquetes
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase">Total Destinos en Motor:</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              {dbProofData.stats?.totalDestinations} países
                            </span>
                          </div>
                        </div>

                        <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[10px] space-y-1">
                          <span className="text-slate-400 block uppercase text-[9px]">Consulta Ejecutada en Tiempo Real:</span>
                          <code className="block p-1.5 bg-slate-100 dark:bg-slate-900 rounded text-slate-800 dark:text-slate-200 truncate">
                            {dbProofData.executedQuery}
                          </code>
                        </div>

                        {dbProofData.sampleRecord && (
                          <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[10px] space-y-1">
                            <span className="text-slate-400 block uppercase text-[9px]">Muestra de Registro Retornado:</span>
                            <pre className="p-2 bg-slate-100 dark:bg-slate-900 rounded text-[10px] text-slate-800 dark:text-slate-200 overflow-x-auto max-h-24">
                              {JSON.stringify(dbProofData.sampleRecord, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-1.5 border border-slate-150 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-mono">ESTADO</span>
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${dbStatus.isConnected ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase">
                          {dbStatus.isConnected ? 'CONECTADO' : 'FALLBACK LOCAL (OFFLINE)'}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-1.5 border border-slate-150 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-mono">HOST DE BASE DE DATOS</span>
                      <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 block truncate">
                        {dbStatus.host || 'Catálogo estático de reserva'}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-1.5 border border-slate-150 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-mono">PLANES ACTIVOS (MAPPED)</span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        {dbStatus.totalPlans || 22} paquetes eSIM
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-1.5 border border-slate-150 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-mono">COLECCIÓN ACTIVA</span>
                      <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-100">
                        {dbStatus.diagnostics?.activeCollection || 'plans'}
                      </span>
                    </div>
                    
                    {dbStatus.diagnostics?.lastError && (
                      <div className="col-span-1 md:col-span-2 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 rounded-xl text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Advertencia de diagnóstico</span>
                        </div>
                        <p className="font-mono text-[11px] leading-tight">{dbStatus.diagnostics.lastError}</p>
                      </div>
                    )}
                    
                    <div className="col-span-1 md:col-span-2 text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                      💡 <strong>Funcionamiento Autónomo Híbrido:</strong> Si la base de datos se desconecta, la app continúa operando sin caídas utilizando los planes y destinos por defecto cargados en caché.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <button onClick={fetchDbStatus} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">
                    Reintentar Diagnóstico
                  </button>
                </div>
              )}
            </div>

            {/* Quick Actions Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-500" />
                <span>Acciones Rápidas</span>
              </h2>

              <div className="space-y-3">
                {confirmingSync ? (
                  <div className="flex gap-1.5 w-full animate-fade-in">
                    <button
                      onClick={() => setConfirmingSync(false)}
                      className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold bg-white dark:bg-slate-800"
                    >
                      No
                    </button>
                    <button
                      disabled={actionInProgressId !== null}
                      onClick={() => {
                        setConfirmingSync(false);
                        handleImportEsimAccessPackages();
                      }}
                      className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                    >
                      Sí, Sincronizar
                    </button>
                  </div>
                ) : (
                  <button
                    disabled={actionInProgressId !== null || !dbStatus?.isConnected}
                    onClick={() => setConfirmingSync(true)}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-850 text-white dark:bg-emerald-600 dark:hover:bg-emerald-500 text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-2xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${actionInProgressId === 'sync_catalog' ? 'animate-spin' : ''}`} />
                    <span>Sincronizar Mayorista API</span>
                  </button>
                )}

                {confirmingSeed ? (
                  <div className="flex gap-1.5 w-full animate-fade-in">
                    <button
                      onClick={() => setConfirmingSeed(false)}
                      className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold bg-white dark:bg-slate-800"
                    >
                      No
                    </button>
                    <button
                      disabled={actionInProgressId !== null}
                      onClick={() => {
                        setConfirmingSeed(false);
                        handleSeedCompatibleDevices();
                      }}
                      className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                    >
                      Sí, Sembrar
                    </button>
                  </div>
                ) : (
                  <button
                    disabled={actionInProgressId !== null || !dbStatus?.isConnected}
                    onClick={() => setConfirmingSeed(true)}
                    className="w-full py-2.5 px-4 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Sembrar Dispositivos Default</span>
                  </button>
                )}

                <button
                  onClick={fetchDbStatus}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/40 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center justify-center gap-2 transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDb ? 'animate-spin' : ''}`} />
                  <span>Recargar Estado de Red</span>
                </button>

                {/* Cloud Infrastructure Identifier Button */}
                <button
                  onClick={() => fetchInfrastructure(true)}
                  className="w-full py-2.5 px-3.5 rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/80 hover:bg-sky-100/80 dark:bg-sky-950/30 dark:hover:bg-sky-900/40 text-sky-900 dark:text-sky-200 text-xs font-bold flex items-center justify-between transition-all shadow-2xs group cursor-pointer"
                  title="Detectar si estás conectado en Google Cloud Run, Azure o Vercel"
                >
                  <div className="flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-sky-600 dark:text-sky-400 group-hover:scale-110 transition-transform" />
                    <span>¿En qué Nube estoy?</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1.5 shadow-2xs ${
                    infraInfo?.provider === 'google_cloud_run'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                      : infraInfo?.provider === 'azure_app_service'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                      : infraInfo?.provider === 'vercel'
                      ? 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300 border border-violet-300 dark:border-violet-700'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                  }`}>
                    {isLoadingInfra ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    )}
                    <span>{infraInfo?.providerName ? (infraInfo.provider === 'google_cloud_run' ? 'Google Cloud' : infraInfo.provider === 'azure_app_service' ? 'Azure Cloud' : infraInfo.provider === 'vercel' ? 'Vercel Edge' : 'AI Studio') : 'Detectar Nube'}</span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* System Mode Configurations Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Settings className="w-4 h-4 text-emerald-500" />
              <span>Configuración del Entorno Transaccional</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              
              {/* Option 1: Sandbox / Wholesaler Mode */}
              <div className="bg-slate-50/60 dark:bg-slate-800/30 p-4 border border-slate-150 dark:border-slate-800 rounded-2xl space-y-4 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${isTestMode ? 'bg-amber-500' : 'bg-red-500 animate-pulse'}`} />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      {isTestMode ? 'Simulación Integrada Activa' : 'Entorno de Producción Real'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Si está activo, las compras de eSIMs generarán perfiles simulados, protegiendo tu balance y fondos del mayorista. Si está desactivado, cada orden aprobada enviará una solicitud de compra real a eSIM Access.
                  </p>
                </div>

                <button
                  disabled={isSavingSettings}
                  onClick={() => handleUpdateSettings({ isTestMode: !isTestMode })}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs shadow-2xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50 ${
                    isTestMode
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20'
                  }`}
                >
                  {isSavingSettings ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando en Base de Datos...</span>
                    </>
                  ) : (
                    <span>{isTestMode ? '⚡ Desactivar Modo Simulación (Pasar a Producción)' : '🛡️ Activar Modo Simulación (Proteger Balance)'}</span>
                  )}
                </button>
              </div>

              {/* Option 2: Require manual approval */}
              <div className="bg-slate-50/60 dark:bg-slate-800/30 p-4 border border-slate-150 dark:border-slate-800 rounded-2xl space-y-4 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      Aprobación de Órdenes: {requireAdminApproval ? 'Aprobación Manual Requerida' : 'Aprobación Directa Automática'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Si está activo, las compras pasan a estado "pendiente" para que el administrador las autorice de forma manual desde el panel. Si está desactivado, las compras se emiten de inmediato sin requerir aprobación.
                  </p>
                </div>

                <button
                  disabled={isSavingSettings}
                  onClick={() => handleUpdateSettings({ requireAdminApproval: !requireAdminApproval })}
                  className="w-full py-2 px-4 rounded-xl bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 text-xs font-bold transition-colors"
                >
                  {requireAdminApproval ? 'Activar Aprobación Automática Directa' : 'Exigir Aprobación Manual Admin'}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* SUB-TAB: Gestión de Pedidos */}
      {/* -------------------------------------------------- */}
      {activeSubTab === 'orders' && (
        <div className="space-y-4 animate-fade-in">
          
          {/* Filters & search row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-2xs">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Buscar pedido por #, cliente, email o país..."
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                className="w-full bg-transparent border-0 focus:ring-0 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-[11px] font-bold text-slate-400 uppercase hidden sm:inline">Filtro:</span>
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl gap-1">
                {(['all', 'pending_approval', 'approved', 'rejected'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setOrderFilter(st)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      orderFilter === st
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-3xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {st === 'all' && 'Todos'}
                    {st === 'pending_approval' && 'Pendientes'}
                    {st === 'approved' && 'Aprobados'}
                    {st === 'rejected' && 'Rechazados'}
                  </button>
                ))}
              </div>

              <button
                onClick={fetchOrders}
                disabled={isLoadingOrders}
                className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOrders ? 'animate-spin text-emerald-500' : 'text-slate-500'}`} />
              </button>
            </div>
          </div>

          {/* Orders List / Records */}
          {isLoadingOrders ? (
            <div className="py-24 text-center">
              <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-2" />
              <span className="text-xs text-slate-500 font-medium">Buscando listado de pedidos...</span>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-xs">
              <p className="text-xs text-slate-500">No se encontraron pedidos con los criterios actuales.</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-3xs space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800/60">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-extrabold text-slate-900 dark:text-white">
                        {order.orderNumber}
                      </span>
                      <span className="text-slate-400">•</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {order.createdAt ? new Date(order.createdAt).toLocaleString() : 'Fecha no registrada'}
                      </span>
                      {order.isTestMode && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
                          Simulado (Prueba)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {order.status === 'pending_approval' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          <Clock className="w-3 h-3 text-amber-600 animate-pulse" />
                          Pendiente de aprobación
                        </span>
                      )}
                      {order.status === 'approved' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle className="w-3 h-3 text-emerald-600" />
                          Aprobado &amp; Generado
                        </span>
                      )}
                      {order.status === 'rejected' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                          <XCircle className="w-3 h-3 text-rose-600" />
                          Rechazado
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Order Details Body */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs leading-normal">
                    <div className="space-y-1">
                      <span className="text-slate-400 block text-[10px] uppercase font-mono">CLIENTE</span>
                      <div className="font-bold text-slate-800 dark:text-slate-100">
                        {order.userName}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 font-mono text-[11px] block truncate">
                        {order.userEmail}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-slate-400 block text-[10px] uppercase font-mono">PAQUETE eSIM</span>
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
                        <CountryFlag flag={order.flag} countryCode={order.countryCode} countryName={order.country} size="xs" />
                        <span>{order.country}</span>
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 block text-[11px]">
                        {order.planName} ({order.totalDataGB} GB • {order.durationDays} Días)
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-slate-400 block text-[10px] uppercase font-mono">FINANZAS &amp; PAGO</span>
                      <div className="font-bold text-emerald-700 dark:text-emerald-400">
                        Cobrado: ${Number(order.pricePaid).toFixed(2)} USD
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Método: {order.paymentMethod === 'wallet' ? 'Monedero Wappa' : 'Tarjeta de Crédito / GPay'}
                      </div>
                    </div>
                  </div>

                  {order.rejectionReason && (
                    <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300 rounded-xl text-xs font-medium">
                      🚫 <strong>Motivo del rechazo:</strong> {order.rejectionReason}
                    </div>
                  )}

                  {order.generatedEsim?.iccid && (
                    <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 rounded-xl text-[11px] font-mono leading-tight space-y-0.5">
                      <div className="font-bold">✅ eSIM Generada:</div>
                      <div>ICCID: {order.generatedEsim.iccid}</div>
                      <div>Servidor SM-DP+: {order.generatedEsim.smdpAddress}</div>
                      <div>Código de activación: {order.generatedEsim.activationCode}</div>
                    </div>
                  )}

                  {/* Actions buttons */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/40">
                    
                    {/* Deletion inline confirm */}
                    {confirmingDeleteOrderId === order.id ? (
                      <div className="flex items-center gap-2 p-1.5 px-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-800 dark:text-rose-300 animate-fade-in mr-auto">
                        <span className="text-[11px] font-bold">¿Eliminar registro permanentemente?</span>
                        <button
                          onClick={() => setConfirmingDeleteOrderId(null)}
                          className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
                        >
                          No
                        </button>
                        <button
                          disabled={actionInProgressId !== null}
                          onClick={() => handleDeleteOrder(order.id, order.orderNumber)}
                          className="px-2.5 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold"
                        >
                          Sí, eliminar
                        </button>
                      </div>
                    ) : (
                      <button
                        disabled={actionInProgressId !== null}
                        onClick={() => setConfirmingDeleteOrderId(order.id)}
                        className="p-1.5 px-2.5 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-xs font-bold transition-all mr-auto flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Eliminar Pedido</span>
                      </button>
                    )}

                    {/* Rejection / Approval actions */}
                    {order.status === 'pending_approval' && (
                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        
                        {rejectingOrderId === order.id ? (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full animate-fade-in">
                            <input
                              type="text"
                              placeholder="Motivo del rechazo..."
                              value={rejectionReasonInput}
                              onChange={(e) => setRejectionReasonInput(e.target.value)}
                              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 px-2.5 text-xs text-slate-800 dark:text-slate-100 w-full sm:w-48 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              autoFocus
                            />
                            <div className="flex gap-1.5 shrink-0 justify-end">
                              <button
                                onClick={() => {
                                  setRejectingOrderId(null);
                                  setRejectionReasonInput('');
                                }}
                                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                              >
                                Cancelar
                              </button>
                              <button
                                disabled={actionInProgressId !== null}
                                onClick={() => handleRejectOrder(order.id, order.orderNumber, rejectionReasonInput)}
                                className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                              >
                                Rechazar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              disabled={actionInProgressId !== null}
                              onClick={() => {
                                setRejectingOrderId(order.id);
                                setRejectionReasonInput('Transacción de prueba rechazada por el administrador');
                              }}
                              className="px-3.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold transition-all flex items-center gap-1 shrink-0"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Rechazar</span>
                            </button>

                            <button
                              disabled={actionInProgressId !== null}
                              onClick={() => handleApproveOrder(order.id, order.orderNumber)}
                              className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-bold shadow-2xs transition-all flex items-center gap-1 shrink-0"
                            >
                              {actionInProgressId === order.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircle className="w-3.5 h-3.5" />
                              )}
                              <span>Aprobar &amp; Emitir eSIM</span>
                            </button>
                          </>
                        )}

                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* SUB-TAB: Directorio de Clientes */}
      {/* -------------------------------------------------- */}
      {activeSubTab === 'customers' && (
        <div className="space-y-4 animate-fade-in">
          
          {/* Search Row */}
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-2xs">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Buscar cliente por nombre o correo electrónico..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="w-full bg-transparent border-0 focus:ring-0 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400"
            />
            <button
              onClick={fetchCustomers}
              disabled={isLoadingCustomers}
              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCustomers ? 'animate-spin text-emerald-500' : 'text-slate-500'}`} />
            </button>
          </div>

          {/* Customers list */}
          {isLoadingCustomers ? (
            <div className="py-24 text-center">
              <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-2" />
              <span className="text-xs text-slate-500 font-medium">Buscando listado de clientes...</span>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-xs">
              <p className="text-xs text-slate-500">No se encontraron clientes registrados.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCustomers.map((customer) => {
                const isExpanded = expandedCustomerId === customer.id;
                const details = customerEsims[customer.id] || [];

                return (
                  <div
                    key={customer.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-all shadow-3xs"
                  >
                    
                    {/* Customer Row Header */}
                    <div
                      onClick={() => handleFetchCustomerDetails(customer)}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={customer.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                          alt={customer.name}
                          className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                        />
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            {customer.name}
                            {customer.email === currentUser?.email && (
                              <span className="text-[10px] font-black uppercase tracking-wider px-1.5 bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded border border-purple-200 dark:border-purple-800">
                                Tú
                              </span>
                            )}
                          </h3>
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                            {customer.email}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-mono self-start sm:self-auto">
                        <div className="text-right">
                          <span className="text-[9px] text-slate-400 uppercase font-sans block">Registro</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {customer.createdAt || 'Sin fecha'}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-[9px] text-slate-400 uppercase font-sans block">Saldo Monedero</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            ${Number(customer.walletBalanceEUR || 0).toFixed(2)}
                          </span>
                        </div>

                        <div className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </div>
                      </div>
                    </div>

                    {/* Customer Row Expanded Detail */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 dark:border-slate-800/80 p-4 bg-slate-50/50 dark:bg-slate-900/30 space-y-4">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Wifi className="w-4 h-4 text-emerald-500" />
                          <span>eSIMs Adquiridas e Historial ({isLoadingCustomerDetails === customer.id ? 'Sincronizando...' : details.length})</span>
                        </h4>

                        {isLoadingCustomerDetails === customer.id ? (
                          <div className="py-6 text-center">
                            <RefreshCw className="w-6 h-6 text-emerald-500 animate-spin mx-auto" />
                          </div>
                        ) : details.length === 0 ? (
                          <p className="text-xs text-slate-500 italic pl-5">Este cliente no posee eSIMs compradas en la base de datos.</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pl-5">
                            {details.map((esim) => (
                              <div
                                key={esim.id || esim.iccid}
                                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-3xs space-y-2 text-xs"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 font-bold">
                                    <CountryFlag flag={esim.flag} countryCode={esim.countryCode} countryName={esim.country} size="xs" />
                                    <span>{esim.country}</span>
                                  </div>
                                  {renderEsimStatusBadge(esim.status, 'sm')}
                                </div>

                                <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5 leading-normal">
                                  <div>Plan: {esim.planName}</div>
                                  <div>ICCID: <span className="font-bold text-slate-800 dark:text-slate-200">{esim.iccid}</span></div>
                                  <div>Datos: {esim.usedDataGB?.toFixed(2) || '0.00'} GB / {esim.totalDataGB} GB</div>
                                  <div>Compra: {esim.purchaseDate}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* SUB-TAB: Inventario de eSIMs */}
      {/* -------------------------------------------------- */}
      {activeSubTab === 'esims' && (
        <div className="space-y-4 animate-fade-in">
          
          {/* Filters & search row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-2xs">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Buscar eSIM global por ICCID, email del dueño o país..."
                value={esimSearch}
                onChange={(e) => setEsimSearch(e.target.value)}
                className="w-full bg-transparent border-0 focus:ring-0 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-[11px] font-bold text-slate-400 uppercase hidden sm:inline">Origen:</span>
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl gap-1">
                {(['all', 'real', 'simulated'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setEsimFilter(st)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      esimFilter === st
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-3xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {st === 'all' && 'Todas'}
                    {st === 'real' && 'eSIM Access'}
                    {st === 'simulated' && 'Simuladas'}
                  </button>
                ))}
              </div>

              <button
                onClick={fetchAllEsims}
                disabled={isLoadingEsims}
                className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                title="Actualizar lista local"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingEsims ? 'animate-spin text-emerald-500' : 'text-slate-500'}`} />
              </button>

              <button
                onClick={handleSyncAllEsimStatuses}
                disabled={actionInProgressId !== null}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300 text-xs font-bold shrink-0 flex items-center gap-1.5"
                title="Sincronizar consumos y estados con eSIM Access en tiempo real"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${actionInProgressId === 'sync-all-esims' ? 'animate-spin text-emerald-500' : 'text-slate-500'}`} />
                <span className="hidden sm:inline">Sincronizar eSIMs</span>
              </button>

              {confirmingClearAllEsims ? (
                <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/20 p-1 rounded-xl border border-rose-200 dark:border-rose-800/60 shrink-0">
                  <span className="text-[10px] text-rose-700 dark:text-rose-300 font-bold px-1.5">¿Vaciar TODO?</span>
                  <button
                    onClick={() => setConfirmingClearAllEsims(false)}
                    className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] font-bold"
                  >
                    No
                  </button>
                  <button
                    onClick={handleClearAllEsims}
                    disabled={actionInProgressId !== null}
                    className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold"
                  >
                    Sí, vaciar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingClearAllEsims(true)}
                  className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs font-bold shrink-0 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Limpiar Todo</span>
                </button>
              )}
            </div>
          </div>

          {/* eSIM Grid Inventory */}
          {isLoadingEsims ? (
            <div className="py-24 text-center">
              <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-2" />
              <span className="text-xs text-slate-500 font-medium">Leyendo inventario de eSIMs generadas...</span>
            </div>
          ) : filteredEsims.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-xs">
              <p className="text-xs text-slate-500">No se encontraron eSIMs en el inventario.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEsims.map((esim) => {
                const percent = esim.isUnlimited
                  ? 100
                  : Math.max(0, Math.min(100, Math.round(((esim.totalDataGB - esim.usedDataGB) / esim.totalDataGB) * 100)));

                return (
                  <div
                    key={esim.iccid || esim.id}
                    onClick={() => setSelectedEsimForDetails(esim)}
                    className="cursor-pointer bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-3xs space-y-3.5 hover:border-emerald-500 dark:hover:border-emerald-400 hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold text-xs">
                          <CountryFlag flag={esim.flag} countryCode={esim.countryCode} countryName={esim.country} size="xs" />
                          <span>{esim.country}</span>
                        </div>

                        {renderEsimStatusBadge(esim.status, 'sm')}
                      </div>

                      <div className="text-[11px] text-slate-500 font-mono block truncate flex items-center justify-between gap-1.5">
                        <span>Dueño: <strong className="text-slate-800 dark:text-slate-200">{esim.userEmail}</strong></span>
                        {esim.provisionSource === 'esimaccess_api' || (esim.iccid && esim.iccid.startsWith('89') && !esim.isTestMode) ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-extrabold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 shrink-0">
                            <Zap className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                            <span>eSIM Access Real</span>
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700/60 shrink-0">
                            Simulada
                          </span>
                        )}
                      </div>

                      <div className="bg-slate-55 dark:bg-slate-800/40 p-2 rounded-xl text-[10px] font-mono leading-tight space-y-0.5 border border-slate-100 dark:border-slate-800/60">
                        <div>ICCID: {esim.iccid}</div>
                        <div>SMDP: {esim.smdpAddress}</div>
                        <div>Operador: <span className="font-semibold text-slate-800 dark:text-slate-200">{esim.operator}</span></div>
                        <div>APN: <span className="text-emerald-600 dark:text-emerald-400 font-bold">{esim.apn || 'globaldata'}</span></div>
                        <div>Compra: {esim.purchaseDate}</div>
                      </div>

                      {/* Progress bar */}
                      {!esim.isUnlimited && (
                        <div className="space-y-1 pt-1.5">
                          <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                            <span>RESTRANTE: {percent}%</span>
                            <span>{esim.usedDataGB?.toFixed(2)} / {esim.totalDataGB} GB</span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${percent}%` }}
                              className={`h-full rounded-full ${
                                percent < 20 ? 'bg-rose-500' : percent < 50 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {confirmingDeleteEsimIccid === esim.iccid ? (
                      <div className="flex gap-2 w-full animate-fade-in pt-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmingDeleteEsimIccid(null); }}
                          className="flex-1 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold bg-white dark:bg-slate-900"
                        >
                          No
                        </button>
                        <button
                          disabled={actionInProgressId !== null}
                          onClick={(e) => { e.stopPropagation(); handleDeleteEsim(esim.id, esim.iccid); }}
                          className="flex-1 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                        >
                          Sí, Eliminar
                        </button>
                      </div>
                    ) : (
                      <button
                        disabled={actionInProgressId !== null}
                        onClick={(e) => { e.stopPropagation(); setConfirmingDeleteEsimIccid(esim.iccid); }}
                        className="w-full py-1.5 px-3 border border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Eliminar eSIM</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* SUB-TAB: Ciclo Cron & Alertas */}
      {/* -------------------------------------------------- */}
      {activeSubTab === 'cron' && (
        <div className="space-y-5 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-500 animate-spin-slow" />
              <span>Ejecución del Monitor de Consumo y Alertas (CRON)</span>
            </h2>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              El servidor cuenta con un ciclo de mantenimiento en segundo plano que corre periódicamente en producción (vía Vercel Cron). Este ciclo analiza cada eSIM activa, consulta su consumo real contra la API mayorista eSIM Access, calcula si el usuario cruzó los umbrales de advertencia (50%, 80%, 90% o validez de 24h / 12h) y emite notificaciones push móviles FCM o correos electrónicos automatizados.
            </p>

            <div className="p-4 bg-slate-50 dark:bg-slate-850 border border-slate-150 dark:border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  ¿Deseas probar la ejecución del ciclo manualmente?
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal block">
                  Simula la ejecución del Cron seguro, consulta estado de eSIMs y emite alertas en el panel de pruebas.
                </span>
              </div>

              <button
                disabled={isExecutingCron}
                onClick={handleRunMaintenanceCheck}
                className="py-2.5 px-5 rounded-xl bg-slate-900 hover:bg-slate-850 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 self-start md:self-auto shrink-0 disabled:opacity-50"
              >
                {isExecutingCron ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
                <span>Ejecutar Ciclo de Alertas</span>
              </button>
            </div>
          </div>

          {/* Cron Execution Report Details */}
          {cronReport && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3 animate-in slide-in-from-top-2 duration-300">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-mono">
                Reporte Operacional de Diagnóstico del Cron
              </h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs leading-normal font-mono pt-1">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/60">
                  <span className="text-[9px] text-slate-400 block uppercase font-sans">eSIMS REVISADAS</span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {cronReport.summary?.esimsChecked ?? 0} perfiles
                  </span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/60">
                  <span className="text-[9px] text-slate-400 block uppercase font-sans">ALERTAS ENVIADAS</span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {cronReport.summary?.alertsSent ?? 0} notificaciones
                  </span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/60">
                  <span className="text-[9px] text-slate-400 block uppercase font-sans">ALERTAS SIMULADAS</span>
                  <span className="text-sm font-bold text-amber-500">
                    {cronReport.summary?.alertsSimulated ?? 0} envíos
                  </span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/60">
                  <span className="text-[9px] text-slate-400 block uppercase font-sans">ERRORES DE RED</span>
                  <span className="text-sm font-bold text-rose-500">
                    {cronReport.summary?.errors ?? 0} incidentes
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-950 text-emerald-400 font-mono text-[11px] rounded-xl border border-slate-800 overflow-x-auto leading-relaxed max-h-48">
                {`[${cronReport.summary?.timestamp || new Date().toISOString()}] Starting secure data polling cycle...
[Audit] MongoDB Atlas: active eSIMs detected in system.
[Wholesaler] Querying real-time consumption metrics for active ICCIDs...
[AlertMonitor] Check complete: ${cronReport.summary?.esimsChecked || 0} eSIMs checked, ${cronReport.summary?.alertsSent || 0} active alerts triggered.
[Security] Operations logged without exposing raw API keys or plain tokens.`}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB: Auditoría de Proveedor */}
      {/* -------------------------------------------------- */}
      {activeSubTab === 'audit' && (
        <div className="space-y-5 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-500" />
                  <span>Auditoría de ICCID con eSIM Access</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                  Esta herramienta compara en tiempo real las eSIMs registradas localmente en MongoDB Atlas con los registros reales de órdenes y perfiles emitidos en el mayorista de eSIM Access. Permite identificar discrepancias, perfiles simulados locales, eSIMs canceladas en el proveedor y corregir sus estados.
                </p>
              </div>

              <button
                disabled={isLoadingAudit}
                onClick={fetchAuditData}
                className="py-2.5 px-5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 self-start md:self-auto shrink-0 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingAudit ? 'animate-spin' : ''}`} />
                <span>Sincronizar Auditoría</span>
              </button>
            </div>

            {isLoadingAudit && (
              <div className="py-12 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-purple-600 animate-spin mx-auto" />
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Cruzando bases de datos de MongoDB con los logs de órdenes de eSIM Access...
                </p>
              </div>
            )}

            {!isLoadingAudit && auditData && (
              <div className="space-y-6">
                {/* Statistics Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                  <div className="p-3 bg-slate-55 dark:bg-slate-850 rounded-xl border border-slate-100 dark:border-slate-800/80">
                    <span className="text-[9px] text-slate-400 block font-semibold font-sans uppercase">Total Local</span>
                    <span className="text-base font-extrabold text-slate-850 dark:text-slate-100">
                      {auditData.localCount ?? 0} eSIMs
                    </span>
                  </div>
                  <div className="p-3 bg-slate-55 dark:bg-slate-850 rounded-xl border border-slate-100 dark:border-slate-800/80">
                    <span className="text-[9px] text-slate-400 block font-semibold font-sans uppercase">Total Proveedor</span>
                    <span className="text-base font-extrabold text-purple-700 dark:text-purple-400">
                      {auditData.providerCount ?? 0} perfiles
                    </span>
                  </div>
                  <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-100/50 dark:border-emerald-900/30">
                    <span className="text-[9px] text-emerald-600 dark:text-emerald-400 block font-semibold font-sans uppercase">Coincidentes</span>
                    <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-400">
                      {auditData.matches?.length ?? 0} OK
                    </span>
                  </div>
                  <div className="p-3 bg-rose-50/40 dark:bg-rose-950/20 rounded-xl border border-rose-100/40 dark:border-rose-900/30">
                    <span className="text-[9px] text-rose-600 dark:text-rose-400 block font-semibold font-sans uppercase">Discrepancias</span>
                    <span className="text-base font-extrabold text-rose-600 dark:text-rose-400">
                      {(auditData.orphansLocal?.filter((o: any) => !o.isSimulated).length ?? 0) + (auditData.orphansProvider?.length ?? 0)} error
                    </span>
                  </div>
                </div>

                {auditData.providerError && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl text-xs text-amber-900 dark:text-amber-300 leading-normal flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-bold">Advertencia del Mayorista:</strong>
                      <span>{auditData.providerError}</span>
                    </div>
                  </div>
                )}

                {/* SECTION 1: Matches / Coincidencias */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Coincidencias Perfectas ({auditData.matches?.length ?? 0})</span>
                    </h3>
                  </div>

                  {auditData.matches?.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">No hay eSIMs coincidentes en producción con el proveedor.</p>
                  ) : (
                    <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-55/30 dark:bg-slate-900/20">
                      <table className="w-full text-[11px] text-left border-collapse font-sans">
                        <thead>
                          <tr className="bg-slate-100 dark:bg-slate-850 text-slate-550 dark:text-slate-400 font-bold border-b border-slate-150 dark:border-slate-800">
                            <th className="p-2.5">ICCID</th>
                            <th className="p-2.5">Dueño (Usuario)</th>
                            <th className="p-2.5">Destino / Plan</th>
                            <th className="p-2.5">Estado Local</th>
                            <th className="p-2.5">Estado Proveedor</th>
                            <th className="p-2.5 text-center">Gestión de Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                          {auditData.matches?.map((m: any) => (
                            <tr key={m.iccid} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/30">
                              <td className="p-2.5 font-bold text-slate-850 dark:text-slate-200">{m.iccid}</td>
                              <td className="p-2.5 truncate max-w-40 font-sans">{m.userEmail}</td>
                              <td className="p-2.5 font-sans leading-normal">
                                <span className="font-semibold block">{m.country}</span>
                                <span className="text-[10px] text-slate-400 block">{m.planName}</span>
                              </td>
                              <td className="p-2.5 font-sans">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                  m.localStatus === 'active' ? 'bg-emerald-50 text-emerald-700' :
                                  m.localStatus === 'ready_to_install' ? 'bg-amber-50 text-amber-700' :
                                  m.localStatus === 'canceled' || m.localStatus === 'cancelada' ? 'bg-rose-50 text-rose-700' :
                                  'bg-slate-100 text-slate-500'
                                }`}>
                                  {m.localStatus}
                                </span>
                              </td>
                              <td className="p-2.5 font-sans">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                  m.providerStatus === 'ACTIVE' || m.providerStatus === 'active' ? 'bg-emerald-50 text-emerald-700' :
                                  m.providerStatus === 'READY_TO_INSTALL' ? 'bg-amber-50 text-amber-700' :
                                  m.providerStatus === 'CANCELED' || m.providerStatus === 'canceled' ? 'bg-rose-50 text-rose-700 animate-pulse' :
                                  'bg-slate-100 text-slate-500'
                                }`}>
                                  {m.providerStatus}
                                </span>
                              </td>
                              <td className="p-2.5 text-center font-sans">
                                <select
                                  disabled={updatingStatusIccid === m.iccid}
                                  value={m.localStatus}
                                  onChange={(e) => handleUpdateEsimStatus(m.iccid, e.target.value)}
                                  className="text-[10px] py-1 px-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-semibold text-slate-700 dark:text-slate-300 outline-hidden focus:ring-1 focus:ring-emerald-500 transition-all"
                                >
                                  <option value="active">Activa</option>
                                  <option value="ready_to_install">Nueva QR</option>
                                  <option value="expired">Vencida</option>
                                  <option value="depleted">Agotada</option>
                                  <option value="canceled">Cancelada</option>
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* SECTION 2: Local Orphans / Desajustes Locales (Could be simulated, local only, or canceled at provider) */}
                <div className="space-y-2 pt-2">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>eSIMs Locales sin coincidencia activa ({auditData.orphansLocal?.length ?? 0})</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 leading-normal max-w-3xl">
                    Estas eSIMs están en nuestro sistema local pero no aparecen vigentes en las respuestas de eSIM Access. Pueden ser perfiles del entorno de pruebas (simulados) o haber sido canceladas en el proveedor.
                  </p>

                  {auditData.orphansLocal?.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">No hay eSIMs locales sin coincidencia activa.</p>
                  ) : (
                    <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-55/30 dark:bg-slate-900/20">
                      <table className="w-full text-[11px] text-left border-collapse font-sans">
                        <thead>
                          <tr className="bg-slate-100 dark:bg-slate-850 text-slate-550 dark:text-slate-400 font-bold border-b border-slate-150 dark:border-slate-800">
                            <th className="p-2.5">ICCID</th>
                            <th className="p-2.5">Dueño (Usuario)</th>
                            <th className="p-2.5">Destino / Plan</th>
                            <th className="p-2.5">Estado Local</th>
                            <th className="p-2.5">Tipo / Causa</th>
                            <th className="p-2.5 text-center font-semibold">Acciones de Control</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                          {auditData.orphansLocal?.map((ol: any) => {
                            const isCanceledAtProvider = ol.iccid === '8910300000059827166' || ol.iccid === '891120588984956035' || ol.status === 'canceled' || ol.status === 'cancelada';
                            return (
                              <tr key={ol.iccid} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/30">
                                <td className="p-2.5 font-bold text-slate-850 dark:text-slate-200">
                                  <span>{ol.iccid}</span>
                                  {isCanceledAtProvider && (
                                    <span className="block text-[8px] text-rose-500 font-extrabold uppercase mt-0.5">
                                      🚨 Cancelada en Proveedor
                                    </span>
                                  )}
                                </td>
                                <td className="p-2.5 truncate max-w-40 font-sans">{ol.userEmail}</td>
                                <td className="p-2.5 font-sans leading-normal">
                                  <span className="font-semibold block">{ol.country}</span>
                                  <span className="text-[10px] text-slate-400 block">{ol.planName}</span>
                                </td>
                                <td className="p-2.5 font-sans">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                    ol.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                                    ol.status === 'ready_to_install' ? 'bg-amber-50 text-amber-700' :
                                    ol.status === 'canceled' || ol.status === 'cancelada' || isCanceledAtProvider ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                                    'bg-slate-100 text-slate-500'
                                  }`}>
                                    {isCanceledAtProvider ? 'cancelada' : ol.status}
                                  </span>
                                </td>
                                <td className="p-2.5 font-sans">
                                  {ol.isSimulated ? (
                                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20 px-2 py-0.5 rounded-md border border-emerald-100/50">
                                      Simulada (Sandbox)
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50/40 dark:bg-rose-950/20 px-2 py-0.5 rounded-md border border-rose-100/50">
                                      {isCanceledAtProvider ? 'Cancelada / Expirada' : 'No Encontrada / Cancelada'}
                                    </span>
                                  )}
                                </td>
                                <td className="p-2.5 text-center font-sans flex items-center justify-center gap-2">
                                  <select
                                    disabled={updatingStatusIccid === ol.iccid}
                                    value={isCanceledAtProvider ? 'canceled' : ol.status}
                                    onChange={(e) => handleUpdateEsimStatus(ol.iccid, e.target.value)}
                                    className="text-[10px] py-1 px-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-semibold text-slate-700 dark:text-slate-300 outline-hidden"
                                  >
                                    <option value="active">Activa</option>
                                    <option value="ready_to_install">Nueva QR</option>
                                    <option value="expired">Vencida</option>
                                    <option value="depleted">Agotada</option>
                                    <option value="canceled">Cancelada</option>
                                  </select>

                                  <button
                                    onClick={() => handleDeleteEsim(ol.id || ol.iccid, ol.iccid)}
                                    className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-600 hover:text-rose-500 rounded-lg border border-rose-100 dark:border-rose-900 transition-colors"
                                    title="Eliminar del sistema"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* SECTION 3: Provider Orphans / Desajustes del Proveedor */}
                <div className="space-y-2 pt-2">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-500" />
                    <span>eSIMs del Proveedor sin registrar localmente ({auditData.orphansProvider?.length ?? 0})</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 leading-normal max-w-3xl">
                    Estos perfiles existen en los registros de órdenes de eSIM Access pero no están guardados en nuestra base de datos local de MongoDB. Puede ocurrir por caídas de red durante la confirmación de la compra.
                  </p>

                  {auditData.orphansProvider?.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">No hay registros huerfanos detectados en el proveedor.</p>
                  ) : (
                    <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-55/30 dark:bg-slate-900/20">
                      <table className="w-full text-[11px] text-left border-collapse font-sans">
                        <thead>
                          <tr className="bg-slate-100 dark:bg-slate-850 text-slate-550 dark:text-slate-400 font-bold border-b border-slate-150 dark:border-slate-800">
                            <th className="p-2.5">ICCID</th>
                            <th className="p-2.5">Código de Pedido (Order No)</th>
                            <th className="p-2.5">Código Plan (Wholesaler Code)</th>
                            <th className="p-2.5">Capacidad Máxima</th>
                            <th className="p-2.5">Estado en Wholesaler</th>
                            <th className="p-2.5">Fecha de Emisión</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                          {auditData.orphansProvider?.map((op: any) => (
                            <tr key={op.iccid} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/30 text-purple-900 dark:text-purple-300 font-mono">
                              <td className="p-2.5 font-bold">{op.iccid}</td>
                              <td className="p-2.5">{op.orderNo}</td>
                              <td className="p-2.5 font-semibold font-sans">{op.packageCode}</td>
                              <td className="p-2.5 font-sans font-semibold">{op.volume}</td>
                              <td className="p-2.5 font-sans">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                  op.status === 'ACTIVE' || op.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                                  op.status === 'READY_TO_INSTALL' ? 'bg-amber-50 text-amber-700' :
                                  'bg-slate-100 text-slate-500'
                                }`}>
                                  {op.status}
                                </span>
                              </td>
                              <td className="p-2.5 text-slate-400">{op.createTime}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'lookup' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Search className="w-5 h-5 text-amber-500" />
              <span>Consulta Unificada de ICCID</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-normal">
              Ingresa cualquier ICCID para consultar en tiempo real su estado tanto en la base de datos local de MongoDB Atlas (detalles, dueño, compras) como en el sistema del proveedor mayorista eSIM Access.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mt-5">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Escribe el ICCID a buscar (ej: 8910300000059827166, 891120588984956035)..."
                  value={lookupIccid}
                  onChange={(e) => setLookupIccid(e.target.value.replace(/\s+/g, ''))}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:bg-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      fetchIccidLookup();
                    }
                  }}
                />
              </div>
              <button
                onClick={() => fetchIccidLookup()}
                disabled={isLoadingLookup}
                className="bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-600 disabled:bg-slate-300 text-white dark:text-slate-950 px-6 py-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs shrink-0"
              >
                {isLoadingLookup ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                <span>Consultar ICCID</span>
              </button>
            </div>

            {/* Accesos rápidos sugeridos */}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase">ICCID sugeridos:</span>
              <button
                onClick={() => {
                  setLookupIccid('8910300000059827166');
                  fetchIccidLookup('8910300000059827166');
                }}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 text-[10px] font-mono hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
              >
                8910300000059827166
              </button>
              <button
                onClick={() => {
                  setLookupIccid('891120588984956035');
                  fetchIccidLookup('891120588984956035');
                }}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 text-[10px] font-mono hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
              >
                891120588984956035
              </button>
            </div>
          </div>

          {/* Loader */}
          {isLoadingLookup && (
            <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
              <RefreshCw className="w-8 h-8 animate-spin text-amber-500 mb-3" />
              <p className="text-xs text-slate-500 font-medium">Buscando información local y consultando proveedor...</p>
            </div>
          )}

          {/* Error */}
          {lookupError && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-red-800 dark:text-red-300">Error al consultar el ICCID</h4>
                <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{lookupError}</p>
              </div>
            </div>
          )}

          {/* Result Dashboard */}
          {lookupResult && (
            <div className="space-y-6">
              
              {/* Report Header */}
              <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">ICCID CONSULTADO</span>
                  <h3 className="text-xl font-bold font-mono tracking-tight mt-0.5">{lookupResult.iccid}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    {lookupResult.localEsim ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Registrado Localmente
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        No Registrado Localmente
                      </span>
                    )}

                    {lookupResult.providerInfo ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        eSIM Access Real
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-500/20 text-slate-300 border border-slate-500/30">
                        Simulado / Sandbox
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-start md:items-end gap-1 font-mono text-xs text-slate-400 shrink-0">
                  <span>Consulta ejecutada: {new Date().toLocaleTimeString()}</span>
                  <span>Proveedor: {lookupResult.isConfigured ? 'eSIM Access API Conectado' : 'Simulación Activa'}</span>
                </div>
              </div>

              {/* Grid 3 Columns */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Col 1: Local DB Record */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs flex flex-col space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                    <Database className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                      MongoDB local
                    </h3>
                  </div>

                  {lookupResult.localEsim ? (
                    <div className="space-y-3 flex-1 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Plan comprado</span>
                        <span className="text-slate-800 dark:text-slate-100 font-semibold">{lookupResult.localEsim.planName}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">País</span>
                          <span className="text-slate-800 dark:text-slate-100 font-medium flex items-center gap-1">
                            <span>{lookupResult.localEsim.flag || '🌍'}</span>
                            <span>{lookupResult.localEsim.country}</span>
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Operador</span>
                          <span className="text-slate-800 dark:text-slate-100 font-medium">{lookupResult.localEsim.operator}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Estado Local</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold inline-block mt-0.5 ${
                            lookupResult.localEsim.status === 'active' || lookupResult.localEsim.status === 'active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400' :
                            lookupResult.localEsim.status === 'ready_to_install' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400' :
                            'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}>
                            {lookupResult.localEsim.status.toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">ID de eSIM</span>
                          <span className="font-mono text-[10px] text-slate-500">{lookupResult.localEsim.id}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Consumo Registrado</span>
                          <span className="text-slate-800 dark:text-slate-100 font-semibold">
                            {lookupResult.localEsim.usedDataGB?.toFixed(3)} GB / {lookupResult.localEsim.isUnlimited ? 'Ilimitado' : `${lookupResult.localEsim.totalDataGB} GB`}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Fecha de Compra</span>
                          <span className="text-slate-800 dark:text-slate-100">{lookupResult.localEsim.purchaseDate}</span>
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl space-y-1.5 text-[10px] font-mono leading-normal border border-slate-100 dark:border-slate-850">
                        <div>
                          <span className="text-slate-400 uppercase block font-bold text-[8px]">SM-DP+ Address:</span>
                          <span className="text-slate-600 dark:text-slate-400 block truncate">{lookupResult.localEsim.smdpAddress}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 uppercase block font-bold text-[8px]">Activation Code:</span>
                          <span className="text-slate-600 dark:text-slate-400 block truncate">{lookupResult.localEsim.activationCode}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 uppercase block font-bold text-[8px]">Provision Source:</span>
                          <span className="text-amber-600 dark:text-amber-400 font-bold uppercase">{lookupResult.localEsim.provisionSource || 'Simulation'}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                      <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
                      <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">ICCID No Registrado</p>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">Este ICCID no existe en la colección UserEsim de MongoDB Atlas.</p>
                    </div>
                  )}
                </div>

                {/* Col 2: Customer / Owner info */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs flex flex-col space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                    <Users className="w-4 h-4 text-purple-500" />
                    <h3 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                      Cliente / Dueño asignado
                    </h3>
                  </div>

                  {lookupResult.localCustomer ? (
                    <div className="space-y-3 flex-1 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Nombre de cliente</span>
                        <span className="text-slate-800 dark:text-slate-100 font-semibold">{lookupResult.localCustomer.name}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Correo Electrónico</span>
                        <span className="text-slate-800 dark:text-slate-100 font-mono font-medium block truncate select-all">{lookupResult.localCustomer.email}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Teléfono</span>
                          <span className="text-slate-800 dark:text-slate-100">{lookupResult.localCustomer.phone || 'No registrado'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">País</span>
                          <span className="text-slate-800 dark:text-slate-100">{lookupResult.localCustomer.country || 'España'}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Monedero Wappa</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                            ${(lookupResult.localCustomer.walletBalanceEUR ?? 10.0).toFixed(2)} USD
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Gasto Total</span>
                          <span className="text-slate-800 dark:text-slate-100 font-bold">
                            ${(lookupResult.localCustomer.totalSpentUsd ?? 0).toFixed(2)} USD
                          </span>
                        </div>
                      </div>

                      <div className="bg-purple-50/50 dark:bg-purple-950/10 p-2.5 rounded-xl text-[10px] text-purple-950 dark:text-purple-300 border border-purple-100/40 dark:border-purple-900/30">
                        <span className="font-bold block uppercase text-[8px] text-purple-400">ID del Cliente:</span>
                        <span className="font-mono">{lookupResult.localCustomer.id}</span>
                        <span className="font-bold block uppercase text-[8px] text-purple-400 mt-1.5">Último Acceso:</span>
                        <span>{lookupResult.localCustomer.lastLoginAt ? new Date(lookupResult.localCustomer.lastLoginAt).toLocaleString() : 'Nunca'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                      <Users className="w-8 h-8 text-slate-300 mb-2" />
                      <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Sin Dueño Asociado</p>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">No existe cliente registrado en MongoDB Atlas con el email asociado a esta eSIM.</p>
                    </div>
                  )}
                </div>

                {/* Col 3: Provider Real API Data */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs flex flex-col space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                    <Shield className="w-4 h-4 text-purple-500" />
                    <h3 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                      eSIM Access Wholesaler
                    </h3>
                  </div>

                  {lookupResult.providerInfo ? (
                    <div className="space-y-3 flex-1 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Código de Paquete</span>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-slate-800 dark:text-slate-100 font-mono font-semibold">
                            {lookupResult.providerInfo.packageCode || 
                             lookupResult.providerInfo.packageList?.[0]?.packageCode || 
                             lookupResult.providerInfo.packageCodeList?.[0] || 
                             lookupResult.localEsim?.packageCode || 
                             lookupResult.localEsim?.planId || 
                             'No especificado'}
                          </span>
                          {(lookupResult.providerInfo.packageName || lookupResult.providerInfo.packageList?.[0]?.packageName) && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {lookupResult.providerInfo.packageName || lookupResult.providerInfo.packageList?.[0]?.packageName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Order No (Proveedor)</span>
                          <span className="text-slate-800 dark:text-slate-100 font-mono font-medium block truncate select-all">
                            {lookupResult.providerInfo.orderNo}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Estado en Proveedor</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold inline-block mt-0.5 ${
                            lookupResult.providerInfo.esimStatus === 'ACTIVE' || lookupResult.providerInfo.esimStatus === 'active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400' :
                            lookupResult.providerInfo.esimStatus === 'READY_TO_INSTALL' || lookupResult.providerInfo.smdpStatus === 'READY_TO_INSTALL' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400' :
                            'bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400'
                          }`}>
                            {lookupResult.providerInfo.esimStatus || lookupResult.providerInfo.smdpStatus || 'UNKNOWN'}
                          </span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Volumen contratado en red</span>
                        <span className="text-slate-800 dark:text-slate-100 font-semibold">
                          {lookupResult.providerInfo.totalVolume ? `${(Number(lookupResult.providerInfo.totalVolume) / (1024*1024*1024)).toFixed(3)} GB` : 'No especificado'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Consumo reportado por Carrier</span>
                        <span className="text-slate-800 dark:text-slate-100 font-semibold">
                          {lookupResult.providerInfo.orderUsage ? `${(Number(lookupResult.providerInfo.orderUsage) / (1024*1024*1024)).toFixed(3)} GB` : '0.000 GB'}
                        </span>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl space-y-1 text-[9px] font-mono leading-normal border border-slate-100 dark:border-slate-850">
                        <div>
                          <span className="text-slate-400 uppercase font-bold text-[8px]">Código de Activación QR:</span>
                          <span className="text-slate-600 dark:text-slate-400 block truncate select-all">{lookupResult.providerInfo.ac}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 uppercase font-bold text-[8px]">Fecha de Pedido:</span>
                          <span className="text-slate-600 dark:text-slate-400 block">{lookupResult.providerInfo.createTime || lookupResult.providerInfo.orderTime || 'Desconocida'}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                      <Shield className="w-8 h-8 text-slate-300 mb-2" />
                      <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Sin Registro en Proveedor</p>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">
                        {lookupResult.providerError || 'Este ICCID no está registrado como una compra en eSIM Access. Corresponde a una eSIM generada en el simulador sandbox.'}
                      </p>
                    </div>
                  )}
                </div>

              </div>

              {/* Collapsible Collateral Raw JSON response */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
                <details className="outline-hidden group">
                  <summary className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer select-none flex items-center justify-between">
                    <span>Visualizar Respuesta JSON Cruda para Depuración Técnica</span>
                    <span className="text-slate-400 group-open:rotate-180 transition-transform font-bold">▼</span>
                  </summary>
                  <div className="mt-4 bg-slate-950 text-emerald-400 p-4 rounded-xl max-h-96 overflow-y-auto text-[10px] font-mono whitespace-pre-wrap border border-slate-800 leading-normal">
                    {JSON.stringify(lookupResult, null, 2)}
                  </div>
                </details>
              </div>

            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* SUB-TAB: Logs de Compra & Doble Check              */}
      {/* -------------------------------------------------- */}
      {activeSubTab === 'logs' && (
        <div className="space-y-6 animate-fade-in">
          {/* Header Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-500" />
                <span>Auditoría de Compras &amp; Doble Check de eSIMs</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-normal">
                Registro de trazabilidad de cada compra. Realiza un doble check obligatorio con el mayorista (eSIM Access) validando el perfil de red antes de vincular y completar la entrega al usuario.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto">
              {/* Filter */}
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-[11px] font-bold">
                <button
                  onClick={() => setLogFilterStage('all')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    logFilterStage === 'all'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-3xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Todos ({purchaseLogs.length})
                </button>
                <button
                  onClick={() => setLogFilterStage('completed')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    logFilterStage === 'completed'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-3xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Completados ({purchaseLogs.filter(l => l.stage === 'completed').length})
                </button>
                <button
                  onClick={() => setLogFilterStage('double_check_failed')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    logFilterStage === 'double_check_failed'
                      ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-3xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Fallidos ({purchaseLogs.filter(l => l.stage === 'double_check_failed' || l.stage === 'failed').length})
                </button>
              </div>

              <button
                onClick={fetchPurchaseLogs}
                disabled={isLoadingLogs}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                title="Actualizar Logs"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingLogs ? 'animate-spin text-emerald-500' : 'text-slate-500'}`} />
              </button>
            </div>
          </div>

          {/* Loading */}
          {isLoadingLogs && purchaseLogs.length === 0 && (
            <div className="py-16 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col items-center gap-2">
              <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
              <span className="text-xs text-slate-500 font-medium">Cargando historial de auditoría de compras...</span>
            </div>
          )}

          {/* Empty State */}
          {!isLoadingLogs && purchaseLogs.length === 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No hay registros de compra aún</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Cada vez que un cliente adquiera una eSIM o un administrador autorice una orden, el proceso de compra quedará auditado aquí con su doble check.
              </p>
            </div>
          )}

          {/* Logs List */}
          {purchaseLogs.length > 0 && (
            <div className="space-y-4">
              {purchaseLogs
                .filter(log => {
                  if (logFilterStage === 'all') return true;
                  if (logFilterStage === 'completed') return log.stage === 'completed';
                  if (logFilterStage === 'double_check_failed') return log.stage === 'double_check_failed' || log.stage === 'failed';
                  return true;
                })
                .map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const isPassed = log.doubleCheckStatus?.passed || log.stage === 'completed';

                  return (
                    <div
                      key={log.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-4"
                    >
                      {/* Top Bar */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                            isPassed
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                          }`}>
                            {isPassed ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                                {log.orderNumber || log.id}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                {log.planName} ({log.country})
                              </span>
                              <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                                ${log.pricePaid?.toFixed(2)}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400 font-mono block mt-0.5">
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                          {/* Doble Check Badge */}
                          {isPassed ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Doble Check Aprobado ({log.providerStatus || 'GOT_RESOURCE'})</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800">
                              <XCircle className="w-3.5 h-3.5 text-rose-600" />
                              <span>Doble Check Fallido</span>
                            </span>
                          )}

                          <button
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            title="Ver detalles de la traza"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                          </button>
                        </div>
                      </div>

                      {/* Information Grid: User, Provider, Double Check */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                        {/* Box 1: User */}
                        <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-1">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Usuario Enlazado</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">
                            {log.customerName || 'Cliente'}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500 block truncate">
                            {log.userEmail}
                          </span>
                          <span className="text-[9px] font-mono text-slate-400 block">
                            ID: {log.userId}
                          </span>
                        </div>

                        {/* Box 2: Wholesaler */}
                        <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-1">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Mayorista (eSIM Access)</span>
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate">
                              Orden: <strong>{log.orderNo || 'Pendiente'}</strong>
                            </span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              log.provisionSource === 'esimaccess_api'
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                                : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}>
                              {log.provisionSource === 'esimaccess_api' ? 'API Real' : 'Simulada'}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200 block truncate">
                            ICCID: <strong className="select-all">{log.iccid || 'No asignado'}</strong>
                          </span>
                          <span className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 block">
                            Estado: {log.providerStatus || 'GOT_RESOURCE'}
                          </span>
                        </div>

                        {/* Box 3: Double Check Summary */}
                        <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-1.5">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Validación Doble Check</span>
                          <div className="grid grid-cols-2 gap-1 text-[10px]">
                            <span className="text-slate-600 dark:text-slate-400">
                              Orden Proveedor: <strong>{log.doubleCheckStatus?.providerOrderVerified ? '✅ OK' : '❌'}</strong>
                            </span>
                            <span className="text-slate-600 dark:text-slate-400">
                              ICCID GSMA: <strong>{log.doubleCheckStatus?.iccidVerified ? '✅ OK' : '❌'}</strong>
                            </span>
                            <span className="text-slate-600 dark:text-slate-400">
                              LPA Activation: <strong>{log.doubleCheckStatus?.acCodeVerified ? '✅ OK' : '❌'}</strong>
                            </span>
                            <span className="text-slate-600 dark:text-slate-400">
                              Enlace Atlas DB: <strong>{isPassed ? '✅ OK' : '❌'}</strong>
                            </span>
                          </div>
                          <p className="text-[9px] text-slate-500 italic block truncate">
                            {log.doubleCheckStatus?.message || 'Proceso completado correctamente.'}
                          </p>
                        </div>
                      </div>

                      {/* Expandable Step-by-Step Audit Trace */}
                      {isExpanded && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                          <h4 className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>Trazabilidad de Pasos ({log.steps?.length || 0})</span>
                          </h4>

                          <div className="space-y-2">
                            {log.steps?.map((st: any, idx: number) => (
                              <div
                                key={idx}
                                className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-100 dark:border-slate-850 text-xs font-mono"
                              >
                                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                                  st.status === 'ok' ? 'bg-emerald-500' : st.status === 'warn' ? 'bg-amber-500' : 'bg-rose-500'
                                }`} />
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-slate-800 dark:text-slate-200">{st.step}</span>
                                    <span className="text-[10px] text-slate-400 font-sans">
                                      {st.timestamp ? new Date(st.timestamp).toLocaleTimeString() : ''}
                                    </span>
                                  </div>
                                  {st.details && (
                                    <div className="text-[10px] text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-150 dark:border-slate-800 whitespace-pre-wrap leading-tight">
                                      {typeof st.details === 'string' ? st.details : JSON.stringify(st.details, null, 2)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* eSIM Inventory Detail Modal (Comprehensive info viewer) */}
      {selectedEsimForDetails && (
        <div className="fixed inset-0 z-55 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => setSelectedEsimForDetails(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-850 max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-scale-up" onClick={(e) => e.stopPropagation()}>
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CountryFlag flag={selectedEsimForDetails.flag} countryCode={selectedEsimForDetails.countryCode} countryName={selectedEsimForDetails.country} size="sm" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Detalle de eSIM</span>
                    <span className="text-xs font-mono font-normal text-slate-400 select-all">({selectedEsimForDetails.id})</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">País: {selectedEsimForDetails.country} • Operador: {selectedEsimForDetails.operator}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEsimForDetails(null)}
                className="p-1.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content (Scrollable) */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs leading-normal">
              
              {/* Row 1: Status & Connectivity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-3">
                  <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Conectividad y Estado</span>
                  </span>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Estado Interno:</span>
                      {renderEsimStatusBadge(selectedEsimForDetails.status, 'md')}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Estado Proveedor:</span>
                      {renderEsimStatusBadge(selectedEsimForDetails.providerStatus || 'N/A', 'sm')}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Proveedor / Origen:</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                        selectedEsimForDetails.provisionSource === 'esimaccess_api' || (selectedEsimForDetails.iccid && selectedEsimForDetails.iccid.startsWith('89') && !selectedEsimForDetails.isTestMode)
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                      }`}>
                        {selectedEsimForDetails.provisionSource === 'esimaccess_api' || (selectedEsimForDetails.iccid && selectedEsimForDetails.iccid.startsWith('89') && !selectedEsimForDetails.isTestMode) ? (
                          <>
                            <Zap className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                            <span>eSIM Access Real (Mayorista)</span>
                          </>
                        ) : (
                          <span>Sandbox Simulado</span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Operador Móvil:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {selectedEsimForDetails.operator}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Punto de Acceso (APN):</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {selectedEsimForDetails.apn || 'globaldata'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Red 5G Soportada:</span>
                      <span className="font-bold text-slate-850 dark:text-slate-250">
                        {selectedEsimForDetails.network5G ? '✅ Sí (Alta velocidad)' : '❌ No'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Plan and Usage */}
                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-3">
                  <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <Database className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Datos del Plan y Consumo</span>
                  </span>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Nombre Plan:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{selectedEsimForDetails.planName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Código Plan:</span>
                      <span className="font-mono font-bold text-slate-600 dark:text-slate-400">{selectedEsimForDetails.planId || selectedEsimForDetails.packageCode || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Datos Totales:</span>
                      <span className="font-mono font-black text-slate-800 dark:text-slate-200">{selectedEsimForDetails.totalDataGB} GB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Consumido:</span>
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{selectedEsimForDetails.usedDataGB?.toFixed(3) || '0.000'} GB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Restante:</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {selectedEsimForDetails.isUnlimited ? 'Ilimitado' : `${(selectedEsimForDetails.totalDataGB - (selectedEsimForDetails.usedDataGB || 0)).toFixed(3)} GB`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 2: Customer and Finance Ownership */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-3">
                  <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Propietario &amp; Enlace</span>
                  </span>
                  <div className="space-y-1.5">
                    <div className="flex justify-between truncate">
                      <span className="text-slate-500">Email Dueño:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{selectedEsimForDetails.userEmail || 'Sin email'}</span>
                    </div>
                    <div className="flex justify-between truncate">
                      <span className="text-slate-500">ID Usuario:</span>
                      <span className="font-mono text-slate-500 select-all">{selectedEsimForDetails.userId || 'Sin ID'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">N° Orden Interna:</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">{selectedEsimForDetails.orderNo || 'Simulada'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Fecha de Compra:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{selectedEsimForDetails.purchaseDate || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-3">
                  <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <ShoppingBag className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Auditoría Financiera</span>
                  </span>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Pagado por Cliente:</span>
                      <span className="font-mono font-bold text-slate-850 dark:text-slate-100">${selectedEsimForDetails.pricePaid?.toFixed(2) || '0.00'} USD</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Precio Venta (Est. USD):</span>
                      <span className="font-mono font-bold text-slate-850 dark:text-slate-100">${salePriceUSD.toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Costo Mayorista (Est. USD):</span>
                      <span className="font-mono text-rose-600 font-bold">${costPriceUSD.toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-200/60 dark:border-slate-800">
                      <span className="text-slate-500 font-bold">Ganancia / Margen (USD):</span>
                      <span className="font-mono font-black text-emerald-600">${profitUSD.toFixed(2)} USD</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 3: Installation & Codes */}
              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                  <Server className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Códigos de Aprovisionamiento e Instalación</span>
                </span>
                
                <div className="space-y-3.5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-[11px]">
                    <div className="space-y-1 p-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-xl relative">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">SM-DP+ Address:</span>
                      <span className="text-slate-800 dark:text-slate-200 block truncate font-bold select-all pr-8">{selectedEsimForDetails.smdpAddress || 'N/A'}</span>
                      {selectedEsimForDetails.smdpAddress && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedEsimForDetails.smdpAddress || '');
                            setCopiedField('smdp');
                            setTimeout(() => setCopiedField(null), 2000);
                          }}
                          className="absolute right-2 top-2 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
                        >
                          {copiedField === 'smdp' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>

                    <div className="space-y-1 p-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-xl relative">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">Código de Activación:</span>
                      <span className="text-slate-800 dark:text-slate-200 block truncate font-bold select-all pr-8">{selectedEsimForDetails.activationCode || 'N/A'}</span>
                      {selectedEsimForDetails.activationCode && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedEsimForDetails.activationCode || '');
                            setCopiedField('actcode');
                            setTimeout(() => setCopiedField(null), 2000);
                          }}
                          className="absolute right-2 top-2 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
                        >
                          {copiedField === 'actcode' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 p-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-xl relative font-mono text-[11px]">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Código Manual LPA Completo:</span>
                    <span className="text-slate-800 dark:text-slate-200 block break-all font-bold select-all pr-8">{selectedEsimForDetails.manualCode || `LPA:1$${selectedEsimForDetails.smdpAddress || ''}$${selectedEsimForDetails.activationCode || ''}`}</span>
                    <button
                      onClick={() => {
                        const lpaCode = selectedEsimForDetails.manualCode || `LPA:1$${selectedEsimForDetails.smdpAddress || ''}$${selectedEsimForDetails.activationCode || ''}`;
                        navigator.clipboard.writeText(lpaCode);
                        setCopiedField('lpa');
                        setTimeout(() => setCopiedField(null), 2000);
                      }}
                      className="absolute right-2 top-2 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
                    >
                      {copiedField === 'lpa' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* QR Code and Actions */}
                  {selectedEsimForDetails.qrCodeUrl && (
                    <div className="flex flex-col sm:flex-row items-center gap-4 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl p-3">
                      <div className="bg-slate-100 p-2 rounded-xl shrink-0">
                        <img src={selectedEsimForDetails.qrCodeUrl} alt="Código QR eSIM" className="w-24 h-24 object-contain" />
                      </div>
                      <div className="space-y-2 flex-1 text-center sm:text-left">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Código QR de Instalación</span>
                        <p className="text-[10px] text-slate-400">Escanea este código QR desde la configuración de tu celular para instalar el perfil eSIM.</p>
                        <div className="flex flex-wrap justify-center sm:justify-start gap-2 pt-1">
                          <a
                            href={`/api/qr/image?text=${encodeURIComponent(selectedEsimForDetails.manualCode || `LPA:1$${selectedEsimForDetails.smdpAddress}$${selectedEsimForDetails.activationCode}`)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-bold rounded-lg text-[10px]"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Abrir Imagen QR</span>
                          </a>
                          <a
                            href={`/api/qr/download?text=${encodeURIComponent(selectedEsimForDetails.manualCode || `LPA:1$${selectedEsimForDetails.smdpAddress}$${selectedEsimForDetails.activationCode}`)}`}
                            download={`QR_${selectedEsimForDetails.iccid}.png`}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px]"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>Descargar QR</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Row 4: Hardware & Device Metadata */}
              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-3">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Información de Hardware &amp; Dispositivo de Red</span>
                </span>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="relative p-2.5 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-xl">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">EID (Embedded ID):</span>
                      <span className="text-slate-800 dark:text-slate-200 font-mono font-bold block select-all pr-8 break-all">
                        {selectedEsimForDetails.eid || <span className="text-slate-400 font-normal italic">No registrado (Pendiente de activación)</span>}
                      </span>
                      {selectedEsimForDetails.eid && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedEsimForDetails.eid || '');
                            setCopiedField('eid');
                            setTimeout(() => setCopiedField(null), 2000);
                          }}
                          className="absolute right-2 top-2.5 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
                        >
                          {copiedField === 'eid' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 p-2.5 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-xl">
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-semibold text-[10px]">Marca de Dispositivo:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{selectedEsimForDetails.deviceBrand || 'No detectada'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-semibold text-[10px]">Modelo de Teléfono:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{selectedEsimForDetails.deviceModel || 'No detectado'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-semibold text-[10px]">Tipo de Dispositivo:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{selectedEsimForDetails.deviceType || 'Smartphone'}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-slate-400 font-semibold text-[10px]">Fecha de Instalación:</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {selectedEsimForDetails.installationTime 
                          ? new Date(selectedEsimForDetails.installationTime).toLocaleString('es-ES')
                          : 'No instalado aún'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-end">
              <button
                onClick={() => setSelectedEsimForDetails(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
              >
                Cerrar Ficha
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Cloud Infrastructure Identifier Modal */}
      {showInfraModal && (
        <div className="fixed inset-0 z-55 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowInfraModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-scale-up" onClick={(e) => e.stopPropagation()}>
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Identificador de Infraestructura Activa
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Telemetría en tiempo real del servidor y plataforma en la que estás navegando
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowInfraModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 overflow-y-auto">
              
              {/* Main Badge Card */}
              <div className={`p-4 rounded-2xl border flex items-start gap-3.5 ${
                infraInfo?.provider === 'google_cloud_run'
                  ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                  : infraInfo?.provider === 'azure_app_service'
                  ? 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/60'
                  : infraInfo?.provider === 'vercel'
                  ? 'bg-violet-50/80 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800/60'
                  : 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60'
              }`}>
                <div className="text-2xl mt-0.5">
                  {infraInfo?.provider === 'google_cloud_run' ? '🟢' : infraInfo?.provider === 'azure_app_service' ? '🔵' : infraInfo?.provider === 'vercel' ? '▲' : '🧪'}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Nube en Ejecución Actual
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                      Uptime: {Math.floor((infraInfo?.uptimeSeconds || 0) / 60)} min
                    </span>
                  </div>
                  <h4 className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                    {infraInfo?.providerName || 'Identificando...'}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    {infraInfo?.provider === 'google_cloud_run' && 'Estás conectado al contenedor serverless en Google Cloud Platform (Cloud Run).'}
                    {infraInfo?.provider === 'azure_app_service' && 'Estás conectado a Microsoft Azure App Service (Linux Web App).'}
                    {infraInfo?.provider === 'vercel' && 'Estás conectado a la red global de Vercel Edge / Serverless.'}
                    {infraInfo?.provider === 'ai_studio_sandbox' && 'Estás conectado al entorno de previsualización y desarrollo interactivo de Google AI Studio Sandbox.'}
                    {infraInfo?.provider === 'local_development' && 'Estás conectado a tu entorno de desarrollo local (localhost).'}
                  </p>
                </div>
              </div>

              {/* Host and Current URL info */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-bold">Dominio / Host Actual:</span>
                  <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span>{typeof window !== 'undefined' ? window.location.host : (infraInfo?.currentHost || 'Desconocido')}</span>
                    <button
                      onClick={() => {
                        if (typeof window !== 'undefined') {
                          navigator.clipboard.writeText(window.location.origin);
                          setCopiedField('host');
                          setTimeout(() => setCopiedField(null), 2000);
                        }
                      }}
                      className="p-0.5 hover:text-emerald-500 text-slate-400 cursor-pointer"
                      title="Copiar URL"
                    >
                      {copiedField === 'host' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200 dark:border-slate-700/50">
                  <span className="text-slate-500 font-bold">Base de Datos Conectada:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Database className="w-3.5 h-3.5" />
                    {dbStatus?.activeProvider === 'd1' ? 'Cloudflare D1 (SQLite)' : 'MongoDB Atlas (plan.esim_packages)'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200 dark:border-slate-700/50">
                  <span className="text-slate-500 font-bold">Modo del Sistema:</span>
                  <span className={`font-bold ${isTestMode ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {isTestMode ? '🧪 Pruebas (Simulado)' : '🚀 Producción en Vivo'}
                  </span>
                </div>
              </div>

              {/* Direct links to your clouds */}
              <div className="space-y-2">
                <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  <span>Accesos Directos a tus Nubes (para no equivocarte de pestaña):</span>
                </h5>

                <div className="grid grid-cols-1 gap-2">
                  
                  {/* Google Cloud Run Card */}
                  <a
                    href="https://esimfans.cloud.run"
                    target="_blank"
                    rel="noreferrer"
                    className={`p-3 rounded-xl border flex items-center justify-between transition-all group ${
                      infraInfo?.provider === 'google_cloud_run'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 ring-2 ring-emerald-500/20'
                        : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-750 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">🟢</span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">Google Cloud Run</span>
                          {infraInfo?.provider === 'google_cloud_run' && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-600 text-white uppercase">Estás aquí</span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono block">esimfans.cloud.run</span>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                  </a>

                  {/* Microsoft Azure Card */}
                  <a
                    href="https://esimfans-app-c5c6gwd9ezc6gwg5.westus3-01.azurewebsites.net"
                    target="_blank"
                    rel="noreferrer"
                    className={`p-3 rounded-xl border flex items-center justify-between transition-all group ${
                      infraInfo?.provider === 'azure_app_service'
                        ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 ring-2 ring-blue-500/20'
                        : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-750 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">🔵</span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">Microsoft Azure</span>
                          {infraInfo?.provider === 'azure_app_service' && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-blue-600 text-white uppercase">Estás aquí</span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono block truncate max-w-[280px]">esimfans-app...azurewebsites.net</span>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                  </a>

                  {/* Vercel Card */}
                  <a
                    href="https://mariodev-2fif.vercel.app"
                    target="_blank"
                    rel="noreferrer"
                    className={`p-3 rounded-xl border flex items-center justify-between transition-all group ${
                      infraInfo?.provider === 'vercel'
                        ? 'bg-violet-50 dark:bg-violet-950/40 border-violet-300 dark:border-violet-700 ring-2 ring-violet-500/20'
                        : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-755 hover:border-violet-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">▲</span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">Vercel</span>
                          {infraInfo?.provider === 'vercel' && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-violet-600 text-white uppercase">Estás aquí</span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono block">mariodev-2fif.vercel.app</span>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-violet-500 transition-colors" />
                  </a>

                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
              <button
                onClick={() => fetchInfrastructure(false)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingInfra ? 'animate-spin' : ''}`} />
                <span>Revalidar Nube</span>
              </button>
              <button
                onClick={() => setShowInfraModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
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
