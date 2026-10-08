import React, { useState } from 'react';
import {
  Smartphone,
  Code2,
  Copy,
  Check,
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

export const FlutterSdkView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'architecture' | 'dart_code' | 'manifest' | 'interactive_test' | 'butterfly_logo'>('dart_code');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

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

  void _handleWebMessage(JavaScriptMessage message) async {
    try {
      final Map<String, dynamic> data = jsonDecode(message.message);
      final String action = data['action'] ?? '';
      final payload = data['payload'] ?? {};

      switch (action) {
        case 'CHECK_ESIM_SUPPORT':
          final bool isSupported = await _esimManager.isEsimSupported();
          final responseJson = jsonEncode({
            'supported': isSupported,
            'details': isSupported ? 'Chip eUICC activo' : 'Dispositivo sin soporte eSIM',
          });
          await _controller.runJavaScript(
            'window.onFlutterEsimSupported && window.onFlutterEsimSupported($responseJson);',
          );
          break;
        case 'INSTALL_ESIM':
          final String lpaString = payload['lpaString'] ?? '';
          final bool success = await _esimManager.installEsim(lpaString);
          break;
      }
    } catch (e) {
      debugPrint('Error: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(child: WebViewWidget(controller: _controller)),
    );
  }
}
`;

  const androidSnippet = `<!-- android/app/src/main/AndroidManifest.xml -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
    <application
        android:label="Wappa eSIM"
        android:usesCleartextTraffic="true">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
    </application>
</manifest>`;

  const butterflyDartSnippet = `// Integración del componente Butterfly Logo en Flutter
import 'package:flutter/material.dart';

class FlutterButterflyBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.slate[900],
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.wifi, color: Colors.emerald[400]),
          SizedBox(width: 8),
          Text('Wappa eSIM Engine', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
`;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-blue-500" />
            <span>Guía Técnica &amp; SDK Flutter (esim_manager)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-normal">
            Arquitectura de integración nativa para la App Móvil Flutter con WebViews bidireccionales, EuiccManager y canales JavaScript.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
            Flutter 3.x / Dart 3+
          </span>
        </div>
      </div>

      {/* Subtabs navigation */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl">
        <button
          onClick={() => setActiveTab('dart_code')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'dart_code'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Code2 className="w-3.5 h-3.5 text-blue-500" />
          <span>WebView &amp; Bridge Dart</span>
        </button>

        <button
          onClick={() => setActiveTab('architecture')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'architecture'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-emerald-500" />
          <span>pubspec.yaml</span>
        </button>

        <button
          onClick={() => setActiveTab('manifest')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'manifest'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Terminal className="w-3.5 h-3.5 text-purple-500" />
          <span>AndroidManifest</span>
        </button>

        <button
          onClick={() => setActiveTab('butterfly_logo')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'butterfly_logo'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Flutter UI Branding</span>
        </button>

        <button
          onClick={() => setActiveTab('interactive_test')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'interactive_test'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Cpu className="w-3.5 h-3.5 text-cyan-500" />
          <span>Pruebas Interactivas SDK</span>
        </button>
      </div>

      {/* Content panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
        {activeTab === 'dart_code' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Controlador WebView con Canal JavaScript Bidireccional (`NativeFlutterBridge`)
              </span>
              <button
                onClick={() => handleCopy(dartCodeSnippet, 'dart')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                {copiedKey === 'dart' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'dart' ? 'Copiado' : 'Copiar código'}</span>
              </button>
            </div>
            <pre className="p-4 bg-slate-950 text-cyan-200 font-mono text-[11px] rounded-2xl border border-slate-800 overflow-x-auto leading-normal">
              <code>{dartCodeSnippet}</code>
            </pre>
          </div>
        )}

        {activeTab === 'architecture' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Dependencias en `pubspec.yaml`
              </span>
              <button
                onClick={() => handleCopy(pubspecSnippet, 'pubspec')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                {copiedKey === 'pubspec' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'pubspec' ? 'Copiado' : 'Copiar pubspec'}</span>
              </button>
            </div>
            <pre className="p-4 bg-slate-950 text-emerald-300 font-mono text-[11px] rounded-2xl border border-slate-800 overflow-x-auto leading-normal">
              <code>{pubspecSnippet}</code>
            </pre>
          </div>
        )}

        {activeTab === 'manifest' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Configuración nativa Android (`AndroidManifest.xml`)
              </span>
              <button
                onClick={() => handleCopy(androidSnippet, 'android')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                {copiedKey === 'android' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'android' ? 'Copiado' : 'Copiar XML'}</span>
              </button>
            </div>
            <pre className="p-4 bg-slate-950 text-purple-300 font-mono text-[11px] rounded-2xl border border-slate-800 overflow-x-auto leading-normal">
              <code>{androidSnippet}</code>
            </pre>
          </div>
        )}

        {activeTab === 'butterfly_logo' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Componente UI de Marca (Butterfly Logo) en Flutter
              </span>
              <button
                onClick={() => handleCopy(butterflyDartSnippet, 'butterfly')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                {copiedKey === 'butterfly' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'butterfly' ? 'Copiado' : 'Copiar UI'}</span>
              </button>
            </div>
            <pre className="p-4 bg-slate-950 text-amber-300 font-mono text-[11px] rounded-2xl border border-slate-800 overflow-x-auto leading-normal">
              <code>{butterflyDartSnippet}</code>
            </pre>
          </div>
        )}

        {activeTab === 'interactive_test' && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white text-xs">Estado del Canal Flutter en este Navegador:</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isRunningInFlutter()
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                }`}>
                  {isRunningInFlutter() ? 'Canal Móvil Detectado' : 'Navegador Web Estándar'}
                </span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-xs">
                Puedes probar las funciones de comunicación bidireccional directamente. Si no estás dentro del WebView de Flutter, el simulador responderá con los datos de prueba.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={runTestCheck}
                disabled={isTesting}
                className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Cpu className="w-4 h-4" />
                <span>Probar CHECK_ESIM_SUPPORT</span>
              </button>
              <button
                onClick={runTestInstall}
                disabled={isTesting}
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                <span>Probar INSTALL_ESIM (Mock)</span>
              </button>
            </div>

            {testResult && (
              <div className="p-4 bg-slate-950 text-emerald-400 font-mono text-xs rounded-2xl border border-slate-800 overflow-x-auto animate-fade-in space-y-1">
                <span className="text-slate-400 block font-sans text-xs font-bold">Respuesta recibida:</span>
                <pre>{testResult}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
