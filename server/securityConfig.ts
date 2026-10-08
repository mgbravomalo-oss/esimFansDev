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
export function isOriginAllowed(origin?: string): boolean {
  if (!origin) {
    // Permitir llamadas sin origin (como apps móviles nativas Flutter, Postman en servidor, o fetch backend-to-backend)
    return true;
  }
  
  const cleanOrigin = origin.trim().toLowerCase();
  
  // Comprobar coincidencia exacta o subdominios permitidos (.run.app, .vercel.app, .azurewebsites.net, .esim.fans)
  return ALLOWED_ORIGINS.some(allowed => {
    const cleanAllowed = allowed.trim().toLowerCase();
    if (cleanOrigin === cleanAllowed) return true;
    if (cleanOrigin.endsWith('.run.app') && cleanAllowed.endsWith('.run.app')) return true;
    if (cleanOrigin.endsWith('.vercel.app') && cleanAllowed.endsWith('.vercel.app')) return true;
    if (cleanOrigin.endsWith('.azurewebsites.net') && cleanAllowed.endsWith('.azurewebsites.net')) return true;
    if (cleanOrigin.endsWith('.esim.fans') || cleanOrigin === 'https://esim.fans' || cleanOrigin === 'http://esim.fans') return true;
    return false;
  });
}
