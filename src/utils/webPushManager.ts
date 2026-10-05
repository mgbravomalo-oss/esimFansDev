/**
 * Gestor de Notificaciones Push Web para Wappa eSIM en Navegadores (Chrome, Safari, Edge, Firefox)
 */

export interface WebPushStatus {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  token?: string;
}

export function isWebPushSupported(): boolean {
  return typeof window !== 'undefined';
}

export function getWebPushPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  return Notification.permission;
}

/**
 * Solicitar permiso y registrar el dispositivo web en el backend
 */
export async function requestWebPushPermission(userEmail?: string): Promise<{ success: boolean; permission: NotificationPermission; token?: string; error?: string }> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { success: false, permission: 'denied', error: 'Tu navegador no soporta notificaciones push web' };
  }

  try {
    let permission: NotificationPermission = Notification.permission;

    // Intentar solicitar permiso nativo
    try {
      permission = await Notification.requestPermission();
    } catch (e: any) {
      console.warn('Notification.requestPermission en iframe o contexto restringido:', e);
    }

    // Generar un token único de sesión web para el navegador
    let webToken = localStorage.getItem('wappa_web_push_token');
    if (!webToken) {
      webToken = 'web_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
      localStorage.setItem('wappa_web_push_token', webToken);
    }

    const email = userEmail || 'mgbravomalo@gmail.com';

    // Registrar en el backend siempre para vincular el navegador
    try {
      await fetch('/api/user/device-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          fcmToken: webToken,
          platform: 'web',
          deviceName: `${getBrowserName()} (${navigator.platform || 'Web Browser'})`,
        }),
      });
      console.log('✅ [Web Push] Dispositivo Web registrado en Atlas para:', email);
    } catch (apiErr) {
      console.warn('⚠️ [Web Push] Error enviando token al backend:', apiErr);
    }

    // Registrar service worker si es posible
    try {
      await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    } catch (swErr) {
      console.warn('⚠️ Service worker en contexto preview:', swErr);
    }

    if (permission === 'granted') {
      return {
        success: true,
        permission: 'granted',
        token: webToken,
      };
    } else if (permission === 'denied') {
      return {
        success: false,
        permission: 'denied',
        error: 'Las notificaciones están bloqueadas en este navegador. Haz clic en el icono de candado 🔒 en la barra de direcciones para permitirlas.',
      };
    } else {
      return {
        success: true,
        permission: 'default',
        token: webToken,
        error: 'Suscripción web registrada. Para ver alertas emergentes nativas, abre la aplicación en una pestaña directa.',
      };
    }
  } catch (err: any) {
    console.error('❌ [Web Push] Error al solicitar permisos:', err);
    return { success: false, permission: 'denied', error: err.message };
  }
}

/**
 * Mostrar una notificación local en el navegador inmediatamente
 */
export function showLocalWebNotification(title: string, options?: NotificationOptions) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  try {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, {
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          ...(options || {}),
        } as NotificationOptions);
      });
    } else {
      new Notification(title, {
        icon: '/favicon.ico',
        ...options,
      });
    }
  } catch (e) {
    console.warn('No se pudo mostrar notificación local:', e);
  }
}

function getBrowserName(): string {
  if (typeof navigator === 'undefined') return 'Navegador Web';
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox Web';
  if (ua.includes('SamsungBrowser')) return 'Samsung Internet';
  if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera Web';
  if (ua.includes('Edge') || ua.includes('Edg')) return 'Microsoft Edge';
  if (ua.includes('Chrome')) return 'Google Chrome Web';
  if (ua.includes('Safari')) return 'Safari Web';
  return 'Navegador Web';
}
