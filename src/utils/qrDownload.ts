import QRCode from 'qrcode';

/**
 * Generates a high-resolution Data URL (PNG) from an eSIM activation string or fallback URL.
 */
export async function generateQrDataUrl(text: string, width = 600): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'M'
    });
  } catch (err) {
    console.error('Error generating QR data URL:', err);
    throw err;
  }
}

/**
 * Builds the URL to download the QR code as a PNG file via the backend.
 * This triggers native Android Download Manager in Chrome Android and iOS Safari.
 */
export function getQrDownloadUrl(text: string, filename: string = 'eSIM-QR.png'): string {
  const safeFilename = filename.endsWith('.png') ? filename : `${filename}.png`;
  const params = new URLSearchParams({
    text,
    filename: safeFilename,
  });
  return `/api/qr/download?${params.toString()}`;
}

/**
 * Builds the URL to view the QR image directly in a browser tab.
 */
export function getQrImageUrl(text: string): string {
  const params = new URLSearchParams({ text });
  return `/api/qr/image?${params.toString()}`;
}

/**
 * Detects if the current client is a mobile device (Android or iOS).
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Triggers an image download or native share sheet, resilient across mobile Chrome, iOS, and desktop.
 */
export async function downloadOrShareImage(
  dataUrl: string,
  filename: string,
  title: string = 'Código QR eSIM',
  qrText?: string,
  preferShare?: boolean
): Promise<'shared' | 'downloaded' | 'opened'> {
  const safeFilename = filename.endsWith('.png') ? filename : `${filename}.png`;

  // 1. Flutter Android Native Bridge: Si la app corre dentro del visor Flutter
  if (typeof window !== 'undefined' && (window as any).FlutterNativeBridge) {
    const requestId = `qr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      return await new Promise<'downloaded' | 'opened'>((resolve) => {
        const handleResult = (event: Event) => {
          const result = (event as CustomEvent<{ requestId: string; saved: boolean }>).detail;
          if (result.requestId !== requestId) return;
          window.removeEventListener('flutter-native-save-result', handleResult);
          resolve(result.saved ? 'downloaded' : 'opened');
        };

        window.addEventListener('flutter-native-save-result', handleResult);
        (window as any).FlutterNativeBridge.postMessage(
          JSON.stringify({ action: 'save_image', base64: dataUrl, filename: safeFilename, requestId })
        );

        setTimeout(() => {
          window.removeEventListener('flutter-native-save-result', handleResult);
          resolve('opened');
        }, 15000);
      });
    } catch (bridgeErr) {
      console.warn('FlutterNativeBridge falló, probando métodos estándar:', bridgeErr);
    }
  }

  // Convert Data URL to Blob
  let blob: Blob | null = null;
  try {
    const parts = dataUrl.split(',');
    if (parts.length === 2) {
      const byteString = atob(parts[1]);
      const mimeString = parts[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      blob = new Blob([ab], { type: mimeString });
    }
  } catch (blobErr) {
    console.warn('Error convirtiendo dataUrl a Blob:', blobErr);
  }

  const isMobile = isMobileDevice();

  // 2. Mobile Web Share API (si preferShare es true o no se especificó y soporta archivos)
  if (preferShare && blob && typeof navigator !== 'undefined' && navigator.canShare) {
    try {
      const file = new File([blob], safeFilename, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title,
          text: 'Código QR para instalar eSIM en tu teléfono'
        });
        return 'shared';
      }
    } catch (shareErr: any) {
      // AbortError significa que el usuario canceló voluntariamente el diálogo nativo
      if (shareErr.name === 'AbortError') {
        return 'shared';
      }
      console.warn('Web Share falló o fue cancelado, continuando con descarga directa:', shareErr);
    }
  }

  // 3. Descarga mediante Endpoint HTTP dedicado en el Servidor (Máxima compatibilidad en Chrome Android)
  // Chrome en Android descarga archivos con Content-Disposition a la carpeta /Download usando el Download Manager nativo
  if (qrText) {
    try {
      const downloadUrl = getQrDownloadUrl(qrText, safeFilename);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = safeFilename;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (link.parentNode) link.parentNode.removeChild(link);
      }, 3000);
      return 'downloaded';
    } catch (serverDlErr) {
      console.warn('Fallo en descarga vía servidor:', serverDlErr);
    }
  }

  // 4. Standard Blob Object URL download (Ideal para Desktop y navegadores compatibles)
  if (blob) {
    try {
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = safeFilename;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (link.parentNode) link.parentNode.removeChild(link);
        URL.revokeObjectURL(objectUrl);
      }, 3000);
      return 'downloaded';
    } catch (blobDlErr) {
      console.warn('Error en descarga Blob URL:', blobDlErr);
    }
  }

  // 5. Fallback para móviles cuando la descarga es bloqueada (ej. iframes sandboxed): Abrir imagen HTTP directa
  if (qrText) {
    try {
      const imageUrl = getQrImageUrl(qrText);
      window.open(imageUrl, '_blank');
      return 'opened';
    } catch {
      // Ignore
    }
  }

  return 'opened';
}
