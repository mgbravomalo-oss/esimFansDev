import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Check,
  Smartphone,
  HelpCircle,
  Plus,
  Trash2,
  RefreshCw,
  SlidersHorizontal,
  Save,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Cpu,
  Phone,
  Play
} from 'lucide-react';
import { COMPATIBLE_DEVICES as FALLBACK_COMPATIBLE_DEVICES } from '../data/esimData';
import { CompatibleDevice, User } from '../types';
import { isRunningInFlutter, checkFlutterEsimSupport, FlutterEsimCheckResult, triggerNativeHaptic } from '../utils/flutterBridge';
import { InteractivePhoneDialerModal } from './InteractivePhoneDialerModal';

interface DeviceCompatibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: User | null;
  isAdmin?: boolean;
  onOpenFlutterDevGuide?: () => void;
  onOpenPhoneDialer?: () => void;
}

export const DeviceCompatibilityModal: React.FC<DeviceCompatibilityModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  isAdmin = false,
  onOpenFlutterDevGuide,
  onOpenPhoneDialer
}) => {
  const isUserAdmin = Boolean(
    isAdmin ||
    (currentUser && (
      currentUser.role === 'admin' ||
      (currentUser as any).isAdmin === true ||
      currentUser.email?.toLowerCase().trim() === 'mgbravomalo@gmail.com' ||
      currentUser.email?.toLowerCase().includes('admin') ||
      currentUser.email?.toLowerCase().trim() === 'admin@wappa.io'
    ))
  );

  const [searchPhone, setSearchPhone] = useState('');
  const [devices, setDevices] = useState<CompatibleDevice[]>(FALLBACK_COMPATIBLE_DEVICES);
  const [isLoading, setIsLoading] = useState(false);
  const [dataSource, setDataSource] = useState<'mongodb_atlas' | 'local_fallback'>('local_fallback');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null);
  const [isPhoneDialerOpen, setIsPhoneDialerOpen] = useState(false);

  // Flutter Native eSIM Check
  const inFlutter = isRunningInFlutter();
  const [hardwareCheckResult, setHardwareCheckResult] = useState<FlutterEsimCheckResult | null>(null);
  const [isCheckingHardware, setIsCheckingHardware] = useState(false);

  const handleCheckHardware = async () => {
    setIsCheckingHardware(true);
    triggerNativeHaptic('light');
    try {
      const res = await checkFlutterEsimSupport();
      setHardwareCheckResult(res);
      if (res.supported) {
        triggerNativeHaptic('success');
      } else {
        triggerNativeHaptic('warning');
      }
    } catch (e: any) {
      setHardwareCheckResult({
        supported: false,
        details: e.message || 'Error consultando paquete nativo',
        source: 'unknown',
      });
    } finally {
      setIsCheckingHardware(false);
    }
  };

  // New Brand / Device Form State
  const [isAddingBrand, setIsAddingBrand] = useState(false);
  const [newBrand, setNewBrand] = useState('');
  const [newModels, setNewModels] = useState('');
  const [newInstructions, setNewInstructions] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Quick add model to existing brand
  const [addingModelToId, setAddingModelToId] = useState<string | null>(null);
  const [singleNewModel, setSingleNewModel] = useState('');

  const fetchDevices = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/compatible-devices');
      const data = await res.json();
      if (data.success && Array.isArray(data.devices) && data.devices.length > 0) {
        setDevices(data.devices);
        setDataSource(data.source || 'mongodb_atlas');
      } else {
        setDevices(FALLBACK_COMPATIBLE_DEVICES);
      }
    } catch (err) {
      console.warn('Error fetching compatible devices from API:', err);
      setDevices(FALLBACK_COMPATIBLE_DEVICES);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDevices();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const cleanSearchPhone = searchPhone.replace(/\s+/g, '').toLowerCase();
  const filteredBrands = devices
    .map((b) => ({
      ...b,
      models: b.models.filter(
        (m) =>
          m.replace(/\s+/g, '').toLowerCase().includes(cleanSearchPhone) ||
          b.brand.toLowerCase().includes(cleanSearchPhone)
      ),
    }))
    .filter((b) => b.models.length > 0 || cleanSearchPhone === '');

  const totalModelsCount = devices.reduce((acc, curr) => acc + (curr.models?.length || 0), 0);

  // Handle Save New Brand
  const handleCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrand.trim() || !newModels.trim()) return;

    setIsSaving(true);
    try {
      const modelsArray = newModels
        .split(/[\n,]+/)
        .map((m) => m.trim())
        .filter((m) => m.length > 0);

      const res = await fetch('/api/compatible-devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: newBrand.trim(),
          models: modelsArray,
          instructions: newInstructions.trim() || 'Ajustes > Conexiones > Añadir eSIM',
          order: devices.length + 1,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setNewBrand('');
        setNewModels('');
        setNewInstructions('');
        setIsAddingBrand(false);
        await fetchDevices();
      } else {
        alert(data.error || 'Error al guardar');
      }
    } catch (err: any) {
      alert(err?.message || 'Error de conexión');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Quick Add Model to existing brand
  const handleAddModelToBrand = async (device: CompatibleDevice) => {
    if (!singleNewModel.trim() || !device.id) return;
    setIsSaving(true);
    try {
      const updatedModels = [...device.models, singleNewModel.trim()];
      const res = await fetch(`/api/compatible-devices/${device.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          models: updatedModels,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSingleNewModel('');
        setAddingModelToId(null);
        await fetchDevices();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Delete Model from brand
  const handleDeleteModel = async (device: CompatibleDevice, modelIndex: number) => {
    if (!device.id) return;
    const updatedModels = device.models.filter((_, idx) => idx !== modelIndex);
    try {
      const res = await fetch(`/api/compatible-devices/${device.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          models: updatedModels,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchDevices();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Delete Entire Brand
  const handleDeleteBrand = async (device: CompatibleDevice) => {
    if (!device.id) return;
    if (!confirm(`¿Estás seguro de eliminar la marca "${device.brand}" y todos sus modelos?`)) return;
    try {
      const res = await fetch(`/api/compatible-devices/${device.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        await fetchDevices();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative overflow-hidden text-slate-900 dark:text-white max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-800/40">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Dispositivos Compatibles con eSIM
              </h2>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                <span>Verifica si tu teléfono o tablet soporta tecnología eSIM</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isUserAdmin && (
              <button
                onClick={() => setIsAdminMode(!isAdminMode)}
                title={isAdminMode ? 'Cerrar modo gestión' : 'Gestionar / Añadir modelos en BD'}
                className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  isAdminMode
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline">{isAdminMode ? 'Vista Usuario' : 'Gestionar BD'}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div className="py-3 shrink-0 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
            <input
              type="text"
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              placeholder="Buscar modelo o marca (ej. iPhone 16, S24, Pixel 9, Xiaomi...)"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 shadow-xs"
            />
          </div>
          <button
            onClick={fetchDevices}
            disabled={isLoading}
            title="Recargar desde base de datos"
            className="p-2.5 border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-500' : ''}`} />
          </button>
          {isUserAdmin && isAdminMode && (
            <button
              onClick={() => setIsAddingBrand(!isAddingBrand)}
              className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nueva Marca</span>
            </button>
          )}
        </div>

        {/* New Brand Form (Admin Mode) */}
        {isUserAdmin && isAdminMode && isAddingBrand && (
          <form
            onSubmit={handleCreateBrand}
            className="mb-3 p-4 bg-slate-100 dark:bg-slate-800/95 border-2 border-emerald-500/50 rounded-xl space-y-3 shrink-0 text-xs shadow-md"
          >
            <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
              <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-sm font-bold">
                <Plus className="w-4 h-4" /> Añadir Nueva Marca
              </span>
              <button
                type="button"
                onClick={() => setIsAddingBrand(false)}
                className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                placeholder="Nombre de la Marca (ej. Sony, OnePlus)"
                className="px-3 py-2 bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white"
                required
              />
              <input
                type="text"
                value={newInstructions}
                onChange={(e) => setNewInstructions(e.target.value)}
                placeholder="Instrucciones (ej. Ajustes > SIM > Añadir)"
                className="px-3 py-2 bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <textarea
                value={newModels}
                onChange={(e) => setNewModels(e.target.value)}
                placeholder="Modelos compatibles (separados por coma o uno por línea, ej: Modelo Pro, Modelo Plus, Modelo Lite)"
                rows={2}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddingBrand(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Guardando...' : 'Guardar'}</span>
              </button>
            </div>
          </form>
        )}

        {/* List */}
        <div className="space-y-4 overflow-y-auto pr-1.5 flex-1 py-1">
          {/* Flutter Native Hardware Diagnostic Card */}
          {inFlutter && (
            <div className="bg-gradient-to-r from-teal-500/10 via-emerald-500/15 to-teal-500/10 border-2 border-emerald-500/30 rounded-xl p-3.5 text-xs shadow-xs space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white">
                      Diagnóstico de Hardware en Vivo
                    </h4>
                  </div>
                </div>

                <button
                  onClick={handleCheckHardware}
                  disabled={isCheckingHardware}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  {isCheckingHardware ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Comprobando...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                      <span>Comprobar Ahora</span>
                    </>
                  )}
                </button>
              </div>

              {hardwareCheckResult && (
                <div className={`p-2.5 rounded-lg text-xs flex items-start gap-2 animate-fade-in ${
                  hardwareCheckResult.supported
                    ? 'bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-200'
                    : 'bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-200'
                }`}>
                  {hardwareCheckResult.supported ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-bold block">
                      {hardwareCheckResult.supported
                        ? '¡Dispositivo 100% Compatible con eSIM!'
                        : 'Dispositivo sin soporte eSIM detectado'}
                    </span>
                    <span className="text-[11px] opacity-90 block">
                      {hardwareCheckResult.details}
                      {hardwareCheckResult.deviceModel ? ` • Modelo: ${hardwareCheckResult.deviceModel}` : ''}
                    </span>
                  </div>
                </div>
              )}

              {isAdmin && onOpenFlutterDevGuide && (
                <div className="pt-1 flex justify-end">
                  <button
                    onClick={() => {
                      onClose();
                      onOpenFlutterDevGuide();
                    }}
                    className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <span>Ver código Dart de Flutter (esim_manager)</span>
                    <span>→</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Quick code check banner with Phone Dialer button */}
          <div className="bg-emerald-100/90 dark:bg-emerald-950/70 border-2 border-emerald-300 dark:border-emerald-800 rounded-xl p-3.5 text-xs text-emerald-950 dark:text-emerald-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3 flex-1">
              <HelpCircle className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block text-emerald-950 dark:text-emerald-200 text-xs mb-0.5">
                  Comprobación rápida mediante teclado:
                </span>
                <span className="text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                  Marca <strong className="font-mono bg-white dark:bg-emerald-900 px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 font-bold">*#06#</strong> en tu teléfono. Si aparece un número <strong>EID</strong> (código de 32 dígitos), tu dispositivo es 100% compatible con eSIM.
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (onOpenPhoneDialer) {
                  onOpenPhoneDialer();
                } else {
                  setIsPhoneDialerOpen(true);
                }
              }}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer active:scale-95 group"
            >
              <Smartphone className="w-4 h-4 text-emerald-300 group-hover:animate-bounce" />
              <span>Discar en Teléfono Virtual (*#06#)</span>
            </button>
          </div>

          {filteredBrands.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <Smartphone className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
              <p className="text-sm font-semibold">No se encontraron modelos con &ldquo;{searchPhone}&rdquo;</p>
              <p className="text-xs text-slate-500 mt-1">Prueba escribiendo otra marca o modelo (ej. iPhone, Galaxy, Pixel)</p>
            </div>
          ) : (
            filteredBrands.map((brandGroup) => (
              <div
                key={brandGroup.id || brandGroup.brand}
                className="border-2 border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/90 dark:bg-slate-800/80 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                {/* Brand Header */}
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-700/80">
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-sm font-bold text-slate-950 dark:text-white">
                      {brandGroup.brand}
                    </h3>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-200/90 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                      {brandGroup.models.length} modelos
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {brandGroup.instructions && (
                      <span className="text-xs text-slate-600 dark:text-slate-300 hidden sm:inline max-w-sm truncate font-medium">
                        {brandGroup.instructions}
                      </span>
                    )}
                    {isUserAdmin && isAdminMode && (
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          onClick={() =>
                            setAddingModelToId(
                              addingModelToId === brandGroup.id ? null : (brandGroup.id || null)
                            )
                          }
                          title="Añadir modelo a esta marca"
                          className="p-1.5 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800 rounded-lg transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteBrand(brandGroup)}
                          title="Eliminar marca"
                          className="p-1.5 bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-800 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick add model input for this brand */}
                {isUserAdmin && isAdminMode && addingModelToId === brandGroup.id && (
                  <div className="mt-3 p-3 bg-white dark:bg-slate-900 border border-emerald-500/50 rounded-xl flex items-center gap-2 shadow-xs">
                    <input
                      type="text"
                      value={singleNewModel}
                      onChange={(e) => setSingleNewModel(e.target.value)}
                      placeholder={`Nuevo modelo para ${brandGroup.brand}...`}
                      className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-900 dark:text-white"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddModelToBrand(brandGroup);
                      }}
                    />
                    <button
                      onClick={() => handleAddModelToBrand(brandGroup)}
                      disabled={isSaving || !singleNewModel.trim()}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-xs"
                    >
                      Añadir
                    </button>
                    <button
                      onClick={() => setAddingModelToId(null)}
                      className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Models Grid */}
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3">
                  {brandGroup.models.map((model, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between group rounded-xl px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 shadow-xs hover:border-emerald-500/50 dark:hover:border-emerald-500/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-1">
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 stroke-[2.5]" />
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {model}
                        </span>
                      </div>
                      {isUserAdmin && isAdminMode && (
                        <button
                          onClick={() => handleDeleteModel(brandGroup, idx)}
                          title="Eliminar este modelo"
                          className="opacity-0 group-hover:opacity-100 p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded transition-opacity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>

      {/* Interactive Phone Dialer Modal */}
      <InteractivePhoneDialerModal
        isOpen={isPhoneDialerOpen}
        onClose={() => setIsPhoneDialerOpen(false)}
        initialDial="*#06#"
      />
    </div>
  );
};
