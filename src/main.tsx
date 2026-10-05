import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';

// Registro automático del Service Worker para soporte PWA Offline e Instalabilidad
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onOfflineReady() {
      console.log('PWA eSIM Global lista para funcionamiento sin conexión.');
    },
  });
}

// ============================================================================
// INTERCEPTOR GLOBAL DE FETCH (SEGURIDAD CRIPTOGRÁFICA TRANSPARENTE)
// Evita que peticiones externas o de componentes no autorizados llamen a la API sin token
// ============================================================================
const originalFetch = window.fetch;
try {
  Object.defineProperty(window, 'fetch', {
    value: async function (this: any, input: any, init: any) {
      let urlStr = '';
      if (typeof input === 'string') {
        urlStr = input;
      } else if (input && (input as any).url) {
        urlStr = (input as any).url;
      }

      if (urlStr.startsWith('/api/') || urlStr.includes('/api/')) {
        try {
          const saved = localStorage.getItem('wappa_user_session');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed) {
              init = init || {};
              init.headers = init.headers || {};

              if (parsed.email) {
                const email = parsed.email;
                if (init.headers instanceof Headers) {
                  if (!init.headers.has('x-user-email')) init.headers.set('x-user-email', email);
                  if (parsed.isAdmin && !init.headers.has('x-admin-email')) init.headers.set('x-admin-email', email);
                } else if (Array.isArray(init.headers)) {
                  if (!init.headers.some(([k]) => k.toLowerCase() === 'x-user-email')) {
                    init.headers.push(['x-user-email', email]);
                  }
                  if (parsed.isAdmin && !init.headers.some(([k]) => k.toLowerCase() === 'x-admin-email')) {
                    init.headers.push(['x-admin-email', email]);
                  }
                } else {
                  if (!(init.headers as Record<string, string>)['x-user-email']) {
                    (init.headers as Record<string, string>)['x-user-email'] = email;
                  }
                  if (parsed.isAdmin && !(init.headers as Record<string, string>)['x-admin-email']) {
                    (init.headers as Record<string, string>)['x-admin-email'] = email;
                  }
                }
              }

              if (parsed.token) {
                if (init.headers instanceof Headers) {
                  if (!init.headers.has('Authorization')) {
                    init.headers.set('Authorization', `Bearer ${parsed.token}`);
                  }
                } else if (Array.isArray(init.headers)) {
                  const hasAuth = init.headers.some(([k]) => k.toLowerCase() === 'authorization');
                  if (!hasAuth) {
                    init.headers.push(['Authorization', `Bearer ${parsed.token}`]);
                  }
                } else {
                  const keys = Object.keys(init.headers);
                  const hasAuth = keys.some(k => k.toLowerCase() === 'authorization');
                  if (!hasAuth) {
                    init.headers = {
                      ...init.headers,
                      'Authorization': `Bearer ${parsed.token}`
                    };
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('Error al inyectar el token de seguridad:', e);
        }
      }
      return originalFetch.call(this, input, init);
    },
    writable: true,
    configurable: true,
    enumerable: true
  });
} catch (e) {
  console.error('Error al redefinir window.fetch con Object.defineProperty:', e);
  try {
    // Fallback: intentamos en globalThis si window.fetch no era configurable
    (globalThis as any).fetch = async function (this: any, input: any, init: any) {
      let urlStr = '';
      if (typeof input === 'string') {
        urlStr = input;
      } else if (input && (input as any).url) {
        urlStr = (input as any).url;
      }

      if (urlStr.startsWith('/api/') || urlStr.includes('/api/')) {
        try {
          const saved = localStorage.getItem('wappa_user_session');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed) {
              init = init || {};
              init.headers = init.headers || {};

              if (parsed.email) {
                const email = parsed.email;
                if (init.headers instanceof Headers) {
                  if (!init.headers.has('x-user-email')) init.headers.set('x-user-email', email);
                  if (parsed.isAdmin && !init.headers.has('x-admin-email')) init.headers.set('x-admin-email', email);
                } else if (Array.isArray(init.headers)) {
                  if (!init.headers.some(([k]) => k.toLowerCase() === 'x-user-email')) {
                    init.headers.push(['x-user-email', email]);
                  }
                  if (parsed.isAdmin && !init.headers.some(([k]) => k.toLowerCase() === 'x-admin-email')) {
                    init.headers.push(['x-admin-email', email]);
                  }
                } else {
                  if (!(init.headers as Record<string, string>)['x-user-email']) {
                    (init.headers as Record<string, string>)['x-user-email'] = email;
                  }
                  if (parsed.isAdmin && !(init.headers as Record<string, string>)['x-admin-email']) {
                    (init.headers as Record<string, string>)['x-admin-email'] = email;
                  }
                }
              }

              if (parsed.token) {
                if (init.headers instanceof Headers) {
                  if (!init.headers.has('Authorization')) {
                    init.headers.set('Authorization', `Bearer ${parsed.token}`);
                  }
                } else if (Array.isArray(init.headers)) {
                  const hasAuth = init.headers.some(([k]) => k.toLowerCase() === 'authorization');
                  if (!hasAuth) {
                    init.headers.push(['Authorization', `Bearer ${parsed.token}`]);
                  }
                } else {
                  const keys = Object.keys(init.headers);
                  const hasAuth = keys.some(k => k.toLowerCase() === 'authorization');
                  if (!hasAuth) {
                    init.headers = {
                      ...init.headers,
                      'Authorization': `Bearer ${parsed.token}`
                    };
                  }
                }
              }
            }
          }
        } catch (err) {
          console.warn('Error en fallback de inyección de token:', err);
        }
      }
      return originalFetch.call(this, input, init);
    };
  } catch (err) {
    console.error('Error crítico: No se pudo configurar el interceptor de seguridad para fetch.', err);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
