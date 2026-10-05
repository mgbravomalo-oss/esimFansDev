import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  Database,
  Globe,
  RefreshCw,
  Send,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Terminal,
  Cpu,
  Trash2,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Zap,
  Search,
  FileText,
  Smartphone
} from 'lucide-react';
import { User } from '../types';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  telemetry?: any;
}

interface AdminAiDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
}

const SUGGESTED_PROMPTS = [
  { label: '🩺 Diagnóstico Completo de Salud', query: 'Realiza un diagnóstico completo de salud de la plataforma, base de datos y eSIMAccess' },
  { label: '💰 Saldo en eSIMAccess', query: '¿Cuál es el saldo actual disponible en la cuenta mayorista de eSIMAccess y estado de conexión?' },
  { label: '🗄️ Estado de MongoDB Atlas', query: '¿Cómo está la conexión a MongoDB Atlas, latencia y colecciones?' },
  { label: '⏳ Pedidos Pendientes', query: '¿Hay pedidos pendientes de aprobación o problemas en las últimas compras?' },
  { label: '🧪 Modo de Operación Actual', query: '¿El sistema está operando en Modo de Pruebas o en Producción real?' },
];

export const AdminAiDiagnosticModal: React.FC<AdminAiDiagnosticModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: `👋 **¡Hola ${currentUser?.name || 'Administrador'}!** Soy tu **Copiloto IA de Diagnóstico y Operaciones**.

Tengo conexión en tiempo real con:
* 🗄️ **MongoDB Atlas** (latencia, colecciones, pedidos y usuarios)
* 🌐 **API Mayorista de eSIMAccess** (conectividad, saldo en USD e inventario)
* 📱 **Inspección de eSIMs y Pedidos** (búsqueda rápida por ID, ICCID o Nº de Pedido con historial)
* ⚙️ **Configuración del Sistema** (Modo de pruebas, validación de órdenes y logs de auditoría)

Puedes ingresar un **ID o ICCID** en la barra superior, elegir una orden del **Historial de Pedidos**, o hacerme cualquier consulta técnica.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedTelemetryId, setExpandedTelemetryId] = useState<string | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<{
    dbStatus?: string;
    dbLatency?: number;
    balanceUsd?: number;
    pendingOrders?: number;
    isTestMode?: boolean;
  }>({});

  // eSIM Quick Diagnostic Search State
  const [searchEsimId, setSearchEsimId] = useState('');
  const [orderHistoryEsims, setOrderHistoryEsims] = useState<Array<{
    orderNumber: string;
    id: string;
    esimId?: string;
    iccid?: string;
    country: string;
    flag?: string;
    planName: string;
    userEmail: string;
    userName?: string;
    status: string;
    createdAt?: string;
  }>>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [showOrderHistoryPicker, setShowOrderHistoryPicker] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
      // Fetch initial background health check and order history
      fetchInitialTelemetry();
      fetchOrderHistory();
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const fetchInitialTelemetry = async () => {
    try {
      const res = await fetch('/api/admin/settings');
      if (res.ok) {
        const data = await res.json();
        setLiveMetrics(prev => ({
          ...prev,
          pendingOrders: data.pendingOrdersCount,
          isTestMode: data.settings?.isTestMode,
        }));
      }
    } catch {}
  };

  const fetchOrderHistory = async () => {
    setIsLoadingOrders(true);
    try {
      const res = await fetch(`/api/orders?email=${encodeURIComponent(currentUser?.email || 'mgbravomalo@gmail.com')}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.orders)) {
          const list = data.orders.map((o: any) => ({
            orderNumber: o.orderNumber || o.id,
            id: o.id,
            esimId: o.generatedEsim?.id,
            iccid: o.generatedEsim?.iccid,
            country: o.country || 'Global',
            flag: o.flag || '🌐',
            planName: o.planName || 'Plan eSIM',
            userEmail: o.userEmail || '',
            userName: o.userName || '',
            status: o.status || 'unknown',
            createdAt: o.createdAt,
          }));
          setOrderHistoryEsims(list);
        }
      }
    } catch (e) {
      console.warn('Error fetching order history for diagnostic copilot:', e);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const handleDiagnoseEsim = (targetIdentifier?: string) => {
    const id = (targetIdentifier || searchEsimId).trim();
    if (!id || isLoading) return;

    const query = `Diagnóstico completo en tiempo real del estado de la eSIM o Pedido con identificador "${id}" (consultar base de datos Atlas, historial de pedidos y API de eSIMAccess)`;
    handleSend(query, id);
    setShowOrderHistoryPicker(false);
  };

  const handleSend = async (queryText?: string, explicitIdentifier?: string) => {
    const query = (queryText || inputQuery).trim();
    if (!query || isLoading) return;

    const userMessageId = `user-${Date.now()}`;
    const newMessages: Message[] = [
      ...messages,
      {
        id: userMessageId,
        sender: 'user',
        text: explicitIdentifier ? `🔍 Consultar estado de eSIM / Pedido: **${explicitIdentifier}**` : query,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];

    setMessages(newMessages);
    setInputQuery('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/admin/ai/diagnostic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': currentUser?.email || 'mgbravomalo@gmail.com',
        },
        body: JSON.stringify({ 
          query,
          identifier: explicitIdentifier || undefined,
        }),
      });

      const data = await res.json();

      if (data.success && data.answer) {
        const assistantMsg: Message = {
          id: `ai-${Date.now()}`,
          sender: 'assistant',
          text: data.answer,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          telemetry: data.telemetry,
        };

        setMessages(prev => [...prev, assistantMsg]);

        // Update live header telemetry
        if (data.telemetry) {
          setLiveMetrics({
            dbStatus: data.telemetry.database?.connected ? 'OK' : 'Error',
            dbLatency: data.telemetry.database?.latencyMs,
            balanceUsd: data.telemetry.esimAccess?.balance?.balanceUsd,
            pendingOrders: data.telemetry.database?.orders?.pending,
            isTestMode: data.telemetry.systemSettings?.isTestMode,
          });
        }
      } else {
        setMessages(prev => [
          ...prev,
          {
            id: `ai-err-${Date.now()}`,
            sender: 'assistant',
            text: `⚠️ **No fue posible obtener el diagnóstico:** ${data.error || 'Error desconocido del servidor.'}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: `ai-net-err-${Date.now()}`,
          sender: 'assistant',
          text: `🔴 **Error de comunicación de red:** ${err.message || 'No se pudo conectar al endpoint de diagnóstico.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'cleared',
        sender: 'assistant',
        text: '✨ Historial reiniciado. Hazme una consulta o pulsa uno de los diagnósticos rápidos.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  // Simple clean markdown formatter for bullets, bold, headers
  const renderFormattedText = (rawText: string) => {
    const lines = rawText.split('\n');
    return (
      <div className="space-y-1.5 text-xs sm:text-sm leading-relaxed">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) {
            return <div key={idx} className="h-1.5" />;
          }

          // Headers
          if (trimmed.startsWith('### ')) {
            return (
              <h4 key={idx} className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white pt-1.5 pb-0.5 border-b border-slate-200 dark:border-slate-800">
                {trimmed.replace(/^###\s+/, '')}
              </h4>
            );
          }
          if (trimmed.startsWith('## ')) {
            return (
              <h3 key={idx} className="text-sm sm:text-base font-bold text-emerald-600 dark:text-emerald-400 pt-2 pb-1 border-b border-slate-200 dark:border-slate-800">
                {trimmed.replace(/^##\s+/, '')}
              </h3>
            );
          }

          // Horizontal rule
          if (trimmed === '---') {
            return <hr key={idx} className="border-slate-200 dark:border-slate-800 my-2" />;
          }

          // Bullet list items
          if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
            const content = trimmed.substring(2);
            return (
              <div key={idx} className="flex items-start gap-2 pl-1">
                <span className="text-emerald-500 font-bold shrink-0 mt-0.5">•</span>
                <span dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(content) }} />
              </div>
            );
          }

          // Numbered lists
          if (/^\d+\.\s/.test(trimmed)) {
            const match = trimmed.match(/^(\d+\.)\s*(.*)/);
            return (
              <div key={idx} className="flex items-start gap-2 pl-1">
                <span className="text-slate-400 dark:text-slate-500 font-mono text-xs shrink-0 mt-0.5">{match ? match[1] : '•'}</span>
                <span dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(match ? match[2] : trimmed) }} />
              </div>
            );
          }

          // Standard paragraph
          return (
            <p key={idx} dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(trimmed) }} />
          );
        })}
      </div>
    );
  };

  const formatInlineMarkdown = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-white">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px] text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-700">$1</code>');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] sm:max-h-[85vh] animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-diagnostic-title"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between gap-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950 flex items-center justify-center font-bold shadow-md shadow-emerald-500/20 shrink-0">
              <Sparkles className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="ai-diagnostic-title" className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5">
                  <span>Copiloto IA de Diagnóstico</span>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Live Telemetry
                  </span>
                </h3>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Inspección inteligente en tiempo real de MongoDB Atlas y eSIMAccess API
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClearChat}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Limpiar conversación"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live System Quick Bar */}
        <div className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800/80 px-4 py-2 flex items-center justify-between gap-3 overflow-x-auto text-[11px] font-medium shrink-0">
          <div className="flex items-center gap-4 shrink-0">
            {/* MongoDB Pill */}
            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
              <Database className="w-3.5 h-3.5 text-emerald-500" />
              <span>MongoDB:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {liveMetrics.dbStatus || 'Conectado'}
              </span>
              {liveMetrics.dbLatency && (
                <span className="text-slate-400 text-[10px]">({liveMetrics.dbLatency}ms)</span>
              )}
            </div>

            {/* eSIMAccess Pill */}
            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
              <Globe className="w-3.5 h-3.5 text-teal-500" />
              <span>eSIMAccess:</span>
              <span className="font-bold text-teal-600 dark:text-teal-400">
                {liveMetrics.balanceUsd !== undefined ? `$${liveMetrics.balanceUsd.toFixed(2)} USD` : 'Online'}
              </span>
            </div>

            {/* Orders Pill */}
            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>Pendientes:</span>
              <span className={`font-bold px-1.5 py-0.2 rounded-full text-[10px] ${
                (liveMetrics.pendingOrders || 0) > 0 ? 'bg-amber-500 text-slate-950 animate-pulse' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}>
                {liveMetrics.pendingOrders ?? 0}
              </span>
            </div>

            {/* Mode Pill */}
            <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
              <ShieldCheck className="w-3 h-3 text-purple-400" />
              <span>Modo: {liveMetrics.isTestMode !== false ? 'Pruebas (Fake)' : 'Producción'}</span>
            </div>
          </div>

          <button
            onClick={() => handleSend('Realiza una comprobación inmediata de latencia y estado')}
            disabled={isLoading}
            className="flex items-center gap-1 text-slate-500 hover:text-emerald-500 transition-colors text-[10px] font-semibold shrink-0 disabled:opacity-50"
            title="Refrescar telemetría ahora"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin text-emerald-500' : ''}`} />
            <span className="hidden sm:inline">Refrescar</span>
          </button>
        </div>

        {/* Quick eSIM / ICCID / Order Status Search Bar */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-3 sm:px-5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4 text-emerald-500" />
              </div>
              <input
                type="text"
                value={searchEsimId}
                onChange={(e) => setSearchEsimId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleDiagnoseEsim();
                  }
                }}
                placeholder="Buscar eSIM por ID (esim-...), ICCID (89...) o Pedido (WPA-...)"
                disabled={isLoading}
                className="w-full pl-9 pr-24 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono"
              />
              {searchEsimId && (
                <button
                  type="button"
                  onClick={() => setSearchEsimId('')}
                  className="absolute inset-y-0 right-24 pr-2 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDiagnoseEsim()}
                disabled={!searchEsimId.trim() || isLoading}
                className="absolute right-1 top-1 bottom-1 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-xs disabled:opacity-40 transition-all active:scale-95 cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
                <span>Diagnosticar</span>
              </button>
            </div>

            {/* Selector desde el historial de pedidos */}
            <button
              type="button"
              onClick={() => setShowOrderHistoryPicker(!showOrderHistoryPicker)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                showOrderHistoryPicker
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              title="Abrir lista de órdenes recientes con eSIM"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
              <span>Historial de Pedidos</span>
              {orderHistoryEsims.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-600 text-white font-bold">
                  {orderHistoryEsims.length}
                </span>
              )}
              {showOrderHistoryPicker ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Quick Order Picker Dropdown Panel */}
          {showOrderHistoryPicker && (
            <div className="mt-2.5 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl animate-in fade-in duration-150">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-emerald-500" />
                  <span>eSIMs y Órdenes en el historial de pedidos:</span>
                </span>
                <span className="text-[10px] text-slate-400">Haz clic en una orden para diagnosticarla de inmediato</span>
              </div>

              {isLoadingOrders ? (
                <div className="py-3 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                  <span>Cargando órdenes desde MongoDB Atlas...</span>
                </div>
              ) : orderHistoryEsims.length === 0 ? (
                <div className="py-2 text-center text-xs text-slate-400">
                  No se encontraron órdenes registradas en el historial.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {orderHistoryEsims.map((ord, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        const target = ord.iccid || ord.esimId || ord.orderNumber;
                        setSearchEsimId(target);
                        handleDiagnoseEsim(target);
                      }}
                      className="text-left p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500/60 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-all group flex items-start gap-2.5 cursor-pointer"
                    >
                      <span className="text-xl leading-none shrink-0 mt-0.5">{ord.flag}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                            #{ord.orderNumber}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                            ord.status === 'approved' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }`}>
                            {ord.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                          {ord.country} • {ord.planName}
                        </div>
                        {ord.iccid ? (
                          <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 truncate mt-0.5">
                            ICCID: {ord.iccid}
                          </div>
                        ) : ord.esimId ? (
                          <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                            ID: {ord.esimId}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            {ord.userEmail}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} animate-in fade-in duration-200`}
            >
              <div
                className={`max-w-[88%] sm:max-w-[80%] rounded-2xl p-4 shadow-xs ${
                  msg.sender === 'user'
                    ? 'bg-emerald-600 text-white rounded-tr-xs'
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700/60 rounded-tl-xs'
                }`}
              >
                {/* Dedicated Visual eSIM Diagnostic Card */}
                {msg.sender === 'assistant' && msg.telemetry?.targetIccidInspection && (
                  <div className="mb-3.5 p-3 sm:p-4 rounded-xl bg-white dark:bg-slate-900 border border-emerald-500/40 shadow-xs">
                    <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-800 gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl leading-none">
                          {msg.telemetry.targetIccidInspection.country === 'España' ? '🇪🇸' : '🌐'}
                        </span>
                        <div>
                          <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                            <span>eSIM: {msg.telemetry.targetIccidInspection.searchedIdentifier || msg.telemetry.targetIccidInspection.iccid}</span>
                            {msg.telemetry.targetIccidInspection.orderInfo?.orderNumber && (
                              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                                #{msg.telemetry.targetIccidInspection.orderInfo.orderNumber}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {msg.telemetry.targetIccidInspection.country} • {msg.telemetry.targetIccidInspection.orderInfo?.planName || 'Plan eSIM'} • {msg.telemetry.targetIccidInspection.userEmail || 'Sin usuario'}
                          </div>
                        </div>
                      </div>
                      <div>
                        <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                          msg.telemetry.targetIccidInspection.providerUsage?.status === 'CANCEL'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800 animate-pulse'
                            : msg.telemetry.targetIccidInspection.foundInDatabase
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}>
                          {msg.telemetry.targetIccidInspection.providerUsage?.status === 'CANCEL'
                            ? 'CANCELADA EN CARRIER'
                            : msg.telemetry.targetIccidInspection.statusInDb || 'CONSULTADA'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2.5 text-[11px]">
                      <div className="bg-slate-50 dark:bg-slate-950/80 p-2 rounded-lg border border-slate-100 dark:border-slate-800/80">
                        <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-semibold">ICCID</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-[10px] break-all">
                          {msg.telemetry.targetIccidInspection.iccid || 'N/A'}
                        </span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-950/80 p-2 rounded-lg border border-slate-100 dark:border-slate-800/80">
                        <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-semibold">MongoDB Atlas</span>
                        <span className={`font-bold ${msg.telemetry.targetIccidInspection.foundInDatabase ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'}`}>
                          {msg.telemetry.targetIccidInspection.foundInDatabase ? 'Registrada (OK)' : 'Solo en Orden'}
                        </span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-950/80 p-2 rounded-lg border border-slate-100 dark:border-slate-800/80">
                        <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-semibold">Carrier (eSIMAccess)</span>
                        <span className={`font-bold ${
                          msg.telemetry.targetIccidInspection.providerUsage?.status === 'CANCEL'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-teal-600 dark:text-teal-400'
                        }`}>
                          {msg.telemetry.targetIccidInspection.providerUsage?.status || 'Simulado / OK'}
                        </span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-950/80 p-2 rounded-lg border border-slate-100 dark:border-slate-800/80">
                        <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-semibold">Consumo Datos</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {msg.telemetry.targetIccidInspection.usedDataGB ?? 0} / {msg.telemetry.targetIccidInspection.totalDataGB ?? 0} GB
                        </span>
                      </div>
                    </div>

                    {msg.telemetry.targetIccidInspection.providerUsage?.status === 'CANCEL' && (
                      <div className="mt-2.5 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-[11px] text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                        <span><strong>Discrepancia crítica:</strong> El mayorista eSIMAccess reporta el perfil como <strong>CANCELADO</strong>. El cliente no podrá navegar con esta eSIM.</span>
                      </div>
                    )}
                  </div>
                )}

                {msg.sender === 'assistant' ? (
                  renderFormattedText(msg.text)
                ) : (
                  <p className="text-xs sm:text-sm whitespace-pre-wrap font-medium">{msg.text}</p>
                )}

                {/* Optional Telemetry Accordion for Assistant Messages */}
                {msg.telemetry && (
                  <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                    <button
                      onClick={() =>
                        setExpandedTelemetryId(expandedTelemetryId === msg.id ? null : msg.id)
                      }
                      className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                    >
                      <Terminal className="w-3 h-3" />
                      <span>{expandedTelemetryId === msg.id ? 'Ocultar Telemetría Técnica' : 'Ver Telemetría Cruda (JSON)'}</span>
                      {expandedTelemetryId === msg.id ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>

                    {expandedTelemetryId === msg.id && (
                      <div className="mt-2 bg-slate-900 text-emerald-400 p-3 rounded-xl font-mono text-[10px] overflow-x-auto max-h-48 border border-slate-800 animate-in fade-in duration-150">
                        <pre>{JSON.stringify(msg.telemetry, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <span className="text-[10px] text-slate-400 px-1 mt-1 font-mono">{msg.timestamp}</span>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-start gap-2.5 animate-in fade-in duration-200">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold shrink-0">
                <Sparkles className="w-4 h-4 animate-spin" />
              </div>
              <div className="bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl rounded-tl-xs p-3.5 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>Consultando estado en vivo en MongoDB y eSIMAccess...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Quick Action Chips */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950/40 border-t border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 hidden sm:inline">
            Sugeridos:
          </span>
          {SUGGESTED_PROMPTS.map((item, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(item.query)}
              disabled={isLoading}
              className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-700 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors shrink-0 disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Escribe tu consulta (ej: ¿Cuánto saldo queda? o estado de la orden #WPA-123)..."
              disabled={isLoading}
              className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || isLoading}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white disabled:text-slate-400 font-bold text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-sm active:scale-95 disabled:scale-100 disabled:opacity-60"
            >
              <span>Preguntar</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 px-1">
            <span>💡 Consulta en vivo respaldada por Gemini AI y telemetría de Atlas</span>
            <span className="hidden sm:inline">Presiona Escape o haz clic fuera para cerrar</span>
          </div>
        </div>
      </div>
    </div>
  );
};
