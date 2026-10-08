import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { runEsimConsumptionAlertCheck } from '../server/esimAlertMonitor.js';

async function runTest() {
  console.log('🚀 Ejecutando prueba real del monitor de consumo y alertas (Cron)...');
  try {
    const report = await runEsimConsumptionAlertCheck();
    const output = {
      testExecutedAt: new Date().toISOString(),
      success: true,
      report
    };
    const outPath = path.join(process.cwd(), 'cron.out');
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log('✅ Resultado guardado exitosamente en', outPath);
    console.log('📊 Reporte:', JSON.stringify(report, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('❌ Error ejecutando prueba de cron:', err);
    const errorOutput = {
      testExecutedAt: new Date().toISOString(),
      success: false,
      error: err.message
    };
    fs.writeFileSync(path.join(process.cwd(), 'cron.out'), JSON.stringify(errorOutput, null, 2), 'utf-8');
    process.exit(1);
  }
}

runTest();
