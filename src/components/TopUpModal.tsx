import React, { useState, useEffect } from 'react';
import { X, Zap, Check, CreditCard, ShieldCheck, AlertTriangle, Loader2, ArrowRight, QrCode, Smartphone } from 'lucide-react';
import { UserEsim } from '../types';
import { CountryFlag } from './CountryFlag';

interface TopUpModalProps {
  esim: UserEsim | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmTopUp: (esimId: string, addedGB: number, price: number, packageCode?: string) => void;
  onNavigateToStore: () => void;
  onOpenQrCode?: (esim: UserEsim) => void;
}

export const TopUpModal: React.FC<TopUpModalProps> = ({
  esim,
  isOpen,
  onClose,
  onConfirmTopUp,
  onNavigateToStore,
  onOpenQrCode
}) => {
  const [checking, setChecking] = useState(true);
  const [canTopup, setCanTopup] = useState(true);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [topupCount, setTopupCount] = useState(0);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);
  const [packages, setPackages] = useState<any[]>([]);
  const [selectedPack, setSelectedPack] = useState<any | null>(null);

  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  // Run check when modal opens or esim changes
  useEffect(() => {
    if (isOpen && esim) {
      setChecking(true);
      setEligibilityError(null);
      setCanTopup(true);
      setBlockReason(null);
      setPackages([]);
      setSelectedPack(null);

      fetch(`/api/user/esims/topup/check/${esim.iccid}`)
        .then((res) => res.json())
        .then((data) => {
          setChecking(false);
          if (data.success) {
            setCanTopup(data.canTopup);
            setBlockReason(data.blockReason || null);
            setTopupCount(data.topupCount || 0);
            
            if (!data.canTopup) {
              setEligibilityError(data.error);
            } else {
              // We have compatible packages
              const packsList = data.packages || [];
              setPackages(packsList);
              if (packsList.length > 0) {
                setSelectedPack(packsList[0]);
              }
            }
          } else {
            setEligibilityError(data.error || 'No se pudo verificar la elegibilidad de recarga.');
            setCanTopup(false);
          }
        })
        .catch((err) => {
          console.error('Error checking topup eligibility:', err);
          setChecking(false);
          setEligibilityError('Error de red al consultar con el operador móvil.');
          setCanTopup(false);
        });
    }
  }, [isOpen, esim]);

  if (!isOpen || !esim) return null;

  const handlePay = () => {
    if (!selectedPack) return;
    setProcessing(true);

    const addedGB = Number(((selectedPack.volume || selectedPack.dataAmount || 1024 * 1024 * 1024) / (1024 * 1024 * 1024)).toFixed(0));
    const priceUsd = typeof selectedPack.price === 'number' && selectedPack.price > 1000 
      ? Number((selectedPack.price / 10000).toFixed(2)) 
      : (selectedPack.priceEUR || selectedPack.priceUsd || 5);

    setTimeout(() => {
      onConfirmTopUp(esim.id, addedGB, priceUsd, selectedPack.packageCode || selectedPack.slug);
      setProcessing(false);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in" id="topup-modal">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-xl relative overflow-hidden text-slate-900 dark:text-white">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Recargar Datos para eSIM</h2>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                <CountryFlag flag={esim.flag} countryCode={esim.countryCode} countryName={esim.country} size="xs" rounded="sm" />
                <span>{esim.country} - {esim.operator}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {checking ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 animate-spin" />
            <div className="text-center">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Consultando con el Operador Móvil...</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-mono">Verificando compatibilidad de paquetes, estado e historial</p>
            </div>
          </div>
        ) : success ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">¡Recarga Completada!</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Se han añadido los datos de recarga a tu eSIM existente sin necesidad de volver a escanear el QR.
            </p>
          </div>
        ) : !canTopup ? (
          <div className="py-6 space-y-4">

            {/* If the eSIM is pending installation */}
            {blockReason === 'not_installed_yet' ? (
              <div className="p-4 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-xl space-y-3">
                <div className="flex items-start gap-2.5">
                  <Smartphone className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-emerald-950 dark:text-emerald-300">
                      eSIM Comprada - Lista para Instalar
                    </h4>
                    <p className="text-xs text-emerald-900/80 dark:text-emerald-400 mt-1 leading-relaxed">
                      Esta eSIM ({esim.planName || esim.country}) ya está generada y tiene su paquete original de datos intacto.
                    </p>
                    <p className="text-xs text-emerald-900/80 dark:text-emerald-400 mt-2 leading-relaxed">
                      Para evitar problemas técnicos o reinicios de validez con el operador móvil, primero debes instalar la eSIM en tu teléfono usando el código QR antes de añadir recargas.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onClose();
                    if (onOpenQrCode) {
                      onOpenQrCode(esim);
                    }
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-xs"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Ver Código QR e Instalar eSIM</span>
                </button>
              </div>
            ) : (
              /* If invalid status (expired/canceled) or limit reached */
              <>
                <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-rose-900 dark:text-rose-300">
                        {blockReason === 'limit_reached' ? 'Límite de Recargas Alcanzado (9/9)' : 'eSIM no Elegible para Recargas'}
                      </h4>
                      <p className="text-xs text-rose-800 dark:text-rose-400 mt-1 leading-relaxed">
                        {eligibilityError || 'La eSIM actual no admite paquetes de recarga.'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-xs space-y-1.5">
                  <div className="flex justify-between text-slate-500">
                    <span>Historial de recargas hechas:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">{topupCount} de 9</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Estado actual de la eSIM:</span>
                    <span className="font-bold text-rose-600 dark:text-rose-400 uppercase font-mono">{esim.status}</span>
                  </div>
                </div>

                {/* Alternativa recomendada para expiradas o limite */}
                <div className="p-4 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl space-y-2.5">
                  <div className="text-xs font-bold text-amber-950 dark:text-amber-300 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>¿Necesitas seguir navegando?</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Al tratarse de un plan que no admite recarga adicional, <strong>al agotar los días para los que se contrata o consumir su saldo, es necesario comprar una nueva eSIM</strong>.
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Adquiere un nuevo plan para {esim.country} de forma inmediata. Te daremos un nuevo código QR al instante para que continúes conectado sin interrupciones.
                  </p>
                  <button
                    onClick={() => {
                      onClose();
                      onNavigateToStore();
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>Comprar un Nuevo Plan eSIM</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}

            <button
              onClick={onClose}
              className="w-full py-2 px-4 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-semibold transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              Cerrar Ventana
            </button>
          </div>
        ) : (
          <div className="py-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Selecciona paquete de datos adicional
              </label>
              {packages.length === 0 ? (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 rounded-xl space-y-2.5">
                    <p className="font-bold text-xs text-amber-900 dark:text-amber-300">
                      Este plan no admite paquetes de recarga
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      El operador móvil para el plan contratado de {esim.country} ({esim.planName}) no admite recargas de datos secundarias sobre el mismo perfil.
                    </p>
                    <div className="p-2.5 bg-amber-100/70 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-950 dark:text-amber-200 leading-relaxed font-medium">
                      💡 <strong>Información importante:</strong> Al agotar los días para los que se contrata esta eSIM (o su paquete de datos), no es posible recargarla. Debes comprar un nuevo plan eSIM para seguir navegando.
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      onClose();
                      onNavigateToStore();
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2"
                  >
                    <span>Comprar un Nuevo Plan eSIM</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                  {packages.map((pack, idx) => {
                    const isSelected = selectedPack?.packageCode === pack.packageCode || selectedPack?.slug === pack.slug;
                    const gbValue = Number(((pack.volume || pack.dataAmount || 1024*1024*1024) / (1024*1024*1024)).toFixed(0));
                    const durationDays = Number(pack.duration || pack.validityDays || 7);
                    const priceUsd = typeof pack.price === 'number' && pack.price > 1000 
                      ? Number((pack.price / 10000).toFixed(2)) 
                      : (pack.priceEUR || pack.priceUsd || 5);

                    return (
                      <button
                        key={pack.packageCode || pack.slug || idx}
                        onClick={() => setSelectedPack(pack)}
                        className={`p-3 rounded-xl border text-left transition-all relative ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40 shadow-xs'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40'
                        }`}
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {pack.name || pack.packageName || `+${gbValue} GB`}
                        </div>
                        <div className="text-xs text-emerald-700 dark:text-emerald-400 font-bold mt-1">
                          ${priceUsd.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                          +{durationDays} días de validez
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Summary Box & Pay Button only shown if packages are available */}
            {packages.length > 0 && selectedPack && (
              <>
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>eSIM de Destino:</span>
                    <span className="font-semibold text-slate-900 dark:text-white font-mono">{esim.iccid.slice(-6)} ({esim.country})</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>Contador de Recargas:</span>
                    <span className="font-semibold text-slate-900 dark:text-white font-mono">{topupCount} de 9 hechas</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>Paquete Seleccionado:</span>
                    <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">
                      {selectedPack.name || selectedPack.packageName || 'Recarga eSIM'}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-200 dark:border-slate-700 text-sm font-bold">
                    <span className="text-slate-900 dark:text-white">Total a Pagar:</span>
                    <span className="text-emerald-700 dark:text-emerald-400">
                      ${(typeof selectedPack.price === 'number' && selectedPack.price > 1000 
                        ? Number((selectedPack.price / 10000).toFixed(2)) 
                        : (selectedPack.priceEUR || selectedPack.priceUsd || 5)).toFixed(2)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handlePay}
                  disabled={processing || !selectedPack}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4 text-emerald-400 dark:text-white" />
                  <span>
                    {processing 
                      ? 'Procesando recarga instantánea...' 
                      : `Pagar $${(typeof selectedPack.price === 'number' && selectedPack.price > 1000 
                          ? Number((selectedPack.price / 10000).toFixed(2)) 
                          : (selectedPack.priceEUR || selectedPack.priceUsd || 5)).toFixed(2)} y Recargar`}
                  </span>
                </button>

                <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center flex items-center justify-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Los datos se activan de forma inmediata en la red local.
                </p>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
