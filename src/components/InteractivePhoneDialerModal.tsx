import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Phone, Delete, Wifi, Battery, Sparkles, CheckCircle2, 
  RotateCcw, Play, Volume2, ShieldCheck, Smartphone, PhoneCall, PhoneOff, Mic, VolumeX
} from 'lucide-react';

interface InteractivePhoneDialerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDial?: string;
}

export const InteractivePhoneDialerModal: React.FC<InteractivePhoneDialerModalProps> = ({
  isOpen,
  onClose,
  initialDial
}) => {
  const [dialedNumber, setDialedNumber] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [isAutoDialing, setIsAutoDialing] = useState(false);
  const [showEidScreen, setShowEidScreen] = useState(false);
  const [isInCall, setIsInCall] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState('');
  const autoDialTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync current phone clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateClock();
    const interval = setInterval(updateClock, 30000);
    return () => clearInterval(interval);
  }, []);

  // Call duration counter
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isInCall) {
      timer = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(timer);
  }, [isInCall]);

  // Handle initialDial if passed
  useEffect(() => {
    if (isOpen && initialDial) {
      setDialedNumber(initialDial);
      if (initialDial === '*#06#') {
        setShowEidScreen(true);
      }
    } else if (isOpen) {
      setDialedNumber('');
      setShowEidScreen(false);
      setIsInCall(false);
    }
  }, [isOpen, initialDial]);

  // Clean timeouts on unmount
  useEffect(() => {
    return () => {
      if (autoDialTimeoutRef.current) clearTimeout(autoDialTimeoutRef.current);
    };
  }, []);

  if (!isOpen) return null;

  // Realistic Dual-Tone Multi-Frequency (DTMF) Sound Generator
  const playDtmfTone = (key: string, durationMs = 130) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const freqMap: { [k: string]: [number, number] } = {
        '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
        '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
        '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
        '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
      };

      const freqs = freqMap[key] || [750, 1200];
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.frequency.value = freqs[0];
      osc2.frequency.value = freqs[1];

      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + durationMs / 1000);
      osc2.stop(ctx.currentTime + durationMs / 1000);

      setTimeout(() => {
        ctx.close().catch(() => {});
      }, durationMs + 50);
    } catch {
      // Audio context may be restricted by autoplay policy
    }
  };

  const handleKeyPress = (key: string) => {
    if (isAutoDialing || isInCall || showEidScreen) return;
    
    playDtmfTone(key);
    setActiveKey(key);
    setTimeout(() => setActiveKey(null), 150);

    const nextNumber = dialedNumber + key;
    setDialedNumber(nextNumber);

    // Universal eSIM / IMEI check code
    if (nextNumber === '*#06#') {
      setTimeout(() => {
        setShowEidScreen(true);
      }, 250);
    }
  };

  const handleDelete = () => {
    if (dialedNumber.length > 0) {
      setDialedNumber(prev => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    setDialedNumber('');
    setShowEidScreen(false);
    setIsInCall(false);
  };

  // Automated typing sequence simulating a user dialing *#06#
  const startAutoDialSequence = (sequence = '*#06#') => {
    if (isAutoDialing) return;
    setIsAutoDialing(true);
    setDialedNumber('');
    setShowEidScreen(false);
    setIsInCall(false);

    const chars = sequence.split('');
    chars.forEach((char, index) => {
      const delay = (index + 1) * 350;
      setTimeout(() => {
        playDtmfTone(char, 160);
        setActiveKey(char);
        setDialedNumber(prev => prev + char);
        setTimeout(() => setActiveKey(null), 180);

        if (index === chars.length - 1) {
          setTimeout(() => {
            setIsAutoDialing(false);
            if (sequence === '*#06#') {
              setShowEidScreen(true);
            }
          }, 300);
        }
      }, delay);
    });
  };

  const handleCall = () => {
    if (!dialedNumber) return;
    if (dialedNumber === '*#06#') {
      setShowEidScreen(true);
      return;
    }
    setIsInCall(true);
    playDtmfTone('1', 300);
  };

  const handleEndCall = () => {
    setIsInCall(false);
    setCallDuration(0);
  };

  const formatCallTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const keypadKeys = [
    { num: '1', sub: ' ' },
    { num: '2', sub: 'A B C' },
    { num: '3', sub: 'D E F' },
    { num: '4', sub: 'G H I' },
    { num: '5', sub: 'J K L' },
    { num: '6', sub: 'M N O' },
    { num: '7', sub: 'P Q R S' },
    { num: '8', sub: 'T U V' },
    { num: '9', sub: 'W X Y Z' },
    { num: '*', sub: ' ' },
    { num: '0', sub: '+' },
    { num: '#', sub: ' ' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative flex flex-col md:flex-row items-center gap-6 max-h-[95vh] overflow-y-auto p-1">
        
        {/* Smartphone Hardware Frame Mockup */}
        <div className="relative w-[310px] sm:w-[330px] h-[640px] sm:h-[660px] bg-slate-900 rounded-[50px] p-3.5 shadow-2xl border-[5px] border-slate-700/80 ring-1 ring-slate-600/50 flex flex-col shrink-0 select-none">
          
          {/* Outer Volume & Power Buttons on Chassis */}
          <div className="absolute -left-2 top-28 w-1 h-12 bg-slate-700 rounded-l-md" />
          <div className="absolute -left-2 top-44 w-1 h-12 bg-slate-700 rounded-l-md" />
          <div className="absolute -right-2 top-36 w-1 h-16 bg-slate-700 rounded-r-md" />

          {/* Screen Glass */}
          <div className="relative w-full h-full bg-slate-950 rounded-[40px] overflow-hidden flex flex-col border border-slate-800 text-white font-sans">
            
            {/* Status Bar */}
            <div className="pt-3 px-6 pb-1 flex items-center justify-between text-[11px] font-semibold text-slate-300 shrink-0 z-30">
              <span>{currentTime || '09:41'}</span>
              
              {/* Dynamic Island / Camera Notch */}
              <div className="w-24 h-5 bg-black rounded-full flex items-center justify-end px-2.5 gap-1.5 shadow-inner">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="w-2 h-2 rounded-full bg-slate-800" />
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-emerald-400">5G</span>
                <Wifi className="w-3.5 h-3.5" />
                <Battery className="w-4 h-4 fill-white" />
              </div>
            </div>

            {/* Carrier Info */}
            <div className="px-6 py-0.5 flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-800/40">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>Wappa eSIM 5G</span>
              </span>
              <span>SIM 2 Activa</span>
            </div>

            {/* MAIN SCREEN STATES */}
            {showEidScreen ? (
              /* EID Information System Modal (Triggered by *#06#) */
              <div className="flex-1 p-4 flex flex-col justify-between animate-fade-in bg-slate-900/95 text-slate-100 overflow-y-auto">
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-center gap-2 pb-2 border-b border-slate-800">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <h3 className="font-bold text-sm text-white">Información del Dispositivo</h3>
                  </div>

                  {/* EID Section (The proof of eSIM compatibility) */}
                  <div className="p-3 bg-slate-950 rounded-xl border-2 border-emerald-500/80 shadow-md space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> EID (eSIM Hardware):
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 uppercase">
                        Compatible
                      </span>
                    </div>

                    {/* Simulated EID Barcode */}
                    <div className="h-9 w-full bg-white rounded p-1 flex items-center justify-center overflow-hidden">
                      <div className="flex items-center justify-between w-full h-full">
                        {Array.from({ length: 42 }).map((_, i) => (
                          <div 
                            key={i} 
                            className="bg-black h-full" 
                            style={{ width: `${(i % 3 === 0 ? 3 : (i % 2 === 0 ? 1 : 2))}px` }} 
                          />
                        ))}
                      </div>
                    </div>

                    <div className="font-mono text-[10px] text-center tracking-wider text-slate-300 select-all bg-slate-900/90 p-1.5 rounded border border-slate-800">
                      8904 9032 0050 0888 2600 0341 7721 8392
                    </div>

                    <p className="text-[10px] text-emerald-300 font-medium text-center leading-tight">
                      ¡Tu dispositivo cuenta con chip eSIM integrado y está listo para navegar!
                    </p>
                  </div>

                  {/* IMEI 1 */}
                  <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1">
                    <div className="text-[10px] font-semibold text-slate-400">IMEI (Ranura física 1):</div>
                    <div className="font-mono text-[11px] text-slate-200">356892 11 048291 0</div>
                  </div>

                  {/* IMEI 2 */}
                  <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1">
                    <div className="text-[10px] font-semibold text-slate-400">IMEI 2 (eSIM Digital):</div>
                    <div className="font-mono text-[11px] text-slate-200">356892 11 048291 8</div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEidScreen(false);
                      setDialedNumber('');
                    }}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Volver al Teclado</span>
                  </button>
                </div>
              </div>
            ) : isInCall ? (
              /* Simulated Active Call Screen */
              <div className="flex-1 p-6 flex flex-col justify-between items-center text-center animate-fade-in bg-gradient-to-b from-slate-900 to-slate-950">
                <div className="pt-6 space-y-2">
                  <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-emerald-500/40 flex items-center justify-center mx-auto shadow-lg">
                    <PhoneCall className="w-9 h-9 text-emerald-400 animate-pulse" />
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-wide">
                    {dialedNumber === '+34900800123' || dialedNumber.includes('900') ? 'Soporte Wappa eSIM' : dialedNumber}
                  </h3>
                  <div className="text-xs font-mono text-emerald-400 font-semibold">
                    {formatCallTime(callDuration)}
                  </div>
                  <span className="text-[11px] text-slate-400 block">Llamada en curso con voz HD</span>
                </div>

                {/* Simulated In-call controls */}
                <div className="grid grid-cols-3 gap-4 w-full max-w-[220px]">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-11 h-11 rounded-full bg-slate-800/90 flex items-center justify-center text-slate-400">
                      <Mic className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] text-slate-400">Silenciar</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-11 h-11 rounded-full bg-slate-800/90 flex items-center justify-center text-slate-400">
                      <Volume2 className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] text-slate-400">Altavoz</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-11 h-11 rounded-full bg-slate-800/90 flex items-center justify-center text-slate-400">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] text-slate-400">Teclado</span>
                  </div>
                </div>

                {/* Hang up button */}
                <button
                  type="button"
                  onClick={handleEndCall}
                  className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer mb-2"
                >
                  <PhoneOff className="w-7 h-7" />
                </button>
              </div>
            ) : (
              /* Phone Dialer Screen */
              <div className="flex-1 flex flex-col justify-between px-5 pb-4 pt-2">
                
                {/* Dialed Number Display Area */}
                <div className="min-h-[64px] flex flex-col items-center justify-center relative">
                  <div className="text-2xl sm:text-3xl font-mono font-medium tracking-widest text-white text-center break-all select-all flex items-center justify-center">
                    <span>{dialedNumber || ''}</span>
                    {!dialedNumber && (
                      <span className="text-slate-500 font-sans text-xs tracking-normal">
                        Marca un código o número
                      </span>
                    )}
                    <span className="w-0.5 h-6 bg-emerald-400 animate-pulse ml-0.5"></span>
                  </div>
                  {dialedNumber && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-white transition-colors"
                      title="Borrar dígito"
                    >
                      <Delete className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {/* 3x4 Dialpad Keys */}
                <div className="grid grid-cols-3 gap-x-4 gap-y-2.5 max-w-[250px] mx-auto w-full">
                  {keypadKeys.map(({ num, sub }) => {
                    const isPressed = activeKey === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => handleKeyPress(num)}
                        disabled={isAutoDialing}
                        className={`w-16 h-16 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer select-none active:scale-90 ${
                          isPressed 
                            ? 'bg-emerald-500 text-slate-950 scale-95 shadow-[0_0_15px_#10b981]' 
                            : 'bg-slate-800/80 hover:bg-slate-700/80 text-white'
                        }`}
                      >
                        <span className="text-2xl font-semibold leading-none">{num}</span>
                        {sub.trim() && (
                          <span className={`text-[8px] font-bold tracking-widest uppercase mt-0.5 ${
                            isPressed ? 'text-slate-950' : 'text-slate-400'
                          }`}>
                            {sub}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Bottom Dial & Action Bar */}
                <div className="flex items-center justify-around pt-2 px-2 max-w-[250px] mx-auto w-full">
                  {/* Clear / Reset button */}
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={!dialedNumber || isAutoDialing}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-0 cursor-pointer"
                    title="Limpiar"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  {/* Green Call Button */}
                  <button
                    type="button"
                    onClick={handleCall}
                    disabled={!dialedNumber || isAutoDialing}
                    className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-lg active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
                    title="Llamar / Ejecutar código"
                  >
                    <Phone className="w-7 h-7 fill-current" />
                  </button>

                  {/* Delete button placeholder for balance */}
                  <div className="w-10 h-10" />
                </div>
              </div>
            )}

            {/* Bottom Home Indicator Bar */}
            <div className="pb-2 pt-1 flex justify-center shrink-0">
              <div className="w-32 h-1 bg-slate-700 rounded-full" />
            </div>
          </div>
        </div>

        {/* Control & Demo Panel beside the phone */}
        <div className="w-full md:w-[320px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl text-slate-900 dark:text-white space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold">Simulador de Teléfono</h3>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Prueba de marcación en vivo</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Interactúa directamente con el teclado del teléfono o pulsa una de las secuencias automáticas para ver cómo responde el sistema con sonido DTMF real.
          </p>

          {/* Quick Dial Actions */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
              Acciones de marcación rápida:
            </span>

            {/* Primary Action: Auto-dial *#06# */}
            <button
              type="button"
              onClick={() => startAutoDialSequence('*#06#')}
              disabled={isAutoDialing}
              className="w-full p-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-between cursor-pointer disabled:opacity-50 active:scale-[0.98]"
            >
              <div className="flex items-center gap-2 text-left">
                <Play className="w-4 h-4 fill-white" />
                <div>
                  <div className="text-xs font-bold leading-tight">Discar *#06# (Test EID eSIM)</div>
                  <div className="text-[10px] font-normal opacity-90">Verifica la compatibilidad física</div>
                </div>
              </div>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-black/20">*#06#</span>
            </button>

            {/* Support Call Test */}
            <button
              type="button"
              onClick={() => {
                setDialedNumber('+34900800123');
                setShowEidScreen(false);
                setIsInCall(true);
              }}
              disabled={isAutoDialing}
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <PhoneCall className="w-3.5 h-3.5 text-blue-500" />
                <span>Llamar a Soporte Wappa</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">+34 900...</span>
            </button>
          </div>

          {/* Sound & Feedback Notice */}
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl flex items-start gap-2 text-[11px] text-amber-900 dark:text-amber-200">
            <Volume2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <span>
              Cada tecla emite su frecuencia acústica <strong>DTMF real</strong>. Si no escuchas sonido, asegúrate de haber interactuado con la página para activar el audio.
            </span>
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors"
            >
              Cerrar simulador
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
