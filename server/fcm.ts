/**
 * Firebase Cloud Messaging (FCM) Service
 * 
 * Manages push notification delivery to Flutter mobile devices (iOS / Android / Web)
 * - Anti-spam rate-limiting
 * - Dynamic message generation (data consumption & time validity alerts)
 * - Deep-link routing for Flutter WebView navigation
 */

import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getMessaging, Message } from 'firebase-admin/messaging';

let isInitialized = false;
let initError: string | null = null;

/**
 * Lazy-initialize Firebase Admin SDK.
 * Supports:
 * 1. FIREBASE_SERVICE_ACCOUNT_KEY (JSON string or base64 encoded)
 * 2. FIREBASE_PROJECT_ID (with Google Application Default Credentials)
 */
function getFirebaseAdminApp(): App | null {
  const existingApps = getApps();
  if (isInitialized && existingApps.length > 0) {
    return existingApps[0] || null;
  }

  try {
    if (existingApps.length > 0) {
      isInitialized = true;
      return existingApps[0] || null;
    }

    const serviceAccountKeyRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (serviceAccountKeyRaw) {
      let serviceAccount: any;
      try {
        if (serviceAccountKeyRaw.trim().startsWith('{')) {
          serviceAccount = JSON.parse(serviceAccountKeyRaw);
        } else {
          // Might be base64 encoded
          const decoded = Buffer.from(serviceAccountKeyRaw, 'base64').toString('utf8');
          serviceAccount = JSON.parse(decoded);
        }

        const app = initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id || projectId,
        });

        isInitialized = true;
        console.log('✅ [FCM] Firebase Admin inicializado exitosamente con Service Account Key');
        return app;
      } catch (err: any) {
        initError = `Error parseando FIREBASE_SERVICE_ACCOUNT_KEY: ${err.message}`;
        console.warn(`⚠️ [FCM] ${initError}`);
      }
    } else if (projectId) {
      const app = initializeApp({
        projectId,
      });
      isInitialized = true;
      console.log(`✅ [FCM] Firebase Admin inicializado con Project ID: ${projectId}`);
      return app;
    } else {
      initError = 'Faltan credenciales FCM: Configura FIREBASE_SERVICE_ACCOUNT_KEY o FIREBASE_PROJECT_ID en .env';
    }
  } catch (err: any) {
    initError = `Excepción al inicializar Firebase Admin: ${err.message}`;
    console.warn(`⚠️ [FCM] ${initError}`);
  }

  return null;
}

export function isFcmConfigured(): boolean {
  const app = getFirebaseAdminApp();
  return app !== null;
}

export function getFcmConfigStatus(): {
  configured: boolean;
  projectId?: string;
  source?: string;
  error?: string | null;
} {
  const app = getFirebaseAdminApp();
  if (app) {
    return {
      configured: true,
      projectId: app.options.projectId || process.env.FIREBASE_PROJECT_ID || 'Configurado',
      source: process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? 'service_account_key' : 'project_id',
    };
  }
  return {
    configured: false,
    error: initError,
  };
}

export interface SendPushParams {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

export interface SendPushResult {
  success: boolean;
  messageId?: string;
  error?: string;
  simulated?: boolean;
}

/**
 * Send push notification to a single FCM device token
 */
export async function sendPushNotification(params: SendPushParams): Promise<SendPushResult> {
  const { token, title, body, data = {}, imageUrl } = params;

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return { success: false, error: 'FCM Token inválido o vacío' };
  }

  // Handle simulated / mock tokens gracefully during development/testing
  const cleanToken = token.trim();
  if (
    cleanToken.startsWith('fcm_test_') ||
    cleanToken.startsWith('dev_mobile_') ||
    cleanToken.startsWith('simulated_') ||
    cleanToken.startsWith('test_') ||
    cleanToken.startsWith('web_')
  ) {
    console.log(`📱 [FCM Simulado] Entrega de prueba para token "${cleanToken.substring(0, 20)}...":`);
    console.log(`   Título: ${title}`);
    console.log(`   Cuerpo: ${body}`);
    return {
      success: true,
      messageId: `projects/wappa-esim/messages/simulated_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      simulated: true,
    };
  }

  const app = getFirebaseAdminApp();

  // If Firebase Admin credentials are not provided yet, provide clear simulation for development/testing
  if (!app) {
    console.log(`📱 [FCM Simulado] Push para token "${token.substring(0, 15)}...":`);
    console.log(`   Título: ${title}`);
    console.log(`   Cuerpo: ${body}`);
    console.log(`   Data payload:`, data);
    return {
      success: true,
      messageId: `simulated_fcm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      simulated: true,
    };
  }

  try {
    const message: Message = {
      token: token.trim(),
      notification: {
        title,
        body,
        imageUrl: imageUrl || undefined,
      },
      data: {
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        route: '/my-esims',
        ...data,
      },
      android: {
        priority: 'high',
        ttl: 0,
        notification: {
          channelId: 'esim_alerts',
          sound: 'default',
          priority: 'max',
          visibility: 'public',
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
    };

    const messaging = getMessaging(app);
    const messageId = await messaging.send(message);
    console.log(`✅ [FCM] Notificación enviada con éxito (ID: ${messageId}) a ${token.substring(0, 15)}...`);
    return {
      success: true,
      messageId,
    };
  } catch (err: any) {
    const isInvalidToken =
      err.message?.includes('registration token') ||
      err.message?.includes('invalid-registration-token') ||
      err.code?.includes('invalid-argument') ||
      err.code?.includes('registration-token-not-registered');

    if (isInvalidToken) {
      console.warn(`⚠️ [FCM Info] Se omitió el envío push (El token es inválido o simulado en pruebas: ${err.message})`);
    } else {
      console.error(`❌ [FCM Error] Falló el envío push: ${err.message}`);
    }

    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Build dynamic notification text matching business rules
 */
export function buildEsimAlertMessage(params: {
  type: '50_percent' | '80_percent' | '90_percent' | '24_hours' | '12_hours';
  country: string;
  usedDataGB: number;
  totalDataGB: number;
  daysLeft?: number;
  hoursLeft?: number;
  isReloadable?: boolean;
}): { title: string; body: string } {
  const { type, country, usedDataGB, totalDataGB, daysLeft, hoursLeft, isReloadable } = params;
  const remainingGB = Math.max(0, Number((totalDataGB - usedDataGB).toFixed(2)));
  const percentageRemaining = Math.max(0, Math.round(((totalDataGB - usedDataGB) / totalDataGB) * 100));

  switch (type) {
    case '50_percent':
      return {
        title: `Has consumido el 50% de datos en ${country}`,
        body: `Has usado ${usedDataGB.toFixed(1)} GB de ${totalDataGB} GB. Te quedan ${remainingGB} GB para continuar conectado.`,
      };

    case '80_percent':
      if (isReloadable) {
        return {
          title: `¡Atención! Te queda el ${percentageRemaining}% de datos en ${country}`,
          body: `Has consumido ${usedDataGB.toFixed(1)} GB de ${totalDataGB} GB. Recarga datos en tu app antes de que se agoten.`,
        };
      } else {
        return {
          title: `¡Atención! Te queda el ${percentageRemaining}% de datos en ${country}`,
          body: `Te quedan ${remainingGB >= 1 ? `${remainingGB} GB` : `${Math.round(remainingGB * 1024)} MB`}. Adquiere una nueva eSIM para no perder conexión.`,
        };
      }

    case '90_percent':
      if (isReloadable) {
        return {
          title: `¡Último 10% de datos disponible en ${country}!`,
          body: `Sólo te quedan ${remainingGB >= 1 ? `${remainingGB} GB` : `${Math.round(remainingGB * 1024)} MB`}. Realiza tu recarga inmediata ahora.`,
        };
      } else {
        return {
          title: `¡Último 10% de datos en ${country}!`,
          body: `Te quedan ${remainingGB >= 1 ? `${remainingGB} GB` : `${Math.round(remainingGB * 1024)} MB`}. Compra un nuevo paquete para seguir navegando.`,
        };
      }

    case '24_hours':
      return {
        title: `Tu plan eSIM en ${country} vence en 24 horas`,
        body: `La vigencia de tu eSIM expirará pronto.${daysLeft && daysLeft > 1 ? ` Vigencia restante: ${daysLeft} días.` : ''} Revisa tu paquete en la app.`,
      };

    case '12_hours':
      return {
        title: `¡Alerta! Tu eSIM en ${country} vence en menos de 12 horas`,
        body: `Tu conexión está por expirar. ${isReloadable ? 'Extiende la vigencia recargando tu plan' : 'Adquiere una nueva eSIM'} para evitar desconexiones.`,
      };

    default:
      return {
        title: `Actualización de tu eSIM en ${country}`,
        body: `Consumo actual: ${usedDataGB.toFixed(1)} GB / ${totalDataGB} GB.`,
      };
  }
}
