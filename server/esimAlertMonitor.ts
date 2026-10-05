/**
 * eSIM Alert Monitor & Cron Engine
 * 
 * Periodically monitors active eSIM data consumption and validity expiration
 * - Fetches real usage from eSIM Access Wholesale API via ICCID
 * - Evaluates anti-spam threshold rules:
 *   * Data usage: 50%, 80%, 90%
 *   * Validity time: 24h, 12h
 * - Dispatches FCM push notifications to Flutter mobile devices
 * - Flags records in MongoDB Atlas to prevent duplicate notifications y listo
 */

import cron from 'node-cron';
import { UserEsimModel, AtlasCustomerModel, connectToDatabase } from './db.js';
import { queryEsimUsage, isEsimAccessConfigured } from './esimAccess.js';
import { sendPushNotification, buildEsimAlertMessage } from './fcm.js';
import { sendEsimAlertEmail } from './mailer.js';

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***.***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

function maskIccid(iccid: string): string {
  if (!iccid || iccid.length < 8) return '****';
  return `${iccid.substring(0, 5)}...${iccid.substring(iccid.length - 4)}`;
}

export interface AlertCheckSummary {
  timestamp: string;
  totalActiveEsims: number;
  esimsChecked: number;
  alertsSent: number;
  alertsSimulated: number;
  errors: number;
  details: Array<{
    iccidMasked: string;
    country: string;
    userEmailMasked: string;
    usedDataGB: number;
    totalDataGB: number;
    percentUsed: number;
    hoursLeft: number;
    alertTriggered?: string;
    tokenFound: boolean;
    pushResult?: any;
    error?: string;
  }>;
}

let isCheckRunning = false;

/**
 * Execute a complete cycle of consumption check and push notifications
 */
export async function runEsimConsumptionAlertCheck(): Promise<AlertCheckSummary> {
  if (isCheckRunning) {
    console.log('⏳ [eSIM Monitor] Ya hay un chequeo de consumo en ejecución. Omitiendo ciclo concurrente.');
    return {
      timestamp: new Date().toISOString(),
      totalActiveEsims: 0,
      esimsChecked: 0,
      alertsSent: 0,
      alertsSimulated: 0,
      errors: 0,
      details: [],
    };
  }

  isCheckRunning = true;
  const startTime = new Date();
  console.log(`🔍 [eSIM Monitor] Iniciando monitor de consumo y vencimiento a las ${startTime.toLocaleTimeString()}...`);

  const summary: AlertCheckSummary = {
    timestamp: startTime.toISOString(),
    totalActiveEsims: 0,
    esimsChecked: 0,
    alertsSent: 0,
    alertsSimulated: 0,
    errors: 0,
    details: [],
  };

  try {
    const connected = await connectToDatabase();
    if (!connected) {
      console.log('ℹ️ [eSIM Monitor] MongoDB no disponible; omitiendo ciclo de monitor de consumo.');
      return summary;
    }

    // Find all active or ready to install user eSIMs
    const activeEsims = await UserEsimModel.find({
      status: { $in: ['active', 'ready_to_install'] },
      iccid: { $exists: true, $ne: '' },
    }).exec();

    summary.totalActiveEsims = activeEsims.length;

    for (const esim of activeEsims) {
      summary.esimsChecked++;
      const detail: (typeof summary.details)[0] = {
        iccidMasked: maskIccid(esim.iccid),
        country: esim.country,
        userEmailMasked: maskEmail(esim.userEmail),
        usedDataGB: esim.usedDataGB || 0,
        totalDataGB: esim.totalDataGB || 1,
        percentUsed: 0,
        hoursLeft: 9999,
        tokenFound: false,
      };

      try {
        // 1. Query eSIM Access API for fresh consumption if configured
        if (isEsimAccessConfigured() && esim.iccid) {
          try {
            const usageResult = await queryEsimUsage({
              iccid: esim.iccid,
              orderNo: esim.orderNo,
            });

            if (usageResult.success && usageResult.usedDataGB !== undefined) {
              esim.usedDataGB = usageResult.usedDataGB;
              if (usageResult.totalDataGB && usageResult.totalDataGB > 0) {
                esim.totalDataGB = usageResult.totalDataGB;
              }
              if (usageResult.status === 'ACTIVE' || usageResult.usedBytes! > 0) {
                esim.status = 'active';
              }
              detail.usedDataGB = esim.usedDataGB;
              detail.totalDataGB = esim.totalDataGB;
            }
          } catch (apiErr: any) {
            console.warn(`⚠️ [eSIM Monitor] No se pudo consultar consumo en eSIM Access para ICCID ${esim.iccid}: ${apiErr.message}`);
          }
        }

        // 2. Calculate percentages and time remaining
        const totalGB = Math.max(0.1, esim.totalDataGB || 1);
        const usedGB = Math.max(0, esim.usedDataGB || 0);
        const percentUsed = Math.min(100, (usedGB / totalGB) * 100);
        detail.percentUsed = Math.round(percentUsed);

        let hoursLeft = 9999;
        let daysLeft = 999;
        if (esim.expiryDate) {
          const expiryMs = new Date(esim.expiryDate).getTime();
          const nowMs = Date.now();
          hoursLeft = Math.round((expiryMs - nowMs) / (1000 * 60 * 60));
          daysLeft = Math.max(0, Math.ceil(hoursLeft / 24));
          detail.hoursLeft = hoursLeft;
        }

        // 3. Resolve FCM Token for User
        let userFcmToken: string | null = esim.fcmToken || null;

        if (!userFcmToken && esim.userEmail) {
          const customer = await AtlasCustomerModel.findOne({
            email: esim.userEmail.toLowerCase().trim(),
          }).exec();

          if (customer) {
            if (customer.fcmTokens && customer.fcmTokens.length > 0) {
              userFcmToken = customer.fcmTokens[customer.fcmTokens.length - 1];
            } else if (customer.fcmDevices && customer.fcmDevices.length > 0) {
              userFcmToken = customer.fcmDevices[customer.fcmDevices.length - 1].token;
            }
          }
        }

        detail.tokenFound = Boolean(userFcmToken);

        // 4. Evaluate Alert Thresholds (Prioritized from most critical)
        let alertTypeToTrigger: '90_percent' | '80_percent' | '50_percent' | '12_hours' | '24_hours' | null = null;

        // Data Thresholds
        if (percentUsed >= 90 && !esim.notified90Percent) {
          alertTypeToTrigger = '90_percent';
        } else if (percentUsed >= 80 && !esim.notified80Percent) {
          alertTypeToTrigger = '80_percent';
        } else if (percentUsed >= 50 && !esim.notified50Percent) {
          alertTypeToTrigger = '50_percent';
        }
        // Time Thresholds (if data thresholds didn't already trigger)
        else if (hoursLeft <= 12 && hoursLeft > 0 && !esim.notified12Hours) {
          alertTypeToTrigger = '12_hours';
        } else if (hoursLeft <= 24 && hoursLeft > 12 && !esim.notified24Hours) {
          alertTypeToTrigger = '24_hours';
        }

        if (alertTypeToTrigger) {
          detail.alertTriggered = alertTypeToTrigger;

          const msg = buildEsimAlertMessage({
            type: alertTypeToTrigger,
            country: esim.country || 'tu destino',
            usedDataGB: usedGB,
            totalDataGB: totalGB,
            daysLeft,
            hoursLeft,
            isReloadable: Boolean(esim.isReloadable || (esim.supportTopUpType && esim.supportTopUpType > 0)),
          });

          // Even if user hasn't registered FCM token yet, we build the payload and record the trigger
          const targetToken = userFcmToken || 'SIMULATED_DEVICE_TOKEN_DEV';

          const pushRes = await sendPushNotification({
            token: targetToken,
            title: msg.title,
            body: msg.body,
            data: {
              click_action: 'FLUTTER_NOTIFICATION_CLICK',
              route: '/my-esims',
              iccid: esim.iccid,
              country: esim.country,
              countryCode: esim.countryCode,
              planName: esim.planName,
              alertType: alertTypeToTrigger,
              usedDataGB: usedGB.toFixed(2),
              totalDataGB: totalGB.toFixed(2),
              percentUsed: String(Math.round(percentUsed)),
              isReloadable: String(Boolean(esim.isReloadable)),
            },
          });

          detail.pushResult = pushRes;

          if (pushRes.success) {
            if (pushRes.simulated) {
              summary.alertsSimulated++;
            } else {
              summary.alertsSent++;
            }

            // Set flags to prevent duplicate spam notifications
            if (alertTypeToTrigger === '90_percent') {
              esim.notified90Percent = true;
              esim.notified80Percent = true;
              esim.notified50Percent = true;
            } else if (alertTypeToTrigger === '80_percent') {
              esim.notified80Percent = true;
              esim.notified50Percent = true;
            } else if (alertTypeToTrigger === '50_percent') {
              esim.notified50Percent = true;
            } else if (alertTypeToTrigger === '12_hours') {
              esim.notified12Hours = true;
              esim.notified24Hours = true;
            } else if (alertTypeToTrigger === '24_hours') {
              esim.notified24Hours = true;
            }

            esim.lastNotificationSentAt = new Date();
            esim.lastNotificationType = alertTypeToTrigger;

            if (!esim.notificationHistory) {
              esim.notificationHistory = [];
            }

            esim.notificationHistory.push({
              type: alertTypeToTrigger,
              title: msg.title,
              body: msg.body,
              sentAt: new Date(),
              percentageUsed: Math.round(percentUsed),
              hoursLeft,
              success: true,
            });

            // Enviar correo electrónico de alerta complementario
            if (esim.userEmail && esim.userEmail.includes('@')) {
              try {
                const resolvedUserName = (esim as any).userName || (esim.userEmail ? esim.userEmail.split('@')[0] : 'Cliente');
                await sendEsimAlertEmail({
                  toEmail: esim.userEmail,
                  userName: resolvedUserName,
                  alertType: alertTypeToTrigger,
                  country: esim.country || 'Destino Internacional',
                  planName: esim.planName || esim.country || 'Wappa eSIM',
                  iccid: esim.iccid,
                  usedDataGB: usedGB,
                  totalDataGB: totalGB,
                  percentUsed: Math.round(percentUsed),
                  hoursLeft,
                  daysLeft,
                  isReloadable: Boolean(esim.isReloadable),
                });
              } catch (emailErr: any) {
                console.warn(`⚠️ [eSIM Monitor] No se pudo enviar email de alerta a ${esim.userEmail}:`, emailErr.message);
              }
            }

            await esim.save();
          } else {
            summary.errors++;
            detail.error = pushRes.error;
          }
        }

        // Save fresh usage stats if updated
        if (esim.isModified()) {
          await esim.save();
        }
      } catch (itemErr: any) {
        summary.errors++;
        detail.error = itemErr.message;
        console.error(`❌ [eSIM Monitor] Error procesando eSIM ${esim.iccid}:`, itemErr);
      }

      summary.details.push(detail);
    }

    console.log(
      `📊 [eSIM Monitor] Chequeo completado: ${summary.esimsChecked} eSIMs verificadas, ${summary.alertsSent} alertas enviadas (${summary.alertsSimulated} simuladas).`
    );
  } catch (err: any) {
    console.error('❌ [eSIM Monitor Error] Error general en el monitor de consumo:', err);
    summary.errors++;
  } finally {
    isCheckRunning = false;
  }

  return summary;
}

/**
 * Initialize periodic cron worker (Runs every 4 hours by default)
 */
export function initEsimAlertCronJob(): void {
  const cronSchedule = process.env.ESIM_ALERT_CRON_SCHEDULE || '0 */4 * * *';

  console.log(`⏰ [eSIM Monitor] Programando Cron Job de alertas de consumo (${cronSchedule})...`);

  cron.schedule(cronSchedule, async () => {
    console.log('⏰ [eSIM Monitor Cron] Disparando revisión periódica programada...');
    try {
      await runEsimConsumptionAlertCheck();
    } catch (err: any) {
      console.error('❌ [eSIM Monitor Cron Error]:', err);
    }
  });

  // Optional: Run initial verification 15 seconds after server startup
  setTimeout(() => {
    runEsimConsumptionAlertCheck().catch((err) => {
      console.warn('⚠️ [eSIM Monitor Startup Check] Error inicial no crítico:', err.message);
    });
  }, 15000);
}
