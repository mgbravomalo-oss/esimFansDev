🌐 1. Descripción General del Proyecto
Wappa eSIM es una plataforma integral de conectividad internacional (Travel Data Hub) que permite a los usuarios buscar, comprar e instalar tarjetas eSIM digitales
para más de 190 países de manera instantánea. Cuenta con un ecosistema híbrido que incluye una aplicación web moderna (React + Vite) y una aplicación nativa complementaria 
para dispositivos móviles (Flutter para Android e iOS).

🛠️ 2. Arquitectura y Stack Tecnológico
Frontend Web (React SPA): Desarrollado con Vite, Tailwind CSS, y componentes interactivos modernos para la tienda, selector de destinos, carrito, pasarela de pago y panel de usuario.
Backend (Node.js & Express): Servidor robusto (server.ts) que gestiona las rutas de API, pasarelas de pago, sincronización de base de datos y automatizaciones.
Base de Datos (MongoDB Atlas): Almacenamiento persistente en la base de datos plan con modelos Mongoose optimizados para clientes (customers), paquetes de datos 
(esim_packages), compras de usuario (useresims) y registros de sincronización.

Aplicación Móvil Nativa (Flutter):
WebView Embebido: Carga la plataforma web manteniendo una experiencia fluida mediante flutter_inappwebview y un User-Agent personalizado (WappaMobile/1.0).
Integración eSIM Hardware (esim_manager): Permite verificar la compatibilidad e instalar perfiles eSIM directamente en el chip eUICC del teléfono mediante cadenas LPA oficiales.
Notificaciones Push (FCM): Integración completa con Firebase Cloud Messaging para alertas en primer plano, segundo plano y notificaciones flotantes interactivas (SnackBar).
Galería Nativa (gal): Permite descargar y guardar códigos QR de eSIM directamente en la galería de fotos del dispositivo.

🚀 3. Características Principales
Catálogo Global de Destinos: Exploración de países y regiones con información de operadores locales y tarifas en tiempo real.
Verificador de Compatibilidad: Herramienta inteligente para comprobar si el dispositivo móvil del usuario soporta tecnología eSIM.
Monitor Automático de Consumo (esimAlertMonitor):
Un sistema en segundo plano basado en tareas cron (node-cron) que monitorea periódicamente el consumo de datos de las eSIMs activas.
Envía alertas automáticas por notificaciones Push (FCM) y correo electrónico cuando el usuario alcanza umbrales críticos de consumo (ej. 80%, 100% o vencimiento próximo).
Puente Nativo JavaScript ⇄ Flutter: Comunicación bidireccional segura para invocar funciones nativas del sistema operativo (instalación de eSIM, vibración háptica, 
apertura de ajustes de red y guardado de imágenes).
Identidad Visual Exclusiva: Logotipo animado y sistema de iconos de la mariposa de Wappa eSIM adaptado con gradientes cian, azul e índigo en todas las plataformas
(Android mipmaps, iOS AppIcon y Web PWA).
