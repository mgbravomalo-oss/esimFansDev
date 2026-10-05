/**
 * Decodifica de forma segura la carga útil de un JWT de Google Identity Services
 * sin necesidad de dependencias externas en el cliente.
 */
export interface GoogleIdTokenPayload {
  iss?: string;
  nbf?: number;
  aud?: string;
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  iat?: number;
  exp?: number;
}

export function parseJwt(token: string): GoogleIdTokenPayload | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload) as GoogleIdTokenPayload;
  } catch (e) {
    console.error('Error al decodificar Google JWT:', e);
    return null;
  }
}
