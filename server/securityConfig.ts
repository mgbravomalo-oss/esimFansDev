/**
 * Configuración de dominios y orígenes permitidos para consumir las APIs de Wappa eSIM
 */

export const ALLOWED_ORIGINS: string[] = [
  'https://mariodev-2fif.vercel.app',
  'https://esimfans.cloud.run',
  'https://esimfans-app-c5c6gwd9ezc6gwg5.westus3-01.azurewebsites.net',
  'https://esim.fans',
  'https://www.esim.fans',
  // Entornos de desarrollo locales y de prueba en AI Studio
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

/**
 * Función auxiliar para verificar si un origen está autorizado
 */
export function isOriginAllowed(origin?: string, hostHeader?: string): boolean {
  if (!origin) {
    // Permitir llamadas sin origin (como apps móviles nativas Flutter, Postman en servidor, o fetch backend-to-backend)
    return true;
  }
  
  let cleanOrigin = origin.trim().toLowerCase();
  
  // Si es una URL completa (por ejemplo, procedente de Referer), extraer el protocolo y el host
  try {
    if (cleanOrigin.startsWith('http://') || cleanOrigin.startsWith('https://')) {
      const parsed = new URL(cleanOrigin);
      cleanOrigin = `${parsed.protocol}//${parsed.host}`;
    }
  } catch (e) {
    // Si no es una URL válida, usar el string original limpio
  }

  // 1. Si coincide con el Host actual de la petición (same-origin request)
  if (hostHeader) {
    const cleanHost = hostHeader.trim().toLowerCase();
    if (cleanOrigin === `https://${cleanHost}` || cleanOrigin === `http://${cleanHost}`) {
      return true;
    }
  }

  // 2. Entornos de Google Cloud Run / Google AI Studio (.run.app, .cloud.run)
  if (cleanOrigin.endsWith('.run.app') || cleanOrigin.includes('.run.app') || cleanOrigin.endsWith('.cloud.run')) {
    return true;
  }

  // 3. Entornos de Google AI Studio y Google Cloud
  if (cleanOrigin.endsWith('.google.com') || cleanOrigin.endsWith('.aistudio.google.com')) {
    return true;
  }

  // 4. Dominios de Vercel, Azure y dominios propios de Wappa / esim.fans
  if (cleanOrigin.endsWith('.vercel.app')) return true;
  if (cleanOrigin.endsWith('.azurewebsites.net')) return true;
  if (cleanOrigin.endsWith('.esim.fans') || cleanOrigin === 'https://esim.fans' || cleanOrigin === 'http://esim.fans') return true;

  // 5. Entornos locales
  if (cleanOrigin.includes('localhost') || cleanOrigin.includes('127.0.0.1')) return true;

  // 6. Comprobar lista estática
  return ALLOWED_ORIGINS.some(allowed => {
    const cleanAllowed = allowed.trim().toLowerCase();
    return cleanOrigin === cleanAllowed;
  });
}
