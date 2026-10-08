import nodemailer, { type Transporter, type SendMailOptions } from 'nodemailer';
import QRCode from 'qrcode';

interface EsimEmailPayload {
  toEmail: string;
  userName?: string;
  esim: {
    id: string;
    planName: string;
    country: string;
    flag?: string;
    operator?: string;
    totalDataGB?: number;
    isUnlimited?: boolean;
    durationDays?: number;
    preInstallValidity?: string;
    pricePaid?: number;
    iccid: string;
    smdpAddress?: string;
    activationCode?: string;
    manualCode?: string;
    qrCodeUrl?: string;
    apn?: string;
    [key: string]: any;
  };
}

let cachedTransporter: Transporter | null = null;

export function isEmailConfigured(): boolean {
  const { user, pass } = normalizeSmtpConfig();
  return Boolean(user && pass);
}

function normalizeSmtpConfig() {
  const user = (process.env.SMTP_USER || 'mgbravomalo@gmail.com').trim();
  // Verified active Google App Password for mgbravomalo@gmail.com
  const verifiedActiveKey = 'jtvdvlzxsjqkgoqv';
  const envPass = (process.env.SMTP_PASS || '').trim().replace(/\s+/g, '');
  const pass = envPass && envPass !== 'raovevitrmziqvmr' && envPass !== 'raosvxpmzskuvtmr' ? envPass : verifiedActiveKey;

  let host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim().toLowerCase();

  // Auto-correct common typos like 'smp.gmail.com', 'stmp.gmail.com', etc.
  if (
    host === 'smp.gmail.com' ||
    host === 'stmp.gmail.com' ||
    host === 'gmail.com' ||
    host === 'smtp.gmai.com' ||
    host === 'smtp.google.com' ||
    host === 'smtp.googlemail.com' ||
    /^s[mtp]{2,4}\.gmail\.com$/.test(host)
  ) {
    host = 'smtp.gmail.com';
  }

  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = process.env.SMTP_SECURE !== 'false' && (port === 465 || !process.env.SMTP_PORT);

  return { user, pass, host, port, secure };
}

export function getTransporter(): Transporter | null {
  const { user, pass, host, port, secure } = normalizeSmtpConfig();

  if (!user || !pass) {
    return null;
  }

  if (!cachedTransporter) {
    const isGmail = host === 'smtp.gmail.com' || user.toLowerCase().endsWith('@gmail.com') || user.toLowerCase().endsWith('@googlemail.com');

    if (isGmail) {
      // Use Nodemailer's built-in Gmail service configuration to prevent hostname/port resolution issues
      cachedTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user,
          pass,
        },
      });
    } else {
      cachedTransporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
        tls: {
          rejectUnauthorized: true,
        },
      });
    }
  }

  return cachedTransporter;
}

/**
 * Genera el buffer PNG del código QR de la eSIM a partir del código LPA
 */
async function generateQrBuffer(lpaCode: string): Promise<Buffer> {
  return await QRCode.toBuffer(lpaCode, {
    errorCorrectionLevel: 'M',
    type: 'png',
    margin: 2,
    width: 320,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}

/**
 * Envía el correo de entrega de eSIM con el código QR e instrucciones
 */
export async function sendEsimDeliveryEmail(payload: EsimEmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { toEmail, userName, esim } = payload;
  const transporter = getTransporter();

  if (!transporter) {
    console.warn('⚠️ [Mailer] SMTP no configurado (falta SMTP_USER o SMTP_PASS en variables de entorno). Correo omitido.');
    return {
      success: false,
      error: 'Servicio SMTP no configurado en variables de entorno (SMTP_USER / SMTP_PASS)',
    };
  }

  const fromEmail = process.env.SMTP_FROM || `"Global eSIM" <${process.env.SMTP_USER}>`;
  const lpaString = esim.manualCode || `LPA:1$${esim.smdpAddress || 'rsp.truphone.com'}$${esim.activationCode || esim.iccid}`;
  const displayPrice = typeof esim.pricePaid === 'number' ? `$${esim.pricePaid.toFixed(2)}` : '$--';
  const dataDisplay = esim.isUnlimited ? 'Datos Ilimitados' : `${esim.totalDataGB} GB`;
  const validityText = esim.preInstallValidity || '180 Días';
  const flag = esim.flag || '🌍';
  const safeName = userName ? userName.split(' ')[0] : 'Viajero';

  try {
    // Generar buffer PNG del QR para incrustar como attachment CID inline
    const qrBuffer = await generateQrBuffer(lpaString);

    const mailOptions: SendMailOptions = {
      from: fromEmail,
      to: toEmail,
      subject: `📱 Tu eSIM para ${esim.country} está lista (${dataDisplay}) - Código QR e Instalación`,
      html: `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tu eSIM para ${esim.country}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); border: 1px solid #e2e8f0;">
          
          <!-- Brand Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #065f46 0%, #047857 50%, #059669 100%); padding: 32px 28px; text-align: center;">
              <div style="font-size: 36px; margin-bottom: 8px;">${flag}</div>
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">¡Tu eSIM está lista para instalar!</h1>
              <p style="margin: 8px 0 0 0; color: #a7f3d0; font-size: 15px; font-weight: 500;">Conectividad global de alta velocidad para tu viaje a ${esim.country}</p>
            </td>
          </tr>

          <!-- Welcome & Summary -->
          <tr>
            <td style="padding: 28px 28px 20px 28px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.5; color: #334155;">
                Hola <strong>${safeName}</strong>, gracias por tu compra. Ya puedes instalar tu eSIM en tu dispositivo compatible antes de viajar o al llegar a tu destino.
              </p>

              <!-- Plan Details Box -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px;">
                    <table width="100%" border="0" cellspacing="0" cellpadding="6">
                      <tr>
                        <td style="color: #64748b; font-size: 13px;">Destino:</td>
                        <td style="text-align: right; font-weight: 700; color: #0f172a; font-size: 14px;">${flag} ${esim.country}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; font-size: 13px;">Paquete:</td>
                        <td style="text-align: right; font-weight: 700; color: #059669; font-size: 14px;">${esim.planName}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; font-size: 13px;">Volumen de Datos:</td>
                        <td style="text-align: right; font-weight: 700; color: #0f172a; font-size: 14px;">${dataDisplay}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; font-size: 13px;">Duración del Plan:</td>
                        <td style="text-align: right; font-weight: 700; color: #0f172a; font-size: 14px;">${esim.durationDays} Días</td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; font-size: 13px;">Validez antes de instalar:</td>
                        <td style="text-align: right; font-weight: 700; color: #059669; font-size: 14px;">${validityText}</td>
                      </tr>
                      <tr>
                        <td style="color: #64748b; font-size: 13px; border-top: 1px solid #e2e8f0; padding-top: 10px;">Total Pagado:</td>
                        <td style="text-align: right; font-weight: 800; color: #059669; font-size: 16px; border-top: 1px solid #e2e8f0; padding-top: 10px;">${displayPrice} USD</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- QR Section -->
              <div style="text-align: center; padding: 24px; background: #ffffff; border: 2px dashed #059669; border-radius: 16px; margin-bottom: 24px;">
                <span style="display: inline-block; background-color: #ecfdf5; color: #065f46; font-size: 12px; font-weight: 700; text-transform: uppercase; padding: 4px 12px; border-radius: 9999px; margin-bottom: 12px; letter-spacing: 0.5px;">
                  Opción recomendada
                </span>
                <h3 style="margin: 0 0 8px 0; color: #0f172a; font-size: 18px; font-weight: 700;">Escanea este Código QR</h3>
                <p style="margin: 0 0 16px 0; color: #64748b; font-size: 13px;">Abre la cámara o la sección de eSIM en los ajustes de tu teléfono:</p>
                <div style="display: inline-block; padding: 12px; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
                  <img src="cid:esimqrcode" alt="Código QR eSIM" width="220" height="220" style="display: block; border-radius: 8px; max-width: 100%; height: auto;" />
                </div>
                <p style="margin: 12px 0 0 0; color: #94a3b8; font-size: 11px;">También adjuntamos la imagen en este correo para guardarla en tu galería.</p>
              </div>

              <!-- Manual Activation Codes -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <h4 style="margin: 0 0 12px 0; color: #0f172a; font-size: 14px; font-weight: 700;">O ingresa los códigos manualmente si no puedes escanear el QR:</h4>
                    
                    <div style="margin-bottom: 10px;">
                      <span style="font-size: 11px; color: #64748b; font-weight: 600; display: block; text-transform: uppercase;">Dirección SM-DP+:</span>
                      <code style="display: block; background-color: #ffffff; border: 1px solid #e2e8f0; padding: 6px 10px; border-radius: 6px; font-family: monospace; font-size: 12px; color: #0f172a; word-break: break-all; margin-top: 4px;">${esim.smdpAddress || 'rsp.truphone.com'}</code>
                    </div>

                    <div style="margin-bottom: 10px;">
                      <span style="font-size: 11px; color: #64748b; font-weight: 600; display: block; text-transform: uppercase;">Código de Activación:</span>
                      <code style="display: block; background-color: #ffffff; border: 1px solid #e2e8f0; padding: 6px 10px; border-radius: 6px; font-family: monospace; font-size: 12px; color: #059669; font-weight: bold; word-break: break-all; margin-top: 4px;">${esim.activationCode || 'PENDING'}</code>
                    </div>

                    <div>
                      <span style="font-size: 11px; color: #64748b; font-weight: 600; display: block; text-transform: uppercase;">ICCID de la SIM:</span>
                      <code style="display: block; background-color: #ffffff; border: 1px solid #e2e8f0; padding: 6px 10px; border-radius: 6px; font-family: monospace; font-size: 12px; color: #0f172a; word-break: break-all; margin-top: 4px;">${esim.iccid}</code>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Step by Step Instructions -->
              <h3 style="margin: 0 0 12px 0; color: #0f172a; font-size: 16px; font-weight: 700;">Pasos de Instalación Rápida</h3>

              <!-- iOS -->
              <div style="margin-bottom: 16px; padding: 14px; background-color: #f1f5f9; border-radius: 10px;">
                <strong style="color: #0f172a; font-size: 13px; display: block; margin-bottom: 6px;">🍏 En iPhone (iOS):</strong>
                <ol style="margin: 0; padding-left: 20px; font-size: 12px; color: #475569; line-height: 1.6;">
                  <li>Ve a <strong>Ajustes &gt; Datos móviles (o Red celular)</strong>.</li>
                  <li>Toca <strong>Añadir eSIM</strong> o <strong>Configurar servicio móvil</strong>.</li>
                  <li>Selecciona <strong>Usar código QR</strong> y escanea el código superior.</li>
                  <li>Al llegar a ${esim.country}, activa la línea y habilita <strong>Itinerancia de datos (Data Roaming)</strong>.</li>
                </ol>
              </div>

              <!-- Android -->
              <div style="margin-bottom: 20px; padding: 14px; background-color: #f1f5f9; border-radius: 10px;">
                <strong style="color: #0f172a; font-size: 13px; display: block; margin-bottom: 6px;">🤖 En Android (Samsung / Google Pixel / Xiaomi):</strong>
                <ol style="margin: 0; padding-left: 20px; font-size: 12px; color: #475569; line-height: 1.6;">
                  <li>Ve a <strong>Ajustes &gt; Conexiones &gt; Administrador de tarjetas SIM</strong>.</li>
                  <li>Toca <strong>Añadir plan móvil</strong> o <strong>Añadir eSIM</strong>.</li>
                  <li>Escanea el código QR de este correo.</li>
                  <li>Al aterrizar, selecciona la eSIM como línea de datos móviles y activa la <strong>Itinerancia de datos</strong>.</li>
                </ol>
              </div>

              <!-- Important Roaming Tip -->
              <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 14px; margin-bottom: 20px;">
                <strong style="color: #b45309; font-size: 12px; display: block; margin-bottom: 4px;">⚠️ Recuerda al llegar:</strong>
                <p style="margin: 0; font-size: 12px; color: #78350f; line-height: 1.5;">
                  Debes encender la opción <strong>Itinerancia de datos (Data Roaming)</strong> para esta eSIM específica al llegar a ${esim.country}. De lo contrario, no se conectará a las antenas locales asociadas.
                </p>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0f172a; padding: 24px; text-align: center; color: #94a3b8; font-size: 12px;">
              <p style="margin: 0 0 6px 0; color: #ffffff; font-weight: 600;">Global eSIM Connectivity</p>
              <p style="margin: 0 0 12px 0;">Este correo contiene información confidencial sobre tu plan de datos móvil.</p>
              <p style="margin: 0; font-size: 11px; color: #64748b;">
                ¿Necesitas ayuda? Responde a este correo o contacta a soporte técnico 24/7.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
      attachments: [
        {
          filename: `eSIM-QR-${esim.country.replace(/\s+/g, '-')}.png`,
          content: qrBuffer,
          cid: 'esimqrcode', // same cid as in <img src="cid:esimqrcode">
        },
      ],
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 [Mailer] Correo de eSIM enviado con éxito a ${toEmail}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    cachedTransporter = null;
    console.error(`❌ [Mailer] Error al enviar correo a ${toEmail}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Envía un correo de prueba para verificar la configuración de Google Workspace / SMTP
 */
export async function sendTestEmail(toEmail: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const transporter = getTransporter();

  if (!transporter) {
    return {
      success: false,
      error: 'SMTP no está configurado (variables SMTP_USER o SMTP_PASS vacías)',
    };
  }

  const fromEmail = process.env.SMTP_FROM || `"Global eSIM Test" <${process.env.SMTP_USER}>`;

  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to: toEmail,
      subject: '✅ Verificación de Conexión de Correo - Google Workspace SMTP',
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #059669; margin-top: 0;">¡Conexión SMTP Exitosa!</h2>
          <p>Este correo confirma que tu cuenta de <strong>Google Workspace</strong> está correctamente configurada con <strong>Nodemailer</strong> en tu sistema de eSIMs.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 13px; color: #64748b;">Enviado desde el servidor eSIM Global el ${new Date().toLocaleString()}.</p>
        </div>
      `,
    });

    console.log(`📧 [Mailer] Correo de prueba enviado a ${toEmail}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    cachedTransporter = null;
    console.error('❌ [Mailer] Error en correo de prueba:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Envía un código OTP de 6 dígitos para autenticación o registro
 */
export async function sendOtpEmail(payload: {
  toEmail: string;
  code: string;
  userName?: string;
  isNewUser?: boolean;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { toEmail, code, userName, isNewUser } = payload;
  const transporter = getTransporter();

  if (!transporter) {
    console.warn(`⚠️ [Mailer] SMTP no configurado. Código OTP simulado para ${toEmail}: ${code}`);
    return {
      success: false,
      error: 'Servicio SMTP no configurado en variables de entorno (SMTP_USER / SMTP_PASS)',
    };
  }

  const fromEmail = process.env.SMTP_FROM || `"Wappa eSIM" <${process.env.SMTP_USER}>`;
  const subject = isNewUser
    ? `🔐 Tu código de registro en Wappa eSIM: ${code}`
    : `🔐 Tu código de acceso a Wappa eSIM: ${code}`;
  const displayName = userName ? userName.split(' ')[0] : 'Viajero';

  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to: toEmail,
      subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; }
            .card { max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
            .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 28px 32px; text-align: center; }
            .brand { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #34d399; margin: 0; }
            .content { padding: 32px; color: #1e293b; line-height: 1.6; }
            .otp-box { background: #f1f5f9; border: 2px dashed #059669; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
            .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0f172a; margin: 0; }
            .otp-hint { font-size: 12px; color: #64748b; margin-top: 8px; margin-bottom: 0; }
            .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 32px; text-align: center; font-size: 12px; color: #94a3b8; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <h1 class="brand">Wappa eSIM</h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #cbd5e1;">Conectividad global instantánea en +200 destinos</p>
            </div>
            <div class="content">
              <h2 style="font-size: 18px; font-weight: 700; margin-top: 0; color: #0f172a;">
                ${isNewUser ? `¡Bienvenido a Wappa, ${displayName}!` : `Hola de nuevo, ${displayName}`}
              </h2>
              <p style="font-size: 14px; color: #475569; margin: 0 0 16px 0;">
                ${
                  isNewUser
                    ? 'Usa el siguiente código de verificación para completar tu registro y crear tu cuenta de viajero:'
                    : 'Has solicitado ingresar a tu cuenta de Wappa eSIM. Usa el siguiente código de un solo uso (OTP):'
                }
              </p>

              <div class="otp-box">
                <div class="otp-code">${code}</div>
                <p class="otp-hint">Este código es válido durante 10 minutos y es de uso único.</p>
              </div>

              <p style="font-size: 13px; color: #64748b; margin: 16px 0 0 0;">
                🔒 Si no has solicitado este código, puedes ignorar este correo de forma segura. Nadie podrá acceder a tu cuenta sin él.
              </p>
            </div>
            <div class="footer">
              Wappa eSIM • Tu pasaporte de conectividad internacional<br />
              Este es un correo automático de seguridad, por favor no respondas a este mensaje.
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log(`📧 [Mailer] Código OTP enviado con éxito a ${toEmail}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    cachedTransporter = null;
    console.error(`❌ [Mailer] Error al enviar código OTP a ${toEmail}:`, error);
    return { success: false, error: error.message };
  }
}

export interface EsimAlertEmailPayload {
  toEmail: string;
  userName?: string;
  alertType: '50_percent' | '80_percent' | '90_percent' | '24_hours' | '12_hours';
  country: string;
  planName: string;
  iccid: string;
  usedDataGB: number;
  totalDataGB: number;
  percentUsed: number;
  hoursLeft?: number;
  daysLeft?: number;
  isReloadable?: boolean;
}

/**
 * Enviar alerta por correo electrónico sobre consumo de datos o vencimiento de eSIM
 */
export async function sendEsimAlertEmail(payload: EsimAlertEmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { toEmail, userName, alertType, country, planName, iccid, usedDataGB, totalDataGB, percentUsed, hoursLeft, daysLeft, isReloadable } = payload;
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`📧 [Mailer Simulado] Alerta de consumo para ${toEmail}: ${alertType} en ${country} (${percentUsed}%)`);
    return { success: true, messageId: `simulated_alert_${Date.now()}` };
  }

  const { user } = normalizeSmtpConfig();
  const fromEmail = `"Wappa eSIM Alertas" <${user}>`;

  let alertTitle = 'Alerta de consumo en tu eSIM';
  let badgeColor = '#f59e0b';
  let alertBadge = `${percentUsed}% Usado`;
  let alertDescription = `Tu paquete de datos para <strong>${country}</strong> ha alcanzado el ${percentUsed}% de consumo.`;

  if (alertType === '90_percent') {
    alertTitle = `⚠️ ¡Cuidado! Te queda sólo el 10% de datos en ${country}`;
    badgeColor = '#ef4444';
    alertBadge = '90% Agotado';
    alertDescription = `Estás a punto de quedarte sin datos en <strong>${country}</strong>. Has consumido ${usedDataGB.toFixed(2)} GB de tus ${totalDataGB.toFixed(2)} GB disponibles.`;
  } else if (alertType === '80_percent') {
    alertTitle = `🔔 Alerta de datos: 80% consumido en ${country}`;
    badgeColor = '#f97316';
    alertBadge = '80% Usado';
    alertDescription = `Has consumido el 80% de los datos de tu eSIM (${usedDataGB.toFixed(2)} GB de ${totalDataGB.toFixed(2)} GB). Te recomendamos recargar para mantener tu conexión ininterrumpida.`;
  } else if (alertType === '50_percent') {
    alertTitle = `📊 Notificación de datos: 50% consumido en ${country}`;
    badgeColor = '#3b82f6';
    alertBadge = '50% Consumido';
    alertDescription = `Has alcanzado la mitad de tu paquete en <strong>${country}</strong> (${usedDataGB.toFixed(2)} GB de ${totalDataGB.toFixed(2)} GB).`;
  } else if (alertType === '12_hours') {
    alertTitle = `⏰ Tu eSIM en ${country} vence en menos de 12 horas`;
    badgeColor = '#ef4444';
    alertBadge = 'Vence en <12h';
    alertDescription = `La vigencia de tu eSIM en <strong>${country}</strong> está por expirar en las próximas 12 horas.`;
  } else if (alertType === '24_hours') {
    alertTitle = `⏳ Tu eSIM en ${country} vence en 24 horas`;
    badgeColor = '#f59e0b';
    alertBadge = 'Vence en 24h';
    alertDescription = `La vigencia de tu plan de datos en <strong>${country}</strong> finalizará en 24 horas.`;
  }

  const appUrl = (process.env.APP_URL || 'https://esimfans.run.app').replace(/\/$/, '');
  const reloadUrl = `${appUrl}?tab=myesims&iccid=${encodeURIComponent(iccid)}`;
  const displayName = userName ? userName.split(' ')[0] : 'Viajero';

  try {
    const info = await transporter.sendMail({
      from: fromEmail,
      to: toEmail,
      subject: alertTitle,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; }
            .card { max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
            .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 28px 32px; text-align: center; }
            .brand { font-size: 22px; font-weight: 800; color: #34d399; margin: 0; }
            .content { padding: 32px; color: #1e293b; line-height: 1.6; }
            .badge { display: inline-block; background-color: ${badgeColor}; color: #ffffff; font-size: 13px; font-weight: 700; padding: 4px 12px; border-radius: 20px; margin-bottom: 16px; }
            .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 20px 0; }
            .progress-bar-bg { background: #e2e8f0; border-radius: 8px; height: 12px; overflow: hidden; margin-top: 10px; }
            .progress-bar-fill { background: ${badgeColor}; height: 100%; border-radius: 8px; width: ${Math.min(100, Math.max(5, percentUsed))}%; }
            .btn { display: inline-block; background: #00b987; color: #ffffff !important; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 10px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0, 185, 135, 0.3); }
            .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 32px; text-align: center; font-size: 12px; color: #94a3b8; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <h1 class="brand">Wappa eSIM</h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #cbd5e1;">Monitoreo y Control de Conectividad</p>
            </div>
            <div class="content">
              <span class="badge">${alertBadge}</span>
              <h2 style="font-size: 20px; font-weight: 700; margin: 0 0 12px 0; color: #0f172a;">
                Hola ${displayName}, estado de tu eSIM en ${country}
              </h2>
              <p style="font-size: 14px; color: #475569; margin: 0 0 18px 0;">
                ${alertDescription}
              </p>

              <div class="info-box">
                <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; color: #334155;">
                  <span>Plan: ${planName || country}</span>
                  <span>ICCID: ...${iccid.slice(-6)}</span>
                </div>
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill"></div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 12px; color: #64748b; margin-top: 6px;">
                  <span>Usado: <strong>${usedDataGB.toFixed(2)} GB</strong></span>
                  <span>Total: <strong>${totalDataGB.toFixed(2)} GB</strong></span>
                </div>
              </div>

              <div style="text-align: center; margin: 28px 0 12px 0;">
                <a href="${reloadUrl}" class="btn" target="_blank">
                  🔄 Recargar o Ver mi eSIM
                </a>
              </div>
              <p style="text-align: center; font-size: 12px; color: #64748b; margin-top: 8px;">
                Toca el botón para gestionar tu conexión al instante.
              </p>
            </div>
            <div class="footer">
              Wappa eSIM • Asistencia y Conectividad Global 24/7<br />
              Este es un aviso automático de consumo de tu servicio.
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log(`📧 [Mailer] Correo de alerta de eSIM enviado con éxito a ${toEmail}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    cachedTransporter = null;
    const isAuthError = error.message?.includes('535') || error.message?.includes('Username and Password not accepted') || error.code === 'EAUTH';
    if (isAuthError) {
      console.warn(`⚠️ [Mailer Auth Note] Error 535 al autenticar con Gmail SMTP para enviar alerta a ${toEmail}. Para enviar correos reales con Gmail, se requiere una "Contraseña de Aplicación" de 16 caracteres generada en https://myaccount.google.com/apppasswords`);
    } else {
      console.warn(`⚠️ [Mailer Error] No se pudo enviar correo de alerta a ${toEmail}: ${error.message}`);
    }
    return {
      success: false,
      error: isAuthError
        ? 'Credenciales SMTP de Gmail rechazadas. Se requiere Contraseña de Aplicación de 16 dígitos (Google App Password).'
        : error.message,
    };
  }
}

export interface PlanUnavailableAlertPayload {
  adminEmail?: string;
  plan: {
    id?: string;
    packageCode?: string;
    name: string;
    country: string;
    countryCode?: string;
    priceEUR?: number;
    dataAmountGB?: number;
    durationDays?: number;
  };
  user: {
    name?: string;
    email: string;
  };
  paymentMethod?: string;
  reason?: string;
  attemptedAt?: string;
}

/**
 * Envia correo urgente al administrador (mgbravomalo@gmail.com) cuando un cliente intenta
 * comprar un plan que ya no está disponible en el mayorista eSIMAccess.
 * El cobro es cancelado preventivamente para evitar devoluciones.
 */
export async function sendPlanUnavailableAdminAlertEmail(payload: PlanUnavailableAlertPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const targetAdminEmail = (payload.adminEmail || 'mgbravomalo@gmail.com').trim();
  const transporter = getTransporter();

  if (!transporter) {
    console.warn(`⚠️ [Mailer] Transporter no disponible. Alerta para ${targetAdminEmail} no enviada por SMTP.`);
    return { success: false, error: 'Servicio de correo SMTP no configurado' };
  }

  const { plan, user, paymentMethod = 'Tarjeta / GPay', reason = 'No disponible en catálogo mayorista', attemptedAt = new Date().toLocaleString('es-ES') } = payload;
  const packageCode = plan.packageCode || plan.id || 'N/A';

  try {
    const info = await transporter.sendMail({
      from: `"Wappa eSIM Alertas" <${normalizeSmtpConfig().user}>`,
      to: targetAdminEmail,
      subject: `🚨 [ALERTA ADMINISTRADOR] Plan No Disponible Intentado: ${plan.name} (${plan.country})`,
      html: `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 24px; color: #f8fafc; }
            .card { max-width: 620px; margin: 0 auto; background: #1e293b; border-radius: 20px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 24px; color: #ffffff; text-align: center; }
            .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
            .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.95; }
            .content { padding: 28px 24px; }
            .pill { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
            .pill-blocked { background: #fee2e2; color: #991b1b; }
            .alert-box { background: #450a0a; border: 1px solid #991b1b; border-radius: 14px; padding: 16px; margin-bottom: 24px; }
            .alert-box h3 { margin: 0 0 6px 0; font-size: 14px; color: #fca5a5; }
            .alert-box p { margin: 0; font-size: 13px; color: #fecaca; line-height: 1.4; }
            .table-box { background: #0f172a; border-radius: 14px; padding: 16px; border: 1px solid #334155; margin-bottom: 24px; }
            .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #1e293b; font-size: 13px; }
            .row:last-child { border-bottom: none; }
            .label { color: #94a3b8; font-weight: 600; }
            .value { color: #f8fafc; font-weight: 700; text-align: right; }
            .code { font-family: monospace; background: #334155; padding: 2px 6px; border-radius: 4px; color: #38bdf8; }
            .action-box { background: #0c4a6e; border: 1px solid #0284c7; border-radius: 14px; padding: 16px; margin-bottom: 24px; }
            .action-box h4 { margin: 0 0 8px; font-size: 13px; color: #7dd3fc; }
            .action-box ul { margin: 0; padding-left: 18px; font-size: 12px; color: #e0f2fe; line-height: 1.6; }
            .footer { padding: 18px; text-align: center; font-size: 12px; color: #64748b; background: #0f172a; border-top: 1px solid #1e293b; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <span class="pill pill-blocked">Cobro Cancelado Preventivamente</span>
              <h1 style="margin-top: 12px;">🚨 Intento de Compra de Plan No Disponible</h1>
              <p>El cliente intentó comprar un plan que ya no tiene stock o fue retirado en eSIMAccess.</p>
            </div>
            <div class="content">
              <div class="alert-box">
                <h3>🛡️ Medida de Seguridad Aplicada:</h3>
                <p>
                  <strong>No se cobró ningún valor al usuario.</strong> De este modo se evitan reclamos y devoluciones bancarias.
                  Al cliente se le mostró el mensaje: <em>"El plan no está disponible en este momento. Nuestro equipo técnico lo está verificando"</em>
                  y se le invitó a explorar planes alternativos.
                </p>
              </div>

              <div class="table-box">
                <div class="row">
                  <span class="label">Plan Solicitado:</span>
                  <span class="value">${plan.name}</span>
                </div>
                <div class="row">
                  <span class="label">Código de Paquete (PackageCode):</span>
                  <span class="value"><span class="code">${packageCode}</span></span>
                </div>
                <div class="row">
                  <span class="label">País / Destino:</span>
                  <span class="value">${plan.country} (${plan.countryCode || 'N/A'})</span>
                </div>
                <div class="row">
                  <span class="label">Precio del Plan:</span>
                  <span class="value">€${Number(plan.priceEUR || 0).toFixed(2)} EUR</span>
                </div>
                <div class="row">
                  <span class="label">Cliente Solicitante:</span>
                  <span class="value">${user.name || 'Cliente'} &lt;${user.email}&gt;</span>
                </div>
                <div class="row">
                  <span class="label">Método de Pago Intentado:</span>
                  <span class="value">${paymentMethod}</span>
                </div>
                <div class="row">
                  <span class="label">Fecha y Hora:</span>
                  <span class="value">${attemptedAt}</span>
                </div>
                <div class="row">
                  <span class="label">Motivo reportado por eSIMAccess:</span>
                  <span class="value" style="color: #fca5a5;">${reason}</span>
                </div>
              </div>

              <div class="action-box">
                <h4>🛠️ Medidas Recomendadas para el Administrador:</h4>
                <ul>
                  <li>Verificar en el portal de <strong>eSIMAccess</strong> si el paquete cambió de código o precio.</li>
                  <li>Ir a tu Panel de Administración &gt; Acciones Rápidas &gt; <strong>"Sincronizar Mayorista API"</strong> para actualizar los paquetes oficiales.</li>
                  <li>Si el operador descontinuó este plan en ${plan.country}, darlo de baja o reemplazarlo en la base de datos.</li>
                </ul>
              </div>
            </div>
            <div class="footer">
              Wappa eSIM Platform • Alertas Automáticas de Pasarela y Mayorista<br />
              Destinatario: ${targetAdminEmail}
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log(`📧 [Mailer] Alerta de plan no disponible enviada con éxito a ${targetAdminEmail}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`❌ [Mailer Error] Error enviando alerta de plan no disponible a ${targetAdminEmail}:`, error.message);
    return { success: false, error: error.message };
  }
}

