/**
 * Flutter WebView Native Bridge Utility
 * 
 * Provides seamless bidirectional communication between React and the Flutter Native App shell:
 * - Native JavascriptChannel listener: window.NativeFlutterBridge
 * - Deep linking handler when opening WebView from Push Notifications
 * - Native device interactions (Haptic feedback, push token sync, navigation)
 */

declare global {
  interface Window {
    NativeFlutterBridge?: {
      postMessage: (message: string) => void;
    };
    flutter_inappwebview?: {
      callHandler: (handlerName: string, ...args: any[]) => Promise<any>;
    };
    isFlutterApp?: boolean;
    isWappaNativeApp?: boolean;
    // Callbacks invoked by Flutter via evaluateJavascript
    onFlutterEsimSupported?: (data: { supported: boolean; details?: string; deviceModel?: string }) => void;
    onFlutterEsimInstallResult?: (data: { success: boolean; error?: string; cancelled?: boolean; iccid?: string }) => void;
  }
}

export interface FlutterMessagePayload {
  action: string;
  payload?: any;
  timestamp?: number;
}

export interface FlutterEsimCheckResult {
  supported: boolean;
  details?: string;
  deviceModel?: string;
  source: 'flutter_native' | 'browser_simulated' | 'unknown';
}

export interface FlutterEsimInstallResult {
  success: boolean;
  error?: string;
  cancelled?: boolean;
  iccid?: string;
}

/**
 * Check if the React web app is currently executing inside a Flutter WebView
 */
export function isRunningInFlutter(): boolean {
  if (typeof window === 'undefined') return false;
  
  // 1. Check for injected InAppWebView or NativeFlutterBridge channels
  if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === 'function') {
    return true;
  }
  if (window.NativeFlutterBridge && typeof window.NativeFlutterBridge.postMessage === 'function') {
    return true;
  }

  // 2. Check for custom window flags set by Flutter evaluateJavascript
  if (window.isFlutterApp === true || window.isWappaNativeApp === true) {
    return true;
  }

  // 3. Check for URL query param flag (e.g., ?source=flutter, ?app=true, ?platform=flutter)
  const urlParams = new URLSearchParams(window.location.search);
  const source = (urlParams.get('source') || urlParams.get('platform') || urlParams.get('env') || '').toLowerCase();
  if (source === 'flutter' || source === 'app' || source === 'mobile_app') {
    return true;
  }

  // 4. Check for custom User-Agent tag (e.g. WappaMobile, Flutter, Wappa_Mobile)
  const ua = (navigator.userAgent || '').toLowerCase();
  return (
    ua.includes('flutter') ||
    ua.includes('wappamobile') ||
    ua.includes('wappa_mobile') ||
    ua.includes('esimapp')
  );
}

/**
 * Send a message to the native Flutter app via JavaScriptChannel
 */
export function postMessageToFlutter(action: string, payload: any = {}): boolean {
  if (typeof window === 'undefined') return false;

  const data: FlutterMessagePayload = {
    action,
    payload,
    timestamp: Date.now(),
  };

  const jsonString = JSON.stringify(data);

  // 1. Standard JavascriptChannel
  if (window.NativeFlutterBridge && typeof window.NativeFlutterBridge.postMessage === 'function') {
    try {
      window.NativeFlutterBridge.postMessage(jsonString);
      return true;
    } catch (err) {
      console.warn('Error enviando mensaje a NativeFlutterBridge:', err);
    }
  }

  // 2. InAppWebView handler
  if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === 'function') {
    try {
      window.flutter_inappwebview.callHandler('onWebMessage', jsonString);
      return true;
    } catch (err) {
      console.warn('Error enviando a flutter_inappwebview:', err);
    }
  }

  return false;
}

/**
 * Send haptic vibration request to Flutter native
 */
export function triggerNativeHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' = 'light') {
  postMessageToFlutter('HAPTIC_FEEDBACK', { type });
}

/**
 * Send an on-screen alert / floating notification request to Flutter native shell
 */
export function showFlutterOnScreenAlert(title: string, body: string, extraData: Record<string, any> = {}): boolean {
  return postMessageToFlutter('SHOW_ALERT', { title, body, ...extraData });
}

/**
 * Play a subtle, elegant web audio chime for on-screen notifications
 */
export function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    
    // First tone (523.25 Hz - C5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Second tone (659.25 Hz - E5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, now + 0.12);
    gain2.gain.setValueAtTime(0.2, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.45);
  } catch (e) {
    // Audio might be blocked if user hasn't interacted yet; ignore safely
  }
}

/**
 * Notify Flutter that user selected or bought an eSIM
 */
export function notifyFlutterEsimSelected(iccid: string, planName?: string) {
  postMessageToFlutter('ESIM_SELECTED', { iccid, planName });
}

/**
 * Register FCM device token with backend
 */
export async function registerDeviceTokenWithBackend(params: {
  email: string;
  fcmToken: string;
  deviceName?: string;
  platform?: 'android' | 'ios' | 'web';
}): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/user/device-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Parse URL parameters passed when opening WebView from Flutter FCM notification click
 */
export function getNotificationDeepLinkParams(): {
  route?: string;
  iccid?: string;
  action?: string;
  country?: string;
} | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const route = params.get('route') || params.get('tab');
  const iccid = params.get('iccid');
  const action = params.get('action');
  const country = params.get('country');

  if (route || iccid || action) {
    return { route: route || undefined, iccid: iccid || undefined, action: action || undefined, country: country || undefined };
  }

  return null;
}

/**
 * Check if current device supports eSIM via Flutter Native Package (e.g. esim_manager, EuiccManager, CoreTelephony)
 */
export function checkFlutterEsimSupport(): Promise<FlutterEsimCheckResult> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      return resolve({ supported: false, source: 'unknown', details: 'No window context' });
    }

    // Set a timeout in case Flutter doesn't respond
    const timer = setTimeout(() => {
      // If we are in simulated / browser mode with flutter query param
      if (isRunningInFlutter() && !window.NativeFlutterBridge && !window.flutter_inappwebview) {
        resolve({
          supported: true,
          details: 'Modo simulación móvil activo (Dispositivo compatible)',
          source: 'browser_simulated',
        });
      } else {
        resolve({
          supported: false,
          details: 'Tiempo de espera agotado al consultar capa nativa de Flutter',
          source: 'unknown',
        });
      }
    }, 2500);

    // Clear any stale callback before registering the live response handler
    window.onFlutterEsimSupported = undefined;

    // Register callback on window for Flutter to call
    window.onFlutterEsimSupported = (data) => {
      clearTimeout(timer);
      resolve({
        supported: !!data?.supported,
        details: data?.details || (data?.supported ? 'Dispositivo con chip eSIM activo' : 'Dispositivo sin soporte eSIM'),
        deviceModel: data?.deviceModel,
        source: 'flutter_native',
      });
    };

    // If using flutter_inappwebview with Promise support
    if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === 'function') {
      window.flutter_inappwebview.callHandler('checkEsimSupport')
        .then((res: any) => {
          clearTimeout(timer);
          resolve({
            supported: !!(res?.supported ?? res),
            details: res?.details || 'Comprobado por flutter_inappwebview',
            deviceModel: res?.deviceModel,
            source: 'flutter_native',
          });
        })
        .catch(() => {
          // Handled by timeout or fallback
        });
    }

    // Send action to Flutter
    const sent = postMessageToFlutter('CHECK_ESIM_SUPPORT', {});
    if (!sent && !window.flutter_inappwebview) {
      clearTimeout(timer);
      resolve({
        supported: false,
        details: 'Canal de comunicación JavaScript con Flutter no detectado',
        source: 'unknown',
      });
    }
  });
}

/**
 * Request Flutter native to install an eSIM profile directly into the phone's hardware/OS
 * via packages like `esim_manager` (EuiccManager on Android / CoreTelephony LPA on iOS)
 */
export function installFlutterEsim(params: {
  lpaString: string;
  iccid?: string;
  planName?: string;
}): Promise<FlutterEsimInstallResult> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      return resolve({ success: false, error: 'Entorno no disponible' });
    }

    // Restricción estricta: Solo permitir si está dentro de la App Flutter
    if (!isRunningInFlutter()) {
      return resolve({
        success: false,
        error: 'La instalación automática 1-clic requiere la App Móvil Wappa eSIM (Flutter). En el navegador web escanea el código QR o copia el LPA.',
      });
    }

    const timer = setTimeout(() => {
      // In simulated browser mode
      if (isRunningInFlutter() && !window.NativeFlutterBridge && !window.flutter_inappwebview) {
        resolve({
          success: true,
          iccid: params.iccid,
          error: undefined,
        });
      } else {
        resolve({
          success: false,
          error: 'Tiempo de espera agotado o cancelado por el usuario en el gestor nativo',
          cancelled: true,
        });
      }
    }, 20000); // Allow user time to interact with native system dialog

    // Clear any stale callback before registering the live result handler
    window.onFlutterEsimInstallResult = undefined;

    // Register callback on window for Flutter
    window.onFlutterEsimInstallResult = (data) => {
      clearTimeout(timer);
      resolve({
        success: !!data?.success,
        error: data?.error,
        cancelled: !!data?.cancelled,
        iccid: data?.iccid || params.iccid,
      });
    };

    // If using inappwebview
    if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === 'function') {
      window.flutter_inappwebview.callHandler('installEsim', {
        lpa: params.lpaString,
        iccid: params.iccid,
        planName: params.planName,
      })
        .then((res: any) => {
          clearTimeout(timer);
          resolve({
            success: !!(res?.success ?? res),
            error: res?.error,
            cancelled: res?.cancelled,
            iccid: params.iccid,
          });
        })
        .catch((err: any) => {
          clearTimeout(timer);
          resolve({ success: false, error: err?.message || 'Error invocando instalación nativa' });
        });
      return;
    }

    // Standard JavaScriptChannel
    const sent = postMessageToFlutter('INSTALL_ESIM', {
      lpa: params.lpaString,
      lpaString: params.lpaString,
      iccid: params.iccid,
      planName: params.planName,
    });

    if (!sent) {
      clearTimeout(timer);
      resolve({
        success: false,
        error: 'El canal nativo de Flutter no está listo. Usa la opción de escaneo QR o copia manual.',
      });
    }
  });
}

/**
 * Open native system eSIM / Cellular settings via Flutter
 */
export function openFlutterEsimSettings(): boolean {
  return postMessageToFlutter('OPEN_ESIM_SETTINGS', {});
}
