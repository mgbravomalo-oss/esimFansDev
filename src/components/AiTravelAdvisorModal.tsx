import React, { useState, useEffect } from 'react';
import { X, Sparkles, Bot, Check, ArrowRight, CloudSun, Wind, Thermometer, AlertCircle, MapPin, MessageSquareQuote, HelpCircle, Compass, Clock, Zap } from 'lucide-react';
import { EsimPlan, TravelRecommendation, AiClarification } from '../types';
import { DESTINATIONS, ESIM_PLANS } from '../data/esimData';
import { CountryFlag } from './CountryFlag';

interface AiTravelAdvisorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPlan: (plan: EsimPlan) => void;
}

export const AiTravelAdvisorModal: React.FC<AiTravelAdvisorModalProps> = ({
  isOpen,
  onClose,
  onSelectPlan
}) => {
  const [destinationInput, setDestinationInput] = useState('');
  const [daysInput, setDaysInput] = useState('10');
  const [usageType, setUsageType] = useState<'light' | 'standard' | 'heavy'>('standard');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ destination?: string; days?: string }>({});
  const [recommendation, setRecommendation] = useState<TravelRecommendation | null>(null);
  const [clarification, setClarification] = useState<AiClarification | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [waitingDestination, setWaitingDestination] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOffline && waitingDestination) {
      setWaitingDestination(null);
      setLoading(true);
      executeRecommendation(waitingDestination);
    }
  }, [isOffline, waitingDestination]);

  if (!isOpen) return null;

  const executeRecommendation = async (destOverride?: string) => {
    const cleanDest = (destOverride !== undefined ? destOverride : destinationInput).trim();
    const newErrors: { destination?: string; days?: string } = {};

    if (!cleanDest) {
      newErrors.destination = 'Indica el país o ciudad de tu viaje (ej. Quito, Madrid, Cancún...)';
    } else if (cleanDest.length < 2) {
      newErrors.destination = 'Por favor escribe al menos 2 letras para buscar tu destino';
    }

    const daysNum = parseInt(daysInput, 10);
    if (!daysInput || isNaN(daysNum) || daysNum < 1) {
      newErrors.days = 'Mínimo 1 día de viaje';
    } else if (daysNum > 90) {
      newErrors.days = 'Máximo 90 días por plan';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});

    if (isOffline) {
      setWaitingDestination(cleanDest);
      return;
    }

    setLoading(true);
    let shouldKeepLoadingForConnection = false;

    try {
      const res = await fetch('/api/ai/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: cleanDest,
          days: daysInput,
          usage: usageType
        })
      });
      const data = await res.json();
      if (data.success) {
        if (data.needsClarification && data.clarification) {
          setClarification(data.clarification);
          setRecommendation(null);
        } else if (data.recommendation) {
          setRecommendation(data.recommendation);
          setClarification(null);
        } else {
          throw new Error('Respuesta incompleta de API');
        }
      } else {
        throw new Error(data.error || 'Fallo en la consulta');
      }
    } catch {
      setWaitingDestination(cleanDest);
      shouldKeepLoadingForConnection = true;
    } finally {
      if (!shouldKeepLoadingForConnection) {
        setLoading(false);
      }
    }
  };

  const handleGetRecommendation = async (e: React.FormEvent) => {
    e.preventDefault();
    executeRecommendation();
  };

  const handleSelectClarificationSuggestion = (dest: string) => {
    setDestinationInput(dest);
    setClarification(null);
    setErrors({});
    executeRecommendation(dest);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-xl relative overflow-hidden text-slate-900 dark:text-white max-h-[85vh] flex flex-col pt-7">
        
        {/* Top premium accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-600" />
        
        {/* Loading Spinner and Offline waiting overlay */}
        {(loading || waitingDestination) && (
          <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 z-40 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
            <div className="relative flex items-center justify-center mb-4">
              <div className="w-16 h-16 rounded-full border-4 border-blue-100 dark:border-blue-950/60 border-t-blue-600 dark:border-t-blue-400 animate-spin"></div>
              <Bot className="w-6 h-6 text-blue-600 dark:text-blue-400 absolute animate-pulse" />
            </div>
            
            <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-1">
              {waitingDestination ? 'Esperando conexión de red...' : (isOffline ? 'Esperando conexión de red...' : 'Analizando con Inteligencia Artificial...')}
            </h3>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
              {waitingDestination 
                ? `El Asistente necesita conexión a internet para buscar planes dedicados en "${waitingDestination}". Reintentará automáticamente en cuanto se restablezca la red.`
                : (isOffline 
                  ? 'El asistente detectó que no consigues comunicarte con internet. Esperando por conexión para reanudarse...' 
                  : 'Consultando las mejores tarifas de eSIM, coberturas locales de 5G y condiciones climáticas en tiempo real.')}
            </p>

            {isOffline && (
              <div className="mt-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 text-[10px] font-medium animate-pulse">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                <span>Modo sin conexión activo (esperando para consultar '{waitingDestination || 'este destino'}')</span>
              </div>
            )}

            {waitingDestination && (
              <button
                type="button"
                onClick={() => {
                  setWaitingDestination(null);
                  setLoading(false);
                }}
                className="mt-6 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              >
                Cancelar búsqueda
              </button>
            )}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white flex items-center justify-center shadow-md border border-cyan-400/20">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Asistente IA de Viajes</h2>
                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/80 text-blue-750 dark:text-blue-350 border border-blue-200 dark:border-blue-900 uppercase tracking-wider">
                  Copiloto Blue
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Calcula los GB ideales para tu itinerario</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-4 overflow-y-auto pr-1 flex-1 text-xs">
          {!recommendation ? (
            <form noValidate onSubmit={handleGetRecommendation} className="space-y-3.5">
              {/* Interactive AI Clarification / Reprompt Card */}
              {clarification && (
                <div className="p-3.5 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300/80 dark:border-amber-700/60 space-y-2.5 animate-fade-in shadow-xs">
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                      {clarification.intentType === 'question' ? (
                        <HelpCircle className="w-4 h-4 text-white" />
                      ) : (
                        <Compass className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-bold text-xs text-amber-950 dark:text-amber-200">
                          {clarification.intentType === 'question' ? 'Respuesta de Copiloto IA' : 'Aclaración de Destino'}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-200/70 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200">
                          {clarification.intentType === 'question' ? 'Pregunta detectada' : 'Confirmar destino'}
                        </span>
                      </div>
                      <p className="text-xs text-amber-900 dark:text-amber-100 leading-relaxed font-medium">
                        {clarification.message}
                      </p>
                    </div>
                  </div>

                  {/* Quick Select Destination Chips */}
                  {clarification.suggestions && clarification.suggestions.length > 0 && (
                    <div className="pt-2 border-t border-amber-200/70 dark:border-amber-800/40">
                      <span className="text-[10px] font-bold text-amber-900/80 dark:text-amber-300 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        <span>Toca un destino sugerido para calcular tu plan:</span>
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {clarification.suggestions.map((dest) => (
                          <button
                            key={dest}
                            type="button"
                            onClick={() => handleSelectClarificationSuggestion(dest)}
                            className="text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40 hover:border-amber-400 transition-all flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                          >
                            <span>{dest}</span>
                            <ArrowRight className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  ¿A qué país o ciudad viajas?
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ej. Quito, Japón, París, Cancún, Nueva York..."
                    value={destinationInput}
                    onChange={(e) => {
                      setDestinationInput(e.target.value);
                      if (errors.destination) setErrors(prev => ({ ...prev, destination: undefined }));
                    }}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 transition-colors focus:outline-none ${
                      errors.destination
                        ? 'bg-rose-50/50 dark:bg-rose-950/30 border-2 border-rose-400 dark:border-rose-500/70 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                        : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15'
                    }`}
                  />
                  {destinationInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setDestinationInput('');
                        if (errors.destination) setErrors(prev => ({ ...prev, destination: undefined }));
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {errors.destination ? (
                  <div className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-[11px] font-medium animate-fade-in">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-500 dark:text-rose-400" />
                    <span>{errors.destination}</span>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium flex items-center gap-0.5">
                      <MapPin className="w-3 h-3" /> Destinos frecuentes:
                    </span>
                    {['Quito', 'Madrid', 'Caracas', 'Tokio', 'Cancún', 'Bogotá', 'París'].map((city) => (
                      <button
                        key={city}
                        type="button"
                        onClick={() => {
                          setDestinationInput(city);
                          if (errors.destination) setErrors(prev => ({ ...prev, destination: undefined }));
                        }}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-700 dark:hover:text-blue-400 border border-slate-200/70 dark:border-slate-700 text-slate-600 dark:text-slate-300 transition-colors font-medium"
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="relative p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300 text-xs">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 duration-1000"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500 animate-pulse"></span>
                      </span>
                      <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-pulse" />
                      <span>Duración</span>
                    </label>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-blue-100/70 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/80 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                      {daysInput || 1} {Number(daysInput) === 1 ? 'día' : 'días'}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={daysInput}
                    onChange={(e) => {
                      setDaysInput(e.target.value);
                      if (errors.days) setErrors(prev => ({ ...prev, days: undefined }));
                    }}
                    className={`w-full px-3 py-2 rounded-lg text-xs text-slate-900 dark:text-white transition-colors focus:outline-none ${
                      errors.days
                        ? 'bg-rose-50/50 dark:bg-rose-950/30 border-2 border-rose-400 dark:border-rose-500/70 focus:border-rose-500'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15'
                    }`}
                  />
                  {errors.days && (
                    <p className="mt-1 text-[10px] font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {errors.days}
                    </p>
                  )}
                </div>

                <div className="relative p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300 text-xs">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 duration-1000"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 animate-pulse"></span>
                      </span>
                      <Zap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 animate-pulse" />
                      <span>Perfil de uso</span>
                    </label>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100/70 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {usageType === 'light' ? 'Básico' : usageType === 'standard' ? 'Moderado' : 'Intensivo'}
                    </span>
                  </div>
                  <select
                    value={usageType}
                    onChange={(e: any) => setUsageType(e.target.value)}
                    className="w-full px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="light" className="dark:bg-slate-800">Básico (WhatsApp y Mapas)</option>
                    <option value="standard" className="dark:bg-slate-800">Moderado (Redes y Fotos)</option>
                    <option value="heavy" className="dark:bg-slate-800">Intensivo (Streaming / Hotspot)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-cyan-300 fill-cyan-300/20 animate-pulse" />
                <span>{loading ? 'Analizando itinerario con IA...' : 'Recomendar Mejor Plan'}</span>
              </button>
            </form>
          ) : (
            <div className="space-y-4 animate-fade-in">
              <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl text-slate-800 dark:text-slate-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-blue-950 dark:text-blue-300">
                  <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>{recommendation.isMultiCountryTrip ? 'Solución Multi-País Recomendada' : 'Recomendación Inteligente'}</span>
                </div>
                <p className="text-xs leading-relaxed text-blue-900 dark:text-blue-300">
                  {recommendation.summary}
                </p>
              </div>

              {/* Multi-country Route Banner */}
              {recommendation.isMultiCountryTrip && recommendation.multiCountries && (
                <div className="p-3 rounded-xl bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/40 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-between gap-2 shadow-2xs animate-fade-in">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">✈️</span>
                    <div>
                      <span className="font-bold text-xs text-indigo-950 dark:text-indigo-200 block">
                        Ruta Multipaís Cubierta con 1 sola eSIM
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {recommendation.multiCountries.map((c) => (
                          <span
                            key={c.code}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white/90 dark:bg-slate-800 text-indigo-900 dark:text-indigo-200 border border-indigo-200/80 dark:border-indigo-700/60"
                          >
                            <span>{c.name}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-1 rounded-md bg-indigo-600 text-white shadow-2xs shrink-0">
                    {recommendation.multiCountries.length} Países
                  </span>
                </div>
              )}

              {/* Real-time Weather & Travel Conditions Widget */}
              {recommendation.weather && (
                <div className="p-3 bg-blue-50/70 dark:bg-slate-800/80 border border-blue-200 dark:border-blue-900/50 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl" role="img" aria-label="weather">
                        {recommendation.weather.icon}
                      </span>
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1">
                          Clima en {recommendation.weather.city} ({recommendation.weather.country})
                        </span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {recommendation.weather.condition}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-extrabold font-mono text-blue-700 dark:text-blue-400">
                        {recommendation.weather.temperatureC}°C
                      </span>
                      {recommendation.weather.windKmH !== undefined && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center justify-end gap-0.5">
                          <Wind className="w-2.5 h-2.5" />
                          <span>{recommendation.weather.windKmH} km/h</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {recommendation.weather.packingTip && (
                    <div className="pt-1.5 border-t border-blue-100 dark:border-slate-700/60 flex items-start gap-1.5 text-[11px] text-blue-900 dark:text-blue-200">
                      <CloudSun className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                      <span className="leading-snug">{recommendation.weather.packingTip}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Recommended Plan Card */}
              <div className="border border-blue-500/80 dark:border-blue-500/50 bg-slate-50/80 dark:bg-slate-800/90 rounded-xl p-4 shadow-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 dark:border-slate-700/80">
                  <div className="flex items-center gap-2">
                    <CountryFlag
                       flag={recommendation.recommendedPlan.flag}
                       countryCode={recommendation.recommendedPlan.countryCode}
                       countryName={recommendation.recommendedPlan.country}
                       size="md"
                       rounded="sm"
                    />
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white">{recommendation.recommendedPlan.name}</h3>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{recommendation.recommendedPlan.operator}</span>
                    </div>
                  </div>
                  <span className="text-base font-extrabold text-blue-700 dark:text-blue-400 font-mono">
                    ${recommendation.recommendedPlan.priceEUR.toFixed(2)}
                  </span>
                </div>

                <div className="pt-3 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {recommendation.recommendedPlan.validityDays} días de validez 5G
                  </span>
                  <button
                    onClick={() => {
                      onSelectPlan(recommendation.recommendedPlan);
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-1 cursor-pointer active:scale-[0.98]"
                  >
                    <span>Seleccionar este Plan</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Travel Tips */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px] mb-1.5">
                  Consejos para optimizar tus datos en viaje
                </label>
                <ul className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                  {recommendation.tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => setRecommendation(null)}
                className="w-full text-center text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors pt-2"
              >
                ← Realizar otra consulta
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
