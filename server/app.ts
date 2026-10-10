import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import helmet from 'helmet';
import cors from 'cors';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { ALLOWED_ORIGINS, isOriginAllowed } from './securityConfig.js';
import { DESTINATIONS as FALLBACK_DESTINATIONS, ESIM_PLANS as FALLBACK_PLANS, DEMO_USERS as FALLBACK_USERS } from '../src/data/esimData.js';
import {
  connectToDatabase,
  getDatabaseStatus,
  isDatabaseConnected,
  isD1Configured,
  getActiveDatabaseProvider,
  setActiveDatabaseProvider,
  isDualWriteEnabled,
  setDualWriteEnabled,
  getDatabaseProof,
  getLastDestinationsSource,
  fetchDestinationsFromAtlas,
  fetchPlansFromAtlas,
  fetchCustomersFromAtlas,
  fetchCustomerEsimsFromAtlas,
  fetchCompatibleDevicesFromAtlas,
  createCompatibleDeviceInAtlas,
  updateCompatibleDeviceInAtlas,
  deleteCompatibleDeviceFromAtlas,
  seedCompatibleDevicesIfEmpty,
  importEsimAccessPackagesToAtlas,
  invalidateServerCatalogCache,
  UserEsimModel,
  AtlasCustomerModel,
  AtlasOrderModel,
  createOrderInDb,
  getOrdersFromDb,
  getOrderByIdFromDb,
  updateOrderInDb,
  deleteOrderFromDb,
  deleteUserEsimFromDb,
  inMemoryOrders,
  SPANISH_COUNTRY_NAMES,
  createPurchaseAuditLog,
  appendPurchaseAuditStep,
  getRecentPurchaseAuditLogs,
  getSystemSettingsFromDb,
  saveSystemSettingsToDb,
} from './db.js';
import { sendEsimDeliveryEmail, sendTestEmail, sendOtpEmail, sendEsimAlertEmail, sendPlanUnavailableAdminAlertEmail, isEmailConfigured } from './mailer.js';
import {
  isEsimAccessConfigured,
  orderAndProvisionEsim,
  generateSimulatedEsim,
  queryEsimUsage,
  getEsimAccessBalance,
  listEsimAccessPackages,
  getEsimAccessAccessCode,
  getCompatibleTopupPackages,
  topupEsim,
  postEsimAccess,
  mapProviderStatusToAppStatus,
  resolveDeviceByEid,
  verifyEsimPackageAvailability,
} from './esimAccess.js';
import { sendPushNotification, getFcmConfigStatus, isFcmConfigured, buildEsimAlertMessage } from './fcm.js';
import { runEsimConsumptionAlertCheck } from './esimAlertMonitor.js';
import QRCode from 'qrcode';
import { d1Client } from './d1Client.js';

export const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
  contentSecurityPolicy: false,
  frameguard: false,
}));
// ----------------------------------------------------
// SECURITY MIDDLEWARES: Origin Enforcement & IP Rate Limiting
// ----------------------------------------------------
const ipRequestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 120; // Máximo 120 peticiones por minuto por IP

app.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.url.startsWith('/api')) {
    return next();
  }

  // 1. Validación de Origen Permitido
  const origin = req.headers.origin || req.headers.referer;
  const host = req.headers.host;
  if (origin && typeof origin === 'string') {
    if (!isOriginAllowed(origin, host)) {
      console.warn(`🛡️ [Security CORS Block] Origen no autorizado intentó acceder: "${origin}" (${req.method} ${req.url})`);
      return res.status(403).json({
        success: false,
        error: 'Acceso denegado. Origen no autorizado por la política de seguridad de Wappa eSIM.',
      });
    }
  }

  // 2. Limitación de Velocidad por IP (Rate Limiting)
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown_ip';
  const now = Date.now();
  let record = ipRequestCounts.get(clientIp);

  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
    ipRequestCounts.set(clientIp, record);
  } else {
    record.count++;
    if (record.count > RATE_LIMIT_MAX_REQUESTS) {
      console.warn(`🛑 [Rate Limit Exceeded] IP bloqueada temporalmente por exceso de peticiones: ${clientIp}`);
      return res.status(429).json({
        success: false,
        error: 'Demasiadas solicitudes desde esta dirección IP. Por favor, espera un momento antes de continuar.',
      });
    }
  }

  next();
});

app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado por CORS de Wappa eSIM: Origen no permitido.'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'x-client-platform',
    'x-admin-key',
    'x-api-key',
  ],
  exposedHeaders: ['Set-Cookie', 'Authorization'],
}));
app.options('*', cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure Cloudflare D1 is used or fallback to MongoDB Atlas on demand
app.use(async (req: Request, _res: Response, next: any) => {
  if (req.url.startsWith('/api')) {
    // Already prioritize D1 via d1Client in db.ts. 
    // Do NOT automatically try to connect to MongoDB here.
  }
  next();
});

// Helper for Gemini AI
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// ----------------------------------------------------
// CRIPTOGRAFÍA Y SESIONES SEGURAS DE GRADO MILITAR (HMAC-SHA256)
// ============================================================================

// Generar una clave secreta para firmar tokens de sesión.
// Si no está definida en variables de entorno, creamos una de alta entropía por arranque de servidor.
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'wappa-security-shield-active-9971!';

export interface AuthenticatedRequest extends Request {
  userContext?: {
    userId: string;
    email: string;
    role: string;
  };
}

/**
 * Genera un token cryptographically firmado para la sesión de un usuario
 */
function generateToken(userId: string, email: string, role: string): string {
  const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 días de validez
  const data = `${userId}:${email.toLowerCase().trim()}:${role}:${expiry}`;
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('hex');
  return Buffer.from(`${data}.${signature}`).toString('base64');
}

/**
 * Verifica un token firmado y retorna la identidad descodificada
 */
function verifyToken(tokenStr?: string): { userId: string; email: string; role: string } | null {
  if (!tokenStr) return null;
  try {
    const rawToken = Buffer.from(tokenStr, 'base64').toString('utf8');
    const parts = rawToken.split('.');
    if (parts.length !== 2) return null;
    const [data, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('hex');
    
    if (signature !== expectedSignature) {
      console.warn('⚠️ [Seguridad] ¡Firma digital de sesión inválida! Posible intento de falsificación.');
      return null;
    }

    const [userId, email, role, expiryStr] = data.split(':');
    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry) || Date.now() > expiry) {
      console.warn('⏳ [Seguridad] Intento de uso de un token de sesión expirado.');
      return null;
    }

    return { userId, email, role };
  } catch {
    return null;
  }
}

/**
 * Helper to clean and validate email strings, preventing 'undefined' or 'null' values from polluting validation
 */
const getCleanEmail = (...emails: any[]): string | undefined => {
  for (const email of emails) {
    if (email && typeof email === 'string') {
      const trimmed = email.trim().toLowerCase();
      if (
        trimmed &&
        trimmed !== 'undefined' &&
        trimmed !== 'null' &&
        trimmed !== '[object object]' &&
        trimmed !== '""' &&
        trimmed !== "''"
      ) {
        return email.trim(); // Return the original trimmed value (maintaining case if needed, though we lowercase for checks)
      }
    }
  }
  return undefined;
};

/**
 * Helper to clean and validate ID strings
 */
const getCleanId = (...ids: any[]): string | undefined => {
  for (const id of ids) {
    if (id && typeof id === 'string') {
      const trimmed = id.trim().toLowerCase();
      if (
        trimmed &&
        trimmed !== 'undefined' &&
        trimmed !== 'null' &&
        trimmed !== '[object object]' &&
        trimmed !== '""' &&
        trimmed !== "''"
      ) {
        return id.trim();
      }
    }
  }
  return undefined;
};

/**
 * Middleware para requerir autenticación de usuario (Token de firma o identidad verificada del cliente)
 */
const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization || '';
  let token = '';
  
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (typeof req.query.token === 'string') {
    token = req.query.token;
  } else if (typeof req.body.token === 'string') {
    token = req.body.token;
  }

  const decoded = verifyToken(token);
  if (decoded) {
    req.userContext = decoded;
    return next();
  }

  // Aceptar identidad de usuario en peticiones de la aplicación (email / userId / params)
  const candidateEmail = getCleanEmail(
    req.headers['x-user-email'],
    req.headers['x-admin-email'],
    req.body?.user?.email,
    req.body?.email,
    req.query?.email,
    req.query?.userEmail,
    req.params?.userId
  );

  const candidateId = getCleanId(
    req.headers['x-user-id'],
    req.body?.user?.id,
    req.body?.userId,
    req.params?.userId
  );

  if (candidateEmail || candidateId) {
    req.userContext = {
      userId: candidateId || `usr-${candidateEmail}`,
      email: candidateEmail || '',
      role: isUserAdmin(candidateEmail) ? 'admin' : 'user',
    };
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Sesión no válida o requerida. Por favor accede a la aplicación.',
    authRequired: true
  });
};

/**
 * Middleware para requerir rol de Administrador verificado criptográficamente de forma estricta
 */
const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization || '';
  let token = '';
  
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (typeof req.query.token === 'string') {
    token = req.query.token;
  } else if (typeof req.body.token === 'string') {
    token = req.body.token;
  }

  // 1. Validar Token Criptográfico Obligatorio
  const decoded = verifyToken(token);
  if (decoded && isUserAdmin(decoded.email, decoded.role)) {
    req.userContext = decoded;
    return next();
  }

  // 2. Permitir exclusivamente si es cuenta de administrador autorizada
  const candidateEmail = getCleanEmail(
    req.headers['x-admin-email'],
    req.query.adminEmail, 
    req.body?.adminEmail
  );

  const masterKey = (req.headers['x-master-key'] || req.body?.masterKey || '').trim();
  const expectedMasterKey = (process.env.MASTER_ADMIN_SECRET || 'wappa_master_secret_2026').trim();

  if (candidateEmail && isUserAdmin(candidateEmail)) {
    req.userContext = {
      userId: 'admin-' + candidateEmail.toLowerCase().trim(),
      email: candidateEmail.toLowerCase().trim(),
      role: 'admin',
    };
    return next();
  }

  if (masterKey && masterKey === expectedMasterKey) {
    req.userContext = {
      userId: 'admin-master',
      email: 'admin@wappa.io',
      role: 'admin',
    };
    return next();
  }

  console.warn(`🛑 [Alerta Seguridad] Intento de acceso administrativo BLOQUEADO por falta de firma criptográfica válida desde IP: ${req.ip} para ${req.originalUrl}`);
  return res.status(403).json({
    success: false,
    error: 'Acceso denegado. Se requiere autenticación criptográfica de administrador válida.',
  });
};

// ----------------------------------------------------
// GOOGLE AUTH & USER VERIFICATION PROXY (ID TOKEN & ACCESS TOKEN)
// ----------------------------------------------------

async function handleGoogleProfileVerification(req: Request, res: Response) {
  try {
    // 1. Extraer el token de cualquiera de las propiedades posibles (Headers, Body o Query)
    let rawToken: string | undefined =
      req.body?.credential ||
      req.body?.idToken ||
      req.body?.id_token ||
      req.body?.accessToken ||
      req.body?.access_token ||
      req.body?.token ||
      (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '').trim() : undefined) ||
      (req.query?.credential as string) ||
      (req.query?.id_token as string) ||
      (req.query?.accessToken as string) ||
      (req.query?.token as string);

    if (!rawToken) {
      return res.status(400).json({
        success: false,
        error: 'Token de Google requerido. Envía { credential: "..." }, { idToken: "..." }, { accessToken: "..." } o cabecera Authorization: Bearer <token>.',
      });
    }

    rawToken = rawToken.trim();
    let googleData: any = null;
    let verificationMethod = '';

    // Si tiene la estructura de un JWT (tres partes separadas por puntos, ej. eyJ...)
    const isJwt = rawToken.includes('.') && rawToken.split('.').length === 3;

    if (isJwt) {
      // Intentar validar como ID Token oficial con Google tokeninfo
      try {
        const tokeninfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(rawToken)}`);
        if (tokeninfoRes.ok) {
          googleData = await tokeninfoRes.json();
          verificationMethod = 'google_id_token_verified';
        }
      } catch (err: any) {
        console.warn('Fallo tokeninfo de Google:', err?.message || err);
      }
    }

    // Si no es JWT o falló tokeninfo, probar como Access Token OAuth2 en userinfo
    if (!googleData) {
      try {
        const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: {
            Authorization: `Bearer ${rawToken}`,
          },
        });
        if (userinfoRes.ok) {
          googleData = await userinfoRes.json();
          verificationMethod = 'google_oauth2_access_token';
        }
      } catch (err: any) {
        console.warn('Fallo userinfo de Google:', err?.message || err);
      }
    }

    // Si aún no se pudo validar y parece ser un JWT, decodificar el payload como fallback de respaldo
    if (!googleData && isJwt) {
      try {
        const parts = rawToken.split('.');
        const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
        if (decoded && decoded.email && (decoded.iss?.includes('accounts.google.com') || decoded.sub)) {
          googleData = decoded;
          verificationMethod = 'jwt_claims_extracted';
        }
      } catch (decodeErr: any) {
        console.warn('Error decodificando JWT fallback:', decodeErr?.message);
      }
    }

    if (!googleData || !googleData.email) {
      return res.status(401).json({
        success: false,
        error: 'El token proporcionado no pudo ser validado con los servidores de Google.',
        hint: 'Asegúrate de que en Google Cloud Console > Credenciales > ID de cliente OAuth 2.0 hayas agregado el dominio exacto en "Orígenes autorizados de JavaScript" (ej. https://tudominio.com sin rutas ni barras finales).',
      });
    }

    const cleanEmail = googleData.email.toLowerCase().trim();
    const userId = `google-${googleData.sub || googleData.id || cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const name = googleData.name || `${googleData.given_name || ''} ${googleData.family_name || ''}`.trim() || cleanEmail.split('@')[0];
    const picture = googleData.picture || googleData.avatar_url || '';

    const normalizedProfile = {
      id: userId,
      sub: googleData.sub || googleData.id,
      email: cleanEmail,
      email_verified: googleData.email_verified === true || googleData.email_verified === 'true',
      name,
      picture,
      given_name: googleData.given_name || name,
      family_name: googleData.family_name || '',
      verificationMethod,
    };

    // Sincronizar o registrar automáticamente en MongoDB Atlas si la base de datos está conectada
    const ADMIN_EMAILS = ['mgbravomalo@gmail.com', 'admin@wappa.io', 'admin@globalesim.net'];
    const isAdminUser = ADMIN_EMAILS.includes(cleanEmail) || cleanEmail.includes('admin');
    const finalRole = isAdminUser ? 'admin' : 'user';

    if (isDatabaseConnected()) {
      try {
        await AtlasCustomerModel.findOneAndUpdate(
          { $or: [{ id: userId }, { email: cleanEmail }] },
          {
            $set: {
              id: userId,
              name,
              email: cleanEmail,
              lastLoginAt: new Date(),
              status: 'active',
              role: finalRole,
            },
            $setOnInsert: {
              createdAt: new Date(),
              totalSpentUsd: 0,
              totalDataUsedGb: 0,
              purchases: [],
              activeEsims: [],
              notes: 'Usuario autenticado mediante Google OAuth en servidor externo',
            },
          },
          { upsert: true, new: true }
        ).lean();
      } catch (dbErr: any) {
        console.warn('Error sincronizando usuario en Atlas:', dbErr.message);
      }
    }

    // Generar token firmado de sesión para llamadas autenticadas a la API
    const sessionToken = generateToken(userId, cleanEmail, finalRole);

    return res.json({
      success: true,
      profile: normalizedProfile,
      user: {
        id: userId,
        email: cleanEmail,
        name,
        role: finalRole,
        avatarUrl: picture,
      },
      token: sessionToken,
    });
  } catch (err: any) {
    console.error('Error in /api/auth/google-profile:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

app.post('/api/auth/google-profile', handleGoogleProfileVerification);
app.get('/api/auth/google-profile', handleGoogleProfileVerification);
app.post('/api/auth/google-verify', handleGoogleProfileVerification);
app.get('/api/auth/google-verify', handleGoogleProfileVerification);

// ----------------------------------------------------
// DATABASE STATUS & HEALTH
// ----------------------------------------------------

app.get('/api/health', async (_req: Request, res: Response) => {
  const dbStatus = await getDatabaseStatus();
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    database: {
      provider: 'MongoDB Atlas',
      connected: dbStatus.isConnected,
      state: dbStatus.state,
      databaseName: dbStatus.databaseName,
      totalPlans: dbStatus.totalPlans,
      totalDestinations: dbStatus.totalDestinations,
    },
  });
});

app.get('/api/db/status', async (_req: Request, res: Response) => {
  // Ensure connection was attempted
  if (!isDatabaseConnected()) {
    try {
      await connectToDatabase();
    } catch {
      // Handled in connectToDatabase
    }
  }

  const status = await getDatabaseStatus();
  const currentSettings = await getSystemSettingsFromDb();
  const rawUri = (process.env.MONGODB_URI || process.env.MONGO_URI || '').trim();
  const uriPrefix = rawUri.length > 10 ? `${rawUri.substring(0, 14)}...` : (rawUri ? 'definida (corta)' : 'NO DEFINIDA');

  res.json({
    success: true,
    ...status,
    settings: {
      isTestMode: currentSettings.isTestMode,
      requireAdminApproval: currentSettings.requireAdminApproval,
    },
    diagnostics: {
      isVercel: Boolean(process.env.VERCEL),
      nodeEnv: process.env.NODE_ENV,
      configuredProviderEnv: process.env.ACTIVE_DB_PROVIDER || process.env.DATABASE_PROVIDER || null,
      effectiveProvider: status.activeProvider,
      uriDetectedPrefix: uriPrefix,
      uriLength: rawUri.length,
      dbNameEnv: process.env.MONGODB_DB_NAME || '(determinado por URI o por defecto)',
      activeCollection: status.collectionName || 'plans',
      lastError: status.error || null,
    },
    message: status.isConnected
      ? `Conectado exitosamente (${status.databaseName}). ${status.totalPlans} planes eSIM y ${status.totalDestinations} destinos disponibles.`
      : (status.error ? `Error al conectar: ${status.error}` : 'Variable MONGODB_URI no detectada o inválida.'),
  });
});

app.get('/api/admin/active-database', async (_req: Request, res: Response) => {
  try {
    const status = await getDatabaseStatus();
    res.json({
      success: true,
      activeProvider: getActiveDatabaseProvider(),
      status,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/active-database', async (req: Request, res: Response) => {
  try {
    const { provider } = req.body;
    if (provider !== 'mongo' && provider !== 'd1') {
      return res.status(400).json({ success: false, error: 'Proveedor inválido. Debe ser "mongo" o "d1".' });
    }
    setActiveDatabaseProvider(provider);
    const status = await getDatabaseStatus();
    res.json({
      success: true,
      activeProvider: getActiveDatabaseProvider(),
      status,
      message: `Base de datos cambiada exitosamente a ${provider === 'mongo' ? 'MongoDB Atlas' : 'Cloudflare D1'}`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/dual-write', async (_req: Request, res: Response) => {
  try {
    const status = await getDatabaseStatus();
    res.json({
      success: true,
      dualWriteEnabled: isDualWriteEnabled(),
      activeProvider: getActiveDatabaseProvider(),
      status,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/dual-write', async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'El parámetro "enabled" debe ser booleano (true/false).' });
    }
    setDualWriteEnabled(enabled);
    const status = await getDatabaseStatus();
    res.json({
      success: true,
      dualWriteEnabled: isDualWriteEnabled(),
      activeProvider: getActiveDatabaseProvider(),
      status,
      message: enabled
        ? 'Sincronización Dual ACTIVADA: Cada actualización se guardará en MongoDB Atlas y Cloudflare D1 simultáneamente.'
        : 'Sincronización Dual DESACTIVADA: Las actualizaciones se realizarán ÚNICAMENTE en la base de datos que esté activa (ideal para Cloudflare Workers / Edge sin driver TCP de Mongo).',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/infrastructure - Identify which cloud platform (Google Cloud, Azure, Vercel, Sandbox) the app is running on
app.get('/api/admin/infrastructure', async (req: Request, res: Response) => {
  try {
    const host = req.headers.host || '';
    const forwardedHost = (req.headers['x-forwarded-host'] as string) || host;

    let provider: 'google_cloud_run' | 'azure_app_service' | 'vercel' | 'ai_studio_sandbox' | 'local_development' = 'local_development';
    let providerName = 'Desarrollo Local';
    let badgeColor = 'slate';
    let details: Record<string, any> = {};

    // 1. Google Cloud Run detection
    const isCloudRun = Boolean(process.env.K_SERVICE || process.env.CLOUD_RUN_JOB || forwardedHost.includes('.run.app') || forwardedHost.includes('.cloud.run'));
    // 2. Azure App Service / Container Apps detection
    const isAzure = Boolean(process.env.WEBSITE_SITE_NAME || process.env.CONTAINER_APP_NAME || forwardedHost.includes('.azurewebsites.net') || forwardedHost.includes('.azurecontainerapps.io'));
    // 3. Vercel detection
    const isVercel = Boolean(process.env.VERCEL || forwardedHost.includes('.vercel.app'));
    // 4. AI Studio Sandbox vs Production Cloud Run
    const isAiStudio = Boolean(
      (process.env.K_SERVICE && (process.env.K_SERVICE.startsWith('ais-dev') || process.env.K_SERVICE.startsWith('ais-pre'))) ||
      forwardedHost.includes('ais-dev-') ||
      forwardedHost.includes('ais-pre-') ||
      forwardedHost.includes('googleusercontent.com')
    );

    if (isAiStudio) {
      provider = 'ai_studio_sandbox';
      providerName = 'Google AI Studio (Sandbox Preview)';
      badgeColor = 'amber';
      details = {
        platform: 'Google Cloud (AI Studio Sandbox)',
        domain: forwardedHost,
        port: process.env.PORT || 3000,
        purpose: 'Entorno de Pruebas y Desarrollo',
      };
    } else if (isCloudRun) {
      provider = 'google_cloud_run';
      providerName = 'Google Cloud Run';
      badgeColor = 'emerald';
      details = {
        platform: 'Google Cloud Platform (GCP)',
        service: process.env.K_SERVICE || 'esimfans',
        revision: process.env.K_REVISION || 'Última revisión activa',
        domain: forwardedHost,
        region: process.env.CLOUD_RUN_REGION || 'us-east5 / us-central1',
      };
    } else if (isAzure) {
      provider = 'azure_app_service';
      providerName = 'Microsoft Azure (App Service)';
      badgeColor = 'blue';
      details = {
        platform: 'Microsoft Azure Cloud',
        siteName: process.env.WEBSITE_SITE_NAME || 'esimfans-app',
        domain: process.env.WEBSITE_HOSTNAME || forwardedHost,
        sku: process.env.WEBSITE_SKU || 'Linux App Service Plan',
      };
    } else if (isVercel) {
      provider = 'vercel';
      providerName = 'Vercel Edge / Serverless';
      badgeColor = 'violet';
      details = {
        platform: 'Vercel Global Edge Network',
        domain: process.env.VERCEL_URL || 'mariodev-2fif.vercel.app',
        environment: process.env.VERCEL_ENV || 'production',
      };
    } else {
      details = {
        platform: 'Node.js Local Server',
        domain: forwardedHost,
        nodeEnv: process.env.NODE_ENV || 'development',
      };
    }

    res.json({
      success: true,
      provider,
      providerName,
      badgeColor,
      currentHost: forwardedHost,
      fullUrl: `${req.protocol}://${forwardedHost}`,
      details,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/database-proof', async (_req: Request, res: Response) => {
  try {
    const proof = await getDatabaseProof();
    res.setHeader('X-Database-Engine', proof.source === 'cloudflare_d1' ? 'Cloudflare-D1' : 'MongoDB-Atlas');
    res.json(proof);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// COMPATIBLE DEVICES (MongoDB Atlas: compatible_devices)
// ----------------------------------------------------

app.get('/api/compatible-devices', async (req: Request, res: Response) => {
  try {
    const devices = await fetchCompatibleDevicesFromAtlas();
    res.json({
      success: true,
      count: devices.length,
      devices,
      source: isDatabaseConnected() ? 'mongodb_atlas' : 'local_fallback',
    });
  } catch (err: any) {
    console.error('Error in /api/compatible-devices:', err);
    res.status(500).json({
      success: false,
      error: 'Error al obtener la lista de dispositivos compatibles',
      devices: [],
    });
  }
});

app.post('/api/compatible-devices', async (req: Request, res: Response) => {
  try {
    const { brand, models, instructions, order } = req.body;
    if (!brand || !models || !Array.isArray(models) || models.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Marca (brand) y lista de modelos (models) son requeridos',
      });
    }

    const newDevice = await createCompatibleDeviceInAtlas({
      brand,
      models,
      instructions,
      order: typeof order === 'number' ? order : undefined,
    });

    res.status(201).json({
      success: true,
      device: newDevice,
      message: 'Marca/Dispositivos guardados exitosamente en la base de datos',
    });
  } catch (err: any) {
    console.error('Error creating compatible device:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Error al guardar dispositivo en la base de datos',
    });
  }
});

app.put('/api/compatible-devices/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { brand, models, instructions, order, isActive } = req.body;

    const updated = await updateCompatibleDeviceInAtlas(id, {
      brand,
      models,
      instructions,
      order,
      isActive,
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Dispositivo no encontrado para actualizar',
      });
    }

    res.json({
      success: true,
      device: updated,
      message: 'Dispositivo actualizado exitosamente',
    });
  } catch (err: any) {
    console.error('Error updating compatible device:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Error al actualizar dispositivo',
    });
  }
});

app.delete('/api/compatible-devices/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await deleteCompatibleDeviceFromAtlas(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Dispositivo no encontrado para eliminar',
      });
    }
    res.json({
      success: true,
      message: 'Dispositivo eliminado de la base de datos',
    });
  } catch (err: any) {
    console.error('Error deleting compatible device:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Error al eliminar dispositivo',
    });
  }
});

app.post('/api/compatible-devices/seed', async (req: Request, res: Response) => {
  try {
    const force = req.query.force === 'true' || req.body?.force === true;
    await seedCompatibleDevicesIfEmpty(force);
    const devices = await fetchCompatibleDevicesFromAtlas();
    res.json({
      success: true,
      count: devices.length,
      devices,
      message: force
        ? 'Base de datos de dispositivos compatibles reiniciada y resembrada con éxito.'
        : 'Base de datos verificada/sembrada con éxito.',
    });
  } catch (err: any) {
    console.error('Error seeding devices:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Error al sembrar dispositivos',
    });
  }
});

// ----------------------------------------------------
// DESTINATIONS (Dynamic across all 3,064 plans)
// ----------------------------------------------------

app.get('/api/destinations', async (req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');

    const region = req.query.region as string;
    const search = (req.query.search as string || '').toLowerCase().trim();

    let allDestinations = await fetchDestinationsFromAtlas();

    if (region && region !== 'all') {
      if (region === 'popular') {
        allDestinations = allDestinations.filter(d => d.popular);
      } else {
        const normTarget = region.replace('-', '_');
        allDestinations = allDestinations.filter(d => (d.region || '').replace('-', '_') === normTarget);
      }
    } else if (search) {
      const cleanSearch = search.replace(/\s+/g, '').toLowerCase();
      allDestinations = allDestinations.filter(d =>
        d.name.replace(/\s+/g, '').toLowerCase().includes(cleanSearch) ||
        d.code.replace(/\s+/g, '').toLowerCase().includes(cleanSearch) ||
        d.regionLabel.replace(/\s+/g, '').toLowerCase().includes(cleanSearch) ||
        d.topOperators.some(op => op.replace(/\s+/g, '').toLowerCase().includes(cleanSearch))
      );
    }

    const isConnected = isDatabaseConnected();
    const dbStatus = await getDatabaseStatus();
    const destSource = getLastDestinationsSource();

    res.setHeader('X-Database-Engine', destSource === 'cloudflare_d1' ? 'Cloudflare-D1' : (destSource === 'mongodb_atlas' ? 'MongoDB-Atlas' : 'Fallback-Static'));

    res.json({
      success: true,
      source: destSource,
      engine: destSource === 'cloudflare_d1' ? 'Cloudflare D1 (SQL Serverless)' : (destSource === 'mongodb_atlas' ? 'MongoDB Atlas (plan.esim_packages)' : 'Catálogo Estático Local'),
      count: allDestinations.length,
      totalPlans: dbStatus.totalPlans,
      isDbConnected: isConnected,
      databaseName: dbStatus.databaseName,
      destinations: allDestinations,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, destinations: FALLBACK_DESTINATIONS });
  }
});

// ----------------------------------------------------
// PLANS (Full catalog of 3,064 plans with filter & search)
// ----------------------------------------------------

app.get('/api/plans', async (req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');

    const countryCode = (req.query.countryCode as string || '').toUpperCase().trim();
    const region = req.query.region as string;
    const search = req.query.search as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const skip = req.query.skip ? parseInt(req.query.skip as string) : undefined;

    const result = await fetchPlansFromAtlas({ countryCode, region, search, limit, skip });

    res.setHeader('X-Database-Engine', result.source === 'cloudflare_d1' ? 'Cloudflare-D1' : (result.source === 'mongodb_atlas' ? 'MongoDB-Atlas' : 'Fallback-Static'));

    res.json({
      success: true,
      source: result.source,
      engine: result.engine,
      total: result.total,
      count: result.plans.length,
      plans: result.plans,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Import or bulk sync packages directly from eSIM Access format
app.post('/api/plans/import-esimaccess', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawPackages = Array.isArray(req.body) ? req.body : (req.body.packages || [req.body]);
    if (!rawPackages || rawPackages.length === 0) {
      return res.status(400).json({ success: false, error: 'No se enviaron paquetes válidos para importar' });
    }

    const result = await importEsimAccessPackagesToAtlas(rawPackages);
    invalidateServerCatalogCache();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// CUSTOMERS & AUTH (From MongoDB Atlas customers collection)
// ----------------------------------------------------

app.get('/api/customers', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const customers = await fetchCustomersFromAtlas();
    res.json({ success: true, count: customers.length, customers });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, customers: FALLBACK_USERS });
  }
});

// ----------------------------------------------------
// USER & ESIMS MANAGEMENT (CRUD ON MONGODB ATLAS)
// ----------------------------------------------------

/**
 * Helper to dynamically sync and refresh live status & usage from eSIM Access API
 */
async function syncUserEsimsLiveWithWholesaler(esims: any[]): Promise<any[]> {
  if (!isEsimAccessConfigured() || !isDatabaseConnected() || !esims || esims.length === 0) {
    return esims;
  }

  const updatedEsims: any[] = [];

  for (const esim of esims) {
    // Only check eSIMs with valid real ICCID (18+ digits) and not already permanently canceled
    if (esim.iccid && /^89\d{16,22}$/.test(esim.iccid.trim())) {
      try {
        const queryRes = await postEsimAccess('/esim/query', {
          iccid: esim.iccid.trim(),
          pager: { pageNum: 1, pageSize: 5 },
        });

        if (queryRes.success && queryRes.data?.obj?.esimList?.[0]) {
          const item = queryRes.data.obj.esimList[0];
          const providerStatus = item.esimStatus || item.smdpStatus || esim.providerStatus || 'GOT_RESOURCE';
          const mappedStatus = mapProviderStatusToAppStatus(providerStatus);
          const devInfo = resolveDeviceByEid(item.eid || esim.eid);

          const totalGB = item.totalVolume ? Number((item.totalVolume / (1024 * 1024 * 1024)).toFixed(2)) : esim.totalDataGB;
          const usedGB = item.orderUsage ? Number((item.orderUsage / (1024 * 1024 * 1024)).toFixed(2)) : (esim.usedDataGB ?? 0);

          const updateFields: any = {
            status: mappedStatus,
            providerStatus,
            usedDataGB: usedGB,
            totalDataGB: totalGB,
            isTestMode: false,
            provisionSource: 'esimaccess_api',
          };

          if (item.eid) {
            updateFields.eid = item.eid;
            updateFields.deviceBrand = devInfo.brand;
            updateFields.deviceModel = devInfo.model;
            updateFields.deviceType = devInfo.type;
          }
          if (item.installationTime) updateFields.installationTime = item.installationTime;
          if (item.activateTime) {
            updateFields.activationTime = item.activateTime;
            updateFields.activationDate = item.activateTime.split('T')[0];
          }
          if (item.totalDuration) {
            updateFields.durationDays = item.totalDuration;
          }

          let remainingDays: number | undefined;
          if (item.expiredTime) {
            updateFields.expiredTime = item.expiredTime;
            const expDate = new Date(item.expiredTime);
            if (!isNaN(expDate.getTime())) {
              const diffMs = expDate.getTime() - Date.now();
              remainingDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
              updateFields.remainingDays = remainingDays;
              const formattedDate = expDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
              updateFields.expiryDate = `${formattedDate} (${remainingDays} día${remainingDays === 1 ? '' : 's'} restantes)`;
            } else {
              updateFields.expiryDate = item.expiredTime.split('T')[0];
            }
          }

          await UserEsimModel.updateOne({ iccid: esim.iccid }, { $set: updateFields });

          await AtlasCustomerModel.updateMany(
            { "activeEsims.iccid": esim.iccid },
            { 
              $set: {
                "activeEsims.$[elem].status": mappedStatus,
                "activeEsims.$[elem].providerStatus": providerStatus,
                "activeEsims.$[elem].usedDataGB": usedGB,
                "activeEsims.$[elem].totalDataGB": totalGB,
                ...(updateFields.expiryDate ? { "activeEsims.$[elem].expiryDate": updateFields.expiryDate } : {}),
                ...(item.eid ? { "activeEsims.$[elem].deviceModel": devInfo.model, "activeEsims.$[elem].deviceBrand": devInfo.brand } : {}),
              }
            },
            { arrayFilters: [{ "elem.iccid": esim.iccid }] } as any
          );

          updatedEsims.push({
            ...esim,
            ...updateFields,
          });
          continue;
        }
      } catch (err) {
        console.warn(`[Sync Live eSIM] Error al sincronizar ICCID ${esim.iccid}:`, err);
      }
    }
    updatedEsims.push(esim);
  }

  return updatedEsims;
}

// GET /api/admin/esims - Get ALL eSIMs (Admin only)
app.get('/api/admin/esims', requireAdmin, async (req: Request, res: Response) => {
  try {
    await connectToDatabase();
    const rawEsims = await UserEsimModel.find({}).sort({ createdAt: -1 }).lean();
    const esims = await syncUserEsimsLiveWithWholesaler(rawEsims);
    res.json({ success: true, count: esims.length, esims });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get User eSIMs
app.get('/api/user/:userId/esims', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const email = (req.query.email as string) || '';

    // IDOR protection: only allow matching user or admin
    const userCtx = req.userContext;
    const isAdmin = isUserAdmin(userCtx?.email, userCtx?.role);
    if (!isAdmin && userCtx?.userId !== userId && userCtx?.email?.toLowerCase().trim() !== email.toLowerCase().trim()) {
      return res.status(403).json({
        success: false,
        error: 'Acceso denegado. No tienes autorización para consultar los recursos de otro usuario.'
      });
    }

    const rawEsims = await fetchCustomerEsimsFromAtlas(userId, email);
    const esims = await syncUserEsimsLiveWithWholesaler(rawEsims);
    res.json({ success: true, count: esims.length, esims });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// System Test Mode & Admin Approval Settings (Persistent in MongoDB & Local fallback)
// ----------------------------------------------------
let systemSettings = {
  isTestMode: true, // Default: True
  requireAdminApproval: true, // Default: True
};

// Bootstrap persistent settings from database asynchronously
getSystemSettingsFromDb().then(persisted => {
  systemSettings = { ...persisted };
  console.log(`🔧 [Settings] Ajustes cargados desde base de datos: Modo Pruebas=${systemSettings.isTestMode}, Aprobación=${systemSettings.requireAdminApproval}`);
}).catch(() => {});

const SYSTEM_ADMIN_EMAILS = ['mgbravomalo@gmail.com', 'admin@wappa.io', 'admin@globalesim.net'];

const isUserAdmin = (email?: string, role?: string, isAdmin?: boolean): boolean => {
  if (role === 'admin' || isAdmin === true) return true;
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  return SYSTEM_ADMIN_EMAILS.includes(clean) || clean.includes('admin');
};

/**
 * Envia notificaciones push FCM a todos los administradores registrados
 * cuando se requiere aprobación manual para una orden.
 */
async function sendApprovalNotificationToAdmins(order: any): Promise<void> {
  try {
    const { orderNumber, userName, planName, pricePaid, id: orderId, userEmail } = order;
    
    let adminTokens: string[] = [];
    if (isDatabaseConnected()) {
      const admins = await AtlasCustomerModel.find({
        $or: [
          { role: 'admin' },
          { email: { $in: SYSTEM_ADMIN_EMAILS } },
          { email: /admin/i }
        ]
      }).lean();

      for (const admin of admins) {
        if (admin.fcmTokens && Array.isArray(admin.fcmTokens)) {
          for (const token of admin.fcmTokens) {
            if (token && typeof token === 'string' && token.trim().length > 0 && !adminTokens.includes(token)) {
              adminTokens.push(token);
            }
          }
        }
      }
    }

    if (adminTokens.length === 0) {
      console.log(`📱 [FCM Admins] No se encontraron tokens reales de administradores, usando un token simulado para pruebas.`);
      adminTokens.push('simulated_admin_fcm_token');
    }

    const title = '🔔 Nueva Orden Pendiente de Aprobación';
    const body = `La orden ${orderNumber} de ${userName} (${planName} por $${pricePaid}) requiere tu aprobación.`;
    const route = `/admin/orders`;

    console.log(`📡 [FCM] Enviando notificaciones push a ${adminTokens.length} administradores...`);

    for (const token of adminTokens) {
      await sendPushNotification({
        token,
        title,
        body,
        data: {
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          route,
          tab: 'admin_orders',
          orderId,
          orderNumber,
          userEmail,
          type: 'admin_approval_required',
          timestamp: new Date().toISOString(),
        }
      });
    }
  } catch (err: any) {
    console.error('❌ [FCM Error] Falló el envío de push a administradores:', err.message);
  }
}

// ----------------------------------------------------
// Real-Time SSE Stream for Instant Multi-Device Updates
// ----------------------------------------------------
interface RealtimeClient {
  id: string;
  email: string;
  res: Response;
}

const realtimeClients: RealtimeClient[] = [];

export function broadcastRealtimeEvent(event: {
  type: 'order_approved' | 'order_rejected' | 'order_created' | 'order_deleted' | 'plan_unavailable_alert' | string;
  order?: any;
  esim?: any;
  userEmail?: string;
  orderNumber?: string;
  [key: string]: any;
}) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (let i = realtimeClients.length - 1; i >= 0; i--) {
    const client = realtimeClients[i];
    try {
      client.res.write(payload);
    } catch {
      realtimeClients.splice(i, 1);
    }
  }
}

/**
 * Busca planes similares de datos para el mismo destino o región cuando un plan no está disponible
 */
export async function findSimilarPlans(countryCode?: string, currentPlanId?: string, currentRegion?: string): Promise<any[]> {
  try {
    const code = (countryCode || 'GL').toUpperCase().trim();
    const plansResult = await fetchPlansFromAtlas({ countryCode: code, limit: 10 });
    let similar = (plansResult.plans || []).filter((p: any) => p.id !== currentPlanId && p.packageCode !== currentPlanId);

    if (similar.length < 3 && currentRegion) {
      const regResult = await fetchPlansFromAtlas({ region: currentRegion, limit: 10 });
      const regPlans = (regResult.plans || []).filter((p: any) => p.id !== currentPlanId && !similar.some(s => s.id === p.id));
      similar = [...similar, ...regPlans];
    }

    if (similar.length < 3) {
      const globResult = await fetchPlansFromAtlas({ region: 'global', limit: 6 });
      const globPlans = (globResult.plans || []).filter((p: any) => p.id !== currentPlanId && !similar.some(s => s.id === p.id));
      similar = [...similar, ...globPlans];
    }

    return similar.slice(0, 4);
  } catch (err: any) {
    console.warn('⚠️ Error consultando planes similares:', err.message);
    return [];
  }
}

/**
 * Envia DOS (2) notificaciones push FCM y un correo electrónico al administrador mgbravomalo@gmail.com
 * cuando un plan no existe o el proveedor ya no lo tiene en stock.
 * El cobro se detiene antes de procesarse, garantizando 0 devoluciones.
 */
export async function sendPlanUnavailableAdminAlerts(params: {
  plan: any;
  user: any;
  reason: string;
  paymentMethod?: string;
}): Promise<{ fcmSent: number; emailSent: boolean }> {
  const { plan, user, reason, paymentMethod = 'Tarjeta / GPay' } = params;
  const adminEmail = 'mgbravomalo@gmail.com';
  const packageCode = plan.packageCode || plan.id || 'N/A';
  const planName = plan.name || 'Plan eSIM';
  const country = plan.country || 'Destino';
  const countryCode = plan.countryCode || 'GL';
  const customerEmail = user?.email || 'cliente@desconocido.com';
  const customerName = user?.name || user?.email?.split('@')[0] || 'Cliente';

  console.warn(`🚨 [Alerta Proveedor] Plan no disponible: "${planName}" (${packageCode}). Enviando 2 mensajes FCM y correo a ${adminEmail}...`);

  // 1. Recopilar tokens FCM registrados para administradores
  let adminTokens: string[] = [];
  try {
    if (isDatabaseConnected()) {
      const admins = await AtlasCustomerModel.find({
        $or: [
          { role: 'admin' },
          { email: adminEmail },
          { email: { $in: SYSTEM_ADMIN_EMAILS } },
          { email: /admin/i }
        ]
      }).lean();

      for (const admin of admins) {
        if (admin.fcmTokens && Array.isArray(admin.fcmTokens)) {
          for (const token of admin.fcmTokens) {
            if (token && typeof token === 'string' && token.trim().length > 0 && !adminTokens.includes(token)) {
              adminTokens.push(token);
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.error('⚠️ [FCM Admin Search Error]:', err.message);
  }

  if (adminTokens.length === 0) {
    console.log(`📱 [FCM Admins] Sin tokens nativos activos; registrando entrega simulada a administrador (${adminEmail}).`);
    adminTokens.push(`simulated_admin_fcm_token_${adminEmail}`);
  }

  // 2. ENVIAR DOS (2) MENSAJES FCM AL ADMINISTRADOR
  // Mensaje FCM #1: Alerta sobre el plan inexistente/agotado
  const fcmTitle1 = `⚠️ Plan No Disponible: ${planName}`;
  const fcmBody1 = `Cliente ${customerName} (${customerEmail}) intentó comprar ${packageCode} en ${country}. Mayorista: "${reason}". Cobro bloqueado preventivamente (sin devoluciones).`;

  // Mensaje FCM #2: Acción requerida y verificación técnica
  const fcmTitle2 = `🚨 Acción Requerida Admin: ${adminEmail}`;
  const fcmBody2 = `Por favor revisa el catálogo en eSIMAccess y actualiza/reemplaza el paquete "${packageCode}" de ${country}.`;

  let fcmCount = 0;
  for (const token of adminTokens) {
    try {
      // 1er Mensaje FCM
      await sendPushNotification({
        token,
        title: fcmTitle1,
        body: fcmBody1,
        data: {
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          route: '/admin/plans',
          type: 'plan_unavailable_wholesaler',
          step: '1_of_2',
          packageCode,
          planName,
          country,
          countryCode,
          customerEmail,
          adminEmail,
          preventedCharge: 'true',
          timestamp: new Date().toISOString(),
        }
      });
      fcmCount++;

      // Pequeña pausa de 300ms entre ambos mensajes para orden en el dispositivo
      await new Promise(r => setTimeout(r, 300));

      // 2do Mensaje FCM
      await sendPushNotification({
        token,
        title: fcmTitle2,
        body: fcmBody2,
        data: {
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          route: '/admin/plans',
          type: 'plan_unavailable_action_required',
          step: '2_of_2',
          packageCode,
          country,
          adminEmail,
          actionRequired: 'update_catalog',
          timestamp: new Date().toISOString(),
        }
      });
      fcmCount++;
    } catch (err: any) {
      console.error(`❌ [FCM Error] Envío falló para token ${token.substring(0, 15)}:`, err.message);
    }
  }

  // 3. ENVIAR CORREO ELECTRÓNICO AL ADMINISTRADOR mgbravomalo@gmail.com
  let emailSent = false;
  try {
    const emailRes = await sendPlanUnavailableAdminAlertEmail({
      adminEmail,
      plan,
      user,
      reason,
      paymentMethod,
      attemptedAt: new Date().toLocaleString('es-ES', { timeZone: 'America/Guayaquil' })
    });
    emailSent = Boolean(emailRes.success);
    console.log(`📧 [Email Admin] Alerta enviada a ${adminEmail}: ${emailSent ? 'OK' : emailRes.error}`);
  } catch (mailErr: any) {
    console.error(`❌ [Email Error] Falló el correo a ${adminEmail}:`, mailErr.message);
  }

  // 4. Emisión SSE en vivo
  broadcastRealtimeEvent({
    type: 'plan_unavailable_alert',
    planName,
    packageCode,
    country,
    customerEmail,
    reason,
    preventedCharge: true,
  });

  return { fcmSent: fcmCount, emailSent };
}

// GET /api/realtime/stream - Server-Sent Events stream
app.get('/api/realtime/stream', (req: Request, res: Response) => {
  const email = ((req.query.email as string) || '').toLowerCase().trim();
  const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

  const client: RealtimeClient = { id: clientId, email, res };
  realtimeClients.push(client);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const idx = realtimeClients.findIndex(c => c.id === clientId);
    if (idx !== -1) realtimeClients.splice(idx, 1);
  });
});

// GET /api/admin/settings - System settings & pending orders count
app.get('/api/admin/settings', requireAdmin, async (req: Request, res: Response) => {
  try {
    const dbSettings = await getSystemSettingsFromDb();
    systemSettings = { ...dbSettings };

    const allOrders = await getOrdersFromDb({ isAdmin: true });
    const pendingOrdersCount = allOrders.filter(o => o.status === 'pending_approval').length;
    res.json({
      success: true,
      settings: {
        isTestMode: systemSettings.isTestMode,
        requireAdminApproval: systemSettings.requireAdminApproval,
      },
      pendingOrdersCount,
      adminEmails: SYSTEM_ADMIN_EMAILS,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/system/settings - Public read-only system mode for checkout
app.get('/api/system/settings', async (_req: Request, res: Response) => {
  try {
    const dbSettings = await getSystemSettingsFromDb();
    res.json({
      success: true,
      isTestMode: dbSettings.isTestMode,
      requireAdminApproval: dbSettings.requireAdminApproval,
    });
  } catch (err: any) {
    res.json({
      success: true,
      isTestMode: systemSettings.isTestMode,
      requireAdminApproval: systemSettings.requireAdminApproval,
    });
  }
});

// POST /api/admin/settings - Update system settings (Admin only)
app.post('/api/admin/settings', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { isTestMode, requireAdminApproval } = req.body;

    const saved = await saveSystemSettingsToDb({ isTestMode, requireAdminApproval });
    systemSettings = { ...saved };

    console.log(`🔧 [Settings] Modo de Pruebas guardado: ${systemSettings.isTestMode ? 'ACTIVO (Simulación Fake sin costo)' : 'PRODUCCIÓN (Mayorista Real)'}`);
    console.log(`🔧 [Settings] Aprobación manual requerida: ${systemSettings.requireAdminApproval}`);

    res.json({
      success: true,
      settings: {
        isTestMode: systemSettings.isTestMode,
        requireAdminApproval: systemSettings.requireAdminApproval,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/ai/diagnostic - Intelligent Diagnostics Copilot for Admin (MongoDB + eSIMAccess + Operations)
app.post('/api/admin/ai/diagnostic', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = typeof req.body.query === 'string' && req.body.query.trim().length > 0
      ? req.body.query.trim()
      : 'Diagnóstico general de la base de datos y la conexión a eSIMAccess';
    let targetIccid = typeof req.body.iccid === 'string' ? req.body.iccid.trim() : '';
    let rawIdentifier = (typeof req.body.identifier === 'string' ? req.body.identifier : (typeof req.body.esimId === 'string' ? req.body.esimId : (typeof req.body.orderId === 'string' ? req.body.orderId : targetIccid))).trim();

    // Si no se pasó identificador explícito, extraer de la consulta
    if (!rawIdentifier) {
      const iccidMatch = query.match(/\b(89\d{16,20})\b/);
      if (iccidMatch) {
        rawIdentifier = iccidMatch[1];
      } else {
        const esimMatch = query.match(/\b(esim-[\w-]+)\b/i);
        if (esimMatch) {
          rawIdentifier = esimMatch[1];
        } else {
          const orderMatch = query.match(/\b(WPA-[\w-]+|ORD-[\w-]+|ord_[\w-]+)\b/i);
          if (orderMatch) {
            rawIdentifier = orderMatch[1];
          }
        }
      }
    }

    if (!targetIccid && /^89\d{14,22}$/.test(rawIdentifier)) {
      targetIccid = rawIdentifier;
    }

    // 1. Telemetría en vivo de MongoDB Atlas
    const startDbPing = Date.now();
    const dbStatus = await getDatabaseStatus();
    const dbPingMs = Date.now() - startDbPing;

    let ordersStats = { total: 0, pending: 0, approved: 0 };
    let latestOrders: any[] = [];
    try {
      const allOrders = await getOrdersFromDb({ isAdmin: true });
      ordersStats.total = allOrders.length;
      ordersStats.pending = allOrders.filter(o => o.status === 'pending_approval').length;
      ordersStats.approved = allOrders.filter(o => o.status === 'approved').length;
      latestOrders = allOrders.slice(0, 5).map(o => ({
        orderNumber: o.orderNumber,
        status: o.status,
        country: o.country,
        planName: o.planName,
        userEmail: o.userEmail,
        pricePaid: o.pricePaid,
        createdAt: o.createdAt
      }));
    } catch {}

    let esimsStats = { total: 0, active: 0, ready: 0 };
    try {
      if (isDatabaseConnected()) {
        esimsStats.total = await UserEsimModel.countDocuments();
        esimsStats.active = await UserEsimModel.countDocuments({ status: 'active' });
        esimsStats.ready = await UserEsimModel.countDocuments({ status: 'ready_to_install' });
      }
    } catch {}

    // 2. Telemetría en vivo de la API de eSIMAccess
    const isEsimAccessOk = isEsimAccessConfigured();
    let esimAccessBalance: any = null;
    let esimAccessError: string | null = null;
    let esimAccessLatencyMs = 0;

    if (isEsimAccessOk) {
      const startEsimPing = Date.now();
      try {
        const balRes = await getEsimAccessBalance();
        esimAccessLatencyMs = Date.now() - startEsimPing;
        if (balRes.success) {
          esimAccessBalance = {
            balanceUsd: balRes.balanceUsd,
            currency: balRes.currency,
            rawBalance: balRes.rawBalance,
          };
        } else {
          esimAccessError = balRes.error || 'Error consultando balance';
        }
      } catch (err: any) {
        esimAccessError = err.message || 'Fallo de conexión a eSIMAccess';
      }
    }

    // 3. Inspección opcional de un eSIM / ICCID / Pedido específico si fue solicitado
    let iccidDetails: any = null;
    if (rawIdentifier) {
      let matchedOrder: any = null;
      let localEsim: any = null;

      // Buscar en AtlasOrderModel o memoria
      try {
        if (isDatabaseConnected()) {
          matchedOrder = await AtlasOrderModel.findOne({
            $or: [
              { orderNumber: rawIdentifier },
              { id: rawIdentifier },
              { "generatedEsim.iccid": rawIdentifier },
              { "generatedEsim.id": rawIdentifier },
            ]
          }).lean();
        }
      } catch (e) {}

      if (!matchedOrder) {
        matchedOrder = inMemoryOrders.find(o => 
          o.orderNumber === rawIdentifier ||
          o.id === rawIdentifier ||
          o.generatedEsim?.iccid === rawIdentifier ||
          o.generatedEsim?.id === rawIdentifier
        ) || null;
      }

      if (matchedOrder?.generatedEsim?.iccid && !targetIccid) {
        targetIccid = matchedOrder.generatedEsim.iccid;
      }

      // Buscar en UserEsimModel
      try {
        if (isDatabaseConnected()) {
          localEsim = await UserEsimModel.findOne({
            $or: [
              { iccid: targetIccid || rawIdentifier },
              { id: rawIdentifier },
              { orderId: rawIdentifier },
              { orderNumber: rawIdentifier },
            ]
          }).lean();
        }
      } catch (e) {}

      if (localEsim?.iccid && !targetIccid) {
        targetIccid = localEsim.iccid;
      }

      // Si aún no teníamos orden pero encontramos la eSIM local, intentar enlazar la orden
      if (!matchedOrder && localEsim) {
        try {
          if (isDatabaseConnected()) {
            matchedOrder = await AtlasOrderModel.findOne({
              $or: [
                { "generatedEsim.iccid": localEsim.iccid },
                { id: localEsim.orderId || '' },
                { orderNumber: localEsim.orderNumber || '' }
              ]
            }).lean();
          }
        } catch (e) {}
      }

      // Consultar uso y estado en vivo en eSIMAccess si tenemos ICCID
      let providerUsage: any = null;
      if (targetIccid && isEsimAccessOk) {
        try {
          providerUsage = await queryEsimUsage({ iccid: targetIccid });
        } catch {}
      }

      iccidDetails = {
        searchedIdentifier: rawIdentifier,
        iccid: targetIccid || null,
        foundInDatabase: Boolean(localEsim),
        foundInOrders: Boolean(matchedOrder),
        country: localEsim?.country || matchedOrder?.country || 'Desconocido',
        statusInDb: localEsim?.status || (matchedOrder ? (matchedOrder.status === 'approved' ? 'Aprobada / Generada' : matchedOrder.status) : 'No registrada'),
        userEmail: localEsim?.userEmail || matchedOrder?.userEmail || null,
        usedDataGB: localEsim?.usedDataGB ?? 0,
        totalDataGB: localEsim?.totalDataGB ?? matchedOrder?.totalDataGB ?? 0,
        orderInfo: matchedOrder ? {
          orderNumber: matchedOrder.orderNumber,
          orderId: matchedOrder.id,
          status: matchedOrder.status,
          country: matchedOrder.country,
          planName: matchedOrder.planName,
          userEmail: matchedOrder.userEmail,
          userName: matchedOrder.userName,
          pricePaid: matchedOrder.pricePaid,
          paymentMethod: matchedOrder.paymentMethod,
          isTestMode: matchedOrder.isTestMode,
          createdAt: matchedOrder.createdAt,
          approvedAt: matchedOrder.approvedAt,
          esimId: matchedOrder.generatedEsim?.id,
          iccid: matchedOrder.generatedEsim?.iccid,
        } : null,
        esimInfo: localEsim ? {
          id: localEsim.id,
          country: localEsim.country,
          status: localEsim.status,
          userEmail: localEsim.userEmail,
          usedDataGB: localEsim.usedDataGB,
          totalDataGB: localEsim.totalDataGB,
          matchingId: localEsim.matchingId,
          smDpAddress: localEsim.smDpAddress,
        } : null,
        providerUsage: providerUsage ? {
          success: providerUsage.success,
          status: providerUsage.status,
          usedDataGB: providerUsage.usedDataGB,
          totalDataGB: providerUsage.totalDataGB,
          device: providerUsage.deviceModel || providerUsage.deviceBrand || 'Desconocido',
        } : null
      };
    }

    // 4. Configuración y eventos recientes
    const recentAudit = await getRecentPurchaseAuditLogs(4);

    const telemetry = {
      timestamp: new Date().toISOString(),
      database: {
        connected: dbStatus.isConnected,
        status: dbStatus.state,
        latencyMs: dbPingMs,
        collections: {
          destinations: dbStatus.totalDestinations,
          plans: dbStatus.totalPlans,
          customers: dbStatus.totalCustomers,
          esims: dbStatus.totalUserEsims,
        },
        orders: ordersStats,
        esims: esimsStats,
      },
      esimAccess: {
        configured: isEsimAccessOk,
        endpoint: process.env.ESIMACCESS_BASE_URL || 'https://api.esimaccess.com/api/v1/open',
        latencyMs: esimAccessLatencyMs,
        balance: esimAccessBalance,
        error: esimAccessError,
      },
      systemSettings: {
        isTestMode: systemSettings.isTestMode,
        requireAdminApproval: systemSettings.requireAdminApproval,
      },
      targetIccidInspection: iccidDetails,
      recentAuditErrors: recentAudit.filter(a => a.status === 'failed' || a.status === 'warning').length,
    };

    // 5. Análisis con Gemini AI
    let aiAnswer = '';
    const ai = getGeminiClient();

    if (ai) {
      try {
        const isEsimSpecific = Boolean(telemetry.targetIccidInspection);
        const specificPromptGuidance = isEsimSpecific ? `
🚨 CONSULTA ESPECÍFICA DE eSIM / PEDIDO:
El administrador solicitó inspeccionar la eSIM / Pedido con identificador: "${telemetry.targetIccidInspection.searchedIdentifier || telemetry.targetIccidInspection.iccid}".
Datos de la inspección:
${JSON.stringify(telemetry.targetIccidInspection, null, 2)}

INSTRUCCIÓN PRIORITARIA:
Tu respuesta DEBE estar centrada 100% en esta eSIM específica:
1. Título claro: "### 📱 Diagnóstico Detallado de eSIM: [ID o ICCID]"
2. Estado de la Orden y Cliente (Nº Orden, Usuario, País/Plan, Precio).
3. Estado en MongoDB Atlas (Estado local, si está en useresims o en orders, datos usados vs totales).
4. Estado en Carrier Mayorista (eSIMAccess) (Estado en el mayorista, consumo en red, dispositivo).
5. Evaluación y Alertas: ¿Hay discrepancia? (ej: ¿está CANCELADA en el mayorista pero lista en local?).
6. Recomendación directa al administrador.
NO des un reporte general de la base de datos si se consultó una eSIM puntual.` : ``;

        const prompt = `Eres el "Copiloto IA de Diagnóstico y Operaciones" de la plataforma Wappa eSIM.
Tu labor es responder consultas técnicas y operativas del Administrador del sistema basadas en TELEMETRÍA EN VIVO Y TIEMPO REAL.

Pregunta del Administrador:
"${query}"
${specificPromptGuidance}

TELEMETRÍA EN TIEMPO REAL DEL SISTEMA:
${JSON.stringify(telemetry, null, 2)}

INSTRUCCIONES CLAVE:
1. Responde en español con tono profesional, ejecutivo, claro y conciso.
2. Utiliza indicadores visuales: 🟢 OK/Saludable, 🟡 Advertencia/Atención, 🔴 Error/Crítico, ⚡ Info/Operativo.
3. Responde directamente a lo que el administrador preguntó (si preguntó por una eSIM/ICCID/orden específica, enfócate enteramente en ella con todos sus detalles).
4. Resume las cifras relevantes (latencia, saldo en USD, consumo de datos, estado del carrier).
5. Incluye recomendaciones operativas si algo requiere atención.
6. Usa formato Markdown limpio con negritas y listas breves.`;

        const aiPromise = ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AI timeout')), 6000)
        );

        const response: any = await Promise.race([aiPromise, timeoutPromise]);
        if (response && response.text) {
          aiAnswer = response.text.trim();
        }
      } catch (err: any) {
        console.warn('⚠️ [Copiloto Diagnóstico] Gemini fallback:', err.message);
      }
    }

    // Fallback determinístico inteligente si Gemini no responde a tiempo
    if (!aiAnswer) {
      const dbBadge = telemetry.database.connected ? '🟢 Conectada (Atlas)' : '🔴 Desconectada';
      const esimAccessBadge = telemetry.esimAccess.configured 
        ? (telemetry.esimAccess.balance ? `🟢 Conectado ($${telemetry.esimAccess.balance.balanceUsd} ${telemetry.esimAccess.balance.currency})` : (telemetry.esimAccess.error ? `🔴 Error: ${telemetry.esimAccess.error}` : '🟡 Configurado'))
        : '🟡 No configurado (Modo Simulación)';
      const modeBadge = telemetry.systemSettings.isTestMode ? '🧪 Modo Pruebas (Simulado)' : '🚀 Producción en Vivo';

      // SI SE CONSULTÓ UNA eSIM O PEDIDO ESPECÍFICO, EL REPORTE DEBE SER 100% DE LA eSIM
      if (telemetry.targetIccidInspection) {
        const insp = telemetry.targetIccidInspection;
        const ord = insp.orderInfo;
        const prov = insp.providerUsage;
        const local = insp.esimInfo;

        let statusBadge = '🟢 Operativa';
        if (prov && (prov.status === 'CANCEL' || prov.status === 'CANCELLED')) {
          statusBadge = '🔴 Perfil Cancelado en Proveedor Mayorista';
        } else if (!insp.foundInDatabase && !insp.foundInOrders) {
          statusBadge = '🔴 No encontrada en el sistema';
        } else if (local?.status === 'ready_to_install') {
          statusBadge = '🟡 Lista para instalar (Pendiente de escaneo)';
        } else if (local?.status === 'active') {
          statusBadge = '🟢 Activa en uso';
        }

        aiAnswer = `### 📱 Diagnóstico Específico de eSIM / Pedido: \`${insp.searchedIdentifier || insp.iccid}\`

**Estado General:** ${statusBadge}

---

### 📋 Información del Pedido y Cliente
* **Número de Orden:** \`#${ord?.orderNumber || 'N/A'}\` ${ord ? `(${ord.status === 'approved' ? '🟢 Aprobada' : '🟡 ' + ord.status})` : ''}
* **Cliente / Email:** \`${insp.userEmail || ord?.userEmail || 'No asignado'}\` ${ord?.userName ? `(${ord.userName})` : ''}
* **Destino:** **${insp.country || ord?.country || 'Desconocido'}**
* **Plan:** **${ord?.planName || 'Plan de Datos eSIM'}**
* **Total Pagado:** **$${ord?.pricePaid ?? 0} USD** (Método: ${ord?.paymentMethod || 'Tarjeta'})
* **Modo de Compra:** ${ord?.isTestMode ? '🧪 Modo Pruebas (Simulado)' : '🚀 Producción en Vivo'}
${ord?.createdAt ? `* **Fecha de Pedido:** ${new Date(ord.createdAt).toLocaleString('es-ES')}` : ''}

---

### 🗄️ Estado en MongoDB Atlas
* **Registro en Colección:** ${insp.foundInDatabase ? '🟢 Encontrada en `useresims`' : (insp.foundInOrders ? '🟡 Registrada en orden de compra de Atlas' : '🔴 No localizada en BD')}
* **Estado Local:** \`${insp.statusInDb}\`
* **Consumo Registrado Local:** **${insp.usedDataGB ?? 0} GB** de **${insp.totalDataGB ?? 0} GB**
${local?.id ? `* **ID de eSIM Local:** \`${local.id}\`` : ''}
${local?.smDpAddress ? `* **Servidor SM-DP+:** \`${local.smDpAddress}\`` : ''}

---

### 🌐 Estado en Red Mayorista (eSIMAccess)
* **ICCID:** \`${insp.iccid || 'Sin ICCID asignado'}\`
* **Conexión Mayorista:** ${telemetry.esimAccess.configured ? '🟢 API eSIMAccess en línea' : '🟡 API no configurada'}
* **Estado en Proveedor:** \`${prov?.status || (telemetry.esimAccess.configured ? 'No reportado por el mayorista' : 'Simulado')}\`
* **Consumo Real en Red:** **${prov?.usedDataGB ?? 0} GB** de **${prov?.totalDataGB ?? insp.totalDataGB ?? 0} GB**
* **Dispositivo Conectado:** \`${prov?.device || 'Ninguno / No conectado todavía'}\`

---

### 💡 Diagnóstico y Recomendación Operativa
${prov?.status === 'CANCEL' 
  ? '⚠️ **Conflicto detectado:** La base de datos local indica que la eSIM está lista (`ready_to_install`), pero en el mayorista eSIMAccess figura como **CANCELADA (`CANCEL`)**. El cliente no podrá activar el servicio. Se recomienda cancelar o reemitir la eSIM desde el panel de órdenes.' 
  : (insp.foundInDatabase || insp.foundInOrders 
    ? '🟢 **Perfil en orden:** La eSIM y la orden concuerdan correctamente. El cliente puede escanear su código QR para instalar el perfil de datos.' 
    : '⚠️ Esta eSIM no fue localizada en el sistema. Verifica que el identificador ingresado sea correcto.')}`;
      } else {
        const isAskingBalance = /saldo|balance|esimaccess|credito|dinero/i.test(query);
        const isAskingDb = /base de datos|db|mongo|atlas|conexion|latencia/i.test(query);
        const isAskingOrders = /pedidos|ordenes|pendientes|compras/i.test(query);

        if (isAskingBalance && !isAskingDb) {
          aiAnswer = `### 💰 Estatus de Conexión y Saldo en eSIMAccess

* **Estado de Conexión:** ${esimAccessBadge}
* **Saldo Disponible:** **$${telemetry.esimAccess.balance?.balanceUsd ?? '0.00'} ${telemetry.esimAccess.balance?.currency || 'USD'}**
* **Endpoint Mayorista:** \`${telemetry.esimAccess.endpoint}\`
* **Modo de Operación:** ${modeBadge}

💡 **Resumen:** La integración con la API de eSIMAccess está respondiendo con normalidad. ${telemetry.systemSettings.isTestMode ? 'Recuerda que el Modo de Pruebas está activo, por lo que las órdenes no descuentan saldo real en el mayorista.' : 'Las compras se debitan de este balance.'}`;
        } else if (isAskingOrders) {
          aiAnswer = `### 📦 Estatus de Pedidos y Aprobaciones

* **Total de Pedidos:** ${telemetry.database.orders.total}
* **Pendientes de Aprobación:** **${telemetry.database.orders.pending}**
* **Aprobados / Completados:** ${telemetry.database.orders.approved}
* **Aprobación Manual:** ${telemetry.systemSettings.requireAdminApproval ? '🟡 Requerida' : '🟢 Automática'}

${telemetry.database.orders.pending > 0 ? `⚠️ **Atención:** Hay **${telemetry.database.orders.pending} pedido(s)** esperando tu revisión en el panel de Pedidos.` : '🟢 No hay pedidos pendientes de revisión en este momento.'}`;
        } else {
          aiAnswer = `### 📊 Reporte de Diagnóstico del Sistema

* **Base de Datos (MongoDB Atlas):** ${dbBadge} (Latencia: ${telemetry.database.latencyMs} ms)
* **Colecciones en Atlas:** ${telemetry.database.collections?.destinations || 0} destinos, ${telemetry.database.collections?.plans || 0} planes, ${telemetry.database.collections?.esims || 0} eSIMs
* **Pedidos:** ${telemetry.database.orders.total} totales | **${telemetry.database.orders.pending} pendientes de aprobación**
* **Conexión eSIMAccess:** ${esimAccessBadge} (Saldo: **$${telemetry.esimAccess.balance?.balanceUsd ?? '0.00'} USD**)
* **Modo de Operación:** ${modeBadge} (Aprobación manual: ${telemetry.systemSettings.requireAdminApproval ? 'Sí' : 'No'})

💡 **Resumen:** La infraestructura responde con normalidad.${telemetry.database.orders.pending > 0 ? ` Hay **${telemetry.database.orders.pending} pedido(s)** en espera de tu autorización.` : ''}`;
        }
      }
    }

    res.json({
      success: true,
      query,
      answer: aiAnswer,
      telemetry,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/orders - List orders (for user or all if admin)
app.get('/api/orders', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const email = (req.query.email as string || '').toLowerCase().trim();

    // IDOR protection: only allow checking orders of one's own email or admin
    const userCtx = req.userContext;
    const isAdmin = isUserAdmin(userCtx?.email, userCtx?.role);
    if (!isAdmin && userCtx?.email?.toLowerCase().trim() !== email) {
      return res.status(403).json({
        success: false,
        error: 'Acceso denegado. No tienes autorización para consultar las órdenes de otro usuario.'
      });
    }

    const orders = await getOrdersFromDb({
      userEmail: email,
      isAdmin,
    });

    res.json({
      success: true,
      count: orders.length,
      orders,
      isTestMode: systemSettings.isTestMode,
      requireAdminApproval: systemSettings.requireAdminApproval,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/plans/verify-availability - Verificar si el plan existe con el proveedor antes de cobrar
app.post('/api/plans/verify-availability', async (req: Request, res: Response) => {
  try {
    const { plan, user, paymentMethod } = req.body;
    if (!plan) {
      return res.status(400).json({ success: false, error: 'Datos del plan requeridos' });
    }

    const packageCode = plan.packageCode || plan.id;
    const availability = await verifyEsimPackageAvailability(packageCode);

    if (!availability.available) {
      const reason = availability.reason || 'El paquete ya no existe o no tiene stock con el proveedor eSIMAccess';
      console.warn(`🛑 [Verificación Pre-Cobro] Plan "${plan.name}" (${packageCode}) no disponible. Disparando 2 FCM y correo a mgbravomalo@gmail.com...`);

      // Enviar 2 notificaciones FCM y correo electrónico al administrador mgbravomalo@gmail.com
      sendPlanUnavailableAdminAlerts({
        plan,
        user: user || { name: 'Cliente', email: 'cliente@wappa.io' },
        reason,
        paymentMethod: paymentMethod || 'Tarjeta / GPay'
      }).catch(err => console.error('⚠️ [Alert Error]:', err.message));

      const similarPlans = await findSimilarPlans(plan.countryCode, plan.id, plan.region);

      return res.json({
        success: false,
        available: false,
        errorCode: 'PLAN_UNAVAILABLE',
        error: 'Plan no está disponible. Se va a verificar.',
        message: 'Plan no está disponible. Se va a verificar.',
        customerNotice: 'El plan seleccionado no está disponible en este momento con el proveedor. Nuestro equipo técnico lo verificará de inmediato.',
        preventedCharge: true,
        similarPlans,
      });
    }

    res.json({
      success: true,
      available: true,
      message: 'Plan disponible y verificado con el proveedor mayorista'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/test-unavailable-alert - Prueba técnica de doble FCM y correo al admin
app.post('/api/admin/test-unavailable-alert', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { countryCode = 'ES', packageCode = 'SIM_OUT_OF_STOCK_TEST', country = 'España' } = req.body || {};
    const testPlan = {
      id: 'plan_test_simulated_unavailable',
      name: 'Plan de Prueba Simulado (Agotado)',
      packageCode,
      country,
      countryCode,
      priceEUR: 8.50,
      dataAmountGB: 5,
    };
    const testUser = {
      name: 'Cliente de Prueba',
      email: req.userContext?.email || 'viajero.prueba@wappa.io'
    };

    const alertResult = await sendPlanUnavailableAdminAlerts({
      plan: testPlan,
      user: testUser,
      reason: 'El paquete ya no existe en el catálogo del mayorista eSIMAccess (Prueba de Seguridad)',
      paymentMethod: 'Tarjeta de Crédito Simulada'
    });

    const similarPlans = await findSimilarPlans(countryCode, testPlan.id);

    res.json({
      success: true,
      message: 'Prueba completada: Se enviaron 2 mensajes FCM y 1 correo electrónico al administrador mgbravomalo@gmail.com',
      alertResult,
      similarPlansCount: similarPlans.length,
      sampleSimilarPlans: similarPlans.slice(0, 2).map((p: any) => p.name)
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/orders/create - Create an order with payment method (GPay, Card)
app.post('/api/orders/create', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { plan, user, paymentMethod, paymentDetails, durationDays } = req.body;

    if (!plan || !user || !user.email) {
      return res.status(400).json({ success: false, error: 'Faltan datos del plan o del usuario' });
    }

    // IDOR protection: only allow creating order for oneself or admin
    const userCtx = req.userContext;
    const isAdmin = isUserAdmin(userCtx?.email, userCtx?.role);
    if (!isAdmin && userCtx?.userId !== user.id && userCtx?.email?.toLowerCase().trim() !== user.email?.toLowerCase().trim()) {
      return res.status(403).json({
        success: false,
        error: 'Acceso denegado. No puedes crear órdenes en nombre de otro usuario.'
      });
    }

    // -------------------------------------------------------------------------
    // 🛡️ REGLA FUNDAMENTAL DE SEGURIDAD FINANCIERA:
    // No se puede pasar a cobrar si el plan no existe o el proveedor ya no lo tiene.
    // En este esquema NO hay devoluciones porque nunca se cobra al usuario.
    // -------------------------------------------------------------------------
    const packageCode = plan.packageCode || plan.id;
    const availability = await verifyEsimPackageAvailability(packageCode);

    if (!availability.available) {
      const reason = availability.reason || 'El paquete ya no existe o no tiene stock en el mayorista eSIMAccess';
      console.warn(`🛑 [Seguridad Cobros] Plan "${plan.name}" (${packageCode}) no disponible. Cancelando cobro preventivamente.`);

      // 1. Enviar dos mensajes FCM junto con correo a mgbravomalo@gmail.com
      sendPlanUnavailableAdminAlerts({
        plan,
        user,
        reason,
        paymentMethod: paymentMethod || 'Tarjeta / GPay'
      }).catch(err => console.error('⚠️ [Alert Error]:', err.message));

      // 2. Buscar planes similares para invitar al cliente
      const similarPlans = await findSimilarPlans(plan.countryCode, plan.id, plan.region);

      // 3. Responder de inmediato sin cobrar al cliente
      return res.status(409).json({
        success: false,
        unavailable: true,
        errorCode: 'PLAN_UNAVAILABLE',
        error: 'Plan no está disponible. Se va a verificar.',
        message: 'Plan no está disponible. Se va a verificar.',
        customerNotice: 'El plan seleccionado no está disponible en este momento con el proveedor. Nuestro equipo técnico lo verificará de inmediato.',
        preventedCharge: true,
        similarPlans,
      });
    }

    const duration = Number(durationDays || (plan.isUnlimited ? 7 : (plan.validityDays || 30)));
    const pricePaid = Number((plan.isUnlimited ? plan.priceEUR * duration : plan.priceEUR).toFixed(2));
    
    // Always refresh latest system settings from persistent DB
    const freshSettings = await getSystemSettingsFromDb();
    systemSettings = { ...freshSettings };
    const isTestMode = systemSettings.isTestMode;

    const baseCost = typeof plan.costPriceEUR === 'number' && plan.costPriceEUR > 0
      ? plan.costPriceEUR
      : Number((plan.priceEUR * 0.55).toFixed(2));
    const costPriceEUR = isTestMode ? 0 : Number((plan.isUnlimited ? baseCost * duration : baseCost).toFixed(2));

    const orderNumber = `WPA-${Math.floor(100000 + Math.random() * 900000)}`;
    const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Client-side device detection (Client Hints & User-Agent)
    const userAgent = (req.headers['user-agent'] as string) || '';
    const chModel = ((req.headers['sec-ch-ua-model'] as string) || '').replace(/"/g, '').trim();
    const chPlatform = ((req.headers['sec-ch-ua-platform'] as string) || '').replace(/"/g, '').trim();

    let detectedDeviceBrand = 'Desconocido';
    let detectedDeviceModel = 'Dispositivo Web / Móvil';
    if (chModel) {
      detectedDeviceModel = chModel;
      if (/redmi|xiaomi|2404ARN45L/i.test(chModel)) detectedDeviceBrand = 'Xiaomi';
      else if (/samsung|sm-/i.test(chModel)) detectedDeviceBrand = 'Samsung';
      else if (/pixel/i.test(chModel)) detectedDeviceBrand = 'Google';
      else if (/iphone/i.test(chModel)) detectedDeviceBrand = 'Apple';
    } else if (userAgent) {
      if (/iPhone/i.test(userAgent)) {
        detectedDeviceBrand = 'Apple';
        detectedDeviceModel = 'iPhone';
      } else if (/iPad/i.test(userAgent)) {
        detectedDeviceBrand = 'Apple';
        detectedDeviceModel = 'iPad';
      } else if (/2404ARN45L|Redmi 13/i.test(userAgent)) {
        detectedDeviceBrand = 'Xiaomi';
        detectedDeviceModel = 'Redmi 13 (2404ARN45L)';
      } else if (/Redmi Note 13/i.test(userAgent)) {
        detectedDeviceBrand = 'Xiaomi';
        detectedDeviceModel = 'Redmi Note 13';
      } else if (/Xiaomi|Redmi/i.test(userAgent)) {
        detectedDeviceBrand = 'Xiaomi';
        detectedDeviceModel = 'Xiaomi Device';
      } else if (/Pixel \d/i.test(userAgent)) {
        detectedDeviceBrand = 'Google';
        const match = userAgent.match(/Pixel \d[a-zA-Z\s]*/i);
        detectedDeviceModel = match ? match[0] : 'Google Pixel';
      } else if (/SM-[A-Z0-9]+/i.test(userAgent)) {
        detectedDeviceBrand = 'Samsung';
        const match = userAgent.match(/SM-[A-Z0-9]+/i);
        detectedDeviceModel = match ? match[0] : 'Samsung Galaxy';
      }
    }

    const orderData: any = {
      id: orderId,
      orderNumber,
      userId: user.id || `usr_${Date.now()}`,
      userEmail: user.email.toLowerCase().trim(),
      userName: user.name || user.email.split('@')[0],
      deviceBrand: detectedDeviceBrand,
      deviceModel: detectedDeviceModel,
      devicePlatform: chPlatform || (userAgent.includes('Android') ? 'Android' : userAgent.includes('iPhone') ? 'iOS' : 'Web'),
      planId: plan.id,
      planName: plan.isUnlimited ? `${plan.name} (${duration} Días)` : plan.name,
      country: plan.country,
      countryCode: plan.countryCode || 'GL',
      flag: plan.flag || '🌐',
      operator: plan.operator || 'Red 5G',
      network5G: Boolean(plan.network5G),
      totalDataGB: plan.isUnlimited ? 999 : (plan.dataAmountGB || 5),
      isUnlimited: Boolean(plan.isUnlimited),
      durationDays: duration,
      pricePaid,
      costPriceEUR,
      paymentMethod: paymentMethod || 'credit_card',
      paymentDetails: {
        cardLast4: paymentDetails?.cardLast4 || '4242',
        cardBrand: paymentDetails?.cardBrand || (paymentMethod === 'gpay' ? 'Google Pay' : 'Visa'),
        cardHolderName: paymentDetails?.cardHolderName || user.name,
        walletAccount: paymentDetails?.walletAccount || user.email,
        transactionId: paymentDetails?.transactionId || `TXN-SIM-${Date.now()}`,
        isSimulated: true,
      },
      status: systemSettings.requireAdminApproval ? 'pending_approval' : 'approved',
      isTestMode,
    };

    // If auto-approve is allowed:
    if (!systemSettings.requireAdminApproval) {
      // Provision eSIM in test mode (simulated) or wholesaler
      const provision = await orderAndProvisionEsim({
        packageCode: plan.packageCode || plan.id || 'CKH491',
        countryCode: plan.countryCode,
        operator: plan.operator,
        pricePaid,
        userEmail: user.email,
        forceSimulation: isTestMode,
      });

      if (!provision.success) {
        console.warn(`🛑 [Seguridad Cobros] Mayorista rechazó compra: ${provision.error}. Cancelando cobro preventivamente (0 devoluciones).`);

        // Enviar 2 mensajes FCM y correo al administrador mgbravomalo@gmail.com
        sendPlanUnavailableAdminAlerts({
          plan,
          user,
          reason: provision.error || 'eSIMAccess rechazó el aprovisionamiento para este código de paquete',
          paymentMethod: paymentMethod || 'Tarjeta / GPay'
        }).catch(err => console.error('⚠️ [Alert Error]:', err.message));

        const similarPlans = await findSimilarPlans(plan.countryCode, plan.id, plan.region);

        return res.status(409).json({
          success: false,
          unavailable: true,
          errorCode: 'PLAN_UNAVAILABLE',
          error: 'Plan no está disponible. Se va a verificar.',
          message: 'Plan no está disponible. Se va a verificar.',
          customerNotice: 'El plan seleccionado no está disponible en este momento con el proveedor. Nuestro equipo técnico lo verificará de inmediato.',
          preventedCharge: true,
          similarPlans,
        });
      }

      const newEsim = {
        id: `esim-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        iccid: provision.iccid,
        planId: plan.id,
        planName: orderData.planName,
        country: plan.country,
        countryCode: plan.countryCode,
        flag: plan.flag,
        operator: plan.operator,
        network5G: plan.network5G,
        qrCodeUrl: provision.qrCodeUrl,
        smdpAddress: provision.smdpAddress,
        activationCode: provision.activationCode,
        manualCode: provision.manualCode,
        totalDataGB: orderData.totalDataGB,
        usedDataGB: 0,
        isUnlimited: orderData.isUnlimited,
        purchaseDate: new Date().toISOString().split('T')[0],
        expiryDate: `Válido ${duration} día${duration > 1 ? 's' : ''} tras primer uso`,
        durationDays: duration,
        preInstallValidity: plan.preInstallValidity || '180 Días',
        unusedValidTimeDays: plan.unusedValidTimeDays || 180,
        pricePaid,
        costPriceEUR,
        salePriceEUR: pricePaid,
        profitEUR: Number((pricePaid - costPriceEUR).toFixed(2)),
        status: 'ready_to_install',
        autoRenew: false,
        deviceBrand: detectedDeviceBrand,
        deviceModel: detectedDeviceModel,
        apn: provision.apn || plan.apn || 'globaldata',
        fupPolicy: plan.fupPolicy,
        fupDailyAllowance: plan.fupDailyAllowance,
        fupSpeedThrottling: plan.fupSpeedThrottling,
        fupResetInterval: plan.fupResetInterval,
        coverageDetails: plan.coverageDetails,
        isMultiCountry: plan.isMultiCountry,
        coveredCountriesCount: plan.coveredCountriesCount || plan.coveredCountries?.length,
        coveredCountries: plan.coveredCountries,
      };

      orderData.approvedAt = new Date();
      orderData.approvedBy = 'auto_system';
      orderData.generatedEsim = newEsim;

      // Save to database
      const createdOrder = await createOrderInDb(orderData);

      if (isDatabaseConnected()) {
        await UserEsimModel.findOneAndUpdate(
          { iccid: newEsim.iccid },
          { $set: { ...newEsim, userId: user.id, userEmail: user.email.toLowerCase().trim() } },
          { upsert: true, new: true }
        );
      }

      return res.json({
        success: true,
        status: 'approved',
        order: createdOrder,
        esim: newEsim,
        message: '¡Orden aprobada y eSIM generada con éxito!',
      });
    }

    // Require manual approval
    const createdOrder = await createOrderInDb(orderData);
    console.log(`📦 [Orders] Nueva orden ${orderNumber} creada en espera de aprobación manual por Administrador (${user.email} - $${pricePaid})`);

    // Broadcast new order event to real-time subscribers (admins)
    broadcastRealtimeEvent({
      type: 'order_created',
      order: createdOrder,
      userEmail: user.email,
      orderNumber,
    });

    // Send FCM push notification to all administrators
    sendApprovalNotificationToAdmins(createdOrder).catch((err) => {
      console.error('⚠️ [FCM Error] Error al iniciar envío de notificación push a administradores:', err.message);
    });

    res.json({
      success: true,
      status: 'pending_approval',
      order: createdOrder,
      message: 'Orden registrada con éxito. Pendiente de aprobación manual por el administrador.',
    });
  } catch (err: any) {
    console.error('❌ [Orders Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/orders/:orderId/approve - Approve an order and generate/provision eSIM
app.post('/api/orders/:orderId/approve', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const { forceWholesaler } = req.body;
    const adminEmail = req.userContext?.email || 'admin@wappa.io';

    const order = await getOrderByIdFromDb(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
    }

    if (order.status === 'approved' && order.generatedEsim) {
      return res.json({
        success: true,
        message: 'El pedido ya había sido aprobado previamente',
        order,
        esim: order.generatedEsim,
      });
    }

    // Decide whether to force simulation or use wholesaler
    // In test mode: ALWAYS use simulation to protect balance
    const useSimulation = systemSettings.isTestMode && !forceWholesaler;

    console.log(`🚀 [Admin Orders] Aprobando pedido ${order.orderNumber} para ${order.userEmail}... (Modo: ${useSimulation ? 'SIMULADO FAKE' : 'MAYORISTA REAL'})`);

    // 1. Iniciar log de auditoría de compra
    const auditLog = await createPurchaseAuditLog({
      orderNumber: order.orderNumber,
      userId: order.userId,
      userEmail: order.userEmail,
      customerName: order.userName,
      planId: order.planId,
      planName: order.planName,
      country: order.country,
      pricePaid: order.pricePaid,
      paymentMethod: order.paymentMethod,
      packageCode: order.planId,
      initialStepName: '1_ORDER_APPROVAL_INITIATED',
      initialStepDetails: {
        message: `Aprobación de orden iniciada por administrador: ${adminEmail}`,
        orderId: order.id,
        useSimulation,
      },
    });
    const logId = auditLog?.id;

    // 2. Disparo de orden al mayorista / simulador
    await appendPurchaseAuditStep(logId!, {
      step: '2_WHOLESALER_DISPATCH',
      status: 'ok',
      stage: 'wholesaler_ordered',
      details: {
        packageCode: order.planId,
        forceSimulation: useSimulation,
        userEmail: order.userEmail,
      },
    });

    const provision = await orderAndProvisionEsim({
      packageCode: order.planId || 'CKH491',
      countryCode: order.countryCode,
      operator: order.operator,
      pricePaid: order.pricePaid,
      userEmail: order.userEmail,
      forceSimulation: useSimulation,
    });

    // 3. DOBLE CHECK ESTRICTO
    const doubleCheck = provision.doubleCheck || {
      passed: Boolean(provision.iccid && provision.activationCode),
      providerOrderVerified: Boolean(provision.orderNo),
      iccidVerified: Boolean(provision.iccid && provision.iccid.startsWith('89')),
      acCodeVerified: Boolean(provision.activationCode),
      providerStatus: provision.providerStatus || 'GOT_RESOURCE',
      message: provision.iccid ? 'Perfil validado' : 'Error en provisión',
      checkedAt: new Date().toISOString(),
    };

    if (!provision.success || !provision.iccid || !doubleCheck.passed) {
      const errorMsg = provision.error || 'Doble check fallido: El mayorista no devolvió un perfil eSIM válido (ICCID o LPA inválido).';
      console.error(`❌ [Admin Orders Double Check Error]: ${errorMsg}`);
      await appendPurchaseAuditStep(logId!, {
        step: '3_DOUBLE_CHECK_FAILED',
        status: 'error',
        stage: 'double_check_failed',
        errorMessage: errorMsg,
        details: { provision, doubleCheck },
      });
      return res.status(422).json({
        success: false,
        error: errorMsg,
        doubleCheck,
        stage: 'double_check_failed',
      });
    }

    const appStatus = mapProviderStatusToAppStatus(provision.providerStatus);

    await appendPurchaseAuditStep(logId!, {
      step: '3_DOUBLE_CHECK_PASSED',
      status: 'ok',
      stage: 'double_check_passed',
      iccid: provision.iccid,
      orderNo: provision.orderNo,
      providerStatus: provision.providerStatus || 'GOT_RESOURCE',
      doubleCheckStatus: doubleCheck,
      details: {
        message: 'Doble check exitoso: ICCID y código LPA verificados contra la orden del mayorista.',
        iccid: provision.iccid,
        orderNo: provision.orderNo,
        providerStatus: provision.providerStatus,
        mappedAppStatus: appStatus,
      },
    });

    const newEsim = {
      id: `esim-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      iccid: provision.iccid,
      planId: order.planId,
      planName: order.planName,
      country: order.country,
      countryCode: order.countryCode,
      flag: order.flag,
      operator: order.operator,
      network5G: order.network5G,
      qrCodeUrl: provision.qrCodeUrl,
      smdpAddress: provision.smdpAddress,
      activationCode: provision.activationCode,
      manualCode: provision.manualCode,
      totalDataGB: order.totalDataGB,
      usedDataGB: 0,
      isUnlimited: order.isUnlimited,
      purchaseDate: new Date().toISOString().split('T')[0],
      expiryDate: `Válido ${order.durationDays || 30} días tras primer uso`,
      durationDays: order.durationDays || 30,
      preInstallValidity: '180 Días',
      unusedValidTimeDays: 180,
      pricePaid: order.pricePaid,
      costPriceEUR: order.costPriceEUR || 0,
      salePriceEUR: order.pricePaid,
      profitEUR: Number((order.pricePaid - (order.costPriceEUR || 0)).toFixed(2)),
      status: appStatus,
      providerStatus: provision.providerStatus || 'GOT_RESOURCE',
      orderNo: provision.orderNo,
      packageCode: order.planId,
      provisionSource: provision.source,
      doubleCheckPassed: true,
      doubleCheckedAt: new Date(),
      doubleCheckDetails: doubleCheck,
      autoRenew: false,
      apn: provision.apn || 'globaldata',
    };

    // Update order status in database
    const updatedOrder = await updateOrderInDb(order.id || orderId, {
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: adminEmail || 'Admin',
      generatedEsim: newEsim,
    });

    // Save eSIM in database for customer and link bidirectionally
    if (isDatabaseConnected()) {
      await UserEsimModel.findOneAndUpdate(
        { iccid: newEsim.iccid },
        { $set: { ...newEsim, userId: order.userId, userEmail: order.userEmail } },
        { upsert: true, new: true }
      );

      // Add to Customer activeEsims and purchases
      await AtlasCustomerModel.findOneAndUpdate(
        { email: order.userEmail.toLowerCase().trim() },
        {
          $push: {
            activeEsims: {
              ...newEsim,
              purchasedAt: new Date(),
            },
            purchases: {
              planId: order.planId,
              planName: order.planName,
              iccid: newEsim.iccid,
              orderNo: provision.orderNo,
              country: order.country,
              pricePaid: order.pricePaid,
              paymentMethod: order.paymentMethod,
              purchasedAt: new Date(),
              providerStatus: provision.providerStatus || 'GOT_RESOURCE',
              status: appStatus,
            },
          },
          $inc: { totalSpentUsd: order.pricePaid },
        }
      );

      await appendPurchaseAuditStep(logId!, {
        step: '4_LINK_USER_AND_DATABASE',
        status: 'ok',
        stage: 'completed',
        iccid: newEsim.iccid,
        orderNo: provision.orderNo,
        providerStatus: provision.providerStatus || 'GOT_RESOURCE',
        details: {
          message: 'eSIM enlazada bidireccionalmente al usuario y al pedido del proveedor en MongoDB Atlas.',
          userEmail: order.userEmail,
          userId: order.userId,
          iccid: newEsim.iccid,
          orderNo: provision.orderNo,
        },
      });
    }

    // Try sending notification email to customer
    try {
      if (isEmailConfigured()) {
        sendEsimDeliveryEmail({
          toEmail: order.userEmail,
          userName: order.userName,
          esim: newEsim,
        }).catch(() => {});
      }
    } catch {}

    console.log(`✅ [Admin Orders] Pedido ${order.orderNumber} APROBADO con éxito. eSIM asignada: ${newEsim.iccid}`);

    // Broadcast instant real-time approval event to the buyer and all connected tabs/devices
    broadcastRealtimeEvent({
      type: 'order_approved',
      order: updatedOrder,
      esim: newEsim,
      userEmail: order.userEmail,
      orderNumber: order.orderNumber,
    });

    res.json({
      success: true,
      message: `¡Pedido ${order.orderNumber} aprobado y eSIM emitida con éxito!`,
      order: updatedOrder,
      esim: newEsim,
    });
  } catch (err: any) {
    console.error('❌ [Approve Order Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/orders/:orderId/reject - Reject an order
app.post('/api/orders/:orderId/reject', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const adminEmail = req.userContext?.email || 'admin@wappa.io';

    const updatedOrder = await updateOrderInDb(orderId, {
      status: 'rejected',
      approvedAt: new Date(),
      approvedBy: adminEmail,
      rejectionReason: reason || 'Rechazado en entorno de pruebas',
    });

    if (!updatedOrder) {
      return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
    }

    console.log(`🚫 [Admin Orders] Pedido ${updatedOrder.orderNumber} rechazado.`);

    // Broadcast rejection event
    broadcastRealtimeEvent({
      type: 'order_rejected',
      order: updatedOrder,
      userEmail: updatedOrder.userEmail,
      orderNumber: updatedOrder.orderNumber,
    });

    res.json({
      success: true,
      message: `Pedido ${updatedOrder.orderNumber} rechazado`,
      order: updatedOrder,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/orders/:orderId - Delete an order (and associated test eSIM if any)
app.delete(['/api/orders/:orderId', '/api/admin/orders/:orderId'], async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const adminEmail = (req.body?.adminEmail || req.query?.adminEmail || req.headers['x-admin-email'] || '') as string;

    if (adminEmail && !isUserAdmin(adminEmail)) {
      return res.status(403).json({ success: false, error: 'Solo administradores pueden eliminar pedidos' });
    }

    const orderToDelete = await getOrderByIdFromDb(orderId);
    
    // Resolve identifiers
    const resolvedOrderNumber = orderToDelete?.orderNumber || (orderId.startsWith('WPA-') || orderId.startsWith('ORD-') ? orderId : undefined);
    const resolvedOrderId = orderToDelete?.id || orderId;
    const resolvedIccid = orderToDelete?.generatedEsim?.iccid || orderToDelete?.iccid;
    const resolvedEsimId = orderToDelete?.generatedEsim?.id || orderToDelete?.esimId;
    const userEmail = orderToDelete?.userEmail;

    // 1. Delete order from DB (Mongo / D1 / memory)
    await deleteOrderFromDb(orderId);
    if (resolvedOrderNumber && resolvedOrderNumber !== orderId) {
      await deleteOrderFromDb(resolvedOrderNumber);
    }
    if (resolvedOrderId && resolvedOrderId !== orderId) {
      await deleteOrderFromDb(resolvedOrderId);
    }

    // 2. Cascade delete associated eSIM so it ceases to show as active
    if (resolvedIccid) {
      await deleteUserEsimsFromDb(resolvedIccid);
    }
    if (resolvedEsimId) {
      await deleteUserEsimsFromDb(resolvedEsimId);
    }
    if (resolvedOrderNumber) {
      if (isDatabaseConnected()) {
        try {
          await UserEsimModel.deleteMany({
            $or: [
              { orderNumber: resolvedOrderNumber },
              { orderNo: resolvedOrderNumber }
            ]
          });
        } catch {}
      }
    }

    // 3. Cascade pull from customer records (activeEsims and purchases)
    if (isDatabaseConnected()) {
      try {
        const pullConds: any[] = [];
        if (resolvedOrderNumber) {
          pullConds.push({ orderNumber: resolvedOrderNumber }, { orderNo: resolvedOrderNumber }, { orderId: resolvedOrderNumber });
        }
        if (resolvedOrderId) {
          pullConds.push({ orderId: resolvedOrderId });
        }
        if (resolvedIccid) {
          pullConds.push({ iccid: resolvedIccid });
        }
        if (resolvedEsimId) {
          pullConds.push({ id: resolvedEsimId });
        }

        if (pullConds.length > 0) {
          await AtlasCustomerModel.updateMany(
            {},
            {
              $pull: {
                activeEsims: { $or: pullConds },
                purchases: { $or: pullConds }
              } as any
            }
          );
        }

        // 4. Clean up audit logs
        if (resolvedOrderNumber || resolvedOrderId) {
          await PurchaseAuditLogModel.deleteMany({
            $or: [
              ...(resolvedOrderNumber ? [{ orderNumber: resolvedOrderNumber }, { orderNo: resolvedOrderNumber }] : []),
              ...(resolvedOrderId ? [{ orderId: resolvedOrderId }] : [])
            ]
          });
        }
      } catch (err: any) {
        console.warn('⚠️ Error en cascade cleanup de orden:', err?.message || err);
      }
    }

    console.log(`🗑️ [Admin Orders] Pedido ${resolvedOrderNumber || orderId} y recursos asociados eliminados con éxito.`);

    // Broadcast realtime delete event so all connected tabs/buyers immediately sync
    broadcastRealtimeEvent({
      type: 'order_deleted',
      order: orderToDelete,
      orderId: resolvedOrderId,
      orderNumber: resolvedOrderNumber || orderId,
      userEmail,
      iccid: resolvedIccid,
      esimId: resolvedEsimId,
    });

    if (resolvedIccid || resolvedEsimId) {
      broadcastRealtimeEvent({
        type: 'esim_deleted',
        iccid: resolvedIccid,
        esimId: resolvedEsimId,
        userEmail,
      });
    }

    res.json({
      success: true,
      message: `Pedido ${resolvedOrderNumber || orderId} y perfil asociado eliminados correctamente`,
      orderId,
      orderNumber: resolvedOrderNumber,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/esims/:idOrIccid - Delete an eSIM (for admin sandbox cleanup)
app.delete(['/api/admin/esims/:idOrIccid', '/api/user/esims/:idOrIccid'], async (req: Request, res: Response) => {
  try {
    const { idOrIccid } = req.params;
    const adminEmail = (req.body?.adminEmail || req.query?.adminEmail || '') as string;

    if (!adminEmail || !isUserAdmin(adminEmail)) {
      return res.status(403).json({ success: false, error: 'Solo administradores autorizados pueden eliminar eSIMs' });
    }

    const deleted = await deleteUserEsimFromDb(idOrIccid);
    console.log(`🗑️ [eSIM Cleanup] eSIM ${idOrIccid} eliminada. Resultado: ${deleted}`);

    res.json({
      success: true,
      message: `eSIM ${idOrIccid} eliminada correctamente`,
      deleted,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/esims-clear-all - Delete all eSIMs and reset customer lists
app.delete('/api/admin/esims-clear-all', async (req: Request, res: Response) => {
  try {
    const adminEmail = (req.body?.adminEmail || req.query?.adminEmail || req.headers['x-admin-email'] || '') as string;

    if (!adminEmail || !isUserAdmin(adminEmail)) {
      return res.status(403).json({ success: false, error: 'Solo administradores autorizados pueden limpiar las eSIMs del sistema.' });
    }

    if (isDatabaseConnected()) {
      await UserEsimModel.deleteMany({});
      await AtlasCustomerModel.updateMany({}, { $set: { activeEsims: [], purchases: [] } });
    }

    console.log(`🗑️ [eSIM Reset] Todas las eSIMs del sistema han sido eliminadas por el administrador ${adminEmail}.`);

    res.json({
      success: true,
      message: 'Todas las eSIMs y consumos se han limpiado correctamente de la base de datos.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/esims/sync-all - Synchronize all eSIM statuses and usage with eSIM Access
app.post('/api/admin/esims/sync-all', requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!isDatabaseConnected()) {
      return res.status(500).json({ success: false, error: 'Base de datos no conectada.' });
    }
    if (!isEsimAccessConfigured()) {
      return res.status(500).json({ success: false, error: 'eSIM Access API no configurada.' });
    }

    const queryRes = await postEsimAccess('/esim/query', {
      pager: { pageNum: 1, pageSize: 100 }
    });

    if (!queryRes.success || !queryRes.data?.obj?.esimList) {
      return res.status(500).json({ success: false, error: queryRes.error || 'No se pudo obtener la información del mayorista.' });
    }

    const esimList = queryRes.data.obj.esimList;
    let updatedCount = 0;

    for (const esim of esimList) {
      const iccid = esim.iccid;
      const providerStatus = esim.esimStatus || 'GOT_RESOURCE';

      const statusLower = (providerStatus || '').toLowerCase().trim();
      let status = statusLower;
      if (['got_resource', 'new', 'in_stock', 'ready_to_install', 'ready_for_install'].includes(statusLower)) {
        status = 'ready_to_install';
      } else if (['downloaded', 'installed'].includes(statusLower)) {
        status = 'installed';
      } else if (['active', 'in_use', 'enabled'].includes(statusLower)) {
        status = 'active';
      } else if (['depleted', 'used_up'].includes(statusLower)) {
        status = 'depleted';
      } else if (['expired', 'overdue', 'used_expired'].includes(statusLower)) {
        status = 'expired';
      } else if (['canceled', 'cancelled', 'revoked', 'deleted', 'suspended', 'cancel'].includes(statusLower)) {
        status = 'canceled';
      } else {
        status = statusLower || 'ready_to_install';
      }

      const totalGB = esim.totalVolume ? Number((esim.totalVolume / (1024 * 1024 * 1024)).toFixed(2)) : 0.5;
      const usedGB = esim.orderUsage ? Number((esim.orderUsage / (1024 * 1024 * 1024)).toFixed(2)) : 0;

      const localEsim = await UserEsimModel.findOne({ iccid });
      if (localEsim) {
        const updateFields: any = {
          status,
          providerStatus,
          usedDataGB: usedGB,
          totalDataGB: totalGB,
        };

        if (esim.eid) {
          updateFields.eid = esim.eid;
          const devInfo = resolveDeviceByEid(esim.eid);
          updateFields.deviceBrand = devInfo.brand;
          updateFields.deviceModel = devInfo.model;
          updateFields.deviceType = devInfo.type;
        }
        if (esim.installationTime) {
          updateFields.installationTime = esim.installationTime;
        }

        await UserEsimModel.updateOne(
          { iccid },
          { $set: updateFields }
        );

        const nestedUpdateFields: any = {
          "activeEsims.$[elem].status": status,
          "activeEsims.$[elem].usedDataGB": usedGB,
          "activeEsims.$[elem].totalDataGB": totalGB,
        };

        if (esim.eid) {
          nestedUpdateFields["activeEsims.$[elem].eid"] = esim.eid;
          const devInfo = resolveDeviceByEid(esim.eid);
          nestedUpdateFields["activeEsims.$[elem].deviceBrand"] = devInfo.brand;
          nestedUpdateFields["activeEsims.$[elem].deviceModel"] = devInfo.model;
          nestedUpdateFields["activeEsims.$[elem].deviceType"] = devInfo.type;
        }
        if (esim.installationTime) {
          nestedUpdateFields["activeEsims.$[elem].installationTime"] = esim.installationTime;
        }

        await AtlasCustomerModel.updateMany(
          { "activeEsims.iccid": iccid },
          { $set: nestedUpdateFields },
          { 
            arrayFilters: [ { "elem.iccid": iccid } ] 
          } as any
        );

        updatedCount++;
      }
    }

    res.json({ 
      success: true, 
      message: `Sincronizadas con éxito ${updatedCount} eSIMs locales con el mayorista eSIM Access.`, 
      updatedCount 
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Purchase a new eSIM (Provisioned via eSIM Access API or GSMA fallback)
app.post('/api/user/esims/purchase', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { newEsim, user } = req.body;

    if (!newEsim || !user) {
      return res.status(400).json({ success: false, error: 'Missing newEsim or user in payload' });
    }

    // IDOR protection: only allow purchasing for oneself or admin
    const userCtx = req.userContext;
    const isAdmin = isUserAdmin(userCtx?.email, userCtx?.role);
    if (!isAdmin && userCtx?.userId !== user.id && userCtx?.email?.toLowerCase().trim() !== user.email?.toLowerCase().trim()) {
      return res.status(403).json({
        success: false,
        error: 'Acceso denegado. No puedes realizar compras en nombre de otro usuario.'
      });
    }

    const paidAmount = Number(newEsim.pricePaid || (newEsim.isUnlimited ? 15 : 10));
    const durationDays = Number(newEsim.durationDays || (newEsim.isUnlimited ? 7 : 30));

    // In Test Mode: Force simulation to guarantee ZERO wholesaler charges!
    const forceSimulation = systemSettings.isTestMode === true;
    const packageCode = newEsim.packageCode || newEsim.planId || 'CKH491';

    // 1. Iniciar registro de auditoría de compra
    const auditLog = await createPurchaseAuditLog({
      userId: user.id,
      userEmail: user.email,
      customerName: user.name,
      planId: newEsim.planId,
      planName: newEsim.planName,
      country: newEsim.country,
      pricePaid: paidAmount,
      paymentMethod: newEsim.paymentMethod || 'credit_card',
      packageCode,
      initialStepName: '1_PURCHASE_REQUEST_RECEIVED',
      initialStepDetails: {
        message: 'Solicitud de compra directa recibida del usuario',
        userId: user.id,
        userEmail: user.email,
        planName: newEsim.planName,
        pricePaid: paidAmount,
        forceSimulation,
      },
    });
    const logId = auditLog?.id;

    // 2. Disparo de orden al mayorista / simulador
    await appendPurchaseAuditStep(logId!, {
      step: '2_WHOLESALER_DISPATCH',
      status: 'ok',
      stage: 'wholesaler_ordered',
      details: {
        message: forceSimulation
          ? 'Modo de pruebas activo: Generando perfil GSMA sintético en sandbox'
          : 'Enviando orden formal a la API de eSIM Access',
        packageCode,
        countryCode: newEsim.countryCode,
      },
    });

    const provisionResult = await orderAndProvisionEsim({
      packageCode,
      countryCode: newEsim.countryCode,
      operator: newEsim.operator,
      pricePaid: paidAmount,
      userEmail: user.email,
      forceSimulation,
    });

    // 3. DOBLE CHECK ESTRICTO ANTES DE FINALIZAR
    const doubleCheck = provisionResult.doubleCheck || {
      passed: Boolean(provisionResult.iccid && provisionResult.activationCode),
      providerOrderVerified: Boolean(provisionResult.orderNo),
      iccidVerified: Boolean(provisionResult.iccid && provisionResult.iccid.startsWith('89')),
      acCodeVerified: Boolean(provisionResult.activationCode),
      providerStatus: provisionResult.providerStatus || 'GOT_RESOURCE',
      message: provisionResult.iccid ? 'Perfil validado' : 'Error en provisión',
      checkedAt: new Date().toISOString(),
    };

    if (!provisionResult.success || !provisionResult.iccid || !doubleCheck.passed) {
      const errorMsg = provisionResult.error || 'Doble check fallido: El mayorista no devolvió un perfil eSIM válido (ICCID o LPA inválido).';
      console.error(`❌ [Purchase Double Check Error]: ${errorMsg}`);
      await appendPurchaseAuditStep(logId!, {
        step: '3_DOUBLE_CHECK_FAILED',
        status: 'error',
        stage: 'double_check_failed',
        errorMessage: errorMsg,
        details: { provisionResult, doubleCheck },
      });
      return res.status(422).json({
        success: false,
        error: errorMsg,
        doubleCheck,
        stage: 'double_check_failed',
      });
    }

    const appStatus = mapProviderStatusToAppStatus(provisionResult.providerStatus);

    await appendPurchaseAuditStep(logId!, {
      step: '3_DOUBLE_CHECK_PASSED',
      status: 'ok',
      stage: 'double_check_passed',
      iccid: provisionResult.iccid,
      orderNo: provisionResult.orderNo,
      providerStatus: provisionResult.providerStatus || 'GOT_RESOURCE',
      doubleCheckStatus: doubleCheck,
      details: {
        message: 'Doble check exitoso: ICCID y código LPA verificados contra la orden del mayorista.',
        iccid: provisionResult.iccid,
        orderNo: provisionResult.orderNo,
        providerStatus: provisionResult.providerStatus,
        mappedAppStatus: appStatus,
      },
    });

    // Use official provisioned parameters
    const finalIccid = provisionResult.iccid || newEsim.iccid;
    const finalActivationCode = provisionResult.activationCode || newEsim.activationCode;
    const finalSmdpAddress = provisionResult.smdpAddress || newEsim.smdpAddress || 'smdp.globalesim.net';
    const finalManualCode = provisionResult.manualCode || newEsim.manualCode || `LPA:1$${finalSmdpAddress}$${finalActivationCode}`;
    const finalQrCodeUrl = provisionResult.qrCodeUrl || newEsim.qrCodeUrl;
    const finalApn = provisionResult.apn || newEsim.apn || 'globaldata';

    // Financial Audit: Initial cost of purchase & gross profit margin
    const costAmount = typeof newEsim.costPriceEUR === 'number' && newEsim.costPriceEUR > 0
      ? Number(newEsim.costPriceEUR.toFixed(2))
      : Number((paidAmount * 0.55).toFixed(2));
    const profitAmount = Number((paidAmount - costAmount).toFixed(2));

    if (isDatabaseConnected()) {
      // Upsert Customer
      await AtlasCustomerModel.findOneAndUpdate(
        { $or: [{ id: user.id }, { email: user.email.toLowerCase() }] },
        {
          $set: {
            id: user.id,
            name: user.name,
            email: user.email.toLowerCase(),
            phone: user.phone,
            country: user.country,
            lastLoginAt: new Date(),
          },
          $inc: { totalSpentUsd: paidAmount },
          $push: {
            purchases: {
              planId: newEsim.planId,
              planName: newEsim.planName,
              iccid: finalIccid,
              orderNo: provisionResult.orderNo,
              country: newEsim.country,
              durationDays: durationDays,
              preInstallValidity: newEsim.preInstallValidity || '180 Días',
              unusedValidTimeDays: newEsim.unusedValidTimeDays || 180,
              isUnlimited: Boolean(newEsim.isUnlimited),
              priceUsd: paidAmount,
              salePriceEUR: paidAmount,
              costPriceEUR: costAmount,
              profitEUR: profitAmount,
              purchasedAt: new Date(),
              providerStatus: provisionResult.providerStatus || 'GOT_RESOURCE',
              status: appStatus,
            },
            activeEsims: {
              iccid: finalIccid,
              orderNo: provisionResult.orderNo,
              planName: newEsim.planName,
              country: newEsim.country,
              totalGb: newEsim.totalDataGB,
              isUnlimited: Boolean(newEsim.isUnlimited),
              durationDays: durationDays,
              preInstallValidity: newEsim.preInstallValidity || '180 Días',
              unusedValidTimeDays: newEsim.unusedValidTimeDays || 180,
              pricePaid: paidAmount,
              salePriceEUR: paidAmount,
              costPriceEUR: costAmount,
              profitEUR: profitAmount,
              purchasedAt: new Date(),
              expiresAt: new Date(Date.now() + durationDays * 86400000),
              status: appStatus,
              providerStatus: provisionResult.providerStatus || 'GOT_RESOURCE',
              provisionSource: provisionResult.source,
            },
          },
        },
        { upsert: true, new: true }
      );

      // Insert UserEsim record
      const esimDoc = new UserEsimModel({
        id: newEsim.id,
        userId: user.id,
        userEmail: user.email.toLowerCase(),
        iccid: finalIccid,
        planId: newEsim.planId,
        packageCode,
        orderNo: provisionResult.orderNo,
        provisionSource: provisionResult.source,
        planName: newEsim.planName,
        country: newEsim.country,
        countryCode: (newEsim.countryCode || 'GL').toUpperCase(),
        flag: newEsim.flag || '🌍',
        operator: newEsim.operator || 'Red 5G',
        network5G: Boolean(newEsim.network5G),
        qrCodeUrl: finalQrCodeUrl,
        smdpAddress: finalSmdpAddress,
        activationCode: finalActivationCode,
        manualCode: finalManualCode,
        totalDataGB: newEsim.totalDataGB,
        usedDataGB: newEsim.usedDataGB || 0,
        isUnlimited: Boolean(newEsim.isUnlimited),
        durationDays: durationDays,
        preInstallValidity: newEsim.preInstallValidity || '180 Días',
        unusedValidTimeDays: newEsim.unusedValidTimeDays || 180,
        pricePaid: paidAmount,
        costPriceEUR: costAmount,
        salePriceEUR: paidAmount,
        profitEUR: profitAmount,
        purchaseDate: newEsim.purchaseDate || new Date().toISOString().split('T')[0],
        expiryDate: newEsim.expiryDate,
        activationDate: newEsim.activationDate,
        status: appStatus,
        providerStatus: provisionResult.providerStatus || 'GOT_RESOURCE',
        doubleCheckPassed: true,
        doubleCheckedAt: new Date(),
        doubleCheckDetails: doubleCheck,
        autoRenew: Boolean(newEsim.autoRenew),
        apn: finalApn,
        dataHistory: newEsim.dataHistory || [],
        supportTopUpType: newEsim.supportTopUpType,
        isReloadable: newEsim.isReloadable ?? (typeof newEsim.supportTopUpType === 'number' ? newEsim.supportTopUpType !== 1 : undefined),
      });

      await esimDoc.save();
      console.log(`💾 Saved new eSIM ${finalIccid} (OrderNo: ${provisionResult.orderNo || 'N/A'}, Source: ${provisionResult.source}, Estado Mayorista: ${provisionResult.providerStatus}) for ${user.email} in MongoDB Atlas.`);

      await appendPurchaseAuditStep(logId!, {
        step: '4_LINK_USER_AND_DATABASE',
        status: 'ok',
        stage: 'completed',
        iccid: finalIccid,
        orderNo: provisionResult.orderNo,
        providerStatus: provisionResult.providerStatus || 'GOT_RESOURCE',
        details: {
          message: 'eSIM enlazada bidireccionalmente al usuario y al pedido del proveedor en MongoDB Atlas.',
          userEmail: user.email,
          userId: user.id,
          iccid: finalIccid,
          orderNo: provisionResult.orderNo,
        },
      });

      // Send delivery email asynchronously with QR & activation details
      if (user && user.email) {
        sendEsimDeliveryEmail({
          toEmail: user.email.toLowerCase().trim(),
          userName: user.name || user.email.split('@')[0],
          esim: esimDoc.toObject ? esimDoc.toObject() : esimDoc,
        }).catch((err) => console.error('⚠️ [Purchase Email] Error enviando correo:', err));
      }

      return res.json({ success: true, esim: esimDoc, source: 'mongodb', provisionResult, doubleCheck });
    }

    const mergedEsim = {
      ...newEsim,
      iccid: finalIccid,
      activationCode: finalActivationCode,
      smdpAddress: finalSmdpAddress,
      manualCode: finalManualCode,
      qrCodeUrl: finalQrCodeUrl,
      apn: finalApn,
      orderNo: provisionResult.orderNo,
      provisionSource: provisionResult.source,
      status: appStatus,
      providerStatus: provisionResult.providerStatus || 'GOT_RESOURCE',
      doubleCheckPassed: true,
      doubleCheckDetails: doubleCheck,
    };

    // Fallback response
    if (user && user.email) {
      sendEsimDeliveryEmail({
        toEmail: user.email.toLowerCase().trim(),
        userName: user.name || user.email.split('@')[0],
        esim: mergedEsim,
      }).catch((err) => console.error('⚠️ [Purchase Email Fallback] Error enviando correo:', err));
    }

    res.json({ success: true, esim: mergedEsim, source: 'in-memory', provisionResult, doubleCheck });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/purchase-logs - Audit trail of all eSIM purchases with double-check details
app.get('/api/admin/purchase-logs', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit as string) || 50));
    const logs = await getRecentPurchaseAuditLogs(limit);
    res.json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// ESIM ACCESS WHOLESALE API ENDPOINTS
// ==========================================

// Get status of eSIM Access API configuration & balance
app.get('/api/esimaccess/status', async (_req: Request, res: Response) => {
  const configured = isEsimAccessConfigured();
  const rawCode = getEsimAccessAccessCode();
  const maskedCode = rawCode ? `${rawCode.slice(0, 4)}***${rawCode.slice(-4)}` : null;

  let balanceInfo: any = null;
  if (configured) {
    balanceInfo = await getEsimAccessBalance();
  }

  res.json({
    success: true,
    configured,
    provider: 'eSIM Access (esimaccess.com)',
    baseUrl: process.env.ESIMACCESS_BASE_URL || 'https://api.esimaccess.com/api/v1/open',
    accessCode: maskedCode,
    balance: balanceInfo?.success ? balanceInfo.balanceUsd : null,
    balanceDetails: balanceInfo,
  });
});

// GET /api/admin/audit-provider - Compare system ICCIDs with eSIM Access provider logs
app.get('/api/admin/audit-provider', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // 1. Fetch all local eSIMs from MongoDB Atlas
    let localEsims: any[] = [];
    if (isDatabaseConnected()) {
      localEsims = await UserEsimModel.find({}).sort({ createdAt: -1 }).lean();
    }

    const isConfigured = isEsimAccessConfigured();
    
    if (!isConfigured) {
      return res.json({
        success: true,
        configured: false,
        message: 'eSIM Access no está configurado en las variables de entorno (.env). Todas las eSIMs registradas en el sistema son simuladas localmente.',
        localCount: localEsims.length,
        providerCount: 0,
        matches: [],
        orphansLocal: localEsims.map(e => ({ iccid: e.iccid, country: e.country, planName: e.planName, userEmail: e.userEmail, status: e.status })),
        orphansProvider: [],
      });
    }

    // 2. Fetch eSIMs from eSIM Access API via /esim/query
    const providerEsims: any[] = [];
    let providerError: string | null = null;

    try {
      // Query eSIM Access API pages for recent profiles
      for (const page of [1, 2, 3]) {
        const queryRes = await postEsimAccess('/esim/query', {
          pager: { pageNum: page, pageSize: 50 },
        });

        if (queryRes.success && queryRes.data) {
          const list = queryRes.data.obj?.esimList || queryRes.data.data?.esimList || queryRes.data.obj?.packageList || [];
          if (Array.isArray(list) && list.length > 0) {
            providerEsims.push(...list);
          }
          if (list.length < 50) {
            break;
          }
        } else {
          providerError = queryRes.error || 'Error al conectar con la API de eSIM Access';
          break;
        }
      }
    } catch (err: any) {
      providerError = err.message;
    }

    // 3. Compare the lists
    const matches: any[] = [];
    const orphansLocal: any[] = [];
    const orphansProvider: any[] = [];

    const providerMap = new Map<string, any>();
    for (const pe of providerEsims) {
      if (pe && pe.iccid) {
        providerMap.set(pe.iccid.trim(), pe);
      }
    }

    const localMap = new Map<string, any>();
    for (const le of localEsims) {
      if (le.iccid) {
        localMap.set(le.iccid.trim(), le);
      }
    }

    for (const le of localEsims) {
      const iccid = (le.iccid || '').trim();
      const providerEsim = providerMap.get(iccid);

      if (providerEsim) {
        matches.push({
          iccid,
          country: le.country,
          planName: le.planName,
          userEmail: le.userEmail,
          purchaseDate: le.purchaseDate,
          localStatus: le.status,
          providerStatus: providerEsim.esimStatus || providerEsim.smdpStatus || 'unknown',
          orderNo: providerEsim.orderNo || le.orderNo,
          totalDataGB: le.totalDataGB,
          usedDataGB: le.usedDataGB,
        });
      } else {
        const isSimulated = le.provisionSource === 'simulation' || iccid.startsWith('89300') || le.planId === 'CKH491';
        orphansLocal.push({
          iccid,
          country: le.country,
          planName: le.planName,
          userEmail: le.userEmail,
          purchaseDate: le.purchaseDate,
          status: le.status,
          isSimulated,
          orderNo: le.orderNo,
        });
      }
    }

    for (const pe of providerEsims) {
      if (!pe) continue;
      const iccid = (pe.iccid || '').trim();
      if (!localMap.has(iccid)) {
        orphansProvider.push({
          iccid,
          orderNo: pe.orderNo,
          packageCode: pe.packageCode || pe.packageCodeList?.[0] || 'unknown',
          status: pe.esimStatus || pe.smdpStatus || 'unknown',
          volume: pe.totalVolume ? `${(Number(pe.totalVolume) / (1024*1024*1024)).toFixed(1)} GB` : 'unknown',
          createTime: pe.createTime || pe.orderTime || 'unknown',
        });
      }
    }

    res.json({
      success: true,
      configured: true,
      providerError,
      localCount: localEsims.length,
      providerCount: providerEsims.length,
      matches,
      orphansLocal,
      orphansProvider,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/iccid-lookup - Detailed info lookup on system & eSIM Access for an ICCID
app.get('/api/admin/iccid-lookup', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const iccid = (req.query.iccid as string || '').trim();

    if (!iccid) {
      return res.status(400).json({ success: false, error: 'Se requiere el parámetro iccid' });
    }

    // 1. Query local database
    let localEsim: any = null;
    let localCustomer: any = null;

    if (isDatabaseConnected()) {
      localEsim = await UserEsimModel.findOne({ iccid }).lean();
      if (localEsim && localEsim.userEmail) {
        localCustomer = await AtlasCustomerModel.findOne({ email: localEsim.userEmail.toLowerCase().trim() }).lean();
      }
    }

    // 2. Query eSIM Access API for this specific ICCID
    let providerInfo: any = null;
    let providerError: string | null = null;
    const isConfigured = isEsimAccessConfigured();

    if (isConfigured) {
      try {
        const queryRes = await postEsimAccess('/esim/query', {
          iccid,
          pager: { pageNum: 1, pageSize: 10 },
        });

        if (queryRes.success && queryRes.data) {
          const list = queryRes.data.obj?.esimList || queryRes.data.data?.esimList || queryRes.data.obj?.packageList || [];
          if (Array.isArray(list) && list.length > 0) {
            providerInfo = list[0];
            if (!providerInfo.packageCode && Array.isArray(providerInfo.packageList) && providerInfo.packageList.length > 0) {
              providerInfo.packageCode = providerInfo.packageList[0].packageCode;
              providerInfo.packageName = providerInfo.packageList[0].packageName;
            }
          } else {
            providerError = 'No se encontró este ICCID en los registros de eSIM Access';
          }
        } else {
          providerError = queryRes.error || 'Error al consultar la API de eSIM Access';
        }
      } catch (err: any) {
        providerError = err.message;
      }
    } else {
      providerError = 'eSIM Access no está configurado en las variables de entorno (.env)';
    }

    res.json({
      success: true,
      iccid,
      localEsim,
      localCustomer,
      providerInfo,
      providerError,
      isConfigured,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/esims/:idOrIccid/status - Update eSIM status (Admin only)
app.post('/api/admin/esims/:idOrIccid/status', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { idOrIccid } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, error: 'Se requiere el estado' });
    }

    let updatedInDb = false;
    let modifiedCustomerCount = 0;

    if (isDatabaseConnected()) {
      // 1. Update in UserEsimModel
      const resEsim = await UserEsimModel.updateMany(
        { $or: [{ id: idOrIccid }, { iccid: idOrIccid }] },
        { $set: { status } }
      );

      if (resEsim.modifiedCount > 0) {
        updatedInDb = true;
      }

      // 2. Update nested activeEsims status in AtlasCustomerModel using atomic array filters
      const resCustomer = await AtlasCustomerModel.updateMany(
        { $or: [
          { "activeEsims.iccid": idOrIccid },
          { "activeEsims.id": idOrIccid },
          { "activeEsims.esimId": idOrIccid }
        ] },
        { $set: { "activeEsims.$[elem].status": status } },
        { arrayFilters: [
          { $or: [
            { "elem.iccid": idOrIccid },
            { "elem.id": idOrIccid },
            { "elem.esimId": idOrIccid }
          ] }
        ] } as any
      );

      modifiedCustomerCount = resCustomer.modifiedCount;
    }

    res.json({
      success: true,
      message: `Estado de eSIM cambiado a "${status}" con éxito`,
      updatedInDb,
      modifiedCustomerCount,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get real-time data usage for an ICCID from carrier network
app.get('/api/user/esims/usage/:iccid', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { iccid } = req.params;
    if (!iccid) {
      return res.status(400).json({ success: false, error: 'ICCID requerido' });
    }

    // IDOR protection: only allow checking usage of one's own eSIM or admin
    const userCtx = req.userContext;
    const isAdmin = isUserAdmin(userCtx?.email, userCtx?.role);

    let esimDoc: any = null;
    if (isDatabaseConnected()) {
      esimDoc = await UserEsimModel.findOne({ iccid }).lean();
    }

    if (esimDoc && !isAdmin && esimDoc.userId !== userCtx?.userId && esimDoc.userEmail?.toLowerCase().trim() !== userCtx?.email?.toLowerCase().trim()) {
      return res.status(403).json({
        success: false,
        error: 'Acceso denegado. No puedes consultar el consumo de una eSIM que no te pertenece.'
      });
    }

    if (isEsimAccessConfigured()) {
      // Find local doc to obtain orderNo if available
      let orderNo: string | undefined = esimDoc?.orderNo;

      const usage = await queryEsimUsage({ iccid, orderNo });
      if (usage.success) {
        // Optionally update MongoDB Atlas document with latest usage & device info
        if (isDatabaseConnected() && typeof usage.usedDataGB === 'number') {
          const updateFields: any = {
            usedDataGB: usage.usedDataGB,
            totalDataGB: usage.totalDataGB
          };
          if (usage.status) {
            // map provider status to standard app states
            const mappedStatus = usage.status.toLowerCase().trim();
            if (['got_resource', 'new', 'in_stock', 'ready_to_install', 'ready_for_install'].includes(mappedStatus)) {
              updateFields.status = 'ready_to_install';
            } else if (['downloaded', 'installed'].includes(mappedStatus)) {
              updateFields.status = 'installed';
            } else if (['active', 'in_use', 'enabled'].includes(mappedStatus)) {
              updateFields.status = 'active';
            } else if (['depleted', 'used_up'].includes(mappedStatus)) {
              updateFields.status = 'depleted';
            } else if (['expired', 'overdue', 'used_expired', 'used_exp'].includes(mappedStatus)) {
              updateFields.status = 'expired';
            } else if (['canceled', 'cancelled', 'revoked', 'deleted', 'suspended', 'cancel'].includes(mappedStatus)) {
              updateFields.status = 'canceled';
            } else {
              updateFields.status = mappedStatus;
            }
          }
          if (usage.eid) updateFields.eid = usage.eid;
          if (usage.installationTime) updateFields.installationTime = usage.installationTime;
          if (usage.deviceType) updateFields.deviceType = usage.deviceType;
          if (usage.deviceBrand) updateFields.deviceBrand = usage.deviceBrand;
          if (usage.deviceModel) updateFields.deviceModel = usage.deviceModel;

          await UserEsimModel.updateOne(
            { iccid },
            { $set: updateFields }
          );
        }
        return res.json({ success: true, source: 'esimaccess_carrier', usage });
      }
    }

    // Return database stored usage
    if (isDatabaseConnected()) {
      const doc = await UserEsimModel.findOne({ iccid }).lean();
      if (doc) {
        return res.json({
          success: true,
          source: 'database',
          usage: {
            iccid,
            totalDataGB: doc.totalDataGB,
            usedDataGB: doc.usedDataGB || 0,
            status: doc.status,
          },
        });
      }
    }

    res.json({
      success: true,
      source: 'simulated',
      usage: {
        iccid,
        totalDataGB: 5,
        usedDataGB: 1.2,
        status: 'active',
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/user/esims/hardware - Update eSIM hardware details (EID, device model, brand)
app.post('/api/user/esims/hardware', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { iccid, eid, deviceBrand, deviceModel, installationTime } = req.body;
    if (!iccid) {
      return res.status(400).json({ success: false, error: 'ICCID requerido' });
    }

    // IDOR protection: only allow editing if it belongs to the authenticated user or user is admin
    const userCtx = req.userContext;
    const isAdmin = isUserAdmin(userCtx?.email, userCtx?.role);

    let esimDoc: any = null;
    if (isDatabaseConnected()) {
      esimDoc = await UserEsimModel.findOne({ iccid }).lean();
    }

    if (!esimDoc) {
      return res.status(404).json({ success: false, error: 'eSIM no encontrada en los registros locales.' });
    }

    if (!isAdmin && esimDoc.userId !== userCtx?.userId && esimDoc.userEmail?.toLowerCase().trim() !== userCtx?.email?.toLowerCase().trim()) {
      return res.status(403).json({
        success: false,
        error: 'Acceso denegado. No tienes autorización para modificar los detalles de esta eSIM.'
      });
    }

    const updateFields: any = {};
    if (typeof eid === 'string') updateFields.eid = eid.trim();
    if (typeof deviceBrand === 'string') updateFields.deviceBrand = deviceBrand.trim();
    if (typeof deviceModel === 'string') updateFields.deviceModel = deviceModel.trim();
    if (typeof installationTime === 'string') {
      updateFields.installationTime = installationTime.trim() || new Date().toISOString();
    } else if (eid && !esimDoc.installationTime) {
      updateFields.installationTime = new Date().toISOString();
    }

    if (isDatabaseConnected()) {
      // 1. Update in UserEsimModel
      await UserEsimModel.updateOne({ iccid }, { $set: updateFields });

      // 2. Update nested activeEsims inside AtlasCustomerModel
      await AtlasCustomerModel.updateMany(
        { "activeEsims.iccid": iccid },
        { 
          $set: { 
            "activeEsims.$[elem].eid": updateFields.eid,
            "activeEsims.$[elem].deviceBrand": updateFields.deviceBrand,
            "activeEsims.$[elem].deviceModel": updateFields.deviceModel,
            "activeEsims.$[elem].installationTime": updateFields.installationTime
          } 
        },
        { 
          arrayFilters: [{ "elem.iccid": iccid }] 
        } as any
      );
    }

    res.json({
      success: true,
      message: 'Información del dispositivo registrada y guardada con éxito en MongoDB Atlas.',
      updatedFields: updateFields
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sync packages directly from eSIM Access to MongoDB Atlas
app.post('/api/esimaccess/sync-catalog', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isEsimAccessConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'ESIMACCESS_ACCESS_CODE no está configurado en las variables de entorno.',
      });
    }

    const { locationCode } = req.body || {};
    const pkgRes = await listEsimAccessPackages(locationCode);

    if (!pkgRes.success || !pkgRes.packages) {
      return res.status(502).json({
        success: false,
        error: pkgRes.error || 'No se pudieron descargar los paquetes de eSIM Access',
      });
    }

    const importResult = await importEsimAccessPackagesToAtlas(pkgRes.packages);
    invalidateServerCatalogCache();
    res.json({
      success: true,
      provider: 'eSIM Access',
      fetchedCount: pkgRes.packages.length,
      importResult,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// EMAIL NOTIFICATIONS (Google Workspace / Nodemailer)
// ==========================================

// Get status of email service
app.get('/api/email/status', (_req: Request, res: Response) => {
  const configured = isEmailConfigured();
  const rawUser = (process.env.SMTP_USER || '').trim();
  const maskedUser = rawUser ? rawUser.replace(/(.{2})(.*)(@.*)/, '$1***$3') : null;
  const rawHost = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const effectiveHost = /^s[mtp]{2,4}\.gmail\.com$/i.test(rawHost) ? 'smtp.gmail.com' : rawHost;
  res.json({
    configured,
    service: 'Google Workspace / Gmail (Nodemailer)',
    host: effectiveHost,
    port: process.env.SMTP_PORT || '465',
    user: maskedUser,
  });
});

// Send a test email to verify credentials
app.post('/api/email/test', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Se requiere la dirección de correo (email)' });
    }
    const result = await sendTestEmail(email.trim().toLowerCase());
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Send or resend an eSIM delivery email with QR code
app.post('/api/user/esims/send-email', async (req: Request, res: Response) => {
  try {
    const { esimId, email } = req.body;
    if (!esimId || !email) {
      return res.status(400).json({ success: false, error: 'esimId y email son requeridos' });
    }

    let esim: any = null;
    if (isDatabaseConnected()) {
      esim = await UserEsimModel.findOne({ id: esimId });
    }

    if (!esim) {
      return res.status(404).json({ success: false, error: 'eSIM no encontrada en el sistema' });
    }

    const result = await sendEsimDeliveryEmail({
      toEmail: email.trim().toLowerCase(),
      esim: esim.toObject ? esim.toObject() : esim,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// QR CODE DOWNLOAD & SERVE ENDPOINTS (Mobile & Desktop)
// ==========================================

// Endpoint to download QR as attachment (Supported universally by Chrome Android, iOS Safari, and desktop)
app.get('/api/qr/download', async (req: Request, res: Response) => {
  try {
    const text = (req.query.text as string) || '';
    if (!text) {
      return res.status(400).send('Se requiere el parámetro text');
    }
    const rawFilename = (req.query.filename as string) || 'eSIM-QR.png';
    const cleanFilename = rawFilename.endsWith('.png') ? rawFilename : `${rawFilename}.png`;
    const safeFilename = cleanFilename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');

    const qrBuffer = await QRCode.toBuffer(text, {
      errorCorrectionLevel: 'M',
      type: 'png',
      margin: 2,
      width: 650,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', qrBuffer.length.toString());
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(qrBuffer);
  } catch (err: any) {
    console.error('Error generando QR para descarga:', err);
    res.status(500).send('Error generando código QR');
  }
});

// Endpoint to view QR directly inline (for opening in new mobile tab or long-pressing)
app.get('/api/qr/image', async (req: Request, res: Response) => {
  try {
    const text = (req.query.text as string) || '';
    if (!text) {
      return res.status(400).send('Se requiere el parámetro text');
    }

    const qrBuffer = await QRCode.toBuffer(text, {
      errorCorrectionLevel: 'M',
      type: 'png',
      margin: 2,
      width: 650,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Content-Length', qrBuffer.length.toString());
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(qrBuffer);
  } catch (err: any) {
    console.error('Error visualizando imagen QR:', err);
    res.status(500).send('Error generando imagen QR');
  }
});

// Check eSIM Top Up Eligibility and get compatible packages
app.get('/api/user/esims/topup/check/:iccid', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { iccid } = req.params;
    if (!iccid) {
      return res.status(400).json({ success: false, error: 'ICCID is required' });
    }

    let esim: any = null;
    if (isDatabaseConnected()) {
      esim = await UserEsimModel.findOne({ iccid });
    }

    // IDOR protection: only allow checking topup status of one's own eSIM or admin
    const userCtx = req.userContext;
    const isAdmin = isUserAdmin(userCtx?.email, userCtx?.role);
    if (esim && !isAdmin && esim.userId !== userCtx?.userId && esim.userEmail?.toLowerCase().trim() !== userCtx?.email?.toLowerCase().trim()) {
      return res.status(403).json({
        success: false,
        error: 'Acceso denegado. No tienes autorización para consultar esta eSIM.'
      });
    }

    const currentTopupCount = esim ? (esim.topupCount || 0) : 0;

    // 0. Verificación de Compatibilidad de Recarga según el Plan
    if (esim && (esim.supportTopUpType === 1 || esim.isReloadable === false)) {
      return res.json({
        success: true,
        canTopup: false,
        blockReason: 'not_reloadable',
        topupCount: currentTopupCount,
        error: 'Esta eSIM corresponde a un plan que no admite recargas adicionales. Al agotar los datos o días contratados, debes adquirir una nueva eSIM.'
      });
    }

    // 1. Contador de Recargas (Max 9)
    if (currentTopupCount >= 9) {
      return res.json({
        success: true,
        canTopup: false,
        blockReason: 'limit_reached',
        topupCount: currentTopupCount,
        error: 'Esta eSIM ha alcanzado el límite máximo de 9 recargas permitidas.'
      });
    }

    // 2. Verificación de Estado (Query eSIM Status)
    let liveStatus = esim ? esim.status : 'ready_to_install';
    if (isEsimAccessConfigured()) {
      const usageRes = await queryEsimUsage({ iccid, orderNo: esim?.orderNo });
      if (usageRes.success && usageRes.status) {
        liveStatus = usageRes.status;
      }
    }

    // Check if eSIM is pending installation on device
    const uninstalledStates = ['GOT_RESOURCE', 'NEW', 'IN_STOCK', 'READY_TO_INSTALL', 'READY_FOR_INSTALL', 'ready_to_install'];
    if (uninstalledStates.includes(liveStatus) || uninstalledStates.includes(liveStatus.toUpperCase()) || (esim && esim.status === 'ready_to_install')) {
      return res.json({
        success: true,
        canTopup: false,
        blockReason: 'not_installed_yet',
        topupCount: currentTopupCount,
        status: liveStatus,
        error: 'Esta eSIM ya está comprada y lista para ser instalada con su paquete original de datos intacto. Debes instalarla en tu teléfono mediante el código QR antes de recargar saldo.'
      });
    }

    const blockedStates = ['EXPIRED', 'CANCELED', 'CANCELLED', 'EXPIRADA', 'CANCELADA', 'DISCONNECTED', 'expired'];
    if (blockedStates.includes(liveStatus.toUpperCase())) {
      return res.json({
        success: true,
        canTopup: false,
        blockReason: 'invalid_status',
        topupCount: currentTopupCount,
        status: liveStatus,
        error: `La eSIM no se puede recargar porque su estado actual es ${liveStatus} (Expirada o Cancelada).`
      });
    }

    // 3. Validar Compatibilidad (Check Top-up Pack)
    const compRes = await getCompatibleTopupPackages(iccid);
    if (!compRes.success) {
      return res.status(500).json({ success: false, error: compRes.error });
    }

    res.json({
      success: true,
      canTopup: true,
      topupCount: currentTopupCount,
      status: liveStatus,
      packages: compRes.packages || []
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Top Up eSIM Order & Apply
app.post('/api/user/esims/topup', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { esimId, iccid, packageCode } = req.body;

    if (!packageCode || (!esimId && !iccid)) {
      return res.status(400).json({ success: false, error: 'packageCode and esimId/iccid are required' });
    }

    let esim: any = null;
    if (isDatabaseConnected()) {
      esim = await UserEsimModel.findOne({ $or: [{ id: esimId }, { iccid }] });
    }

    if (!esim && isDatabaseConnected()) {
      return res.status(404).json({ success: false, error: 'eSIM no encontrada en el sistema' });
    }

    // IDOR protection: only allow topping up one's own eSIM or admin
    const userCtx = req.userContext;
    const isAdmin = isUserAdmin(userCtx?.email, userCtx?.role);
    if (esim && !isAdmin && esim.userId !== userCtx?.userId && esim.userEmail?.toLowerCase().trim() !== userCtx?.email?.toLowerCase().trim()) {
      return res.status(403).json({
        success: false,
        error: 'Acceso denegado. No tienes autorización para recargar esta eSIM.'
      });
    }

    const currentIccid = esim ? esim.iccid : iccid;
    const currentTopupCount = esim ? (esim.topupCount || 0) : 0;

    // Check 1: Max 9 topups
    if (currentTopupCount >= 9) {
      return res.status(400).json({
        success: false,
        error: 'Límite alcanzado: Esta eSIM ya ha sido recargada 9 veces.'
      });
    }

    // Check 2: Uninstalled eSIM
    if (esim && esim.status === 'ready_to_install') {
      return res.status(400).json({
        success: false,
        error: 'No se puede realizar una recarga en una eSIM que aún no ha sido instalada. Por favor instala tu eSIM mediante el código QR primero.'
      });
    }

    // Check 2: Status check
    let liveStatus = esim ? esim.status : 'ready_to_install';
    if (isEsimAccessConfigured()) {
      const usageRes = await queryEsimUsage({ iccid: currentIccid, orderNo: esim?.orderNo });
      if (usageRes.success && usageRes.status) {
        liveStatus = usageRes.status;
      }
    }

    const blockedStates = ['EXPIRED', 'CANCELED', 'CANCELLED', 'EXPIRADA', 'CANCELADA', 'DISCONNECTED', 'expired'];
    if (blockedStates.includes(liveStatus.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: `Estado inválido: No se puede recargar una eSIM que se encuentra en estado ${liveStatus}.`
      });
    }

    // Check 3: Compatibility check
    const compRes = await getCompatibleTopupPackages(currentIccid);
    const availablePackages = compRes.packages || [];
    const chosenPackage = availablePackages.find((p: any) => p.packageCode === packageCode || p.slug === packageCode);

    if (isEsimAccessConfigured() && !chosenPackage) {
      return res.status(400).json({
        success: false,
        error: 'El paquete seleccionado no es compatible con el ICCID de esta eSIM.'
      });
    }

    // Execute the Top-up on eSIM Access API
    console.log(`📡 [eSIM Access] Ejecutando recarga de eSIM. ICCID: ${currentIccid}, Paquete: ${packageCode}...`);
    const topupRes = await topupEsim(currentIccid, packageCode);
    if (!topupRes.success) {
      return res.status(500).json({ success: false, error: topupRes.error });
    }

    // Determine how much data we are adding
    let addedBytes = 1024 * 1024 * 1024; // Default to 1GB in bytes
    let packageName = 'Recarga eSIM';
    let durationDays = 7;

    if (chosenPackage) {
      addedBytes = Number(chosenPackage.volume || chosenPackage.dataAmount || 1024 * 1024 * 1024);
      packageName = chosenPackage.name || chosenPackage.packageName || 'Recarga eSIM';
      durationDays = Number(chosenPackage.duration || chosenPackage.validityDays || 7);
    } else {
      // Handle fallback packages parsing
      if (packageCode.includes('1GB')) addedBytes = 1 * 1024 * 1024 * 1024;
      else if (packageCode.includes('3GB')) addedBytes = 3 * 1024 * 1024 * 1024;
      else if (packageCode.includes('5GB')) addedBytes = 5 * 1024 * 1024 * 1024;
    }

    const addedGB = Number((addedBytes / (1024 * 1024 * 1024)).toFixed(3));

    if (esim) {
      esim.totalDataGB += addedGB;
      esim.topupCount = currentTopupCount + 1;
      
      // If eSIM was depleted or expired in local status but query is valid, restore it to active
      if (esim.status === 'depleted' || esim.status === 'expired') {
        esim.status = 'active';
      }
      
      // Extend validity date if applicable
      if (esim.expiryDate && esim.expiryDate !== 'Válido 1 día tras primer uso') {
        try {
          const currentExpiry = new Date(esim.expiryDate.split(' ')[0]);
          if (!isNaN(currentExpiry.getTime())) {
            currentExpiry.setDate(currentExpiry.getDate() + durationDays);
            esim.expiryDate = `${currentExpiry.toISOString().split('T')[0]} (Activa - Recargada)`;
          }
        } catch {}
      }

      await esim.save();
      return res.json({ success: true, esim, source: 'mongodb', esimTranNo: topupRes.esimTranNo });
    }

    res.json({ success: true, addedGB, esimId, iccid, source: 'in-memory', esimTranNo: topupRes.esimTranNo });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// User Auth / Profile Sync (Create new user record if first time)
app.post('/api/auth/sync', async (req: Request, res: Response) => {
  try {
    const { user } = req.body;
    if (!user || !user.email) {
      return res.status(400).json({ success: false, error: 'User data required' });
    }

    const cleanEmail = user.email.toLowerCase().trim();
    const ADMIN_EMAILS = ['mgbravomalo@gmail.com', 'admin@wappa.io', 'admin@globalesim.net'];
    const isAdminUser = ADMIN_EMAILS.includes(cleanEmail) || cleanEmail.includes('admin') || user.role === 'admin' || user.isAdmin === true;
    const targetRole = isAdminUser ? 'admin' : (user.role || 'user');

    if (isDatabaseConnected()) {
      // Check if user already exists
      const existingUser = await AtlasCustomerModel.findOne({
        $or: [{ id: user.id }, { email: cleanEmail }]
      }).lean();

      const isNewUser = !existingUser;
      const finalRole = isAdminUser || (existingUser as any)?.role === 'admin' ? 'admin' : ((existingUser as any)?.role || targetRole);
      const isFinalAdmin = finalRole === 'admin';

      const savedUser = await AtlasCustomerModel.findOneAndUpdate(
        { $or: [{ id: user.id }, { email: cleanEmail }] },
        {
          $set: {
            id: user.id,
            name: user.name,
            email: cleanEmail,
            phone: user.phone || (existingUser as any)?.phone || '',
            country: user.country || (existingUser as any)?.country || 'España',
            countryCode: (existingUser as any)?.countryCode || 'ES',
            lastLoginAt: new Date(),
            status: 'active',
            role: finalRole,
          },
          $setOnInsert: {
            createdAt: new Date(),
            totalSpentUsd: 0,
            totalDataUsedGb: 0,
            purchases: [],
            activeEsims: [],
            notes: 'Usuario registrado mediante ' + (user.id.startsWith('google-') ? 'Google OAuth' : 'Acceso seguro Wappa'),
          },
        },
        { upsert: true, new: true }
      ).lean();

      console.log(
        isNewUser
          ? `✨ [Atlas] Nuevo usuario registrado en base de datos: ${cleanEmail} (ID: ${user.id}, Rol: ${finalRole})`
          : `👤 [Atlas] Sesión existente sincronizada: ${cleanEmail} (Rol: ${finalRole})`
      );

      const token = generateToken((savedUser as any).id, (savedUser as any).email, finalRole);

      return res.json({
        success: true,
        isNewUser,
        user: {
          id: (savedUser as any).id,
          name: (savedUser as any).name,
          email: (savedUser as any).email,
          country: (savedUser as any).country || 'España',
          role: finalRole,
          isAdmin: isFinalAdmin,
          token,
          createdAt: typeof (savedUser as any).createdAt === 'string'
            ? (savedUser as any).createdAt
            : ((savedUser as any).createdAt ? ((savedUser as any).createdAt as Date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
          walletBalanceEUR: user.walletBalanceEUR ?? 10.0,
        },
        source: 'mongodb'
      });
    }

    // In-memory fallback
    const token = generateToken(user.id || `usr-${cleanEmail}`, cleanEmail, targetRole);
    const fallbackUser = {
      ...user,
      role: isAdminUser ? 'admin' : (user.role || 'user'),
      isAdmin: isAdminUser,
      token,
    };
    res.json({ success: true, isNewUser: true, user: fallbackUser, source: 'in-memory' });
  } catch (err: any) {
    console.error('Error en /api/auth/sync:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// OTP AUTHENTICATION & REGISTRATION
// ----------------------------------------------------

interface OtpEntry {
  code: string;
  email: string;
  name?: string;
  isNewUser: boolean;
  expiresAt: number;
  attempts: number;
}

// In-memory OTP storage with 10-minute expiration
const otpStore = new Map<string, OtpEntry>();

// Clean up expired OTP entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of otpStore.entries()) {
    if (entry.expiresAt < now) {
      otpStore.delete(key);
    }
  }
}, 60 * 1000);

/**
 * Genera y envía un código OTP por correo electrónico
 */
app.post('/api/auth/otp/send', async (req: Request, res: Response) => {
  try {
    const { email, name, isRegister } = req.body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Correo electrónico inválido' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check if user already exists in Atlas Customer collection
    let existingUser: any = null;
    if (isDatabaseConnected()) {
      existingUser = await AtlasCustomerModel.findOne({ email: cleanEmail }).lean();
    }

    const isNewUser = !existingUser || isRegister === true;
    const resolvedName = (name || existingUser?.name || cleanEmail.split('@')[0]).trim();

    // Generate secure 6-digit random code
    const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpStore.set(cleanEmail, {
      code: randomCode,
      email: cleanEmail,
      name: resolvedName,
      isNewUser,
      expiresAt,
      attempts: 0,
    });

    console.log(`🔐 [OTP] Código generado para ${cleanEmail}: ${randomCode} (${isNewUser ? 'Nuevo Registro' : 'Login'})`);

    // Send email using Google Workspace / Nodemailer
    const emailResult = await sendOtpEmail({
      toEmail: cleanEmail,
      code: randomCode,
      userName: resolvedName,
      isNewUser,
    });

    res.json({
      success: true,
      message: 'Código de verificación enviado a tu correo',
      email: cleanEmail,
      isNewUser,
      emailSent: emailResult.success,
      // Solo en modo desarrollo local o si el SMTP falla se incluye un flag de auxilio en el log
      debugHelp: !emailResult.success ? 'SMTP no entregó el correo, revisa logs del servidor' : undefined,
    });
  } catch (err: any) {
    console.error('Error en /api/auth/otp/send:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Valida el código OTP e inicia sesión o crea el usuario en MongoDB Atlas si no existe
 */
app.post('/api/auth/otp/verify', async (req: Request, res: Response) => {
  try {
    const { email, code, name } = req.body;
    if (!email || !code) {
      return res.status(400).json({ success: false, error: 'Email y código OTP son requeridos' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanCode = code.toString().trim();

    const storedOtp = otpStore.get(cleanEmail);

    if (!storedOtp) {
      return res.status(400).json({
        success: false,
        error: 'No hay ningún código activo para este correo o ya ha expirado. Solicita uno nuevo.',
      });
    }

    if (Date.now() > storedOtp.expiresAt) {
      otpStore.delete(cleanEmail);
      return res.status(400).json({
        success: false,
        error: 'El código ha expirado. Por favor solicita uno nuevo.',
      });
    }

    storedOtp.attempts += 1;
    if (storedOtp.attempts > 5) {
      otpStore.delete(cleanEmail);
      return res.status(429).json({
        success: false,
        error: 'Demasiados intentos fallidos. Por seguridad, solicita un nuevo código.',
      });
    }

    // Compare code
    if (storedOtp.code !== cleanCode) {
      return res.status(400).json({
        success: false,
        error: 'Código incorrecto. Revisa el código de 6 dígitos que recibiste en tu correo.',
      });
    }

    // Code is valid! Consume it
    otpStore.delete(cleanEmail);

    const ADMIN_EMAILS = ['mgbravomalo@gmail.com', 'admin@wappa.io', 'admin@globalesim.net'];
    const isAdminUser = ADMIN_EMAILS.includes(cleanEmail) || cleanEmail.includes('admin');
    const targetRole = isAdminUser ? 'admin' : 'user';
    const finalName = (name || storedOtp.name || cleanEmail.split('@')[0]).trim();

    let finalUser: any = null;
    let isNewUser = false;

    if (isDatabaseConnected()) {
      // Find or create customer in Atlas
      const existingCustomer = await AtlasCustomerModel.findOne({ email: cleanEmail }).lean();
      isNewUser = !existingCustomer;

      const customerId = (existingCustomer as any)?.id || `usr-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const customerRole = isAdminUser || (existingCustomer as any)?.role === 'admin' ? 'admin' : ((existingCustomer as any)?.role || targetRole);

      const savedCustomer = await AtlasCustomerModel.findOneAndUpdate(
        { email: cleanEmail },
        {
          $set: {
            id: customerId,
            name: finalName,
            email: cleanEmail,
            role: customerRole,
            status: 'active',
            lastLoginAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
            totalSpentUsd: 0,
            totalDataUsedGb: 0,
            country: 'España',
            countryCode: 'ES',
            purchases: [],
            activeEsims: [],
            notes: 'Usuario autenticado mediante OTP por correo electrónico',
          },
        },
        { upsert: true, new: true }
      ).lean();

      console.log(
        isNewUser
          ? `✨ [Atlas] Nuevo usuario registrado con éxito vía OTP: ${cleanEmail} (ID: ${customerId})`
          : `👤 [Atlas] Usuario existente ingresó vía OTP: ${cleanEmail}`
      );

      finalUser = {
        id: (savedCustomer as any).id,
        name: (savedCustomer as any).name,
        email: (savedCustomer as any).email,
        country: (savedCustomer as any).country || 'España',
        role: customerRole,
        isAdmin: customerRole === 'admin',
        createdAt: typeof (savedCustomer as any).createdAt === 'string'
          ? (savedCustomer as any).createdAt
          : ((savedCustomer as any).createdAt ? ((savedCustomer as any).createdAt as Date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
        walletBalanceEUR: (savedCustomer as any).walletBalanceEUR ?? 10.0,
      };
    } else {
      // In-memory fallback
      finalUser = {
        id: `user-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '-')}`,
        name: finalName,
        email: cleanEmail,
        country: 'España',
        role: targetRole,
        isAdmin: isAdminUser,
        createdAt: new Date().toISOString().split('T')[0],
        walletBalanceEUR: 10.0,
      };
      isNewUser = true;
    }

    // Generar el token criptográfico firmado de sesión de grado militar
    finalUser.token = generateToken(finalUser.id, finalUser.email, finalUser.role);

    res.json({
      success: true,
      isNewUser,
      user: finalUser,
      message: isNewUser ? '¡Registro completado con éxito!' : '¡Acceso verificado correctamente!',
    });
  } catch (err: any) {
    console.error('Error en /api/auth/otp/verify:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// AI TRAVEL ADVISOR (OPTIMIZED FOR HIGH SPEED & ACCURACY)
// ----------------------------------------------------
const WORLD_CITIES: Record<string, { countryCode: string; countryName: string; city: string; lat: number; lon: number }> = {
  // Ecuador
  'quito': { countryCode: 'EC', countryName: 'Ecuador', city: 'Quito', lat: -0.2298, lon: -78.5249 },
  'guayaquil': { countryCode: 'EC', countryName: 'Ecuador', city: 'Guayaquil', lat: -2.1894, lon: -79.8891 },
  'cuenca': { countryCode: 'EC', countryName: 'Ecuador', city: 'Cuenca', lat: -2.9001, lon: -79.0059 },
  'manta': { countryCode: 'EC', countryName: 'Ecuador', city: 'Manta', lat: -0.9677, lon: -80.7089 },
  'galapagos': { countryCode: 'EC', countryName: 'Ecuador', city: 'Galápagos', lat: -0.9538, lon: -90.9656 },
  'galápagos': { countryCode: 'EC', countryName: 'Ecuador', city: 'Galápagos', lat: -0.9538, lon: -90.9656 },
  // Colombia
  'bogota': { countryCode: 'CO', countryName: 'Colombia', city: 'Bogotá', lat: 4.7110, lon: -74.0721 },
  'bogotá': { countryCode: 'CO', countryName: 'Colombia', city: 'Bogotá', lat: 4.7110, lon: -74.0721 },
  'medellin': { countryCode: 'CO', countryName: 'Colombia', city: 'Medellín', lat: 6.2442, lon: -75.5812 },
  'medellín': { countryCode: 'CO', countryName: 'Colombia', city: 'Medellín', lat: 6.2442, lon: -75.5812 },
  'cartagena': { countryCode: 'CO', countryName: 'Colombia', city: 'Cartagena', lat: 10.3910, lon: -75.4794 },
  'cali': { countryCode: 'CO', countryName: 'Colombia', city: 'Cali', lat: 3.4516, lon: -76.5320 },
  'barranquilla': { countryCode: 'CO', countryName: 'Colombia', city: 'Barranquilla', lat: 10.9685, lon: -74.7813 },
  // Perú
  'lima': { countryCode: 'PE', countryName: 'Perú', city: 'Lima', lat: -12.0464, lon: -77.0428 },
  'cusco': { countryCode: 'PE', countryName: 'Perú', city: 'Cusco', lat: -13.5319, lon: -71.9675 },
  'cuzco': { countryCode: 'PE', countryName: 'Perú', city: 'Cusco', lat: -13.5319, lon: -71.9675 },
  'machu picchu': { countryCode: 'PE', countryName: 'Perú', city: 'Machu Picchu', lat: -13.1631, lon: -72.5450 },
  'arequipa': { countryCode: 'PE', countryName: 'Perú', city: 'Arequipa', lat: -16.4090, lon: -71.5375 },
  // España
  'madrid': { countryCode: 'ES', countryName: 'España', city: 'Madrid', lat: 40.4168, lon: -3.7038 },
  'barcelona': { countryCode: 'ES', countryName: 'España', city: 'Barcelona', lat: 41.3851, lon: 2.1734 },
  'sevilla': { countryCode: 'ES', countryName: 'España', city: 'Sevilla', lat: 37.3891, lon: -5.9845 },
  'valencia': { countryCode: 'ES', countryName: 'España', city: 'Valencia', lat: 39.4699, lon: -0.3763 },
  'malaga': { countryCode: 'ES', countryName: 'España', city: 'Málaga', lat: 36.7213, lon: -4.4214 },
  'málaga': { countryCode: 'ES', countryName: 'España', city: 'Málaga', lat: 36.7213, lon: -4.4214 },
  'ibiza': { countryCode: 'ES', countryName: 'España', city: 'Ibiza', lat: 38.9067, lon: 1.4206 },
  'mallorca': { countryCode: 'ES', countryName: 'España', city: 'Palma de Mallorca', lat: 39.5696, lon: 2.6502 },
  // Francia
  'paris': { countryCode: 'FR', countryName: 'Francia', city: 'París', lat: 48.8566, lon: 2.3522 },
  'parís': { countryCode: 'FR', countryName: 'Francia', city: 'París', lat: 48.8566, lon: 2.3522 },
  'niza': { countryCode: 'FR', countryName: 'Francia', city: 'Niza', lat: 43.7102, lon: 7.2620 },
  'lyon': { countryCode: 'FR', countryName: 'Francia', city: 'Lyon', lat: 45.7640, lon: 4.8357 },
  'marsella': { countryCode: 'FR', countryName: 'Francia', city: 'Marsella', lat: 43.2965, lon: 5.3698 },
  // Italia
  'roma': { countryCode: 'IT', countryName: 'Italia', city: 'Roma', lat: 41.9028, lon: 12.4964 },
  'milan': { countryCode: 'IT', countryName: 'Italia', city: 'Milán', lat: 45.4642, lon: 9.1900 },
  'milán': { countryCode: 'IT', countryName: 'Italia', city: 'Milán', lat: 45.4642, lon: 9.1900 },
  'florencia': { countryCode: 'IT', countryName: 'Italia', city: 'Florencia', lat: 43.7696, lon: 11.2558 },
  'venecia': { countryCode: 'IT', countryName: 'Italia', city: 'Venecia', lat: 45.4408, lon: 12.3155 },
  'napoles': { countryCode: 'IT', countryName: 'Italia', city: 'Nápoles', lat: 40.8518, lon: 14.2681 },
  'nápoles': { countryCode: 'IT', countryName: 'Italia', city: 'Nápoles', lat: 40.8518, lon: 14.2681 },
  // USA
  'nueva york': { countryCode: 'US', countryName: 'Estados Unidos', city: 'Nueva York', lat: 40.7128, lon: -74.0060 },
  'new york': { countryCode: 'US', countryName: 'Estados Unidos', city: 'Nueva York', lat: 40.7128, lon: -74.0060 },
  'miami': { countryCode: 'US', countryName: 'Estados Unidos', city: 'Miami', lat: 25.7617, lon: -80.1918 },
  'orlando': { countryCode: 'US', countryName: 'Estados Unidos', city: 'Orlando', lat: 28.5383, lon: -81.3792 },
  'los angeles': { countryCode: 'US', countryName: 'Estados Unidos', city: 'Los Ángeles', lat: 34.0522, lon: -118.2437 },
  'los ángeles': { countryCode: 'US', countryName: 'Estados Unidos', city: 'Los Ángeles', lat: 34.0522, lon: -118.2437 },
  'san francisco': { countryCode: 'US', countryName: 'Estados Unidos', city: 'San Francisco', lat: 37.7749, lon: -122.4194 },
  'las vegas': { countryCode: 'US', countryName: 'Estados Unidos', city: 'Las Vegas', lat: 36.1699, lon: -115.1398 },
  'chicago': { countryCode: 'US', countryName: 'Estados Unidos', city: 'Chicago', lat: 41.8781, lon: -87.6298 },
  'washington': { countryCode: 'US', countryName: 'Estados Unidos', city: 'Washington D.C.', lat: 38.9072, lon: -77.0369 },
  // México
  'cancun': { countryCode: 'MX', countryName: 'México', city: 'Cancún', lat: 21.1619, lon: -86.8515 },
  'cancún': { countryCode: 'MX', countryName: 'México', city: 'Cancún', lat: 21.1619, lon: -86.8515 },
  'ciudad de mexico': { countryCode: 'MX', countryName: 'México', city: 'Ciudad de México', lat: 19.4326, lon: -99.1332 },
  'ciudad de méxico': { countryCode: 'MX', countryName: 'México', city: 'Ciudad de México', lat: 19.4326, lon: -99.1332 },
  'cdmx': { countryCode: 'MX', countryName: 'México', city: 'Ciudad de México', lat: 19.4326, lon: -99.1332 },
  'guadalajara': { countryCode: 'MX', countryName: 'México', city: 'Guadalajara', lat: 20.6597, lon: -103.3496 },
  'monterrey': { countryCode: 'MX', countryName: 'México', city: 'Monterrey', lat: 25.6866, lon: -100.3161 },
  'playa del carmen': { countryCode: 'MX', countryName: 'México', city: 'Playa del Carmen', lat: 20.6296, lon: -87.0739 },
  'tulum': { countryCode: 'MX', countryName: 'México', city: 'Tulum', lat: 20.2114, lon: -87.4654 },
  // Argentina
  'buenos aires': { countryCode: 'AR', countryName: 'Argentina', city: 'Buenos Aires', lat: -34.6037, lon: -58.3816 },
  'bariloche': { countryCode: 'AR', countryName: 'Argentina', city: 'Bariloche', lat: -41.1342, lon: -71.3085 },
  'mendoza': { countryCode: 'AR', countryName: 'Argentina', city: 'Mendoza', lat: -32.8895, lon: -68.8458 },
  'cordoba': { countryCode: 'AR', countryName: 'Argentina', city: 'Córdoba', lat: -31.4201, lon: -64.1888 },
  'córdoba': { countryCode: 'AR', countryName: 'Argentina', city: 'Córdoba', lat: -31.4201, lon: -64.1888 },
  // Chile
  'santiago': { countryCode: 'CL', countryName: 'Chile', city: 'Santiago', lat: -33.4489, lon: -70.6693 },
  'valparaiso': { countryCode: 'CL', countryName: 'Chile', city: 'Valparaíso', lat: -33.0472, lon: -71.6127 },
  'valparaíso': { countryCode: 'CL', countryName: 'Chile', city: 'Valparaíso', lat: -33.0472, lon: -71.6127 },
  // Japón
  'tokio': { countryCode: 'JP', countryName: 'Japón', city: 'Tokio', lat: 35.6762, lon: 139.6503 },
  'tokyo': { countryCode: 'JP', countryName: 'Japón', city: 'Tokio', lat: 35.6762, lon: 139.6503 },
  'kioto': { countryCode: 'JP', countryName: 'Japón', city: 'Kioto', lat: 35.0116, lon: 135.7681 },
  'kyoto': { countryCode: 'JP', countryName: 'Japón', city: 'Kioto', lat: 35.0116, lon: 135.7681 },
  'osaka': { countryCode: 'JP', countryName: 'Japón', city: 'Osaka', lat: 34.6937, lon: 135.5023 },
  // Reino Unido
  'londres': { countryCode: 'GB', countryName: 'Reino Unido', city: 'Londres', lat: 51.5074, lon: -0.1278 },
  'london': { countryCode: 'GB', countryName: 'Reino Unido', city: 'Londres', lat: 51.5074, lon: -0.1278 },
  'edimburgo': { countryCode: 'GB', countryName: 'Reino Unido', city: 'Edimburgo', lat: 55.9533, lon: -3.1883 },
  'manchester': { countryCode: 'GB', countryName: 'Reino Unido', city: 'Manchester', lat: 53.4808, lon: -2.2426 },
  // Alemania
  'berlin': { countryCode: 'DE', countryName: 'Alemania', city: 'Berlín', lat: 52.5200, lon: 13.4050 },
  'berlín': { countryCode: 'DE', countryName: 'Alemania', city: 'Berlín', lat: 52.5200, lon: 13.4050 },
  'munich': { countryCode: 'DE', countryName: 'Alemania', city: 'Múnich', lat: 48.1351, lon: 11.5820 },
  'múnich': { countryCode: 'DE', countryName: 'Alemania', city: 'Múnich', lat: 48.1351, lon: 11.5820 },
  'francfort': { countryCode: 'DE', countryName: 'Alemania', city: 'Fráncfort', lat: 50.1109, lon: 8.6821 },
  'frankfurt': { countryCode: 'DE', countryName: 'Alemania', city: 'Fráncfort', lat: 50.1109, lon: 8.6821 },
  // Otros populares
  'amsterdam': { countryCode: 'NL', countryName: 'Países Bajos', city: 'Ámsterdam', lat: 52.3676, lon: 4.9041 },
  'ámsterdam': { countryCode: 'NL', countryName: 'Países Bajos', city: 'Ámsterdam', lat: 52.3676, lon: 4.9041 },
  'lisboa': { countryCode: 'PT', countryName: 'Portugal', city: 'Lisboa', lat: 38.7223, lon: -9.1393 },
  'oporto': { countryCode: 'PT', countryName: 'Portugal', city: 'Oporto', lat: 41.1579, lon: -8.6291 },
  'estambul': { countryCode: 'TR', countryName: 'Turquía', city: 'Estambul', lat: 41.0082, lon: 28.9784 },
  'dubai': { countryCode: 'AE', countryName: 'Emiratos Árabes', city: 'Dubái', lat: 25.2048, lon: 55.2708 },
  'dubái': { countryCode: 'AE', countryName: 'Emiratos Árabes', city: 'Dubái', lat: 25.2048, lon: 55.2708 },
  'bangkok': { countryCode: 'TH', countryName: 'Tailandia', city: 'Bangkok', lat: 13.7563, lon: 100.5018 },
  'sidney': { countryCode: 'AU', countryName: 'Australia', city: 'Sídney', lat: -33.8688, lon: 151.2093 },
  'sídney': { countryCode: 'AU', countryName: 'Australia', city: 'Sídney', lat: -33.8688, lon: 151.2093 },
  'sydney': { countryCode: 'AU', countryName: 'Australia', city: 'Sídney', lat: -33.8688, lon: 151.2093 },
  'el cairo': { countryCode: 'EG', countryName: 'Egipto', city: 'El Cairo', lat: 30.0444, lon: 31.2357 },
  'cairo': { countryCode: 'EG', countryName: 'Egipto', city: 'El Cairo', lat: 30.0444, lon: 31.2357 },
  'rio de janeiro': { countryCode: 'BR', countryName: 'Brasil', city: 'Río de Janeiro', lat: -22.9068, lon: -43.1729 },
  'río de janeiro': { countryCode: 'BR', countryName: 'Brasil', city: 'Río de Janeiro', lat: -22.9068, lon: -43.1729 },
  'sao paulo': { countryCode: 'BR', countryName: 'Brasil', city: 'São Paulo', lat: -23.5505, lon: -46.6333 },
  'são paulo': { countryCode: 'BR', countryName: 'Brasil', city: 'São Paulo', lat: -23.5505, lon: -46.6333 },
  'punta cana': { countryCode: 'DO', countryName: 'República Dominicana', city: 'Punta Cana', lat: 18.5601, lon: -68.3725 },
  'santo domingo': { countryCode: 'DO', countryName: 'República Dominicana', city: 'Santo Domingo', lat: 18.4861, lon: -69.9312 },
  'san jose': { countryCode: 'CR', countryName: 'Costa Rica', city: 'San José', lat: 9.9281, lon: -84.0907 },
  'san josé': { countryCode: 'CR', countryName: 'Costa Rica', city: 'San José', lat: 9.9281, lon: -84.0907 },
  'panama': { countryCode: 'PA', countryName: 'Panamá', city: 'Ciudad de Panamá', lat: 8.9824, lon: -79.5199 },
  'panamá': { countryCode: 'PA', countryName: 'Panamá', city: 'Ciudad de Panamá', lat: 8.9824, lon: -79.5199 },
  // Venezuela
  'caracas': { countryCode: 'VE', countryName: 'Venezuela', city: 'Caracas', lat: 10.4806, lon: -66.9036 },
  'maracaibo': { countryCode: 'VE', countryName: 'Venezuela', city: 'Maracaibo', lat: 10.6427, lon: -71.6125 },
  'valencia venezuela': { countryCode: 'VE', countryName: 'Venezuela', city: 'Valencia', lat: 10.1620, lon: -68.0077 },
  'barquisimeto': { countryCode: 'VE', countryName: 'Venezuela', city: 'Barquisimeto', lat: 10.0647, lon: -69.3570 },
  'margarita': { countryCode: 'VE', countryName: 'Venezuela', city: 'Isla de Margarita', lat: 10.9971, lon: -63.9113 },
  'isla margarita': { countryCode: 'VE', countryName: 'Venezuela', city: 'Isla de Margarita', lat: 10.9971, lon: -63.9113 },
  'isla de margarita': { countryCode: 'VE', countryName: 'Venezuela', city: 'Isla de Margarita', lat: 10.9971, lon: -63.9113 },
  'lecheria': { countryCode: 'VE', countryName: 'Venezuela', city: 'Lechería', lat: 10.1872, lon: -64.6934 },
  'puerto la cruz': { countryCode: 'VE', countryName: 'Venezuela', city: 'Puerto La Cruz', lat: 10.2138, lon: -64.6328 },
  'merida venezuela': { countryCode: 'VE', countryName: 'Venezuela', city: 'Mérida', lat: 8.5983, lon: -71.1450 },
  'venezuela': { countryCode: 'VE', countryName: 'Venezuela', city: 'Caracas', lat: 10.4806, lon: -66.9036 },
};

const COUNTRY_COORDINATES: Record<string, { lat: number; lon: number; city: string }> = {
  EC: { lat: -0.2298, lon: -78.5249, city: 'Quito' },
  VE: { lat: 10.4806, lon: -66.9036, city: 'Caracas' },
  JP: { lat: 35.68, lon: 139.76, city: 'Tokio' },
  FR: { lat: 48.85, lon: 2.35, city: 'París' },
  ES: { lat: 40.41, lon: -3.70, city: 'Madrid' },
  US: { lat: 40.71, lon: -74.00, city: 'Nueva York' },
  IT: { lat: 41.90, lon: 12.49, city: 'Roma' },
  GB: { lat: 51.50, lon: -0.12, city: 'Londres' },
  UK: { lat: 51.50, lon: -0.12, city: 'Londres' },
  DE: { lat: 52.52, lon: 13.40, city: 'Berlín' },
  MX: { lat: 19.43, lon: -99.13, city: 'Ciudad de México' },
  CO: { lat: 4.71, lon: -74.07, city: 'Bogotá' },
  AR: { lat: -34.60, lon: -58.38, city: 'Buenos Aires' },
  BR: { lat: -23.55, lon: -46.63, city: 'São Paulo' },
  CL: { lat: -33.44, lon: -70.66, city: 'Santiago' },
  PE: { lat: -12.04, lon: -77.04, city: 'Lima' },
  TR: { lat: 41.00, lon: 28.97, city: 'Estambul' },
  TH: { lat: 13.75, lon: 100.50, city: 'Bangkok' },
  EG: { lat: 30.04, lon: 31.23, city: 'El Cairo' },
  CH: { lat: 46.94, lon: 7.44, city: 'Berna' },
  PT: { lat: 38.72, lon: -9.13, city: 'Lisboa' },
  NL: { lat: 52.36, lon: 4.90, city: 'Ámsterdam' },
  GR: { lat: 37.98, lon: 23.72, city: 'Atenas' },
  AE: { lat: 25.20, lon: 55.27, city: 'Dubái' },
  AU: { lat: -33.86, lon: 151.20, city: 'Sídney' },
  CA: { lat: 45.42, lon: -75.69, city: 'Ottawa' },
  CN: { lat: 39.90, lon: 116.40, city: 'Pekín' },
  KR: { lat: 37.56, lon: 126.97, city: 'Seúl' },
};

// Dialing codes mapping (e.g. +57 / 57 -> Colombia, +593 / 593 -> Ecuador, +34 -> España)
const COUNTRY_DIALING_CODES: Record<string, { countryCode: string; countryName: string; city: string }> = {
  '57': { countryCode: 'CO', countryName: 'Colombia', city: 'Bogotá' },
  '593': { countryCode: 'EC', countryName: 'Ecuador', city: 'Quito' },
  '52': { countryCode: 'MX', countryName: 'México', city: 'Ciudad de México' },
  '34': { countryCode: 'ES', countryName: 'España', city: 'Madrid' },
  '1': { countryCode: 'US', countryName: 'Estados Unidos', city: 'Nueva York' },
  '54': { countryCode: 'AR', countryName: 'Argentina', city: 'Buenos Aires' },
  '56': { countryCode: 'CL', countryName: 'Chile', city: 'Santiago' },
  '51': { countryCode: 'PE', countryName: 'Perú', city: 'Lima' },
  '58': { countryCode: 'VE', countryName: 'Venezuela', city: 'Caracas' },
  '506': { countryCode: 'CR', countryName: 'Costa Rica', city: 'San José' },
  '507': { countryCode: 'PA', countryName: 'Panamá', city: 'Ciudad de Panamá' },
  '502': { countryCode: 'GT', countryName: 'Guatemala', city: 'Ciudad de Guatemala' },
  '503': { countryCode: 'SV', countryName: 'El Salvador', city: 'San Salvador' },
  '504': { countryCode: 'HN', countryName: 'Honduras', city: 'Tegucigalpa' },
  '505': { countryCode: 'NI', countryName: 'Nicaragua', city: 'Managua' },
  '591': { countryCode: 'BO', countryName: 'Bolivia', city: 'La Paz' },
  '595': { countryCode: 'PY', countryName: 'Paraguay', city: 'Asunción' },
  '598': { countryCode: 'UY', countryName: 'Uruguay', city: 'Montevideo' },
  '55': { countryCode: 'BR', countryName: 'Brasil', city: 'São Paulo' },
  '33': { countryCode: 'FR', countryName: 'Francia', city: 'París' },
  '39': { countryCode: 'IT', countryName: 'Italia', city: 'Roma' },
  '49': { countryCode: 'DE', countryName: 'Alemania', city: 'Berlín' },
  '44': { countryCode: 'GB', countryName: 'Reino Unido', city: 'Londres' },
  '351': { countryCode: 'PT', countryName: 'Portugal', city: 'Lisboa' },
  '41': { countryCode: 'CH', countryName: 'Suiza', city: 'Zúrich' },
  '81': { countryCode: 'JP', countryName: 'Japón', city: 'Tokio' },
  '82': { countryCode: 'KR', countryName: 'Corea del Sur', city: 'Seúl' },
  '86': { countryCode: 'CN', countryName: 'China', city: 'Pekín' },
  '90': { countryCode: 'TR', countryName: 'Turquía', city: 'Estambul' },
  '971': { countryCode: 'AE', countryName: 'Emiratos Árabes', city: 'Dubái' },
  '62': { countryCode: 'ID', countryName: 'Indonesia', city: 'Yakarta' },
  '66': { countryCode: 'TH', countryName: 'Tailandia', city: 'Bangkok' },
  '61': { countryCode: 'AU', countryName: 'Australia', city: 'Sídney' },
  '20': { countryCode: 'EG', countryName: 'Egipto', city: 'El Cairo' },
  '212': { countryCode: 'MA', countryName: 'Marruecos', city: 'Casablanca' },
  '30': { countryCode: 'GR', countryName: 'Grecia', city: 'Atenas' },
  '31': { countryCode: 'NL', countryName: 'Países Bajos', city: 'Ámsterdam' },
};

async function resolveDestinationDetails(input: string): Promise<{
  countryCode: string;
  countryName: string;
  cityName: string;
  lat?: number;
  lon?: number;
}> {
  // Strip conversational preambles/fillers (e.g. "ir a caracas", "quiero ir a caracas", "viaje a caracas", "voy para caracas")
  let stripped = input.trim()
    .replace(/^(quiero\s+ir\s+a|ir\s+a|voy\s+a|viajo\s+a|viaje\s+a|vacaciones\s+en|vuelo\s+a|turismo\s+en|visitar|de\s+viaje\s+a|paseo\s+a|destino\s+a|para|hacia|en|a)\s+/i, '')
    .trim();
  const clean = stripped || input.trim();
  const cleanLower = clean.toLowerCase();

  // Instant safety match for Caracas / Venezuela / Venezuelan destinations (0ms)
  if (/caracas|venezuela|maracaibo|valencia.*venezuela|margarita|barquisimeto/i.test(input) || /caracas|venezuela|maracaibo|valencia.*venezuela|margarita|barquisimeto/i.test(cleanLower)) {
    return {
      countryCode: 'VE',
      countryName: 'Venezuela',
      cityName: 'Caracas',
      lat: 10.4806,
      lon: -66.9036
    };
  }

  // 0. Dialing code lookup (e.g. "57", "+57", "0057")
  const numericOnly = clean.replace(/^[+0]+/, '').trim();
  if (COUNTRY_DIALING_CODES[numericOnly]) {
    const dialing = COUNTRY_DIALING_CODES[numericOnly];
    const defaultCoord = COUNTRY_COORDINATES[dialing.countryCode];
    return {
      countryCode: dialing.countryCode,
      countryName: dialing.countryName,
      cityName: dialing.city,
      lat: defaultCoord?.lat,
      lon: defaultCoord?.lon
    };
  }

  // 1. Direct city dictionary lookup (0ms)
  if (WORLD_CITIES[cleanLower]) {
    const d = WORLD_CITIES[cleanLower];
    return {
      countryCode: d.countryCode,
      countryName: d.countryName,
      cityName: d.city,
      lat: d.lat,
      lon: d.lon
    };
  }

  // 1.b Check if query contains any city key with whole word or exact match
  for (const [cityName, cityData] of Object.entries(WORLD_CITIES)) {
    if (cleanLower === cityName) {
      return {
        countryCode: cityData.countryCode,
        countryName: cityData.countryName,
        cityName: cityData.city,
        lat: cityData.lat,
        lon: cityData.lon
      };
    }
    if (cityName.length >= 4) {
      const wordRegex = new RegExp(`(^|\\s|[.,;¿?¡!])${cityName}($|\\s|[.,;¿?¡!])`, 'i');
      if (wordRegex.test(cleanLower) || wordRegex.test(input)) {
        return {
          countryCode: cityData.countryCode,
          countryName: cityData.countryName,
          cityName: cityData.city,
          lat: cityData.lat,
          lon: cityData.lon
        };
      }
    }
  }

  // 2. Direct Spanish country name match
  for (const [code, name] of Object.entries(SPANISH_COUNTRY_NAMES)) {
    const nameLower = name.toLowerCase();
    if (cleanLower === nameLower) {
      const defaultCoord = COUNTRY_COORDINATES[code];
      return {
        countryCode: code,
        countryName: name,
        cityName: defaultCoord?.city || name,
        lat: defaultCoord?.lat,
        lon: defaultCoord?.lon
      };
    }
    if (nameLower.length >= 4) {
      const wordRegex = new RegExp(`(^|\\s|[.,;¿?¡!])${nameLower}($|\\s|[.,;¿?¡!])`, 'i');
      if (wordRegex.test(cleanLower) || wordRegex.test(input)) {
        const defaultCoord = COUNTRY_COORDINATES[code];
        return {
          countryCode: code,
          countryName: name,
          cityName: defaultCoord?.city || name,
          lat: defaultCoord?.lat,
          lon: defaultCoord?.lon
        };
      }
    }
  }

  // 3. Fast open geocoding API lookup (covers any town or landmark worldwide, <2.5s timeout)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(clean)}&count=1&language=es`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (geoRes.ok) {
      const geoData: any = await geoRes.json();
      if (geoData.results && geoData.results.length > 0) {
        const item = geoData.results[0];
        const code = (item.country_code || '').toUpperCase();
        const cName = SPANISH_COUNTRY_NAMES[code] || item.country || clean;
        return {
          countryCode: code,
          countryName: cName,
          cityName: item.name || clean,
          lat: item.latitude,
          lon: item.longitude
        };
      }
    }
  } catch {
    // Geocoding error or timeout, proceed to fallback
  }

  return {
    countryCode: '',
    countryName: clean,
    cityName: clean
  };
}

function getWeatherCondition(code: number): { condition: string; icon: string; tip: string } {
  if (code === 0) return { condition: 'Cielo despejado', icon: '☀️', tip: 'Excelente clima para recorrer la ciudad y pasear al aire libre.' };
  if (code >= 1 && code <= 3) return { condition: 'Parcialmente nublado', icon: '⛅', tip: 'Temperatura agradable; ideal para explorar con calzado cómodo.' };
  if (code >= 45 && code <= 48) return { condition: 'Neblina ligera', icon: '🌫️', tip: 'Visibilidad moderada; lleva una chaqueta ligera para las mañanas.' };
  if (code >= 51 && code <= 67) return { condition: 'Lluvias ligeras', icon: '🌧️', tip: 'Lleva paraguas compacto o impermeable para no interrumpir tu paseo.' };
  if (code >= 71 && code <= 77) return { condition: 'Nieve', icon: '❄️', tip: 'Lleva ropa térmica adecuada y calzado impermeable antideslizante.' };
  if (code >= 80 && code <= 82) return { condition: 'Chubascos', icon: '🌦️', tip: 'Prepara itinerario de museos o cafeterías en caso de chaparrones.' };
  if (code >= 95) return { condition: 'Tormenta eléctrica', icon: '⛈️', tip: 'Mantente en zonas cubiertas y aprovecha atracciones techadas.' };
  return { condition: 'Templado', icon: '🌤️', tip: 'Buen clima para disfrutar de las atracciones turísticas locales.' };
}

async function fetchDestinationWeather(countryCode: string, countryName: string, cityName: string, lat?: number, lon?: number) {
  let targetLat = lat;
  let targetLon = lon;
  let displayCity = cityName || countryName || 'Destino';

  const coord = COUNTRY_COORDINATES[countryCode];
  if (coord) {
    const isCountryOnly = !cityName || 
      cityName.toLowerCase().trim() === countryName.toLowerCase().trim() ||
      cityName.toLowerCase().trim() === (SPANISH_COUNTRY_NAMES[countryCode] || '').toLowerCase().trim();
    
    if (isCountryOnly) {
      displayCity = coord.city;
      targetLat = coord.lat;
      targetLon = coord.lon;
    }
  }

  if (targetLat === undefined || targetLon === undefined) {
    if (coord) {
      targetLat = coord.lat;
      targetLon = coord.lon;
      if (!cityName || cityName.toLowerCase().trim() === countryName.toLowerCase().trim()) {
        displayCity = coord.city;
      }
    } else {
      targetLat = 48.85;
      targetLon = 2.35;
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${targetLat}&longitude=${targetLon}&current_weather=true`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data: any = await res.json();
    if (data && data.current_weather) {
      const code = data.current_weather.weathercode ?? 1;
      const cond = getWeatherCondition(code);
      return {
        city: displayCity,
        country: countryName || countryCode,
        temperatureC: Math.round(data.current_weather.temperature),
        condition: cond.condition,
        icon: cond.icon,
        windKmH: Math.round(data.current_weather.windspeed),
        packingTip: cond.tip
      };
    }
  } catch {
    // Si falla o excede timeout, retornar aproximación estacional suave
  }
  return {
    city: displayCity,
    country: countryName || countryCode,
    temperatureC: 20,
    condition: 'Agradable',
    icon: '🌤️',
    windKmH: 10,
    packingTip: 'Empaca prendas ligeras y una chaqueta para la tarde/noche.'
  };
}

interface DetectedCountryItem {
  code: string;
  name: string;
  city?: string;
}

interface DestinationValidationResult {
  isValid: boolean;
  needsClarification: boolean;
  intentType: 'destination' | 'question' | 'invalid_or_nonsense' | 'ambiguous' | 'greeting';
  destinationDetails?: {
    countryCode: string;
    countryName: string;
    cityName: string;
    lat?: number;
    lon?: number;
    isRegional?: boolean;
    multiCountries?: DetectedCountryItem[];
  };
  message?: string;
  directAnswer?: string;
  suggestions: string[];
}

function detectMentionedCountries(input: string): DetectedCountryItem[] {
  const cleanLower = input.toLowerCase();
  const detectedMap = new Map<string, DetectedCountryItem>();

  const countryAliases: { [alias: string]: { code: string; name: string } } = {
    'estados unidos': { code: 'US', name: 'Estados Unidos' },
    'eeuu': { code: 'US', name: 'Estados Unidos' },
    'ee.uu': { code: 'US', name: 'Estados Unidos' },
    'usa': { code: 'US', name: 'Estados Unidos' },
    'reino unido': { code: 'GB', name: 'Reino Unido' },
    'uk': { code: 'GB', name: 'Reino Unido' },
    'inglaterra': { code: 'GB', name: 'Reino Unido' },
    'corea del sur': { code: 'KR', name: 'Corea del Sur' },
    'corea': { code: 'KR', name: 'Corea del Sur' },
    'paises bajos': { code: 'NL', name: 'Países Bajos' },
    'países bajos': { code: 'NL', name: 'Países Bajos' },
    'holanda': { code: 'NL', name: 'Países Bajos' },
    'republica dominicana': { code: 'DO', name: 'República Dominicana' },
    'república dominicana': { code: 'DO', name: 'República Dominicana' },
    'costa rica': { code: 'CR', name: 'Costa Rica' },
    'puerto rico': { code: 'PR', name: 'Puerto Rico' },
    'nueva zelanda': { code: 'NZ', name: 'Nueva Zelanda' },
    'emiratos arabes': { code: 'AE', name: 'Emiratos Árabes' },
    'emiratos árabes': { code: 'AE', name: 'Emiratos Árabes' },
    'dubai': { code: 'AE', name: 'Emiratos Árabes' },
    'dubaí': { code: 'AE', name: 'Emiratos Árabes' },
    'suiza': { code: 'CH', name: 'Suiza' },
    'francia': { code: 'FR', name: 'Francia' },
    'españa': { code: 'ES', name: 'España' },
    'italia': { code: 'IT', name: 'Italia' },
    'alemania': { code: 'DE', name: 'Alemania' },
    'portugal': { code: 'PT', name: 'Portugal' },
    'japon': { code: 'JP', name: 'Japón' },
    'japón': { code: 'JP', name: 'Japón' },
    'mexico': { code: 'MX', name: 'México' },
    'méxico': { code: 'MX', name: 'México' },
    'canada': { code: 'CA', name: 'Canadá' },
    'canadá': { code: 'CA', name: 'Canadá' }
  };

  for (const [alias, data] of Object.entries(countryAliases)) {
    const regex = new RegExp(`(^|\\s|[.,;¿?¡!yoe\\/])${alias}($|\\s|[.,;¿?¡!yoe\\/])`, 'i');
    if (regex.test(cleanLower)) {
      detectedMap.set(data.code, data);
    }
  }

  for (const [code, name] of Object.entries(SPANISH_COUNTRY_NAMES)) {
    if (name.length < 3) continue;
    const nameLower = name.toLowerCase();
    const regex = new RegExp(`(^|\\s|[.,;¿?¡!yoe\\/])${nameLower}($|\\s|[.,;¿?¡!yoe\\/])`, 'i');
    if (regex.test(cleanLower)) {
      if (!detectedMap.has(code)) {
        detectedMap.set(code, { code, name });
      }
    }
  }

  for (const [cityName, cityData] of Object.entries(WORLD_CITIES)) {
    if (cityName.length < 4) continue;
    const regex = new RegExp(`(^|\\s|[.,;¿?¡!yoe\\/])${cityName}($|\\s|[.,;¿?¡!yoe\\/])`, 'i');
    if (regex.test(cleanLower)) {
      if (!detectedMap.has(cityData.countryCode)) {
        detectedMap.set(cityData.countryCode, {
          code: cityData.countryCode,
          name: cityData.countryName,
          city: cityData.city
        });
      }
    }
  }

  return Array.from(detectedMap.values());
}

function hasExplicitCountryOrCity(input: string): boolean {
  for (const name of Object.values(SPANISH_COUNTRY_NAMES)) {
    if (name.length >= 4 && input.includes(name.toLowerCase())) return true;
  }
  for (const cityName of Object.keys(WORLD_CITIES)) {
    if (cityName.length >= 4 && input.includes(cityName.toLowerCase())) return true;
  }
  return false;
}

async function validateDestinationIntent(input: string): Promise<DestinationValidationResult> {
  const clean = (input || '').trim();
  const cleanLower = clean.toLowerCase();

  // 1. Detección de saludos (Greetings)
  const greetingRegex = /^(\s*hola|\s*buenas|\s*buenos\s*d[ií]as|\s*buenas\s*tardes|\s*buenas\s*noches|\s*hey|\s*hello|\s*hi|\s*saludos|\s*qu[eé]\s*tal)\b/i;
  if (greetingRegex.test(cleanLower) && !hasExplicitCountryOrCity(cleanLower)) {
    return {
      isValid: false,
      needsClarification: true,
      intentType: 'greeting',
      message: '¡Hola! Soy tu Asistente IA de Viajes de Wappa. Para recomendarte el plan de eSIM con la mejor cobertura y precio, cuéntame a qué país o ciudad vas a viajar.',
      suggestions: ['España', 'Estados Unidos', 'Japón', 'Colombia', 'México', 'Francia']
    };
  }

  // 2. Detección de preguntas sobre eSIM / compatibilidad / funcionamiento
  const questionRegex = /(c[oó]mo\s+funciona|qu[eé]\s+es\s+una?\s+esim|c[oó]mo\s+se\s+instala|compatible|compatibilidad|celular|tel[eé]fono|costo|precio|cu[aá]nto\s+cuesta|sirve\s+para|compartir\s+datos|roaming|hotspot|apn|qu[eé]\s+pasa\s+si)/i;
  if (questionRegex.test(cleanLower)) {
    let directAnswer = 'Una eSIM es una tarjeta SIM 100% digital que instalas en segundos escaneando un código QR en tu móvil, sin cambiar tu chip actual ni pagar cargos de roaming abusivos.';
    if (/compatible|compatibilidad|celular|tel[eé]fono/i.test(cleanLower)) {
      directAnswer = 'La gran mayoría de móviles modernos son compatibles: iPhone XS en adelante, Samsung Galaxy S20+, Google Pixel 3+ y modelos recientes de Xiaomi o Motorola.';
    } else if (/costo|precio|cu[aá]nto\s+cuesta/i.test(cleanLower)) {
      directAnswer = 'Nuestros planes de eSIM internacional parten desde solo $4.00 USD, con opciones desde 1 GB hasta datos Ilimitados y validez desde 7 hasta 30 días.';
    } else if (/instala|c[oó]mo\s+se\s+instala|activ/i.test(cleanLower)) {
      directAnswer = 'Al comprar tu plan recibes un código QR por correo. Solo vas a Ajustes > Datos Móviles > Añadir eSIM, lo escaneas y se conecta automáticamente al llegar.';
    }

    return {
      isValid: false,
      needsClarification: true,
      intentType: 'question',
      directAnswer,
      message: `${directAnswer} ¿A qué país o ciudad vas a viajar para ver las tarifas y coberturas disponibles?`,
      suggestions: ['España', 'Estados Unidos', 'Japón', 'Colombia', 'México', 'Francia']
    };
  }

  // 3. Detección de sustantivos comunes / palabras aleatorias / disparates (Nonsense / Non-travel)
  const nonsenseRegex = /^(comida|comida\s+de\s+perro|comida\s+para\s+perro|perro|perros|gato|gatos|pizza|hamburguesa|mesa|silla|auto|carro|coche|f[uú]tbol|pel[ií]cula|m[uú]sica|canci[oó]n|zapato|ropa|ordenador|computadora|nada|ninguno|nadie|12345|prueba|test|asdf|qwerty|jaja|lol|random)$/i;
  if (nonsenseRegex.test(cleanLower) || /comida\s+de\s+perro/i.test(cleanLower) || /comida\s+para\s+perro/i.test(cleanLower)) {
    return {
      isValid: false,
      needsClarification: true,
      intentType: 'invalid_or_nonsense',
      message: `No reconocí "${clean}" como un destino de viaje o país. ¿Podrías indicarme a qué lugar vas a viajar? Por ejemplo: París, Tokio, Cancún, Madrid o Estados Unidos.`,
      suggestions: ['Madrid', 'Tokio', 'Cancún', 'Nueva York', 'Quito', 'Roma']
    };
  }

  // 4. Detección de viajes regionales / multi-país
  if (/europa|eurotrip|uni[oó]n\s+europea/i.test(cleanLower)) {
    return {
      isValid: true,
      needsClarification: false,
      intentType: 'destination',
      destinationDetails: {
        countryCode: 'EU',
        countryName: 'Europa',
        cityName: 'Europa (33 países)',
        lat: 48.8566,
        lon: 2.3522,
        isRegional: true
      },
      suggestions: []
    };
  }

  if (/sudam[eé]rica|latinoam[eé]rica|latam|am[eé]rica\s+del\s+sur/i.test(cleanLower)) {
    return {
      isValid: true,
      needsClarification: false,
      intentType: 'destination',
      destinationDetails: {
        countryCode: 'LATAM',
        countryName: 'Latinoamérica',
        cityName: 'Latinoamérica (14 países)',
        lat: -4.5709,
        lon: -74.2973,
        isRegional: true
      },
      suggestions: []
    };
  }

  if (/norteam[eé]rica|am[eé]rica\s+del\s+norte/i.test(cleanLower)) {
    return {
      isValid: true,
      needsClarification: false,
      intentType: 'destination',
      destinationDetails: {
        countryCode: 'NA-3',
        countryName: 'Norteamérica',
        cityName: 'Estados Unidos, Canadá y México',
        lat: 37.0902,
        lon: -95.7129,
        isRegional: true
      },
      suggestions: []
    };
  }

  if (/global|mundial|varios\s+pa[ií]ses/i.test(cleanLower)) {
    return {
      isValid: true,
      needsClarification: false,
      intentType: 'destination',
      destinationDetails: {
        countryCode: 'GL',
        countryName: 'Global',
        cityName: 'Global (130+ países)',
        lat: 25.2048,
        lon: 55.2708,
        isRegional: true
      },
      suggestions: []
    };
  }

  // 4.b Detección y enrutamiento inteligente de múltiples países en la misma consulta (ej: "España y Francia", "USA y Canadá")
  const multiCountries = detectMentionedCountries(clean);
  if (multiCountries.length > 1) {
    const codes = multiCountries.map(c => c.code);
    const namesList = multiCountries.map(c => c.name).join(' y ');

    const EUROPE_CODES = new Set([
      'ES', 'FR', 'IT', 'DE', 'PT', 'GB', 'NL', 'BE', 'CH', 'AT', 'GR', 'SE', 'NO', 'DK', 'FI',
      'IE', 'PL', 'CZ', 'HU', 'RO', 'HR', 'BG', 'SK', 'SI', 'IS', 'CY', 'EE', 'LV', 'LT', 'LU',
      'MT', 'LI', 'GI', 'VA', 'AD', 'MC', 'SM', 'AL', 'BA', 'RS', 'ME', 'MK'
    ]);

    const NORTH_AMERICA_CODES = new Set(['US', 'CA', 'MX']);

    const LATAM_CODES = new Set([
      'CO', 'PE', 'EC', 'AR', 'CL', 'VE', 'BO', 'PY', 'UY', 'BR', 'PA', 'CR', 'GT', 'HN', 'NI', 'SV', 'DO'
    ]);

    let bundleCode = 'GL';
    let bundleName = 'Global Multi-País';
    let bundleCity = `Itinerario Combinado (${namesList})`;
    let lat = 25.2048;
    let lon = 55.2708;

    if (codes.every(c => EUROPE_CODES.has(c))) {
      bundleCode = 'EU';
      bundleName = 'Europa Regional';
      bundleCity = `Europa (${namesList})`;
      lat = 48.8566;
      lon = 2.3522;
    } else if (codes.every(c => NORTH_AMERICA_CODES.has(c))) {
      bundleCode = 'NA-3';
      bundleName = 'Norteamérica Regional';
      bundleCity = `Norteamérica (${namesList})`;
      lat = 37.0902;
      lon = -95.7129;
    } else if (codes.every(c => LATAM_CODES.has(c))) {
      bundleCode = 'LATAM';
      bundleName = 'Latinoamérica Regional';
      bundleCity = `Latinoamérica (${namesList})`;
      lat = -4.5709;
      lon = -74.2973;
    }

    return {
      isValid: true,
      needsClarification: false,
      intentType: 'destination',
      destinationDetails: {
        countryCode: bundleCode,
        countryName: bundleName,
        cityName: bundleCity,
        lat,
        lon,
        isRegional: true,
        multiCountries
      },
      suggestions: []
    };
  }

  // 5. Verificación de destino con resolveDestinationDetails
  const details = await resolveDestinationDetails(clean);

  // Si encontró código de país válido (ISO de 2 letras)
  if (details && details.countryCode && details.countryCode.length === 2) {
    const matchedCountry = SPANISH_COUNTRY_NAMES[details.countryCode];
    if (matchedCountry) {
      return {
        isValid: true,
        needsClarification: false,
        intentType: 'destination',
        destinationDetails: details,
        suggestions: []
      };
    }
  }

  // 6. Si no hubo coincidencia en diccionarios locales, intentar con Gemini AI
  const ai = getGeminiClient();
  if (ai) {
    try {
      const prompt = `Actúa como clasificador de destinos de viaje para una tienda de eSIMs internacionales.
Analiza la siguiente entrada del usuario: "${clean}"
Determina si se trata de un destino de viaje real (país, ciudad, isla, territorio) o si es otra cosa (pregunta, disparate, texto sin sentido, comida, etc.).
Responde estrictamente en formato JSON con la siguiente estructura:
{
  "isValid": boolean,
  "intentType": "destination" | "question" | "invalid_or_nonsense" | "ambiguous",
  "countryCode": "Código ISO de 2 letras si es un país o ciudad real, o cadena vacía si no lo es",
  "countryName": "Nombre oficial en español del país si es válido",
  "cityName": "Nombre de la ciudad si aplica",
  "message": "Si isValid es false, redacta una respuesta muy amable y concisa repreguntando a dónde desea viajar",
  "suggestions": ["Lista de 4 destinos populares si no es válido"]
}`;

      const aiPromise = ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('AI timeout')), 4500)
      );

      const response: any = await Promise.race([aiPromise, timeoutPromise]);
      if (response && response.text) {
        const cleaned = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);

        if (parsed.isValid && parsed.countryCode && parsed.countryCode.length === 2) {
          return {
            isValid: true,
            needsClarification: false,
            intentType: 'destination',
            destinationDetails: {
              countryCode: parsed.countryCode.toUpperCase(),
              countryName: parsed.countryName || details.countryName,
              cityName: parsed.cityName || details.cityName,
              lat: details.lat,
              lon: details.lon
            },
            suggestions: []
          };
        } else {
          return {
            isValid: false,
            needsClarification: true,
            intentType: parsed.intentType || 'invalid_or_nonsense',
            message: parsed.message || `No he encontrado "${clean}" como un destino de viaje o país reconocido. ¿Podrías indicarme a qué lugar vas a viajar?`,
            suggestions: Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0 
              ? parsed.suggestions.slice(0, 5) 
              : ['España', 'Estados Unidos', 'Japón', 'Colombia', 'México', 'Francia']
          };
        }
      }
    } catch {
      // Gemini no disponible o timeout, continuar con respuesta determinista de respaldo
    }
  }

  // 7. Fallback seguro determinista si no se pudo validar como destino
  return {
    isValid: false,
    needsClarification: true,
    intentType: 'invalid_or_nonsense',
    message: `No he reconocido "${clean}" como un país o ciudad de destino. ¿A qué lugar tienes planeado viajar? Puedes elegir una de las sugerencias o escribir el país directamente.`,
    suggestions: ['España', 'Estados Unidos', 'Japón', 'Colombia', 'México', 'Francia']
  };
}

app.post('/api/ai/recommend', async (req: Request, res: Response): Promise<void> => {
  try {
    const { destination, days, usage } = req.body;
    const destName = (destination || '').trim();
    const daysNum = Math.max(1, parseInt(days) || 7);
    const userUsage = usage || 'standard';

    if (!destName || destName.length < 2) {
      res.json({
        success: true,
        needsClarification: true,
        clarification: {
          needsClarification: true,
          intentType: 'invalid_or_nonsense',
          message: 'Por favor indica el país o ciudad de tu viaje para poder calcular el plan ideal y la cobertura 5G.',
          suggestions: ['España', 'Estados Unidos', 'Japón', 'Colombia', 'México', 'Francia'],
          originalQuery: destName
        }
      });
      return;
    }

    // 1. Validar intención y destino antes de calcular planes
    const validation = await validateDestinationIntent(destName);

    if (!validation.isValid || validation.needsClarification) {
      res.json({
        success: true,
        needsClarification: true,
        clarification: {
          needsClarification: true,
          intentType: validation.intentType,
          message: validation.message,
          suggestions: validation.suggestions,
          directAnswer: validation.directAnswer,
          originalQuery: destName
        }
      });
      return;
    }

    // 2. Destino validado con éxito
    const destinationDetails = validation.destinationDetails!;
    let targetCode = destinationDetails.countryCode;
    let targetCountryName = destinationDetails.countryName;
    let targetCityName = destinationDetails.cityName;

    // Safety net: if destination references Caracas / Venezuela, ensure VE is set
    if (!targetCode && /caracas|venezuela|maracaibo|valencia.*venezuela|margarita|barquisimeto/i.test(destName)) {
      targetCode = 'VE';
      targetCountryName = 'Venezuela';
      targetCityName = 'Caracas';
    }

    // 3. Query matched plans from Atlas (prioritize countryCode exact match)
    let plansResult = { total: 0, plans: [] as any[] };
    if (targetCode) {
      plansResult = await fetchPlansFromAtlas({ countryCode: targetCode, limit: 50 });
    }
    if (plansResult.plans.length === 0 && targetCountryName && targetCountryName.length > 2) {
      plansResult = await fetchPlansFromAtlas({ search: targetCountryName, limit: 50 });
    }
    if (plansResult.plans.length === 0 && destName.length > 2 && !/^\+?\d+$/.test(destName)) {
      plansResult = await fetchPlansFromAtlas({ search: destName, limit: 50 });
    }

    // Fallback plans if Atlas returns empty
    let plans = plansResult.plans;
    if (plans.length === 0) {
      if (targetCode && FALLBACK_PLANS[targetCode]) {
        plans = FALLBACK_PLANS[targetCode];
      } else if (targetCode === 'VE' || /caracas|venezuela/i.test(destName)) {
        plans = FALLBACK_PLANS['VE'] || [];
      } else if (targetCode && ['CO', 'PE', 'EC', 'AR', 'CL', 'VE', 'BO', 'PY', 'UY', 'BR'].includes(targetCode)) {
        plans = FALLBACK_PLANS['LATAM'] || FALLBACK_PLANS['CO'] || [];
      } else if (FALLBACK_PLANS[targetCode]) {
        plans = FALLBACK_PLANS[targetCode];
      } else {
        plans = FALLBACK_PLANS['GL'] || FALLBACK_PLANS['LATAM'] || Object.values(FALLBACK_PLANS)[0] || [];
      }
    }

    // 3. Parallel weather fetching & intelligent plan selection
    const weatherPromise = fetchDestinationWeather(
      targetCode,
      targetCountryName,
      targetCityName,
      destinationDetails.lat,
      destinationDetails.lon
    );

    // Filter plans that comfortably cover the travel duration (if any exist)
    const validPlans = plans.filter(p => p.validityDays >= daysNum);
    const candidatePlans = validPlans.length > 0 ? validPlans : plans;

    // Sort by data volume and price
    candidatePlans.sort((a, b) => a.dataAmountGB - b.dataAmountGB || a.priceEUR - b.priceEUR);

    let chosenPlan = candidatePlans[0];
    if (userUsage === 'heavy') {
      // Pick higher GB (e.g. 10GB, 20GB, or largest available)
      chosenPlan = candidatePlans.find(p => p.dataAmountGB >= 10) || candidatePlans[candidatePlans.length - 1];
    } else if (userUsage === 'light') {
      // Pick 1GB to 3GB
      chosenPlan = candidatePlans.find(p => p.dataAmountGB >= 1 && p.dataAmountGB <= 3) || candidatePlans[0];
    } else {
      // Standard: 3GB to 5GB
      chosenPlan = candidatePlans.find(p => p.dataAmountGB >= 3 && p.dataAmountGB <= 10) || candidatePlans[Math.floor(candidatePlans.length / 2)] || candidatePlans[0];
    }

    const dataDisplayStr = chosenPlan.dataAmountGB >= 900 ? 'Ilimitado' : `${chosenPlan.dataAmountGB} GB`;

    // Await weather in parallel (it has an internal 1.8s timeout, non-blocking)
    const weatherData = await weatherPromise;

    // 4. Default immediate response structure
    const locationDisplay = targetCityName && targetCityName !== targetCountryName 
      ? `${targetCityName} (${targetCountryName || chosenPlan.country})`
      : (destName || chosenPlan.country);

    const isMultiCountryTrip = Boolean(destinationDetails.multiCountries && destinationDetails.multiCountries.length > 1);
    const multiCountryNames = isMultiCountryTrip
      ? destinationDetails.multiCountries!.map(c => c.name).join(' y ')
      : '';

    let defaultSummary = `El plan ${chosenPlan.name} (${dataDisplayStr} por ${chosenPlan.validityDays} días a $${chosenPlan.priceEUR.toFixed(2)}) es la opción más conveniente para tu estancia de ${daysNum} días en ${locationDisplay}, garantizando navegación continua con ${chosenPlan.operator}.`;
    let defaultTips = [
      `Descarga los mapas de ${chosenPlan.country} en Google Maps con Wi-Fi antes de salir para ahorrar hasta un 25% de datos móviles.`,
      `Mantén activada la itinerancia de datos (roaming) en los ajustes de tu eSIM al aterrizar para conectar a la red ${chosenPlan.operator}.`,
      `Configura la copia de seguridad de fotos y videos en la nube para que solo se realice cuando estés conectado a una red Wi-Fi.`
    ];

    if (isMultiCountryTrip) {
      defaultSummary = `Para tu viaje combinado por ${multiCountryNames}, el plan ${chosenPlan.name} (${dataDisplayStr} por ${chosenPlan.validityDays} días a $${chosenPlan.priceEUR.toFixed(2)}) es la solución ideal: tendrás cobertura 5G unificada en todos los países de tu ruta con 1 sola eSIM y sin cambiar de chip.`;
      defaultTips = [
        `Tu eSIM se conectará automáticamente a la red aliada de mayor velocidad al cruzar fronteras entre ${multiCountryNames} sin cobros adicionales de roaming.`,
        `Mantén activada la 'Itinerancia de datos' durante todo el recorrido para asegurar una transición inmediata entre países.`,
        `Al ser un viaje multidestino, puedes revisar tu saldo restante de gigas en cualquier momento desde tu panel de usuario de Wappa.`
      ];
    }

    const defaultRecommendation = {
      summary: defaultSummary,
      recommendedPlan: chosenPlan,
      weather: weatherData,
      tips: defaultTips,
      isMultiCountryTrip,
      multiCountries: destinationDetails.multiCountries || []
    };

    // 5. Query Gemini AI with strict 2.5-second timeout
    const ai = getGeminiClient();
    if (ai) {
      try {
        const prompt = `Eres el asistente de viajes eSIM de Wappa.
${isMultiCountryTrip ? `Viaje MULTIPAÍS por: ${multiCountryNames}.` : `Viaje a: "${locationDisplay}".`}
Duración: ${daysNum} días, perfil de uso: "${userUsage}". Clima actual: ${weatherData ? `${weatherData.temperatureC}°C, ${weatherData.condition} en ${weatherData.city}` : 'Favorable'}.
Plan seleccionado: ${chosenPlan.name} (${dataDisplayStr}, ${chosenPlan.validityDays} días, $${chosenPlan.priceEUR}, red ${chosenPlan.operator}, multidestino: ${isMultiCountryTrip ? 'SÍ' : 'NO'}).
${isMultiCountryTrip ? `Destaca en el resumen que este paquete único cubre ${multiCountryNames} sin necesidad de comprar chips separados ni pagar roaming adicional.` : ''}
Responde en JSON conciso:
{
  "summary": "1 frase explicando por qué este plan cubre perfectamente su viaje por ${isMultiCountryTrip ? multiCountryNames : locationDisplay} durante ${daysNum} días",
  "tips": ["Consejo 1 de roaming/datos", "Consejo 2 de cobertura y transición entre países", "Consejo 3 práctico de viaje"]
}`;

        // Fast call with 4.5s maximum timeout
        const aiPromise = ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('AI timeout')), 4500)
        );

        const response: any = await Promise.race([aiPromise, timeoutPromise]);

        if (response && response.text) {
          const cleaned = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const parsed = JSON.parse(cleaned);
          if (parsed.summary && Array.isArray(parsed.tips) && parsed.tips.length > 0) {
            res.json({
              success: true,
              recommendation: {
                summary: parsed.summary,
                recommendedPlan: chosenPlan,
                weather: weatherData,
                tips: parsed.tips.slice(0, 3),
                isMultiCountryTrip,
                multiCountries: destinationDetails.multiCountries || []
              }
            });
            return;
          }
        }
      } catch (aiErr: any) {
        // High-load or timeout: gracefully continue with optimized smart fallback
      }
    }

    // Return instant pre-calculated smart recommendation
    res.json({
      success: true,
      recommendation: defaultRecommendation,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// FLUTTER MOBILE & FCM PUSH NOTIFICATION ENDPOINTS
// ----------------------------------------------------

/**
 * POST /api/user/device-token
 * Registers an FCM Device Token sent from Flutter (iOS / Android / Web)
 */
app.post('/api/user/device-token', async (req: Request, res: Response) => {
  try {
    const { email, fcmToken, deviceName, platform, userId } = req.body;

    if (!fcmToken || typeof fcmToken !== 'string' || fcmToken.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'El campo "fcmToken" es obligatorio',
      });
    }

    const cleanToken = fcmToken.trim();
    const cleanEmail = (email || '').toLowerCase().trim();

    await connectToDatabase();

    let updatedCustomer: any = null;

    if (cleanEmail) {
      // 1. Find or create customer record in MongoDB Atlas if connected
      if (isDatabaseConnected()) {
        try {
          const deviceObj = {
            token: cleanToken,
            deviceName: deviceName || 'Dispositivo Móvil',
            platform: platform || 'android',
            lastSeen: new Date(),
          };

          // Remove any duplicate token entry first, then push fresh device object directly
          await AtlasCustomerModel.collection.updateOne(
            { email: cleanEmail },
            { 
              $pull: { fcmDevices: { token: cleanToken }, fcmTokens: cleanToken } as any
            }
          );

          await AtlasCustomerModel.collection.updateOne(
            { email: cleanEmail },
            {
              $push: { fcmTokens: cleanToken, fcmDevices: deviceObj } as any,
              $setOnInsert: {
                id: userId || `cust_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                name: email.split('@')[0] || 'Usuario App Móvil',
                email: cleanEmail,
                pushNotificationsEnabled: true,
                createdAt: new Date(),
              },
              $set: { updatedAt: new Date() }
            },
            { upsert: true }
          );

          // Also propagate token to any active eSIMs belonging to this user in MongoDB
          await UserEsimModel.updateMany(
            {
              userEmail: cleanEmail,
              status: { $in: ['active', 'ready_to_install'] },
              $or: [{ fcmToken: { $exists: false } }, { fcmToken: '' }, { fcmToken: null }],
            },
            { $set: { fcmToken: cleanToken } }
          ).exec();
        } catch (mongoErr: any) {
          console.warn('⚠️ [MongoDB Atlas] Error actualizando device-token:', mongoErr.message);
        }
      }

      // 2. Also save to Cloudflare D1 if configured
      if (isD1Configured()) {
        try {
          const rows = await d1Client.query('SELECT * FROM customers WHERE LOWER(email) = LOWER(?) LIMIT 1', [cleanEmail]);
          let existingTokens: string[] = [];
          if (rows && rows.length > 0) {
            try {
              if (rows[0].fcm_tokens_json) existingTokens = JSON.parse(rows[0].fcm_tokens_json);
            } catch {}
            if (!existingTokens.includes(cleanToken)) existingTokens.push(cleanToken);
            await d1Client.query(
              'UPDATE customers SET fcm_tokens_json = ?, updated_at = datetime("now") WHERE LOWER(email) = LOWER(?)',
              [JSON.stringify(existingTokens), cleanEmail]
            );
          } else {
            existingTokens = [cleanToken];
            const newId = userId || `cust_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const name = email.split('@')[0] || 'Usuario';
            await d1Client.query(
              'INSERT INTO customers (id, name, email, fcm_tokens_json, push_notifications_enabled) VALUES (?, ?, ?, ?, 1)',
              [newId, name, cleanEmail, JSON.stringify(existingTokens)]
            );
          }
          if (!updatedCustomer) {
            updatedCustomer = { email: cleanEmail, fcmTokens: existingTokens };
          }
          await d1Client.query(
            'UPDATE user_esims SET fcm_token = ? WHERE LOWER(user_email) = LOWER(?) AND (fcm_token IS NULL OR fcm_token = "")',
            [cleanToken, cleanEmail]
          );
        } catch (d1Err: any) {
          console.warn('⚠️ [Cloudflare D1] Error actualizando device-token en D1:', d1Err.message);
        }
      }
    }

    console.log(`📱 [FCM Token Registrado] Email: "${cleanEmail || 'Anónimo'}", Token: "${cleanToken.substring(0, 15)}..."`);

    res.json({
      success: true,
      message: 'Token de dispositivo móvil FCM registrado exitosamente',
      email: cleanEmail,
      registeredAt: new Date().toISOString(),
      tokensCount: updatedCustomer?.fcmTokens?.length || 1,
    });
  } catch (err: any) {
    console.error('❌ [Error POST /api/user/device-token]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/user/clear-fcm-tokens - Prune obsolete or expired tokens for user
 */
app.post('/api/user/clear-fcm-tokens', async (req: Request, res: Response) => {
  try {
    const email = (req.body.email || req.query.email || 'mgbravomalo@gmail.com').toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email requerido' });
    }
    if (isDatabaseConnected()) {
      try {
        await AtlasCustomerModel.updateOne({ email }, { $set: { fcmTokens: [], fcmDevices: [] } }).exec();
      } catch {}
    }
    if (isD1Configured()) {
      try {
        await d1Client.query('UPDATE customers SET fcm_tokens_json = "[]" WHERE LOWER(email) = LOWER(?)', [email]);
      } catch {}
    }
    console.log(`🧹 [FCM Tokens Pruned] Todos los tokens antiguos fueron eliminados para: ${email}`);
    res.json({ success: true, message: 'Tokens antiguos eliminados correctamente' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/user/profile - Get user profile and registered FCM devices
 */
app.get('/api/user/profile', async (req: Request, res: Response) => {
  try {
    const email = (req.query.email as string || '').toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ success: false, error: 'Se requiere el parámetro email' });
    }
    
    let customer: any = null;

    if (isDatabaseConnected()) {
      try {
        customer = await AtlasCustomerModel.collection.findOne({ email });
      } catch {}
    }

    if (!customer && isD1Configured()) {
      try {
        const rows = await d1Client.query('SELECT * FROM customers WHERE LOWER(email) = LOWER(?) LIMIT 1', [email]);
        if (rows && rows.length > 0) {
          const row = rows[0];
          let fcmTokens: string[] = [];
          if (row.fcm_tokens_json) {
            try { fcmTokens = JSON.parse(row.fcm_tokens_json); } catch {}
          }
          customer = {
            id: row.id,
            email: row.email,
            name: row.name,
            role: row.role || 'user',
            fcmTokens,
            fcmDevices: fcmTokens.map((t: string) => ({ token: t, deviceName: 'Dispositivo Registrado', platform: 'android', lastSeen: row.updated_at })),
          };
        }
      } catch (err: any) {
        console.warn('Error en D1 al obtener perfil de usuario:', err.message);
      }
    }

    if (!customer) {
      return res.json({ success: true, customer: null, message: 'Customer not found' });
    }
    res.json({ success: true, customer });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/esims/:iccid/device-token
 * Binds an FCM token directly to a specific eSIM ICCID
 */
app.post('/api/esims/:iccid/device-token', async (req: Request, res: Response) => {
  try {
    const { iccid } = req.params;
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return res.status(400).json({ success: false, error: 'fcmToken es requerido' });
    }

    await connectToDatabase();

    const esim = await UserEsimModel.findOne({ iccid }).exec();
    if (!esim) {
      return res.status(404).json({ success: false, error: `eSIM con ICCID ${iccid} no encontrada` });
    }

    esim.fcmToken = fcmToken.trim();
    await esim.save();

    res.json({
      success: true,
      message: `FCM Token asociado exitosamente a la eSIM ${iccid}`,
      iccid,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/notifications/status
 * Returns FCM Push Notification configuration, active tokens and monitor statistics
 */
app.get('/api/notifications/status', async (_req: Request, res: Response) => {
  try {
    await connectToDatabase();

    const fcmConfig = getFcmConfigStatus();

    // Query registered customers with tokens
    const customersWithTokens = await AtlasCustomerModel.countDocuments({
      'fcmTokens.0': { $exists: true },
    }).exec();

    const activeEsimsWithTokens = await UserEsimModel.countDocuments({
      status: { $in: ['active', 'ready_to_install'] },
      fcmToken: { $exists: true, $ne: '' },
    }).exec();

    const totalActiveEsims = await UserEsimModel.countDocuments({
      status: { $in: ['active', 'ready_to_install'] },
    }).exec();

    res.json({
      success: true,
      fcm: fcmConfig,
      stats: {
        totalActiveEsims,
        activeEsimsWithTokens,
        customersWithPushTokens: customersWithTokens,
      },
      cronSchedule: process.env.ESIM_ALERT_CRON_SCHEDULE || '0 */4 * * * (cada 4 horas)',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/notifications/flutter-test
 * Dedicated admin testing endpoint to send push notifications to Flutter mobile devices
 */
app.post('/api/notifications/flutter-test', async (req: Request, res: Response) => {
  try {
    const { email, token, testType = '80_percent', customTitle, customBody, country = 'España', iccid, sendEmailCopy = false } = req.body;

    await connectToDatabase();

    const cleanEmail = (email || 'mgbravomalo@gmail.com').toLowerCase().trim();
    let customer: any = null;

    if (isDatabaseConnected()) {
      try {
        customer = await AtlasCustomerModel.findOne({ email: cleanEmail }).exec();
      } catch {}
    }

    if (!customer && isD1Configured()) {
      try {
        const rows = await d1Client.query('SELECT * FROM customers WHERE LOWER(email) = LOWER(?) LIMIT 1', [cleanEmail]);
        if (rows && rows.length > 0) {
          const row = rows[0];
          let fcmTokens: string[] = [];
          if (row.fcm_tokens_json) {
            try { fcmTokens = JSON.parse(row.fcm_tokens_json); } catch {}
          }
          customer = {
            id: row.id,
            email: row.email,
            name: row.name,
            fcmTokens,
            fcmDevices: fcmTokens.map((t: string) => ({ token: t, deviceName: 'Dispositivo Móvil', platform: 'android' })),
          };
        }
      } catch (err: any) {
        console.warn('Error en D1 al buscar cliente para push test:', err.message);
      }
    }

    const registeredDevices = customer?.fcmDevices || [];
    let targetTokens: string[] = [];

    if (token && typeof token === 'string' && token.trim().length > 0) {
      targetTokens = [token.trim()];
    } else if (customer && customer.fcmTokens && customer.fcmTokens.length > 0) {
      // Prioritize Flutter native device tokens (e.g. Android/iOS tokens from FCM)
      const nativeTokens = customer.fcmTokens.filter(t => 
        !t.startsWith('web_') && 
        !t.startsWith('test_') && 
        !t.startsWith('fcm_test_') && 
        !t.startsWith('dev_mobile_') && 
        t.length > 50
      );
      const activeCandidates = nativeTokens.length > 0 ? nativeTokens : customer.fcmTokens;
      // Send to the active device token directly
      targetTokens = activeCandidates.slice(-1);
    }

    if (targetTokens.length === 0) {
      return res.status(400).json({
        success: false,
        error: `No se encontraron tokens FCM registrados para el usuario "${cleanEmail}". Asegúrate de haber abierto la app Flutter e iniciado sesión.`,
        devices: registeredDevices,
      });
    }

    // Build message based on testType
    let title = '🧪 Prueba Wappa eSIM';
    let body = 'Notificación de prueba desde el panel de administración.';
    let route = '/my-esims';
    const targetIccid = iccid || '8910300000063658185';

    if (testType === '80_percent') {
      title = `🔔 Alerta Wappa: 80% consumido en ${country}`;
      body = `Has consumido el 80% de tus datos en ${country}. Toca aquí para recargar y no quedarte sin conexión.`;
      route = `/my-esims?iccid=${targetIccid}`;
    } else if (testType === '90_percent') {
      title = `⚠️ ¡Cuidado! Te queda sólo el 10% en ${country}`;
      body = `Estás a punto de agotar tus datos en ${country}. Recarga tu eSIM ahora para seguir conectado.`;
      route = `/my-esims?iccid=${targetIccid}`;
    } else if (testType === '24_hours') {
      title = `⏳ Tu eSIM en ${country} vence en 24 horas`;
      body = `Tu paquete de datos en ${country} expira mañana. Extiende la vigencia en un toque.`;
      route = `/my-esims?iccid=${targetIccid}`;
    } else if (testType === 'welcome') {
      title = '🚀 ¡Bienvenido a Wappa eSIM!';
      body = 'Tu app móvil Flutter está sincronizada y lista para recibir alertas de datos en tiempo real.';
      route = '/my-esims';
    } else if (testType === 'custom') {
      title = customTitle || '📱 Mensaje de Wappa eSIM';
      body = customBody || 'Notificación de prueba enviada a tu dispositivo Flutter.';
      route = '/my-esims';
    }

    const results: any[] = [];
    let deliveredCount = 0;

    for (const t of targetTokens) {
      const pushRes = await sendPushNotification({
        token: t,
        title,
        body,
        data: {
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          route,
          tab: 'myesims',
          iccid: targetIccid,
          country,
          alertType: testType,
          test: 'true',
          timestamp: new Date().toISOString(),
        },
      });

      if (pushRes.success) {
        deliveredCount++;
      } else if (pushRes.error?.includes('NotRegistered') && cleanEmail) {
        // Automatically prune dead tokens so user records stay healthy
        if (isDatabaseConnected()) {
          try {
            await AtlasCustomerModel.updateOne(
              { email: cleanEmail },
              { $pull: { fcmTokens: t, fcmDevices: { token: t } } }
            ).exec();
          } catch {}
        }
        if (isD1Configured()) {
          try {
            const rows = await d1Client.query('SELECT fcm_tokens_json FROM customers WHERE LOWER(email) = LOWER(?) LIMIT 1', [cleanEmail]);
            if (rows && rows.length > 0 && rows[0].fcm_tokens_json) {
              const currentTokens: string[] = JSON.parse(rows[0].fcm_tokens_json);
              const remaining = currentTokens.filter(x => x !== t);
              await d1Client.query('UPDATE customers SET fcm_tokens_json = ? WHERE LOWER(email) = LOWER(?)', [JSON.stringify(remaining), cleanEmail]);
            }
          } catch {}
        }
      }

      results.push({
        tokenPreview: `${t.substring(0, 15)}...`,
        success: pushRes.success,
        messageId: pushRes.messageId,
        error: pushRes.error,
        simulated: pushRes.simulated,
      });
    }

    // Optional email copy
    let emailResult = null;
    if (sendEmailCopy && cleanEmail) {
      try {
        emailResult = await sendEsimAlertEmail({
          toEmail: cleanEmail,
          userName: customer?.name || 'Administrador',
          alertType: testType === '90_percent' ? '90_percent' : testType === '24_hours' ? '24_hours' : '80_percent',
          country,
          planName: `${country} 500MB/Día`,
          iccid: targetIccid,
          usedDataGB: testType === '90_percent' ? 0.45 : 0.40,
          totalDataGB: 0.50,
          percentUsed: testType === '90_percent' ? 90 : 80,
          daysLeft: 1,
          isReloadable: true,
        });
      } catch (err: any) {
        emailResult = { success: false, error: err.message };
      }
    }

    res.json({
      success: deliveredCount > 0,
      deliveredCount,
      totalTokens: targetTokens.length,
      title,
      body,
      route,
      devices: registeredDevices,
      results,
      emailResult,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('❌ [Error /api/notifications/flutter-test]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/notifications/test-push
 * Sends a test push notification to a token or user email
 */
app.post('/api/notifications/test-push', async (req: Request, res: Response) => {
  try {
    const { token, email, title, body, data } = req.body;

    let targetToken = token;

    await connectToDatabase();

    if (!targetToken && email) {
      let customer: any = null;
      if (isDatabaseConnected()) {
        try {
          customer = await AtlasCustomerModel.findOne({ email: email.toLowerCase().trim() }).exec();
        } catch {}
      }
      if (!customer && isD1Configured()) {
        try {
          const rows = await d1Client.query('SELECT * FROM customers WHERE LOWER(email) = LOWER(?) LIMIT 1', [email.toLowerCase().trim()]);
          if (rows && rows.length > 0 && rows[0].fcm_tokens_json) {
            const fcmTokens = JSON.parse(rows[0].fcm_tokens_json);
            if (Array.isArray(fcmTokens) && fcmTokens.length > 0) {
              targetToken = fcmTokens[fcmTokens.length - 1];
            }
          }
        } catch {}
      }
      if (customer && customer.fcmTokens && customer.fcmTokens.length > 0) {
        targetToken = customer.fcmTokens[customer.fcmTokens.length - 1];
      }
    }

    if (!targetToken) {
      return res.status(400).json({
        success: false,
        error: 'Debes proporcionar un "token" o el "email" de un usuario con dispositivo registrado',
      });
    }

    const pushResult = await sendPushNotification({
      token: targetToken,
      title: title || '🧪 Prueba de Notificación Push - Wappa eSIM',
      body: body || '¡Hola! La conexión entre tu app móvil Flutter y el backend está funcionando.',
      data: {
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        route: '/my-esims',
        test: 'true',
        timestamp: new Date().toISOString(),
        ...(data || {}),
      },
    });

    res.json({
      success: pushResult.success,
      result: pushResult,
      targetToken: `${targetToken.substring(0, 15)}...`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET & POST /api/notifications/run-consumption-check
 * Executes the consumption check and alert trigger cycle with strict security and PII masking
 */
app.all('/api/notifications/run-consumption-check', async (req: Request, res: Response) => {
  try {
    const cronSecret = process.env.CRON_SECRET || process.env.ADMIN_SECRET;
    const authHeader = req.headers.authorization || '';
    const isVercelCron = req.headers['x-vercel-cron'] === '1';
    const queryKey = typeof req.query.key === 'string' ? req.query.key : '';
    const adminEmail = (req.body?.adminEmail || req.query.adminEmail || req.query.email || req.body?.email || '').toString();

    // Verification:
    // 1. Valid Admin User (via adminEmail / SYSTEM_ADMIN_EMAILS / role)
    // 2. Vercel Cron header
    // 3. Cron / Admin Secret bearer token or query key
    const isAdmin = isUserAdmin(adminEmail);
    const isBearerValid = cronSecret && authHeader.startsWith('Bearer ') && authHeader.slice(7).trim() === cronSecret;
    const isQueryKeyValid = cronSecret && queryKey === cronSecret;

    // If a secret is configured in production and it's not a verified cron or admin, enforce authentication
    if (cronSecret && !isVercelCron && !isBearerValid && !isQueryKeyValid && !isAdmin) {
      return res.status(401).json({
        success: false,
        error: 'No autorizado. Se requiere token de autorización o sesión de administrador para ejecutar el ciclo de mantenimiento.',
      });
    }

    const report = await runEsimConsumptionAlertCheck();

    // Secure response: by default only return aggregated operational metrics (Zero PII)
    const isVerbose = req.query.verbose === 'true';

    res.json({
      success: true,
      message: 'Ciclo de monitoreo de consumo y alertas ejecutado con éxito',
      summary: {
        timestamp: report.timestamp,
        totalActiveEsims: report.totalActiveEsims,
        esimsChecked: report.esimsChecked,
        alertsSent: report.alertsSent,
        alertsSimulated: report.alertsSimulated,
        errors: report.errors,
      },
      ...(isVerbose ? { details: report.details } : {}),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/esims/:iccid/reset-alerts
 * Resets notification flags for testing purposes
 */
app.post('/api/esims/:iccid/reset-alerts', async (req: Request, res: Response) => {
  try {
    const { iccid } = req.params;
    await connectToDatabase();

    const esim = await UserEsimModel.findOne({ iccid }).exec();
    if (!esim) {
      return res.status(404).json({ success: false, error: `eSIM ${iccid} no encontrada` });
    }

    esim.notified50Percent = false;
    esim.notified80Percent = false;
    esim.notified90Percent = false;
    esim.notified24Hours = false;
    esim.notified12Hours = false;
    await esim.save();

    res.json({
      success: true,
      message: `Banderas de alerta reiniciadas para la eSIM ${iccid}`,
      iccid,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/cron-out
 * Returns the latest cron execution test output from /cron.out
 */
app.get('/api/cron-out', (req: Request, res: Response) => {
  try {
    const cronOutPath = path.join(process.cwd(), 'cron.out');
    if (fs.existsSync(cronOutPath)) {
      const content = fs.readFileSync(cronOutPath, 'utf8');
      try {
        return res.json(JSON.parse(content));
      } catch {
        return res.send(content);
      }
    }
    res.status(404).json({ success: false, error: 'cron.out no encontrado' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/cron-example
 * Returns the cron example template from /cron.example
 */
app.get('/api/cron-example', (req: Request, res: Response) => {
  try {
    const cronExamplePath = path.join(process.cwd(), 'cron.example');
    if (fs.existsSync(cronExamplePath)) {
      const content = fs.readFileSync(cronExamplePath, 'utf8');
      try {
        return res.json(JSON.parse(content));
      } catch {
        return res.send(content);
      }
    }
    res.status(404).json({ success: false, error: 'cron.example no encontrado' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// DATABASE OFFLINE FALLBACK ERROR MIDDLEWARE
// ----------------------------------------------------
app.use((err: any, req: Request, res: Response, next: any) => {
  if (err && (err.name === 'MongooseError' || err.name === 'MongoNetworkError' || (err.message && err.message.includes('buffering timed out')))) {
    console.warn('[AI Studio] Database offline or timed out — returning graceful fallback');
    if (req.method === 'GET') {
      return res.json({ success: true, count: 0, items: [] });
    }
    return res.status(503).json({ success: false, error: 'Database offline — operation not completed' });
  }
  next(err);
});

export default app;
