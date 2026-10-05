import React, { useState, useEffect } from 'react';
import { X, Copy, Check, QrCode, Smartphone, Info, Download, ShieldCheck, ExternalLink, Sparkles, CheckCircle2, Share2, Eye, Mail, Send, Loader2, Zap, Settings } from 'lucide-react';
import { UserEsim } from '../types';
import { CountryFlag } from './CountryFlag';
import { generateQrDataUrl, downloadOrShareImage, getQrDownloadUrl, getQrImageUrl, isMobileDevice } from '../utils/qrDownload';
import { isRunningInFlutter, installFlutterEsim, openFlutterEsimSettings, triggerNativeHaptic } from '../utils/flutterBridge';

interface QrCodeModalProps {
  esim: UserEsim | null;
  isOpen: boolean;
  onClose: () => void;
  defaultEmail?: string;
}

export const QrCodeModal: React.FC<QrCodeModalProps> = ({ esim, isOpen, onClose, defaultEmail }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [guideTab, setGuideTab] = useState<'ios' | 'android'>('ios');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccessNotice, setDownloadSuccessNotice] = useState<string | null>(null);
  const [installSuccessNotice, setInstallSuccessNotice] = useState(false);
  const [localQrDataUrl, setLocalQrDataUrl] = useState<string>('');

  // Flutter Native eSIM Install States
  const inFlutter = isRunningInFlutter();
  const [isNativeInstalling, setIsNativeInstalling] = useState(false);
  const [nativeInstallMessage, setNativeInstallMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Email delivery states
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [targetEmail, setTargetEmail] = useState(defaultEmail || '');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Sync defaultEmail when modal opens
  useEffect(() => {
    if (defaultEmail) {
      setTargetEmail(defaultEmail);
    }
  }, [defaultEmail, isOpen]);

  const fullLpaString = esim ? (esim.manualCode || `LPA:1$${esim.smdpAddress}$${esim.activationCode}`) : '';

  // Generar QR en base64 localmente para garantizar alta fidelidad y evitar problemas de red / CORS
  useEffect(() => {
    if (esim && isOpen) {
      const codeToRender = esim.manualCode || `LPA:1$${esim.smdpAddress}$${esim.activationCode}`;
      generateQrDataUrl(codeToRender, 500)
        .then((dataUri) => setLocalQrDataUrl(dataUri))
        .catch(() => setLocalQrDataUrl(esim.qrCodeUrl));
    }
  }, [esim, isOpen]);

  if (!isOpen || !esim) return null;

  const handleSendEmail = async () => {
    const emailToSend = targetEmail.trim() || defaultEmail?.trim();
    if (!emailToSend || !esim) return;

    setIsSendingEmail(true);
    setEmailStatus(null);
    try {
      const res = await fetch('/api/user/esims/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ esimId: esim.id, email: emailToSend }),
      });
      const data = await res.json();
      if (data.success) {
        setEmailStatus({
          type: 'success',
          message: `¡Correo enviado exitosamente a ${emailToSend}! Incluye tu código QR e instrucciones.`,
        });
        setShowEmailInput(false);
      } else {
        setEmailStatus({
          type: 'error',
          message: data.error || 'No se pudo enviar el correo. Verifica las variables SMTP en el servidor.',
        });
      }
    } catch (err: any) {
      setEmailStatus({
        type: 'error',
        message: err.message || 'Error de conexión con el servidor.',
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const filename = esim ? `eSIM-${esim.country.replace(/\s+/g, '_')}-${esim.planName.replace(/\s+/g, '_')}.png` : 'eSIM-QR.png';
  const downloadApiUrl = fullLpaString ? getQrDownloadUrl(fullLpaString, filename) : '';
  const imageApiUrl = fullLpaString ? getQrImageUrl(fullLpaString) : '';

  // Descargar imagen QR directamente (Compatible al 100% con Chrome Android y navegadores de escritorio)
  const handleDownloadQr = async () => {
    if (!esim) return;
    try {
      setIsDownloading(true);
      setDownloadSuccessNotice(null);

      const qrData = localQrDataUrl || await generateQrDataUrl(fullLpaString, 600);
      const result = await downloadOrShareImage(
        qrData,
        filename,
        `eSIM ${esim.country} - ${esim.planName}`,
        fullLpaString,
        false
      );

      if (result === 'downloaded') {
        setDownloadSuccessNotice('¡Código QR descargado! Guardado en tu carpeta de Descargas o Galería.');
      } else if (result === 'shared') {
        setDownloadSuccessNotice('¡Imagen compartida o guardada en tu galería!');
      } else {
        setDownloadSuccessNotice('Imagen abierta. Mantén presionado sobre ella para guardarla en Fotos.');
      }

      setTimeout(() => setDownloadSuccessNotice(null), 6000);
    } catch (err) {
      console.error('Error guardando QR:', err);
      // Fallback inmediato abriendo la URL del backend
      if (imageApiUrl) {
        window.open(imageApiUrl, '_blank');
      }
    } finally {
      setIsDownloading(false);
    }
  };

  // Abrir menú nativo de Compartir en móviles (WhatsApp, Fotos, Bluetooth, Quick Share)
  const handleShareQr = async () => {
    if (!esim) return;
    try {
      setIsDownloading(true);
      setDownloadSuccessNotice(null);

      const qrData = localQrDataUrl || await generateQrDataUrl(fullLpaString, 600);
      const result = await downloadOrShareImage(
        qrData,
        filename,
        `eSIM ${esim.country} - ${esim.planName}`,
        fullLpaString,
        true
      );

      if (result === 'shared') {
        setDownloadSuccessNotice('¡Código QR listo en tu teléfono!');
      } else {
        setDownloadSuccessNotice('¡Código QR guardado en tu dispositivo!');
      }
      setTimeout(() => setDownloadSuccessNotice(null), 6000);
    } catch (err) {
      console.error('Error compartiendo QR:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  // Asistente de instalación directa con Flutter Native (esim_manager / EuiccManager / LPA)
  const handleNativeFlutterInstall = async () => {
    if (!esim) return;
    setIsNativeInstalling(true);
    setNativeInstallMessage(null);
    triggerNativeHaptic('medium');

    try {
      const res = await installFlutterEsim({
        lpaString: fullLpaString,
        iccid: esim.iccid,
        planName: esim.planName,
      });

      if (res.success) {
        triggerNativeHaptic('success');
        setNativeInstallMessage({
          type: 'success',
          text: '¡Aprovisionamiento iniciado! Sigue las instrucciones del sistema en pantalla para confirmar la activación de tu eSIM.',
        });
      } else if (res.cancelled) {
        setNativeInstallMessage({
          type: 'info',
          text: 'La descarga fue cancelada o descartada en el gestor nativo. Puedes reintentar o usar el código manual.',
        });
      } else {
        triggerNativeHaptic('warning');
        handleInstallOnThisDevice(); // Fallback copiando al portapapeles
        setNativeInstallMessage({
          type: 'error',
          text: res.error || 'Código LPA copiado al portapapeles. Ve a Ajustes > Conexiones > Administrador de SIM para pegarlo.',
        });
      }
    } catch (err: any) {
      handleInstallOnThisDevice();
      setNativeInstallMessage({
        type: 'error',
        text: err.message || 'Error comunicando con Flutter. Código LPA copiado.',
      });
    } finally {
      setIsNativeInstalling(false);
    }
  };

  // Asistente directo para instalar en este teléfono (Copia LPA manual)
  const handleInstallOnThisDevice = () => {
    // Copiar el código LPA completo al portapapeles de forma segura y garantizada
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullLpaString);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = fullLpaString;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    setCopiedKey('fullLpa');
    setInstallSuccessNotice(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-xl relative overflow-hidden text-slate-900 dark:text-white">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center p-1 overflow-hidden">
              <CountryFlag flag={esim.flag} countryCode={esim.countryCode} countryName={esim.country} size="md" rounded="sm" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{esim.planName}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">ICCID: {esim.iccid}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="py-4 space-y-4 max-h-[75vh] overflow-y-auto pr-1">

          {/* Quick Install Banner for This Device */}
          <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 flex flex-col gap-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  {inFlutter ? <Zap className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      {inFlutter ? 'Instalación Nativa en 1 Clic (App Móvil)' : '¿Cómo instalar tu eSIM?'}
                    </h4>
                    {inFlutter ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                        App Móvil Detectada
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        Navegador Web
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    {inFlutter 
                      ? 'Aprovisiona el perfil directamente en el chip eSIM del teléfono mediante el gestor nativo de la app.' 
                      : 'Escanea el código QR con la cámara de tu móvil o copia el código LPA para pegarlo en Ajustes.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {/* Flutter Native 1-Click Install Button */}
              {inFlutter ? (
                <>
                  <button
                    onClick={handleNativeFlutterInstall}
                    disabled={isNativeInstalling}
                    className="flex-1 min-w-[190px] py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all"
                  >
                    {isNativeInstalling ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                        <span>Aprovisionando en Sistema...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                        <span>Instalar eSIM en 1 Clic (Nativo)</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      openFlutterEsimSettings();
                      triggerNativeHaptic('light');
                      setNativeInstallMessage({
                        type: 'info',
                        text: 'Solicitando apertura de Ajustes de Red Celular y eSIM en el dispositivo.',
                      });
                    }}
                    className="py-2 px-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 transition-all shadow-xs"
                    title="Abrir menú de Red Móvil y eSIM del teléfono"
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-500" />
                    <span>Ajustes SIM</span>
                  </button>

                  <button
                    onClick={handleInstallOnThisDevice}
                    className="py-2 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 transition-all"
                    title="Copiar código LPA manual de respaldo"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>{copiedKey === 'fullLpa' ? '¡LPA Copiado!' : 'Copiar LPA'}</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={handleInstallOnThisDevice}
                  className="flex-1 min-w-[170px] py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all"
                >
                  <Copy className="w-3.5 h-3.5 text-emerald-200" />
                  <span>{copiedKey === 'fullLpa' ? '¡Código LPA Copiado!' : 'Copiar Código LPA'}</span>
                </button>
              )}

              <a
                href={downloadApiUrl || '#'}
                download={filename}
                onClick={() => {
                  setDownloadSuccessNotice('¡Descarga iniciada! Guardando código QR en tu teléfono...');
                  setTimeout(() => setDownloadSuccessNotice(null), 5000);
                }}
                className="py-2 px-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                title="Guarda la foto para seleccionarla desde el escáner de eSIM de Ajustes"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Guardar QR</span>
              </a>

              <button
                onClick={() => {
                  setShowEmailInput(!showEmailInput);
                  setEmailStatus(null);
                }}
                className="py-2 px-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs"
                title="Enviar código QR e instrucciones a un correo electrónico"
              >
                <Mail className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Enviar por Correo</span>
              </button>
            </div>

            {/* Native Install Message */}
            {nativeInstallMessage && (
              <div className={`p-2.5 rounded-lg text-[11px] flex items-start gap-1.5 animate-fade-in ${
                nativeInstallMessage.type === 'success'
                  ? 'bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200'
                  : nativeInstallMessage.type === 'info'
                  ? 'bg-blue-100 dark:bg-blue-950/80 border border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200'
                  : 'bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
              }`}>
                {nativeInstallMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                )}
                <span>{nativeInstallMessage.text}</span>
              </div>
            )}

            {/* Email Dispatch Input Panel */}
            {showEmailInput && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2 animate-fade-in text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Enviar eSIM por correo (Google Workspace)</span>
                  </span>
                  <button onClick={() => setShowEmailInput(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={targetEmail}
                    onChange={(e) => setTargetEmail(e.target.value)}
                    placeholder="tu-correo@ejemplo.com"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <button
                    onClick={handleSendEmail}
                    disabled={isSendingEmail || !targetEmail.includes('@')}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition-colors shrink-0 flex items-center gap-1"
                  >
                    <Send className="w-3 h-3" />
                    <span>{isSendingEmail ? 'Enviando...' : 'Enviar'}</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Enviaremos el código QR adjunto, los códigos manuales y la guía de instalación rápida.
                </p>
              </div>
            )}

            {emailStatus && (
              <div className={`p-2.5 rounded-lg text-[11px] flex items-start gap-1.5 animate-fade-in ${
                emailStatus.type === 'success'
                  ? 'bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200'
                  : 'bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
              }`}>
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{emailStatus.message}</span>
              </div>
            )}

            {downloadSuccessNotice && (
              <div className="p-2 bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 rounded-lg text-[11px] text-emerald-900 dark:text-emerald-200 flex items-start gap-1.5 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>{downloadSuccessNotice}</span>
              </div>
            )}

            {installSuccessNotice && (
              <div className="p-2 bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 rounded-lg text-[11px] text-emerald-900 dark:text-emerald-200 flex items-start gap-1.5 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Código copiado al portapapeles.</strong> Ve a <em>Ajustes &gt; Conexiones &gt; Administrador de SIM / Red celular &gt; Añadir eSIM</em> y pulsa <em>Pegar código</em> o selecciona la foto guardada en tu galería.
                </span>
              </div>
            )}
          </div>
          
          {/* QR Container */}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center flex flex-col items-center">
            <div className="bg-white p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs mb-3 inline-block relative group">
              <img
                src={localQrDataUrl || esim.qrCodeUrl || imageApiUrl}
                alt="Código QR de activación eSIM"
                className="w-48 h-48 mx-auto touch-manipulation cursor-pointer hover:opacity-95 transition-opacity"
                onClick={() => {
                  if (imageApiUrl) window.open(imageApiUrl, '_blank');
                }}
                title="Toca para ver en grande o mantén presionado para guardar imagen"
              />
              <span className="absolute bottom-1 right-1 text-[9px] bg-slate-900/70 text-white px-1.5 py-0.5 rounded backdrop-blur-xs flex items-center gap-0.5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                <Eye className="w-2.5 h-2.5" />
                <span>Ampliar</span>
              </span>
            </div>

            {/* Quick Action Buttons for QR */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 mb-3 w-full max-w-sm">
              <a
                href={downloadApiUrl}
                download={filename}
                onClick={() => {
                  setDownloadSuccessNotice('¡Descarga iniciada! Revisa tus notificaciones o carpeta Descargas.');
                  setTimeout(() => setDownloadSuccessNotice(null), 5000);
                }}
                className="flex-1 min-w-[110px] py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                title="Descarga directa para Chrome en Android, iPhone y PC"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar PNG</span>
              </a>

              <button
                onClick={handleShareQr}
                className="py-1.5 px-3 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                title="Compartir a WhatsApp, Fotos o Quick Share"
              >
                <Share2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Compartir</span>
              </button>

              <a
                href={imageApiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-1.5 px-2.5 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1 shadow-xs transition-colors"
                title="Abrir imagen limpia en pestaña nueva"
              >
                <Eye className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Ver</span>
              </a>
            </div>

            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              O escanea este código con la cámara de otro dispositivo
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Conexión Wi-Fi requerida durante la activación (aprox. 1 minuto)
            </p>
            <div className="mt-2 p-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60 rounded-lg text-left w-full text-[11px] text-emerald-900 dark:text-emerald-200 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              <span>
                <strong>Tip para Chrome móvil:</strong> Puedes pulsar <strong>Descargar PNG</strong> para guardarlo en tu móvil, o mantener pulsada la imagen con el dedo y seleccionar <em>"Descargar imagen"</em>.
              </span>
            </div>
          </div>

          {/* Manual Activation Codes */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                Códigos de Activación Manual
              </span>
              <button
                onClick={() => handleCopy(fullLpaString, 'fullLpa')}
                className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                {copiedKey === 'fullLpa' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>Copiar Código Completo LPA</span>
              </button>
            </div>

            {/* SM-DP+ Address */}
            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 flex items-center justify-between text-xs font-mono">
              <div className="overflow-hidden pr-2">
                <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500 block font-sans font-bold">Dirección SM-DP+</span>
                <span className="text-slate-800 dark:text-slate-200 font-semibold truncate block">{esim.smdpAddress}</span>
              </div>
              <button
                onClick={() => handleCopy(esim.smdpAddress, 'smdp')}
                className="p-1.5 rounded bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 shadow-xs shrink-0 flex items-center gap-1 text-[11px]"
              >
                {copiedKey === 'smdp' ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Copiar</span>
              </button>
            </div>

            {/* Activation Code */}
            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 flex items-center justify-between text-xs font-mono">
              <div className="overflow-hidden pr-2">
                <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500 block font-sans font-bold">Código de Activación</span>
                <span className="text-slate-800 dark:text-slate-200 font-semibold truncate block">{esim.activationCode}</span>
              </div>
              <button
                onClick={() => handleCopy(esim.activationCode, 'act')}
                className="p-1.5 rounded bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 shadow-xs shrink-0 flex items-center gap-1 text-[11px]"
              >
                {copiedKey === 'act' ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Copiar</span>
              </button>
            </div>
          </div>

          {/* Validity & Renewal Policy Notice - Solo en planes/eSIMs que no admiten recargas */}
          {(esim.supportTopUpType === 1 || esim.isReloadable === false) && (
            <div className="p-3 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40 rounded-xl text-[11px] text-amber-900 dark:text-amber-300 flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Plan no recargable:</strong> {esim.planName} está contratada para su período de uso y no admite recargas. Al agotar los días contratados o los datos disponibles, deberás adquirir una nueva eSIM para seguir conectado.
              </span>
            </div>
          )}

          {/* Device tabs */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setGuideTab('ios')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                  guideTab === 'ios'
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-600'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                iPhone (iOS)
              </button>
              <button
                onClick={() => setGuideTab('android')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                  guideTab === 'android'
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-600'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                Android (Samsung / Pixel / Xiaomi)
              </button>
            </div>

            {guideTab === 'ios' ? (
              <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-decimal list-inside bg-slate-50 dark:bg-slate-800/70 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <li>Ve a <strong>Ajustes &gt; Datos móviles</strong>.</li>
                <li>Pulsa en <strong>Añadir eSIM</strong>.</li>
                <li>Elige <strong>Usar código QR</strong> o <strong>Introducir datos manualmente</strong> (pega el código de arriba).</li>
                <li>También puedes usar la opción de escanear desde la <strong>Galería de Fotos</strong> seleccionando la imagen descargada.</li>
                <li>Al llegar a {esim.country}, activa la <strong>Itinerancia de datos</strong>.</li>
              </ol>
            ) : (
              <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-decimal list-inside bg-slate-50 dark:bg-slate-800/70 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <li>Ve a <strong>Ajustes &gt; Conexiones &gt; Administrador de SIM</strong>.</li>
                <li>Pulsa en <strong>Añadir eSIM</strong>.</li>
                <li>Pulsa en <strong>Escanear código QR</strong> y toca el icono de galería para seleccionar la foto descargada, o toca <strong>Introducir código de activación</strong> para pegar el texto copiado.</li>
                <li>Confirma la descarga y activa el <strong>Roaming de datos</strong> al aterrizar.</li>
              </ol>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Perfil compatible con eSIM GSMA</span>
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};

