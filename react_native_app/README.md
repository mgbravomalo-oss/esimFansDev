# eSIM Global - React Native (Expo) Mobile App

Aplicación móvil nativa en **React Native (Expo)** para **eSIM Global**, diseñada para conectarse directamente a la misma API y base de datos de tu plataforma web.

---

## 📱 Características Nativas Incluidas:

1. **Pantalla "Tienda" (Catálogo Nativo):**
   * Buscador ultrarrápido con banderas y filtrado instantáneo.
   * Renderizado optimizado con `FlatList` nativo de 60/120 fps.
   * Indicadores de cobertura 4G/5G y precios en tiempo real.

2. **Pantalla "Mis eSIMs":**
   * Consulta directa al operador mayorista (**eSIM Access**) con botón de refresco en vivo.
   * Barra de balance de datos con detección de Megabytes y Gigabytes consumidos.
   * Conteo exacto de días de vigencia restantes.
   * Caché local con `AsyncStorage`: tus perfiles y códigos QR abren de inmediato incluso en modo avión.

3. **Visor de Código QR Nativo (SVG):**
   * Renderizado nativo con `react-native-qrcode-svg`.
   * Código de activación manual **LPA** con botón de copiado al portapapeles con 1 toque.
   * Instrucciones detalladas de instalación en ajustes del teléfono.

4. **Pantalla de Soporte & Diagnóstico:**
   * Verificador de compatibilidad rápida con marcado `*#06#` para detectar el EID.
   * Pasos de activación y botón de contacto directo.

---

## 🚀 Cómo probarla en tu teléfono en 3 minutos:

### 1. En tu teléfono móvil (Android o iPhone):
* Descarga la app gratuita **Expo Go** desde Google Play Store o App Store.

### 2. En tu computadora (en una terminal):
```bash
cd react_native_app
npm install
npx expo start
```

### 3. Conexión instantánea:
* En la terminal aparecerá un **código QR**.
* Abre **Expo Go** en tu Android, dale a **"Scan QR Code"** y apunta a la pantalla.
* ¡La app cargará en tu teléfono con recarga en vivo en tiempo real!

---

## 📦 Compilación para Tiendas (Google Play / App Store):

Para generar el archivo instalable final sin configurar Android Studio ni Xcode:
```bash
# 1. Instalar CLI de compilación en la nube
npm install -g eas-cli
eas login

# 2. Compilar APK para instalar en cualquier Android:
eas build -p android --profile preview

# 3. Compilar AAB para subir a Google Play Store:
eas build -p android --profile production

# 4. Compilar IPA para Apple App Store / TestFlight:
eas build -p ios --profile production
```
