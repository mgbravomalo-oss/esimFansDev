import React, { useState } from 'react';
import {
  X,
  Code2,
  Copy,
  Check,
  Smartphone,
  Cpu,
  Zap,
  CheckCircle2,
  ExternalLink,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  Terminal,
  Settings,
  Layers,
  Sparkles
} from 'lucide-react';
import { ButterflyLogo } from './ButterflyLogo';
import { checkFlutterEsimSupport, installFlutterEsim, openFlutterEsimSettings, isRunningInFlutter } from '../utils/flutterBridge';

interface FlutterEsimDevGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FlutterEsimDevGuideModal: React.FC<FlutterEsimDevGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'architecture' | 'dart_code' | 'manifest' | 'interactive_test' | 'butterfly_logo'>('dart_code');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const runTestCheck = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await checkFlutterEsimSupport();
      setTestResult(JSON.stringify(res, null, 2));
    } catch (e: any) {
      setTestResult(`Error: ${e.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const runTestInstall = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const dummyLpa = 'LPA:1$smdp.io$TEST_ACTIVATION_CODE_12345';
      const res = await installFlutterEsim({
        lpaString: dummyLpa,
        iccid: '8900000000000000000',
        planName: 'Prueba eSIM Flutter',
      });
      setTestResult(JSON.stringify(res, null, 2));
    } catch (e: any) {
      setTestResult(`Error: ${e.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const pubspecSnippet = `# pubspec.yaml
dependencies:
  flutter:
    sdk: flutter
  # Paquete oficial para gestión de eSIM (EuiccManager en Android / CoreTelephony en iOS)
  esim_manager: ^0.1.2
  # WebView moderno de Flutter
  webview_flutter: ^4.10.0
  # Alternativa si usas inappwebview:
  # flutter_inappwebview: ^6.1.5
`;

  const dartCodeSnippet = `// lib/screens/esim_webview_screen.dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:esim_manager/esim_manager.dart';

class EsimWebViewScreen extends StatefulWidget {
  final String initialUrl;
  const EsimWebViewScreen({Key? key, required this.initialUrl}) : super(key: key);

  @override
  State<EsimWebViewScreen> createState() => _EsimWebViewScreenState();
}

class _EsimWebViewScreenState extends State<EsimWebViewScreen> {
  late final WebViewController _controller;
  final EsimManager _esimManager = EsimManager();

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        'NativeFlutterBridge',
        onMessageReceived: _handleWebMessage,
      )
      ..loadRequest(Uri.parse(widget.initialUrl));
  }

  // Escuchador de acciones enviadas desde la app web React
  void _handleWebMessage(JavaScriptMessage message) async {
    try {
      final Map<String, dynamic> data = jsonDecode(message.message);
      final String action = data['action'] ?? '';
      final payload = data['payload'] ?? {};

      switch (action) {
        // 1. CHEQUEO DE COMPATIBILIDAD CON ESIM
        case 'CHECK_ESIM_SUPPORT':
          final bool isSupported = await _esimManager.isEsimSupported();
          final responseJson = jsonEncode({
            'supported': isSupported,
            'details': isSupported ? 'Chip eUICC activo' : 'Dispositivo sin soporte eSIM',
            'deviceModel': 'Dispositivo Móvil',
          });
          // Inyectamos la respuesta de vuelta a React
          await _controller.runJavaScript(
            'window.onFlutterEsimSupported && window.onFlutterEsimSupported($responseJson);',
          );
          break;

        // 2. INSTALACIÓN DIRECTA EN 1 CLIC (LPA STRING)
        case 'INSTALL_ESIM':
          final String lpaString = payload['lpaString'] ?? payload['lpa'] ?? '';
          final String iccid = payload['iccid'] ?? '';
          
          if (lpaString.isEmpty) {
            _sendInstallResult(false, 'Código LPA vacío', iccid);
            return;
          }

          // Invoca el instalador nativo del sistema operativo (EuiccManager / LPA)
          final bool success = await _esimManager.installEsim(lpaString);
          _sendInstallResult(success, success ? null : 'Instalación cancelada o fallida', iccid);
          break;

        // 3. ABRIR AJUSTES DE RED MÓVIL
        case 'OPEN_ESIM_SETTINGS':
          // En Android abre Intent ACTION_MANAGE_EMBEDDED_SUBSCRIPTIONS o Settings
          break;
      }
    } catch (e) {
      debugPrint('Error procesando mensaje de WebView: \$e');
    }
  }

  void _sendInstallResult(bool success, String? error, String iccid) async {
    final responseJson = jsonEncode({
      'success': success,
      'error': error,
      'iccid': iccid,
    });
    await _controller.runJavaScript(
      'window.onFlutterEsimInstallResult && window.onFlutterEsimInstallResult($responseJson);',
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: WebViewWidget(controller: _controller),
      ),
    );
  }
}
`;

  const androidSnippet = `<!-- android/app/src/main/AndroidManifest.xml -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- Permisos de red e Internet -->
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>

    <!-- Permiso opcional para consultar estado de SIM en algunos fabricantes -->
    <uses-permission android:name="android.permission.READ_PHONE_STATE"/>

    <application
        android:label="Wappa eSIM"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round">
        <!-- android:usesCleartextTraffic="true" (solo para desarrollo local si aplica) -->
    </application>
</manifest>
`;

  const butterflyDartSnippet = `// lib/widgets/butterfly_logo.dart
// Uso del widget en cualquier pantalla o AppBar de Flutter:
import 'package:flutter/material.dart';
import 'widgets/butterfly_logo.dart';

// 1. Icono animado estándar con respiración suave y aleteo 3D:
ButterflyLogo(
  size: 44.0,
  animated: true,
  showBackground: true,
  onTap: () => debugPrint("Tap en logo mariposa"),
)

// 2. Mariposa vectorial transparente (para Splash o AppBar):
ButterflyLogo(
  size: 64.0,
  animated: true,
  showBackground: false,
)
`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl relative overflow-hidden text-slate-900 dark:text-white max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white flex items-center justify-center shadow-md">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Guía de Integración Flutter eSIM (esim_manager)
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  WebView Bridge
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chequeo de compatibilidad de hardware e instalación nativa 1-clic
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800 overflow-x-auto shrink-0 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('dart_code')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'dart_code'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Código Dart (Flutter)</span>
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'architecture'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>¿Cómo Funciona?</span>
          </button>
          <button
            onClick={() => setActiveTab('manifest')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'manifest'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Configuración (pubspec & Android)</span>
          </button>
          <button
            onClick={() => setActiveTab('butterfly_logo')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'butterfly_logo'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
            <span>Logo Mariposa Nativo</span>
          </button>
          <button
            onClick={() => setActiveTab('interactive_test')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'interactive_test'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Prueba Interactiva</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1 text-xs">
          
          {/* TAB: DART CODE */}
          {activeTab === 'dart_code' && (
            <div className="space-y-3">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl text-blue-900 dark:text-blue-200">
                <span className="font-bold block mb-1">Integración bidireccional vía JavaScriptChannel:</span>
                React envía la orden <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded text-[11px]">CHECK_ESIM_SUPPORT</code> o <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded text-[11px]">INSTALL_ESIM</code> con el código LPA. Flutter recibe el mensaje, ejecuta el método nativo del paquete <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded text-[11px]">esim_manager</code> y devuelve el resultado con <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded text-[11px]">runJavaScript</code>.
              </div>

              <div className="relative group">
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800 text-slate-300 text-[11px] font-mono rounded-t-xl border border-b-0 border-slate-700">
                  <span>lib/screens/esim_webview_screen.dart</span>
                  <button
                    onClick={() => handleCopy(dartCodeSnippet, 'dart_code')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    {copiedKey === 'dart_code' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar Código</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 bg-slate-950 text-slate-100 font-mono text-[11px] rounded-b-xl border border-slate-800 overflow-x-auto max-h-[380px] leading-relaxed">
                  <code>{dartCodeSnippet}</code>
                </pre>
              </div>
            </div>
          )}

          {/* TAB: ARCHITECTURE */}
          {activeTab === 'architecture' && (
            <div className="space-y-3.5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">1</div>
                  <h4 className="font-bold text-slate-900 dark:text-white">Web React (WebView)</h4>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                    El usuario pulsa <em>"Instalar eSIM en 1 Clic"</em>. React invoca <code className="font-mono text-emerald-600 dark:text-emerald-400">postMessageToFlutter('INSTALL_ESIM', &#123; lpaString &#125;)</code>.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">2</div>
                  <h4 className="font-bold text-slate-900 dark:text-white">Capa Flutter Native</h4>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                    El canal <code className="font-mono text-blue-600 dark:text-blue-400">NativeFlutterBridge</code> intercepta la acción y ejecuta <code className="font-mono text-blue-600 dark:text-blue-400">EsimManager.installEsim(lpa)</code>.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold">3</div>
                  <h4 className="font-bold text-slate-900 dark:text-white">Sistema Operativo</h4>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                    En <strong>Android</strong>, <code className="font-mono">EuiccManager</code> abre la ventana nativa de descarga de perfil. En <strong>iOS</strong>, abre la hoja de aprovisionamiento de plan celular.
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Beneficios frente al escaneo de QR tradicional:</span>
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300 text-[11px]">
                  <li><strong>Sin requerir 2 pantallas:</strong> El usuario no necesita una computadora ni imprimir el papel para escanear el QR con su cámara.</li>
                  <li><strong>Cero errores de tipeo:</strong> El código LPA (SM-DP+ Address y Activation Code) se pasa por software directamente al chip eUICC.</li>
                  <li><strong>Detección de hardware automática:</strong> La app sabe de antemano si el teléfono soporta eSIM antes de que el usuario compre.</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB: MANIFEST & PUBSPEC */}
          {activeTab === 'manifest' && (
            <div className="space-y-4">
              <div className="relative group">
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800 text-slate-300 text-[11px] font-mono rounded-t-xl border border-b-0 border-slate-700">
                  <span>pubspec.yaml</span>
                  <button
                    onClick={() => handleCopy(pubspecSnippet, 'pubspec')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    {copiedKey === 'pubspec' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 bg-slate-950 text-slate-100 font-mono text-[11px] rounded-b-xl border border-slate-800 overflow-x-auto">
                  <code>{pubspecSnippet}</code>
                </pre>
              </div>

              <div className="relative group">
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800 text-slate-300 text-[11px] font-mono rounded-t-xl border border-b-0 border-slate-700">
                  <span>android/app/src/main/AndroidManifest.xml</span>
                  <button
                    onClick={() => handleCopy(androidSnippet, 'android')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    {copiedKey === 'android' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 bg-slate-950 text-slate-100 font-mono text-[11px] rounded-b-xl border border-slate-800 overflow-x-auto">
                  <code>{androidSnippet}</code>
                </pre>
              </div>
            </div>
          )}

          {/* TAB: BUTTERFLY LOGO */}
          {activeTab === 'butterfly_logo' && (
            <div className="space-y-4">
              {/* Live Preview Card */}
              <div className="p-4 bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-950/60 border border-cyan-500/30 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <ButterflyLogo size="lg" animated={true} />
                    <ButterflyLogo size="md" animated={true} />
                    <ButterflyLogo size="sm" animated={true} />
                    <div>
                      <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                        <span>Logo Nativo Mariposa</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                          HD Vector
                        </span>
                      </h3>
                      <p className="text-xs text-slate-400">
                        Alas en gradiente cian, azul e índigo con aleteo 3D y respiración suave
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-700/60 text-[11px] text-slate-300">
                  <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                    <span className="font-bold text-cyan-400 block mb-1">✅ Icono de Lanzador Móvil (Android App Icon):</span>
                    <p className="text-slate-400">
                      Generado y configurado en <code className="text-white font-mono">mipmap-mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi</code> con formato estándar y redondo (<code className="text-white font-mono">ic_launcher.png</code> y <code className="text-white font-mono">ic_launcher_round.png</code>).
                    </p>
                  </div>
                  <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                    <span className="font-bold text-cyan-400 block mb-1">✅ Widget Nativo Flutter:</span>
                    <p className="text-slate-400">
                      Disponible en <code className="text-white font-mono">lib/widgets/butterfly_logo.dart</code> utilizando <code className="text-white font-mono">CustomPainter</code> para un rendimiento nativo de 60/120 fps.
                    </p>
                  </div>
                </div>
              </div>

              {/* Dart Snippet */}
              <div className="relative group">
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800 text-slate-300 text-[11px] font-mono rounded-t-xl border border-b-0 border-slate-700">
                  <span>lib/widgets/butterfly_logo.dart (Ejemplo de uso)</span>
                  <button
                    onClick={() => handleCopy(butterflyDartSnippet, 'butterfly_dart')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    {copiedKey === 'butterfly_dart' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 bg-slate-950 text-cyan-200 font-mono text-[11px] rounded-b-xl border border-slate-800 overflow-x-auto">
                  <code>{butterflyDartSnippet}</code>
                </pre>
              </div>
            </div>
          )}

          {/* TAB: INTERACTIVE TEST */}
          {activeTab === 'interactive_test' && (
            <div className="space-y-3">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white">Estado del Canal Flutter en este Navegador:</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isRunningInFlutter()
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                  }`}>
                    {isRunningInFlutter() ? 'Canal Móvil Detectado' : 'Navegador Web Estándar'}
                  </span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                  Puedes probar las funciones de comunicación bidireccional directamente. Si no estás dentro del WebView de Flutter, el simulador responderá con los datos de prueba.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={runTestCheck}
                  disabled={isTesting}
                  className="flex-1 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Probar CHECK_ESIM_SUPPORT</span>
                </button>
                <button
                  onClick={runTestInstall}
                  disabled={isTesting}
                  className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Probar INSTALL_ESIM (Mock)</span>
                </button>
              </div>

              {testResult && (
                <div className="p-3 bg-slate-950 text-emerald-400 font-mono text-[11px] rounded-xl border border-slate-800 overflow-x-auto animate-fade-in">
                  <span className="text-slate-400 block mb-1 font-sans text-xs">Respuesta recibida:</span>
                  <pre>{testResult}</pre>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Compatible con Android 9+ (API 28+) e iOS 12.1+
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-xs font-semibold"
          >
            Cerrar Guía
          </button>
        </div>

      </div>
    </div>
  );
};
