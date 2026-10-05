import React from 'react';
import { X, BookOpen, Wifi, Globe, ShieldCheck, CheckCircle2, Zap, Smartphone, QrCode } from 'lucide-react';

interface InstallationGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFlutterDevGuide?: () => void;
}

export const InstallationGuideModal: React.FC<InstallationGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-xl relative overflow-hidden text-slate-900 dark:text-white max-h-[88vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Guía de Instalación eSIM</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Pasos sencillos para activar tu internet de viaje en minutos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps */}
        <div className="space-y-3 overflow-y-auto pr-1 flex-1 py-4 text-xs text-slate-700 dark:text-slate-300">
          
          {/* Step 1: Wi-Fi */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">1</span>
              <div className="flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Conéctate a una red Wi-Fi</span>
              </div>
            </div>
            <p className="text-slate-600 dark:text-slate-400 pl-7 text-[11px] leading-relaxed">
              Asegúrate de tener conexión a Internet estable (en casa, hotel o aeropuerto) antes de iniciar la instalación de tu plan para poder descargar el perfil de la eSIM en tu teléfono.
            </p>
          </div>

          {/* Step 2: Install Options */}
          <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl space-y-2.5">
            <div className="font-bold text-blue-950 dark:text-blue-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">2</span>
                <div className="flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Instala tu eSIM en tu teléfono</span>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-200/80 dark:bg-blue-900 text-blue-800 dark:text-blue-300">
                Fácil y Rápido
              </span>
            </div>

            <div className="pl-7 space-y-2 text-[11px]">
              <div className="p-2.5 bg-white/80 dark:bg-slate-900/60 rounded-lg border border-blue-100 dark:border-blue-800/60">
                <div className="font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5 mb-0.5">
                  <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                  <span>Opción A · Instalación Rápida en 1 Clic (Recomendada):</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300">
                  Si estás navegando en tu celular, pulsa el botón <strong>«Instalar eSIM en 1 Clic»</strong> desde los detalles de tu compra. Tu teléfono abrirá el instalador del sistema de inmediato sin necesidad de imprimir ni escanear.
                </p>
              </div>

              <div className="p-2.5 bg-white/80 dark:bg-slate-900/60 rounded-lg border border-blue-100 dark:border-blue-800/60">
                <div className="font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5 mb-0.5">
                  <QrCode className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span>Opción B · Con Código QR o Código Manual:</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300">
                  En tu teléfono ve a <strong>Ajustes &gt; Datos móviles o Redes &gt; Añadir eSIM</strong> y enfoca con la cámara el código QR que recibiste por correo o en la sección «Mis eSIMs».
                </p>
              </div>
            </div>
          </div>

          {/* Step 3: Accept System Dialog */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-800 dark:bg-slate-600 text-white flex items-center justify-center text-[10px] font-bold">3</span>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Confirma el diálogo en tu pantalla</span>
              </div>
            </div>
            <p className="text-slate-600 dark:text-slate-400 pl-7 text-[11px] leading-relaxed">
              Tu teléfono mostrará un mensaje confirmando: <em>«¿Deseas añadir este plan móvil a tu dispositivo?»</em>. Pulsa <strong>«Continuar / Descargar»</strong> y en pocos segundos la línea quedará guardada.
            </p>
          </div>

          {/* Step 4: Arrival at destination */}
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl space-y-1.5 text-emerald-950 dark:text-emerald-300">
            <div className="font-bold flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-700 dark:bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold">4</span>
              <div className="flex items-center gap-1.5 text-emerald-900 dark:text-emerald-200">
                <Globe className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Al aterrizar en tu destino (¡A navegar!):</span>
              </div>
            </div>
            <div className="pl-7 space-y-1 text-[11px] text-emerald-900 dark:text-emerald-200">
              <p>1. Enciende la línea eSIM en los Ajustes de tu teléfono.</p>
              <p>2. Selecciónala como tu línea predeterminada para <strong>Datos Móviles</strong>.</p>
              <p>3. Activa el interruptor de <strong>«Itinerancia de Datos» (Data Roaming)</strong> de la eSIM.</p>
              <p className="pt-1 font-semibold text-emerald-800 dark:text-emerald-300">
                ¡Listo! Tu teléfono se conectará a la red 4G/5G local al instante.
              </p>
            </div>
          </div>

          {/* Reassurance banner for end users */}
          <div className="p-3 bg-slate-100 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/80 flex items-start gap-2.5 text-slate-600 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              <strong>Mantén tu número habitual:</strong> Tu tarjeta SIM actual continuará funcionando para recibir llamadas y mensajes de WhatsApp. La eSIM únicamente suministra datos móviles durante tu viaje.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Activación en menos de 2 minutos · Soporte 24/7</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
          >
            Entendido
          </button>
        </div>

      </div>
    </div>
  );
};

