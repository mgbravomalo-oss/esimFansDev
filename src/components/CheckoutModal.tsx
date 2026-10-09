import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  ShieldCheck,
  Check,
  Smartphone,
  Sparkles,
  UserCheck,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Calendar,
  Plus,
  Minus,
  Infinity as InfinityIcon,
  Gauge,
  Info,
  Zap,
  Radio,
  Globe,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  Clock,
  CheckCircle2,
  CheckCircle,
  QrCode,
  Copy,
  Lock
} from 'lucide-react';
import { EsimPlan, User, UserEsim, Order, PaymentMethodType } from '../types';
import { CountryFlag } from './CountryFlag';

interface CheckoutModalProps {
  plan: EsimPlan | null;
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccessPurchase: (newEsim: UserEsim, identifiedUser: User) => void;
  onOrderCreatedPendingApproval?: (order: Order, identifiedUser: User) => void;
  onRequireAuth?: () => void;
  onSelectSimilarPlan?: (plan: EsimPlan) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  plan,
  user,
  isOpen,
  onClose,
  onSuccessPurchase,
  onOrderCreatedPendingApproval,
  onRequireAuth,
  onSelectSimilarPlan,
}) => {
  // Step state: 1: Traveler details & plan summary | 2: Payment options (GPay, Card) | 3: Order receipt
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [activePlan, setActivePlan] = useState<EsimPlan | null>(plan);

  // Verificación de disponibilidad previa y captura de error mayorista
  const [isVerifyingPlan, setIsVerifyingPlan] = useState<boolean>(false);
  const [planUnavailableData, setPlanUnavailableData] = useState<{
    message: string;
    customerNotice: string;
    reason?: string;
    similarPlans: EsimPlan[];
  } | null>(null);

  // Traveler info
  const [fullName, setFullName] = useState(user?.name || '');
  const [deliveryEmail, setDeliveryEmail] = useState(user?.email || '');
  const [selectedDays, setSelectedDays] = useState<number>(7);
  const [showCoverageList, setShowCoverageList] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Payment Options & Simulation state
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('gpay');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState(user?.name || '');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [processingStatusText, setProcessingStatusText] = useState('Procesando pago...');
  
  // Completed Order state (for Step 3)
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);

  const [isFadingOutForAuth, setIsFadingOutForAuth] = useState(false);
  const [isTestMode, setIsTestMode] = useState<boolean>(true);

  // Sync activePlan with prop plan
  useEffect(() => {
    setActivePlan(plan);
    setPlanUnavailableData(null);
  }, [plan]);

  // Synchronize system test mode vs production mode
  useEffect(() => {
    if (isOpen) {
      fetch('/api/system/settings')
        .then(r => r.json())
        .then(data => {
          if (data && data.success && typeof data.isTestMode === 'boolean') {
            setIsTestMode(data.isTestMode);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  // Synchronize name and email whenever the validated user changes
  useEffect(() => {
    if (user) {
      setFullName(user.name || '');
      setDeliveryEmail(user.email || '');
      setCardHolder(user.name || '');
    } else {
      setFullName('');
      setDeliveryEmail('');
      setCardHolder('');
    }
  }, [user]);

  // Reset step and days when plan changes or modal opens
  useEffect(() => {
    if (isOpen && plan) {
      setCurrentStep(1);
      setCompletedOrder(null);
      setValidationError(null);
      setIsProcessingPayment(false);
      if (plan.isUnlimited) {
        setSelectedDays(7);
      } else {
        setSelectedDays(plan.validityDays || 30);
      }
    }
  }, [isOpen, plan]);

  const currentDisplayPlan = activePlan || plan;

  if (!isOpen || !currentDisplayPlan) return null;

  const duration = currentDisplayPlan.isUnlimited ? Math.max(1, selectedDays) : (currentDisplayPlan.validityDays || 30);
  const finalPrice = Number((currentDisplayPlan.isUnlimited ? currentDisplayPlan.priceEUR * duration : currentDisplayPlan.priceEUR).toFixed(2));

  const triggerAuthTransition = () => {
    if (isFadingOutForAuth) return;
    setIsFadingOutForAuth(true);
    setTimeout(() => {
      if (onRequireAuth) {
        onRequireAuth();
      }
      setIsFadingOutForAuth(false);
    }, 450);
  };

  // Helper to format credit card number with spaces
  const handleCardNumberChange = (value: string) => {
    const raw = value.replace(/\D/g, '').substring(0, 16);
    const parts = raw.match(/.{1,4}/g);
    setCardNumber(parts ? parts.join(' ') : raw);
  };

  // Helper to format expiry MM/YY
  const handleExpiryChange = (value: string) => {
    const raw = value.replace(/\D/g, '').substring(0, 4);
    if (raw.length >= 3) {
      setCardExpiry(`${raw.substring(0, 2)}/${raw.substring(2, 4)}`);
    } else {
      setCardExpiry(raw);
    }
  };

  // Pre-fill test card with 1 click
  const handleFillTestCard = () => {
    setCardNumber('4242 4242 4242 4242');
    setCardHolder(fullName || user?.name || 'Sofía Delgado');
    setCardExpiry('12/28');
    setCardCvc('123');
    setValidationError(null);
  };

  // Step 1 -> Step 2 validation con verificación obligatoria con el proveedor mayorista
  const handleProceedToPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!user) {
      triggerAuthTransition();
      return;
    }

    if (!fullName.trim()) {
      setValidationError('Por favor, ingresa tu Nombre Completo para la titularidad de la eSIM.');
      return;
    }

    if (!deliveryEmail.trim()) {
      setValidationError('Por favor, ingresa tu Email de Entrega para recibir la eSIM y el código QR.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(deliveryEmail.trim())) {
      setValidationError('Por favor, ingresa un correo electrónico de entrega válido.');
      return;
    }

    // 🛡️ REGLA: No pasar a cobrar si el plan no existe o no tiene stock con el proveedor
    setIsVerifyingPlan(true);
    try {
      const identifiedUser: User = {
        ...(user || {} as User),
        id: user?.id || `usr_${Date.now()}`,
        name: fullName.trim() || user?.name || 'Cliente eSIM',
        email: deliveryEmail.trim().toLowerCase() || user?.email || '',
        createdAt: user?.createdAt || new Date().toISOString(),
      };

      const verifyRes = await fetch('/api/plans/verify-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: activePlan || plan,
          user: identifiedUser,
          paymentMethod,
        }),
      });

      const verifyData = await verifyRes.json();
      setIsVerifyingPlan(false);

      if (verifyData.available === false || verifyData.errorCode === 'PLAN_UNAVAILABLE') {
        console.warn('⚠️ [Pre-Cobro Detenido] El plan no está disponible en el proveedor mayorista:', verifyData);
        setPlanUnavailableData({
          message: verifyData.message || 'Plan no está disponible. Se va a verificar.',
          customerNotice: verifyData.customerNotice || 'El plan seleccionado no está disponible en este momento con el proveedor. Nuestro equipo técnico lo verificará de inmediato.',
          reason: verifyData.error,
          similarPlans: Array.isArray(verifyData.similarPlans) ? verifyData.similarPlans : [],
        });
        return;
      }
    } catch (err: any) {
      console.warn('⚠️ Verificación offline:', err.message);
      setIsVerifyingPlan(false);
    }

    // Advance to Step 2 (Payment Options Card) solo si el plan fue validado
    setCurrentStep(2);
  };

  // Execute Simulated Payment & Create Order
  const handleExecutePayment = async () => {
    setValidationError(null);

    // Validation for Credit Card
    if (paymentMethod === 'credit_card') {
      const cleanNum = cardNumber.replace(/\s+/g, '');
      if (cleanNum.length < 15) {
        setValidationError('Por favor, ingresa un número de tarjeta válido (o usa el botón "Rellenar tarjeta de prueba").');
        return;
      }
      if (cardExpiry.length < 5) {
        setValidationError('Por favor, ingresa la fecha de vencimiento (MM/AA).');
        return;
      }
      if (cardCvc.length < 3) {
        setValidationError('Por favor, ingresa el código de seguridad CVC (3 dígitos).');
        return;
      }
    }

    setIsProcessingPayment(true);
    setProcessingStatusText('Conectando de forma segura con la pasarela...');

    const identifiedUser: User = {
      ...(user || {} as User),
      id: user?.id || `usr_${Date.now()}`,
      name: fullName.trim() || user?.name || 'Cliente eSIM',
      email: deliveryEmail.trim().toLowerCase() || user?.email || '',
      createdAt: user?.createdAt || new Date().toISOString(),
    };

    // Simulated payment steps animation
    setTimeout(() => {
      setProcessingStatusText('Autorizando transacción segura...');
    }, 600);

    setTimeout(async () => {
      setProcessingStatusText('Verificando inventario y registrando pedido...');

      const last4 = paymentMethod === 'credit_card'
        ? cardNumber.replace(/\s+/g, '').slice(-4) || '4242'
        : '4242';

      const cardBrand = paymentMethod === 'credit_card'
        ? (cardNumber.startsWith('5') ? 'Mastercard' : cardNumber.startsWith('3') ? 'Amex' : 'Visa')
        : 'Google Pay';

      try {
        const res = await fetch('/api/orders/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan: activePlan || plan,
            user: identifiedUser,
            paymentMethod,
            paymentDetails: {
              cardLast4: last4,
              cardBrand,
              cardHolderName: cardHolder || fullName,
              walletAccount: identifiedUser.email,
              transactionId: isTestMode ? `TXN-FAKE-${Date.now()}` : `TXN-PROD-${Date.now()}`,
              isSimulated: isTestMode,
            },
            durationDays: duration,
          }),
        });

        const data = await res.json();
        setIsProcessingPayment(false);

        // Captura preventiva de plan no disponible (0 devoluciones, aviso al cliente y alertas al admin)
        if (data.unavailable || data.errorCode === 'PLAN_UNAVAILABLE') {
          console.warn('🛑 [Cobro Bloqueado] El plan no está disponible con el mayorista:', data);
          setPlanUnavailableData({
            message: data.message || 'Plan no está disponible. Se va a verificar.',
            customerNotice: data.customerNotice || 'El plan seleccionado no está disponible en este momento con el proveedor. Nuestro equipo técnico lo verificará de inmediato.',
            reason: data.error,
            similarPlans: Array.isArray(data.similarPlans) ? data.similarPlans : [],
          });
          return;
        }

        if (data.success && data.order) {
          setCompletedOrder(data.order);
          setCurrentStep(3); // Go to receipt

          if (data.status === 'approved' && data.esim) {
            onSuccessPurchase(data.esim, identifiedUser);
          } else {
            if (onOrderCreatedPendingApproval) {
              onOrderCreatedPendingApproval(data.order, identifiedUser);
            }
          }
        } else {
          setValidationError(data.error || 'No se pudo procesar la orden');
        }
      } catch (err: any) {
        setIsProcessingPayment(false);
        setValidationError(`Error de conexión: ${err.message}`);
      }
    }, 1400);
  };

  const [copiedCode, setCopiedCode] = useState(false);

  // ⚡ Live Approval Listener & Polling on Step 3
  useEffect(() => {
    if (currentStep !== 3 || !completedOrder || completedOrder.status === 'approved') {
      return;
    }

    const checkOrderStatus = async () => {
      try {
        const email = completedOrder.userEmail;
        const res = await fetch(`/api/orders?email=${encodeURIComponent(email)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.orders)) {
          const found = data.orders.find(
            (o: any) => o.id === completedOrder.id || o.orderNumber === completedOrder.orderNumber
          );
          if (found && found.status === 'approved' && found.generatedEsim) {
            setCompletedOrder(found);
            const identifiedUser: User = {
              id: user?.id || `user_${Date.now()}`,
              name: fullName || user?.name || 'Cliente',
              email: deliveryEmail.trim().toLowerCase() || user?.email || '',
              createdAt: user?.createdAt || new Date().toISOString(),
            };
            onSuccessPurchase(found.generatedEsim, identifiedUser);
          }
        }
      } catch {}
    };

    // Poll every 1.5 seconds while waiting for approval
    const interval = setInterval(checkOrderStatus, 1500);

    const handleApprovedEvent = (e: any) => {
      const detail = e.detail;
      if (
        detail?.order &&
        (detail.order.id === completedOrder.id || detail.order.orderNumber === completedOrder.orderNumber)
      ) {
        setCompletedOrder(detail.order);
        if (detail.esim) {
          const identifiedUser: User = {
            id: user?.id || `user_${Date.now()}`,
            name: fullName || user?.name || 'Cliente',
            email: deliveryEmail.trim().toLowerCase() || user?.email || '',
            createdAt: user?.createdAt || new Date().toISOString(),
          };
          onSuccessPurchase(detail.esim, identifiedUser);
        }
      }
    };

    window.addEventListener('app:order_approved', handleApprovedEvent);

    return () => {
      clearInterval(interval);
      window.removeEventListener('app:order_approved', handleApprovedEvent);
    };
  }, [currentStep, completedOrder?.id, completedOrder?.status, fullName, deliveryEmail, user, onSuccessPurchase]);

  const dayPresets = [1, 3, 5, 7, 10, 15, 30];

  const hasMultiCountryCoverage = Boolean(
    currentDisplayPlan.isMultiCountry ||
    (currentDisplayPlan.coveredCountries && currentDisplayPlan.coveredCountries.length > 1) ||
    (currentDisplayPlan.coveredCountriesCount && currentDisplayPlan.coveredCountriesCount > 1)
  );

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300 ease-in-out ${
        isFadingOutForAuth ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div
        className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative overflow-y-auto max-h-[92vh] text-slate-900 dark:text-white transition-all duration-300 ease-in-out ${
          isFadingOutForAuth ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <CountryFlag flag={currentDisplayPlan.flag} countryCode={currentDisplayPlan.countryCode} countryName={currentDisplayPlan.country} size="xl" rounded="md" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">{currentDisplayPlan.country}: {currentDisplayPlan.name}</h2>
                {currentDisplayPlan.isUnlimited && (
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-700 text-white flex items-center gap-1 shadow-2xs tracking-tight uppercase">
                    <InfinityIcon className="w-2.5 h-2.5" /> Ilimitado
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                <Radio className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Red:</span>
                <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100">{currentDisplayPlan.operator || 'Red 5G Local'}</span>
                {currentDisplayPlan.network5G && (
                  <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                    5G
                  </span>
                )}
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

        {/* ---------------------------------------------------- */}
        {/* VISTA ESPECIAL: Plan No Disponible en Proveedor      */}
        {/* (0 Cobros, Alertas 2x FCM + Email a mgbravomalo@gmail.com) */}
        {/* ---------------------------------------------------- */}
        {planUnavailableData ? (
          <div className="py-4 space-y-4 animate-in fade-in duration-200">
            {/* Banner Principal de Aviso */}
            <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 dark:bg-amber-950/25 dark:border-amber-500/40 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-sm font-black text-lg">
                  ⚠️
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-black text-amber-950 dark:text-amber-200">
                      {planUnavailableData.message}
                    </h3>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                      Cobro Bloqueado Preventivamente
                    </span>
                  </div>
                  <p className="text-xs text-amber-900/90 dark:text-amber-300/90 leading-relaxed font-medium">
                    {planUnavailableData.customerNotice}
                  </p>
                </div>
              </div>

              {/* Tarjeta de Garantía Cero Devoluciones */}
              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-amber-900/60 text-xs space-y-1">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>Sin cobro efectuado: No hay riesgo ni trámites de devolución</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal pl-6">
                  El sistema bloqueó la operación antes de contactar a tu banco o pasarela. Tu saldo y tarjeta permanecen intactos.
                </p>
              </div>

              {/* Alerta Técnica Despachada */}
              <div className="p-2.5 rounded-xl bg-slate-900/5 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
                <span className="font-bold text-slate-800 dark:text-slate-200">📡 Medidas Técnicas: </span>
                Se enviaron <strong>2 alertas FCM</strong> y correo prioritario al administrador (<span className="font-mono text-emerald-600 dark:text-emerald-400">mgbravomalo@gmail.com</span>) para regularizar el inventario con el mayorista eSIMAccess.
              </div>
            </div>

            {/* Invitación a Elegir un Plan Similar */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Te invitamos a elegir un plan similar para tu viaje:</span>
                </h4>
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {planUnavailableData.similarPlans.length} disponible{planUnavailableData.similarPlans.length !== 1 ? 's' : ''}
                </span>
              </div>

              {planUnavailableData.similarPlans.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {planUnavailableData.similarPlans.map((simPlan) => (
                    <div
                      key={simPlan.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 hover:bg-white dark:bg-slate-850/50 dark:hover:bg-slate-800 transition-all flex items-center justify-between gap-3 group shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CountryFlag
                          flag={simPlan.flag}
                          countryCode={simPlan.countryCode}
                          countryName={simPlan.country}
                          size="md"
                          rounded="md"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                              {simPlan.name}
                            </span>
                            {simPlan.isUnlimited ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-600 text-white uppercase">
                                Ilimitado
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                                {Math.round((simPlan.dataAmountGB || 0) * 100) / 100} GB
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                            <span>{simPlan.isUnlimited ? '7 Días' : `${simPlan.validityDays || 30} Días`}</span>
                            <span>•</span>
                            <span>{simPlan.operator || 'Red 5G'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="text-xs font-black text-slate-900 dark:text-white">
                          ${simPlan.priceEUR?.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setActivePlan(simPlan);
                            setPlanUnavailableData(null);
                            setCurrentStep(1);
                            setValidationError(null);
                            if (onSelectSimilarPlan) onSelectSimilarPlan(simPlan);
                          }}
                          className="py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all shadow-2xs flex items-center gap-1 active:scale-95 cursor-pointer"
                        >
                          <span>Elegir</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-center text-xs text-slate-600 dark:text-slate-400">
                  No hay otros planes similares cargados para este destino. Por favor revisa otros países.
                </div>
              )}

              {/* Botones de Exploración */}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all"
                >
                  🔍 Explorar Otros Destinos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlanUnavailableData(null);
                    setCurrentStep(1);
                  }}
                  className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all"
                >
                  Reintentar
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Multi-country covered countries notice */}
            {hasMultiCountryCoverage && currentStep === 1 && (
              <div className="mt-3 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/30 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="font-bold text-slate-900 dark:text-white truncate">
                      Cobertura multi-país: {currentDisplayPlan.coveredCountries?.length || currentDisplayPlan.coveredCountriesCount || 'Varios'} países incluidos
                    </span>
                  </div>
                  {currentDisplayPlan.coveredCountries && currentDisplayPlan.coveredCountries.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowCoverageList(prev => !prev)}
                      className="px-2 py-1 rounded text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-white dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-slate-700 border border-emerald-200 dark:border-emerald-700 flex items-center gap-1 shrink-0"
                    >
                      <span>{showCoverageList ? 'Ocultar' : 'Ver países'}</span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${showCoverageList ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>

                {showCoverageList && currentDisplayPlan.coveredCountries && (
                  <div className="mt-2.5 pt-2.5 border-t border-emerald-200/60 dark:border-emerald-800/40">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {currentDisplayPlan.coveredCountries.map((c) => (
                        <div
                          key={c.code}
                          className="flex items-center gap-1.5 p-1 px-1.5 rounded bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 text-[11px]"
                        >
                          <CountryFlag flag={c.flag} countryCode={c.code} countryName={c.name} size="xs" rounded="sm" className="shrink-0" />
                          <span className="truncate text-slate-800 dark:text-slate-200 font-medium">{c.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

        {/* ---------------------------------------------------- */}
        {/* STEP 1: Traveler Details & Plan Configuration        */}
        {/* ---------------------------------------------------- */}
        {currentStep === 1 && (
          <form onSubmit={handleProceedToPayment} className="py-4 space-y-4">
            
            {/* Unlimited Plan Duration Selection Section */}
            {plan.isUnlimited && (
              <div className="p-4 bg-gradient-to-br from-emerald-50/70 to-teal-50/40 dark:from-emerald-950/30 dark:to-teal-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-950 dark:text-emerald-300">
                    <Calendar className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span>¿Por cuántos días requieres el plan ilimitado?</span>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 font-mono bg-emerald-100/80 dark:bg-emerald-900/60 px-2 py-0.5 rounded-md">
                    ${plan.priceEUR.toFixed(2)} / día
                  </span>
                </div>

                {/* Day presets */}
                <div className="flex flex-wrap gap-1.5">
                  {dayPresets.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelectedDays(d)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        selectedDays === d
                          ? 'bg-emerald-700 text-white shadow-xs scale-105'
                          : 'bg-white dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      {d} {d === 1 ? 'día' : 'días'}
                    </button>
                  ))}
                </div>

                {/* Stepper */}
                <div className="flex items-center justify-between bg-white dark:bg-slate-800/80 border border-emerald-200 dark:border-slate-700 rounded-lg p-2 mt-2">
                  <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">Personalizar duración exacta:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedDays((prev) => Math.max(1, prev - 1))}
                      disabled={selectedDays <= 1}
                      className="w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 flex items-center justify-center disabled:opacity-40 transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={selectedDays}
                        onChange={(e) => setSelectedDays(Math.max(1, Math.min(90, parseInt(e.target.value) || 1)))}
                        className="w-12 text-center font-bold text-slate-900 dark:text-white bg-transparent border border-slate-200 dark:border-slate-600 rounded-md py-0.5 text-xs focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-xs text-slate-600 dark:text-slate-300 font-semibold">{selectedDays === 1 ? 'día' : 'días'}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedDays((prev) => Math.min(90, prev + 1))}
                      disabled={selectedDays >= 90}
                      className="w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 flex items-center justify-center disabled:opacity-40 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* FUP Specifications */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Gauge className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{plan.isUnlimited ? 'Política de Uso Justo (FUP)' : 'Especificaciones de Datos'}</span>
                </span>
                <span className="text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  {plan.isUnlimited ? 'Sin Cortes' : `${Math.round((plan.dataAmountGB || 0) * 100) / 100} GB / ${duration} días`}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {plan.isUnlimited
                  ? `Cuota de ${plan.fupDailyAllowance || '1 GB /Día'} a máxima velocidad 5G, navegación continua garantizada a ${plan.fupSpeedThrottling || '512 Kbps'} tras cuota.`
                  : `Bolsa de ${Math.round((plan.dataAmountGB || 0) * 100) / 100} GB de navegación 5G/4G válida durante ${duration} días a partir de la instalación.`}
              </div>
            </div>

            {/* Traveler Information & Validation */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Datos del Viajero (Para emisión de la eSIM)</span>
                </div>
                {user && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    <span>Usuario validado</span>
                  </span>
                )}
              </div>

              {user ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Nombre Completo
                    </label>
                    <input
                      type="text"
                      placeholder="Sofía Delgado"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        if (validationError) setValidationError(null);
                      }}
                      readOnly={Boolean(user)}
                      className={`w-full px-3 py-2 border rounded-lg text-xs transition-colors ${
                        user
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 text-slate-900 dark:text-white font-semibold cursor-default'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Email de Entrega
                    </label>
                    <input
                      type="email"
                      placeholder="tu@email.com"
                      value={deliveryEmail}
                      onChange={(e) => {
                        setDeliveryEmail(e.target.value);
                        if (validationError) setValidationError(null);
                      }}
                      readOnly={Boolean(user)}
                      className={`w-full px-3 py-2 border rounded-lg text-xs font-mono transition-colors ${
                        user
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 text-slate-900 dark:text-white font-semibold cursor-default'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500'
                      }`}
                    />
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-2.5 text-center py-5">
                  <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-2xs border border-amber-200 dark:border-amber-900">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Identificación requerida</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                      Para emitir tu código QR y enviarte la eSIM, primero debes identificarte o validar tu cuenta de viajero.
                    </p>
                  </div>
                </div>
              )}

              {validationError && (
                <div className="p-2.5 bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-lg flex items-start gap-2 text-[11px] text-rose-800 dark:text-rose-300 animate-pulse">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <span className="font-semibold">{validationError}</span>
                </div>
              )}
            </div>

            {/* Price Summary */}
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>
                  {currentDisplayPlan.isUnlimited
                    ? `eSIM ${currentDisplayPlan.name} (${duration} día${duration > 1 ? 's' : ''} @ $${currentDisplayPlan.priceEUR.toFixed(2)}/día):`
                    : `eSIM ${currentDisplayPlan.name} (${currentDisplayPlan.validityDays} días):`}
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">${finalPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Activación &amp; Perfil eSIM:</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-bold">GRATIS</span>
              </div>
              <div className="flex justify-between text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-700 text-sm font-bold">
                <span>Total a Pagar:</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-mono">${finalPrice.toFixed(2)} USD</span>
              </div>
            </div>

            {/* Step 1 Button */}
            <button
              type="submit"
              disabled={isFadingOutForAuth || isVerifyingPlan}
              className={`w-full py-3 px-4 rounded-xl text-white text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2 active:scale-98 ${
                isVerifyingPlan
                  ? 'bg-slate-700 opacity-90 cursor-wait'
                  : !user
                  ? 'bg-amber-600 hover:bg-amber-500'
                  : 'bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500'
              }`}
            >
              {isVerifyingPlan ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Verificando disponibilidad con el operador...</span>
                </>
              ) : !user ? (
                <>
                  <UserCheck className="w-4 h-4 text-white" />
                  <span>Valida tu usuario para continuar</span>
                </>
              ) : (
                <>
                  <span>Continuar a Opciones de Pago (${finalPrice.toFixed(2)})</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* ---------------------------------------------------- */}
        {/* STEP 2: Dedicated Payment Options Card (Fake/Sandbox)*/}
        {/* ---------------------------------------------------- */}
        {currentStep === 2 && (
          <div className="py-2 space-y-4 animate-in fade-in duration-200">
            
            {/* Mode Notice Banner */}
            {isTestMode ? (
              <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-extrabold text-purple-900 dark:text-purple-200 block">
                    Simulación de Pasarela de Pago (Entorno de Pruebas Seguro)
                  </span>
                  <span className="text-purple-700 dark:text-purple-300 text-[11px] leading-tight block mt-0.5">
                    Puedes probar pagos con Google Pay o Tarjeta sin cargos bancarios reales ni compras al mayorista.
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-extrabold text-emerald-900 dark:text-emerald-200 block">
                    Pasarela de Pago Segura (Entorno de Producción Oficial)
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-300 text-[11px] leading-tight block mt-0.5">
                    Transacción cifrada TLS de 256 bits. El perfil eSIM oficial se emitirá de forma real al confirmar.
                  </span>
                </div>
              </div>
            )}

            {/* Amount to pay badge */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total a Autorizar</span>
                <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-400 font-mono">
                  ${finalPrice.toFixed(2)} USD
                </span>
              </div>
              <div className="text-right text-[11px] text-slate-500 dark:text-slate-400">
                <span>{plan.country} · {duration} días</span>
              </div>
            </div>

            {/* Payment Method Selector Tabs */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Selecciona tu Método de Pago
              </label>
              <div className="grid grid-cols-2 gap-2">
                
                {/* GPay Tab */}
                <button
                  type="button"
                  onClick={() => setPaymentMethod('gpay')}
                  className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                    paymentMethod === 'gpay'
                      ? 'border-purple-600 dark:border-purple-500 bg-purple-50/50 dark:bg-purple-950/50 text-slate-900 dark:text-white shadow-xs ring-2 ring-purple-500/20'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <span className="text-blue-500 font-extrabold">G</span>
                    <span className="text-slate-800 dark:text-white">Pay</span>
                  </div>
                  <span className="text-xs font-semibold">Google Pay</span>
                </button>

                {/* Credit Card Tab */}
                <button
                  type="button"
                  onClick={() => setPaymentMethod('credit_card')}
                  className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                    paymentMethod === 'credit_card'
                      ? 'border-purple-600 dark:border-purple-500 bg-purple-50/50 dark:bg-purple-950/50 text-slate-900 dark:text-white shadow-xs ring-2 ring-purple-500/20'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <CreditCard className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                  <span className="text-xs font-semibold">Tarjeta de Crédito</span>
                </button>

              </div>
            </div>

            {/* TAB CONTENT 1: GOOGLE PAY (GPay) */}
            {paymentMethod === 'gpay' && (
              <div className="space-y-3.5 p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl animate-in fade-in duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 dark:border-slate-700/80">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-sm shadow-2xs">
                      <span className="text-blue-500">G</span>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">Google Pay Checkout</span>
                      <span className="text-[10px] text-slate-400 font-mono">Cuenta: {deliveryEmail || user?.email}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                    Listo para pagar
                  </span>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-4 bg-blue-600 rounded text-[9px] text-white flex items-center justify-center font-bold font-mono">
                      VISA
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Tarjeta vinculada a Google Wallet</span>
                      <span className="text-[10px] text-slate-400 font-mono">•••• 4242 · Exp 12/28</span>
                    </div>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>

                {/* Characteristic Official GPay Button */}
                <button
                  type="button"
                  onClick={handleExecutePayment}
                  disabled={isProcessingPayment}
                  className="w-full py-3.5 px-4 rounded-xl bg-slate-950 hover:bg-slate-900 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
                >
                  {isProcessingPayment ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{processingStatusText}</span>
                    </>
                  ) : (
                    <>
                      <span>Pagar con</span>
                      <span className="font-extrabold text-sm tracking-tight flex items-center gap-0.5">
                        <span className="text-blue-400">G</span>
                        <span className="text-red-400">o</span>
                        <span className="text-yellow-400">o</span>
                        <span className="text-blue-400">g</span>
                        <span className="text-green-400">l</span>
                        <span className="text-red-400">e</span>
                        <span className="ml-1 text-white">Pay</span>
                      </span>
                      <span className="font-mono ml-1">(${finalPrice.toFixed(2)})</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* TAB CONTENT 2: CREDIT / DEBIT CARD */}
            {paymentMethod === 'credit_card' && (
              <div className="space-y-3.5 p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl animate-in fade-in duration-150">
                
                {/* Visual Card Preview */}
                <div className="p-3.5 rounded-xl bg-gradient-to-tr from-slate-900 via-slate-800 to-purple-900 text-white shadow-md relative overflow-hidden">
                  <div className="flex items-center justify-between text-xs text-slate-300 font-mono">
                    <span className="text-[10px] tracking-wider uppercase">Tarjeta de Crédito</span>
                    <span className={`font-bold tracking-widest ${isTestMode ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {isTestMode ? 'TEST SANDBOX' : 'PRODUCCIÓN REAL'}
                    </span>
                  </div>
                  
                  <div className="my-2.5 font-mono text-sm tracking-widest font-bold">
                    {cardNumber || '•••• •••• •••• 4242'}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-300 font-mono">
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase">Titular</span>
                      <span className="font-semibold truncate max-w-[150px] block">{cardHolder || fullName || 'Sofía Delgado'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 block uppercase">Expira</span>
                      <span className="font-semibold">{cardExpiry || '12/28'}</span>
                    </div>
                  </div>
                </div>

                {/* Quick Fill Test Card Button */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleFillTestCard}
                    className="text-[11px] font-bold text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 flex items-center gap-1 transition-colors"
                  >
                    <Zap className="w-3 h-3 text-amber-500 fill-current" />
                    <span>Rellenar tarjeta de prueba en 1 clic</span>
                  </button>
                </div>

                {/* Form fields */}
                <div className="space-y-2.5 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Número de Tarjeta
                    </label>
                    <div className="relative">
                      <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="4242 4242 4242 4242"
                        value={cardNumber}
                        onChange={(e) => handleCardNumberChange(e.target.value)}
                        maxLength={19}
                        className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Nombre en la Tarjeta
                    </label>
                    <input
                      type="text"
                      placeholder="Nombre del Titular"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Expiración (MM/AA)
                      </label>
                      <input
                        type="text"
                        placeholder="12/28"
                        value={cardExpiry}
                        onChange={(e) => handleExpiryChange(e.target.value)}
                        maxLength={5}
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Código CVC
                      </label>
                      <input
                        type="password"
                        placeholder="123"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, '').substring(0, 4))}
                        maxLength={4}
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Submit button for Card */}
                <button
                  type="button"
                  onClick={handleExecutePayment}
                  disabled={isProcessingPayment}
                  className={`w-full py-3 px-4 rounded-xl text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 ${
                    isTestMode
                      ? 'bg-purple-600 hover:bg-purple-500'
                      : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20'
                  }`}
                >
                  {isProcessingPayment ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{processingStatusText}</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>{isTestMode ? `Confirmar Pago de Prueba ($${finalPrice.toFixed(2)})` : `Confirmar y Pagar ($${finalPrice.toFixed(2)})`}</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {validationError && (
              <div className="p-2.5 bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-lg flex items-start gap-2 text-[11px] text-rose-800 dark:text-rose-300 animate-pulse">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <span className="font-semibold">{validationError}</span>
              </div>
            )}

            {/* Back button to Step 1 */}
            <div className="flex items-center justify-between pt-1 text-xs">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                disabled={isProcessingPayment}
                className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1 font-semibold transition-colors disabled:opacity-50"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver a datos del viaje</span>
              </button>
              <span className="text-[11px] text-slate-400 font-mono">Paso 2 de 2</span>
            </div>

          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* STEP 3: Order Receipt / Confirmation Screen          */}
        {/* ---------------------------------------------------- */}
        {currentStep === 3 && completedOrder && (
          <div className="py-2 space-y-4 text-center animate-in fade-in duration-200">
            {completedOrder.status === 'approved' && completedOrder.generatedEsim ? (
              // 🎉 APPROVED STATE (INSTANT LIVE UPDATE)
              <div className="space-y-4 animate-in zoom-in-95 duration-300">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-md ring-4 ring-emerald-500/20">
                  <CheckCircle className="w-8 h-8 text-emerald-500" />
                </div>

                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 inline-flex items-center gap-1.5 shadow-2xs">
                    <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    ¡Orden Aprobada por Administrador!
                  </span>
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white mt-1.5">
                    ¡Tu eSIM ya está lista para instalar!
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Orden <strong className="font-mono text-slate-800 dark:text-slate-200">#{completedOrder.orderNumber}</strong> • {completedOrder.country}
                  </p>
                </div>

                {/* QR Code Container */}
                <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-center max-w-xs mx-auto space-y-3 shadow-sm">
                  {completedOrder.generatedEsim.qrCodeUrl && (
                    <div className="bg-white p-3 rounded-xl inline-block shadow-xs border border-slate-100">
                      <img
                        src={completedOrder.generatedEsim.qrCodeUrl}
                        alt="Código QR de eSIM"
                        className="w-44 h-44 object-contain mx-auto"
                      />
                    </div>
                  )}

                  <div className="text-left bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200/80 dark:border-slate-700/80 text-[11px] space-y-1.5 font-mono">
                    <div className="flex justify-between items-center text-slate-500">
                      <span>ICCID:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 select-all">
                        {completedOrder.generatedEsim.iccid}
                      </span>
                    </div>
                    {completedOrder.generatedEsim.activationCode && (
                      <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-slate-500">
                        <span>Código Activación:</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              completedOrder.generatedEsim.manualCode || completedOrder.generatedEsim.activationCode
                            );
                            setCopiedCode(true);
                            setTimeout(() => setCopiedCode(false), 2000);
                          }}
                          className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                        >
                          {copiedCode ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedCode ? '¡Copiado!' : 'Copiar'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all active:scale-98 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Ir a Mis eSIMs & Comenzar Viaje</span>
                </button>
              </div>
            ) : (
              // ⏳ PENDING APPROVAL STATE
              <div className="space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-sm">
                  <Clock className="w-7 h-7 animate-pulse" />
                </div>

                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                    Transacción Simulada Registrada
                  </span>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1.5">
                    ¡Pago Simulado Exitoso!
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Orden <strong className="font-mono text-slate-800 dark:text-slate-200">#{completedOrder.orderNumber}</strong> para {completedOrder.country}
                  </p>
                </div>

                {/* Order status card */}
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-left text-xs space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Estado del Pedido:</span>
                    <span className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      <span>Esperando Autorización del Administrador</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Método de Pago:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {completedOrder.paymentMethod === 'gpay' ? 'Google Pay' : 'Tarjeta de Crédito'} (•••• {completedOrder.paymentDetails?.cardLast4 || '4242'})
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Monto Simulado:</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                      ${completedOrder.pricePaid.toFixed(2)} USD
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Destinatario:</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{completedOrder.userEmail}</span>
                  </div>
                </div>

                {/* Live Real-time Sync Indicator */}
                <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-left text-[11px] text-emerald-900 dark:text-emerald-200 leading-relaxed flex items-start gap-2">
                  <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5 animate-pulse" />
                  <span>
                    <strong>Sincronización en Vivo:</strong> Esta pantalla se actualizará automáticamente sin recargar en el instante en que el administrador apruebe el pedido.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3 px-4 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition-colors"
                >
                  Entendido / Ver Mis Pedidos y eSIMs
                </button>
              </div>
            )}
          </div>
        )}
          </>
        )}

      </div>
    </div>
  );
};
