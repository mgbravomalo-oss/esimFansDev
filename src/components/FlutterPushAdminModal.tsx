import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  Send,
  Bell,
  AlertTriangle,
  Clock,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Info,
  Radio,
  Mail,
  ChevronRight
} from 'lucide-react';
import { User, UserEsim } from '../types';
import { requestWebPushPermission } from '../utils/webPushManager';

interface FlutterPushAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  esims: UserEsim[];
}

export const FlutterPushAdminModal: React.FC<FlutterPushAdminModalProps> = ({
  isOpen,
  onClose,
  user,
  esims,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<'80_percent' | '90_percent' | '24_hours' | 'welcome' | 'custom'>('80_percent');
  const [customTitle, setCustomTitle] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(esims[0]?.country || 'España');
  const [selectedIccid, setSelectedIccid] = useState(esims[0]?.iccid || '8910300000063658185');
  const [sendEmailCopy, setSendEmailCopy] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [resultData, setResultData] = useState<any>(null);
  const [devicesList, setDevicesList] = useState<any[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchDevices();
    }
  }, [isOpen]);

  const fetchDevices = async () => {
    setIsLoadingDevices(true);
    try {
      const res = await fetch(`/api/user/profile?email=${encodeURIComponent(user.email || 'mgbravomalo@gmail.com')}`);
      const data = await res.json();
      if (data.success && data.customer?.fcmDevices) {
        setDevicesList(data.customer.fcmDevices);
      }
    } catch (e) {
      console.warn('Error al cargar dispositivos:', e);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  const handleClearOldDevices = async () => {
    if (!window.confirm('¿Deseas limpiar todos los dispositivos antiguos para dejar la cuenta limpia y registrar tu teléfono desde cero?')) return;
    setIsLoadingDevices(true);
    try {
      await fetch('/api/user/clear-fcm-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email || 'mgbravomalo@gmail.com' }),
      });
      setDevicesList([]);
      setResultData({
        success: true,
        title: '🧹 Dispositivos antiguos eliminados',
        body: 'Lista limpiada correctamente. Ahora abre la app de Flutter en tu teléfono e inicia sesión para registrar tu nuevo token limpio.',
      });
    } catch (e: any) {
      alert('Error limpiando dispositivos: ' + e.message);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  const handleTestBrowserPush = async () => {
    setIsLoading(true);
    setResultData(null);
    try {
      if ('Notification' in window) {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          const testTitle = selectedPreset === '80_percent' 
            ? `🔔 Alerta Wappa: 80% consumido en ${selectedCountry}`
            : selectedPreset === '90_percent'
            ? `⚠️ ¡Cuidado! 90% consumido en ${selectedCountry}`
            : selectedPreset === '24_hours'
            ? `⏳ Tu eSIM en ${selectedCountry} vence en 24 horas`
            : (customTitle || '🧪 Notificación de Prueba');
          const testBody = selectedPreset === '80_percent'
            ? `Has consumido el 80% de tus datos en ${selectedCountry}. Toca para recargar.`
            : (customBody || 'Notificación activa en este navegador.');
          
          new Notification(testTitle, {
            body: testBody,
            icon: '/favicon.png',
          });

          setResultData({
            success: true,
            title: testTitle,
            body: testBody,
            route: `/my-esims?iccid=${selectedIccid}`,
            results: [{ tokenPreview: 'Navegador Web Local', success: true }],
          });
        } else {
          setResultData({
            success: false,
            error: 'Permiso de notificaciones rechazado en tu navegador. Por favor permite las notificaciones en el icono de candado de la barra de direcciones.',
          });
        }
      } else {
        setResultData({
          success: false,
          error: 'Este navegador no soporta notificaciones de escritorio.',
        });
      }
    } catch (err: any) {
      setResultData({ success: false, error: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSendTestPush = async () => {
    setIsLoading(true);
    setResultData(null);
    try {
      const response = await fetch('/api/notifications/flutter-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email || 'mgbravomalo@gmail.com',
          testType: selectedPreset,
          customTitle: selectedPreset === 'custom' ? customTitle : undefined,
          customBody: selectedPreset === 'custom' ? customBody : undefined,
          country: selectedCountry,
          iccid: selectedIccid,
          sendEmailCopy,
        }),
      });

      const data = await response.json();
      setResultData(data);
      if (data.devices) {
        setDevicesList(data.devices);
      }
    } catch (err: any) {
      setResultData({
        success: false,
        error: err.message || 'Error de conexión con el servidor',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunFullCycle = async () => {
    setIsLoading(true);
    setResultData(null);
    try {
      const response = await fetch('/api/notifications/run-consumption-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail: user.email || 'mgbravomalo@gmail.com',
        }),
      });
      const data = await response.json();
      setResultData(data);
    } catch (err: any) {
      setResultData({ success: false, error: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-950/70 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Pruebas Push a la App Flutter
                </h3>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                  Admin
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Dispara notificaciones remotas directas al dispositivo móvil con la app Flutter
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">

          {/* Registered Flutter Devices Card */}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-purple-500 animate-pulse" />
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  Dispositivos Móviles Registrados ({devicesList.length})
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchDevices}
                  disabled={isLoadingDevices}
                  className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingDevices ? 'animate-spin' : ''}`} />
                  <span>Actualizar</span>
                </button>
                {devicesList.length > 0 && (
                  <button
                    onClick={handleClearOldDevices}
                    disabled={isLoadingDevices}
                    className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 disabled:opacity-50 ml-2"
                    title="Elimina los dispositivos antiguos caducados para dejar la cuenta limpia"
                  >
                    <span>🗑️ Limpiar caducados</span>
                  </button>
                )}
              </div>
            </div>

            {devicesList.length > 0 ? (
              <div className="space-y-1.5 pt-1">
                {devicesList.map((dev, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl shadow-2xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {dev.deviceName || 'Dispositivo Móvil'}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 uppercase font-bold">
                        {dev.platform || 'android'}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Token: {dev.token ? `${dev.token.substring(0, 10)}...` : 'Activo'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-800/60 space-y-2.5">
                <p className="text-xs text-purple-900 dark:text-purple-200 leading-relaxed">
                  No hay dispositivos registrados en este momento. Abre la app de Flutter en tu teléfono e inicia sesión, o registra este navegador ahora mismo para hacer pruebas:
                </p>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={async () => {
                      setIsLoadingDevices(true);
                      try {
                        const res = await requestWebPushPermission(user.email || 'mgbravomalo@gmail.com');
                        await fetchDevices();
                        if (res.success) {
                          alert('¡Dispositivo registrado correctamente! Ya puedes enviar la alerta.');
                        }
                      } finally {
                        setIsLoadingDevices(false);
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md shadow-purple-600/20 flex items-center gap-1.5 transition-all active:scale-95"
                  >
                    <span>📲 Registrar este Navegador como Dispositivo</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setIsLoadingDevices(true);
                      try {
                        const dummyToken = 'dev_mobile_simulated_' + Math.random().toString(36).substring(2, 12);
                        await fetch('/api/user/device-token', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            email: user.email || 'mgbravomalo@gmail.com',
                            fcmToken: dummyToken,
                            deviceName: 'Android Xiaomi (Simulado)',
                            platform: 'android',
                          }),
                        });
                        await fetchDevices();
                      } finally {
                        setIsLoadingDevices(false);
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold text-xs transition-all active:scale-95"
                  >
                    <span>🤖 Simular Dispositivo Android</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Test Presets Selection */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Selecciona el Tipo de Alerta a Probar
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Preset: 80% Data */}
              <button
                type="button"
                onClick={() => setSelectedPreset('80_percent')}
                className={`p-3 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                  selectedPreset === '80_percent'
                    ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 ring-2 ring-amber-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                    Alerta 80% Consumo
                  </h5>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Avisa que quedan 20% de datos y abre recarga
                  </p>
                </div>
              </button>

              {/* Preset: 90% Data */}
              <button
                type="button"
                onClick={() => setSelectedPreset('90_percent')}
                className={`p-3 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                  selectedPreset === '90_percent'
                    ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/30 ring-2 ring-rose-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                    Alerta 90% Consumo Crítico
                  </h5>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Alerta urgente antes de agotamiento total
                  </p>
                </div>
              </button>

              {/* Preset: 24h Expiry */}
              <button
                type="button"
                onClick={() => setSelectedPreset('24_hours')}
                className={`p-3 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                  selectedPreset === '24_hours'
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                    Alerta Vence en 24h
                  </h5>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Aviso de vigencia para extensión de días
                  </p>
                </div>
              </button>

              {/* Preset: Custom */}
              <button
                type="button"
                onClick={() => setSelectedPreset('custom')}
                className={`p-3 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                  selectedPreset === 'custom'
                    ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/30 ring-2 ring-purple-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                    Mensaje Personalizado
                  </h5>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Escribe un título y cuerpo específico
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Custom Message Inputs if selected */}
          {selectedPreset === 'custom' && (
            <div className="space-y-3 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 p-4 rounded-2xl">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Título de la Notificación
                </label>
                <input
                  type="text"
                  placeholder="Ej: 🚀 ¡Tu eSIM está lista para usar!"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mensaje / Cuerpo
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej: Toca aquí para ver tus detalles de conexión..."
                  value={customBody}
                  onChange={(e) => setCustomBody(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
          )}

          {/* Destination / eSIM Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                País de la Alerta
              </label>
              <input
                type="text"
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                ICCID Asociado
              </label>
              <input
                type="text"
                value={selectedIccid}
                onChange={(e) => setSelectedIccid(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-mono text-[11px]"
              />
            </div>
          </div>

          {/* Option: Send email copy */}
          <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sendEmailCopy}
              onChange={(e) => setSendEmailCopy(e.target.checked)}
              className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300 dark:border-slate-700"
            />
            <span className="flex items-center gap-1.5 font-medium">
              <Mail className="w-3.5 h-3.5 text-purple-500" />
              Enviar también copia de correo a <strong>{user.email || 'mgbravomalo@gmail.com'}</strong>
            </span>
          </label>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleSendTestPush}
              disabled={isLoading}
              className="w-full sm:flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/25 transition-all active:scale-95 disabled:opacity-50"
            >
              <Send className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Enviando Alerta a Flutter...' : 'Enviar Push a la App Flutter'}</span>
            </button>

            <button
              type="button"
              onClick={handleTestBrowserPush}
              disabled={isLoading}
              className="w-full sm:w-auto px-4 py-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
              title="Muestra la notificación inmediatamente en la pantalla de este navegador para verificar el mensaje"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Probar en este Navegador</span>
            </button>

            <button
              type="button"
              onClick={handleRunFullCycle}
              disabled={isLoading}
              className="w-full sm:w-auto px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors disabled:opacity-50"
              title="Ejecuta el ciclo de monitoreo real de todas las eSIMs en la base de datos"
            >
              🔄 Ciclo Cron
            </button>
          </div>

          {/* Result Response Preview */}
          {resultData && (
            <div className={`p-4 rounded-2xl border text-xs space-y-2 animate-in fade-in duration-200 ${
              resultData.success
                ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                : 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800/60 text-rose-900 dark:text-rose-200'
            }`}>
              <div className="flex items-center gap-2 font-bold text-sm">
                {resultData.success ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>¡Notificación entregada exitosamente a Flutter!</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    <span>Fallo al enviar notificación</span>
                  </>
                )}
              </div>

              {resultData.title && (
                <div className="bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60 space-y-1">
                  <p className="font-bold text-slate-900 dark:text-white">
                    {resultData.title}
                  </p>
                  <p className="text-slate-600 dark:text-slate-300">
                    {resultData.body}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Ruta: {resultData.route}
                  </p>
                </div>
              )}

              {resultData.error && (
                <p className="text-rose-700 dark:text-rose-300 font-medium">
                  {resultData.error}
                </p>
              )}

              {resultData.results && resultData.results.length > 0 && (
                <div className="space-y-1.5 pt-1.5">
                  <p className="font-semibold text-[11px] text-slate-700 dark:text-slate-300">
                    Resultado por dispositivo ({resultData.deliveredCount || 0} entregados de {resultData.results.length}):
                  </p>
                  <div className="space-y-1">
                    {resultData.results.map((r: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 font-mono">
                        <span className="truncate max-w-[200px]">{r.tokenPreview}</span>
                        {r.success ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Entregado
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-bold">
                            {r.error === 'NotRegistered' ? 'Expirado (App cerrada/reinstalada)' : (r.error || 'Error')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  {!resultData.success && (
                    <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
                      <p className="font-bold">📱 ¿Por qué no llegó la notificación?</p>
                      <p>
                        Los tokens registrados previamente en tu cuenta han caducado porque la app de Flutter se reinstaló o cerró su sesión.
                      </p>
                      <p>
                        👉 <strong>Para solucionarlo:</strong> Abre la app de Flutter en tu teléfono e inicia sesión con <strong>{user.email || 'tu correo'}</strong> para que registre tu token nuevo al instante.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {resultData.emailResult && resultData.emailResult.success && (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                  📧 Copia de correo enviada a tu bandeja de entrada.
                </p>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-purple-500" />
            <span>FCM Firebase Cloud Messaging v1</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};
