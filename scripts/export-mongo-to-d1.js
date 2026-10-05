import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return isNaN(val) ? 'NULL' : String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (typeof val === 'object') {
    if (val instanceof Date) return `'${val.toISOString()}'`;
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function exportMongoToD1() {
  const uri = (process.env.MONGODB_URI || process.env.MONGO_URI || '').trim();

  console.log('\n🚀 ================= EXPORTADOR MONGODB A CLOUDFLARE D1 =================');

  if (!uri) {
    console.error('❌ ERROR: MONGODB_URI no está configurado en tu .env');
    process.exit(1);
  }

  const outputDir = path.join(process.cwd(), 'd1');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const sqlFile = path.join(outputDir, 'migration_data.sql');
  const stream = fs.createWriteStream(sqlFile, { encoding: 'utf8' });

  stream.write('-- ==========================================================\n');
  stream.write('-- Wappa eSIM - Migración de Datos desde MongoDB Atlas a D1\n');
  stream.write(`-- Fecha de exportación: ${new Date().toISOString()}\n`);
  stream.write('-- ==========================================================\n\n');

  try {
    console.log('⏳ Conectando a MongoDB Atlas...');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      dbName: 'plan',
    });

    console.log(`✅ Conectado a base de datos: "${mongoose.connection.name}"`);

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const colNames = collections.map(c => c.name);
    console.log(`📂 Colecciones disponibles: [${colNames.join(', ')}]\n`);

    // 1. EXPORTAR PLANES (plans / esim_packages / packages)
    let plansColName = 'plans';
    if (colNames.includes('esim_packages')) plansColName = 'esim_packages';
    else if (colNames.includes('packages')) plansColName = 'packages';

    console.log(`📦 Exportando paquetes desde colección "${plansColName}"...`);
    const plansCol = db.collection(plansColName);
    const plansCursor = plansCol.find({});
    let planCount = 0;

    stream.write(`-- Tabla: esim_plans\n`);
    stream.write(`DELETE FROM esim_plans;\n\n`);

    while (await plansCursor.hasNext()) {
      const doc = await plansCursor.next();
      const id = doc._id ? String(doc._id) : `plan_${Date.now()}_${planCount}`;
      const planId = doc.planId || doc.packageCode || doc.id || id;
      const name = doc.name || doc.packageName || 'Plan eSIM';
      const country = doc.country || doc.locationName || 'Destino';
      const countryCode = (doc.countryCode || doc.locationCode || 'GL').toUpperCase();
      const region = doc.region || 'global';
      const regionLabel = doc.regionLabel || null;
      const dataGb = doc.dataGb !== undefined ? doc.dataGb : (doc.volumeGb || (doc.volume ? doc.volume / (1024 * 1024 * 1024) : 1));
      const isUnlimited = doc.isUnlimited ? 1 : 0;
      const durationDays = doc.durationDays || doc.duration || 30;
      const priceUsd = doc.priceUsd || (doc.price ? doc.price / 10000 : null);
      const priceEur = doc.priceEUR || doc.priceEur || (priceUsd ? priceUsd * 0.92 : 4.90);
      const speed = doc.speed || '5G';
      const operatorsJson = doc.operators ? JSON.stringify(doc.operators) : null;
      const operator = doc.operator || (Array.isArray(doc.operators) ? doc.operators.join(', ') : 'Red Local');
      const hotspot = doc.hotspot !== false ? 1 : 0;
      const kycRequired = doc.kycRequired ? 1 : 0;
      const popular = doc.popular ? 1 : 0;
      const bestValue = doc.bestValue ? 1 : 0;
      const apn = doc.apn || 'globaldata';
      const featuresJson = doc.features ? JSON.stringify(doc.features) : null;
      const coverageDetails = doc.coverageDetails || null;
      const supportTopUpType = doc.supportTopUpType || null;
      const isReloadable = doc.isReloadable ? 1 : 0;

      stream.write(
        `INSERT INTO esim_plans (id, plan_id, name, country, country_code, region, region_label, data_gb, is_unlimited, duration_days, price_usd, price_eur, speed, operators_json, operator, hotspot, kyc_required, popular, best_value, apn, features_json, coverage_details, support_top_up_type, is_reloadable) VALUES (${escapeSql(id)}, ${escapeSql(planId)}, ${escapeSql(name)}, ${escapeSql(country)}, ${escapeSql(countryCode)}, ${escapeSql(region)}, ${escapeSql(regionLabel)}, ${escapeSql(dataGb)}, ${isUnlimited}, ${durationDays}, ${escapeSql(priceUsd)}, ${escapeSql(priceEur)}, ${escapeSql(speed)}, ${escapeSql(operatorsJson)}, ${escapeSql(operator)}, ${hotspot}, ${kycRequired}, ${popular}, ${bestValue}, ${escapeSql(apn)}, ${escapeSql(featuresJson)}, ${escapeSql(coverageDetails)}, ${escapeSql(supportTopUpType)}, ${isReloadable});\n`
      );
      planCount++;
    }
    console.log(`   ✓ ${planCount} planes exportados.`);

    // 2. EXPORTAR CLIENTES (customers)
    if (colNames.includes('customers')) {
      console.log(`👥 Exportando clientes...`);
      stream.write(`\n-- Tabla: customers\n`);
      stream.write(`DELETE FROM customers;\n\n`);
      const custCursor = db.collection('customers').find({});
      let custCount = 0;
      while (await custCursor.hasNext()) {
        const c = await custCursor.next();
        const id = c.id || String(c._id);
        const name = c.name || 'Usuario';
        const email = c.email || `${id}@wappa.com`;
        const phone = c.phone || null;
        const role = c.role || 'user';
        const status = c.status || 'active';
        const country = c.country || null;
        const countryCode = c.countryCode || null;
        const notes = c.notes || null;
        const totalSpentUsd = c.totalSpentUsd || 0.0;
        const totalDataUsedGb = c.totalDataUsedGb || 0.0;
        const fcmTokensJson = c.fcmTokens ? JSON.stringify(c.fcmTokens) : null;
        const pushEnabled = c.pushNotificationsEnabled !== false ? 1 : 0;

        stream.write(
          `INSERT INTO customers (id, name, email, phone, role, status, country, country_code, notes, total_spent_usd, total_data_used_gb, fcm_tokens_json, push_notifications_enabled) VALUES (${escapeSql(id)}, ${escapeSql(name)}, ${escapeSql(email)}, ${escapeSql(phone)}, ${escapeSql(role)}, ${escapeSql(status)}, ${escapeSql(country)}, ${escapeSql(countryCode)}, ${escapeSql(notes)}, ${escapeSql(totalSpentUsd)}, ${escapeSql(totalDataUsedGb)}, ${escapeSql(fcmTokensJson)}, ${pushEnabled});\n`
        );
        custCount++;
      }
      console.log(`   ✓ ${custCount} clientes exportados.`);
    }

    // 3. EXPORTAR ESIMS DE USUARIOS (useresims)
    if (colNames.includes('useresims')) {
      console.log(`📱 Exportando eSIMs de usuarios...`);
      stream.write(`\n-- Tabla: user_esims\n`);
      stream.write(`DELETE FROM user_esims;\n\n`);
      const esimCursor = db.collection('useresims').find({});
      let userEsimCount = 0;
      while (await esimCursor.hasNext()) {
        const e = await esimCursor.next();
        const id = e.id || String(e._id);
        const userId = e.userId || 'user-default';
        const userEmail = e.userEmail || '';
        const userName = e.userName || null;
        const iccid = e.iccid || `ICCID_${id}`;
        const planId = e.planId || 'plan-1';
        const planName = e.planName || 'Plan eSIM';
        const country = e.country || 'Destino';
        const countryCode = e.countryCode || 'GL';
        const flag = e.flag || '🌍';
        const operator = e.operator || 'Red Móvil';
        const network5G = e.network5G !== false ? 1 : 0;
        const qrCodeUrl = e.qrCodeUrl || '';
        const smdpAddress = e.smdpAddress || 'smdp.wappa-esim.net';
        const activationCode = e.activationCode || '';
        const manualCode = e.manualCode || '';
        const totalDataGB = e.totalDataGB || 1.0;
        const usedDataGB = e.usedDataGB || 0.0;
        const isUnlimited = e.isUnlimited ? 1 : 0;
        const durationDays = e.durationDays || 30;
        const pricePaid = e.pricePaid || 0.0;
        const purchaseDate = e.purchaseDate || new Date().toISOString().split('T')[0];
        const activationDate = e.activationDate || null;
        const expiryDate = e.expiryDate || new Date().toISOString().split('T')[0];
        const status = e.status || 'ready_to_install';
        const apn = e.apn || 'globaldata';
        const eid = e.eid || null;
        const deviceBrand = e.deviceBrand || null;
        const deviceModel = e.deviceModel || null;

        stream.write(
          `INSERT INTO user_esims (id, user_id, user_email, user_name, iccid, plan_id, plan_name, country, country_code, flag, operator, network_5g, qr_code_url, smdp_address, activation_code, manual_code, total_data_gb, used_data_gb, is_unlimited, duration_days, price_paid, purchase_date, activation_date, expiry_date, status, apn, eid, device_brand, device_model) VALUES (${escapeSql(id)}, ${escapeSql(userId)}, ${escapeSql(userEmail)}, ${escapeSql(userName)}, ${escapeSql(iccid)}, ${escapeSql(planId)}, ${escapeSql(planName)}, ${escapeSql(country)}, ${escapeSql(countryCode)}, ${escapeSql(flag)}, ${escapeSql(operator)}, ${network5G}, ${escapeSql(qrCodeUrl)}, ${escapeSql(smdpAddress)}, ${escapeSql(activationCode)}, ${escapeSql(manualCode)}, ${totalDataGB}, ${usedDataGB}, ${isUnlimited}, ${durationDays}, ${pricePaid}, ${escapeSql(purchaseDate)}, ${escapeSql(activationDate)}, ${escapeSql(expiryDate)}, ${escapeSql(status)}, ${escapeSql(apn)}, ${escapeSql(eid)}, ${escapeSql(deviceBrand)}, ${escapeSql(deviceModel)});\n`
        );
        userEsimCount++;
      }
      console.log(`   ✓ ${userEsimCount} eSIMs de usuarios exportadas.`);
    }

    // 4. EXPORTAR DISPOSITIVOS COMPATIBLES
    if (colNames.includes('compatible_devices')) {
      console.log(`📱 Exportando dispositivos compatibles...`);
      stream.write(`\n-- Tabla: compatible_devices\n`);
      stream.write(`DELETE FROM compatible_devices;\n\n`);
      const devCursor = db.collection('compatible_devices').find({});
      let devCount = 0;
      while (await devCursor.hasNext()) {
        const d = await devCursor.next();
        const id = d._id ? String(d._id) : `dev_${devCount}`;
        const brand = d.brand || 'Apple';
        const modelsJson = JSON.stringify(d.models || []);
        const instructions = d.instructions || '';
        const displayOrder = d.order || 0;
        const isActive = d.isActive !== false ? 1 : 0;

        stream.write(
          `INSERT INTO compatible_devices (id, brand, models_json, instructions, display_order, is_active) VALUES (${escapeSql(id)}, ${escapeSql(brand)}, ${escapeSql(modelsJson)}, ${escapeSql(instructions)}, ${displayOrder}, ${isActive});\n`
        );
        devCount++;
      }
      console.log(`   ✓ ${devCount} dispositivos exportados.`);
    }

    stream.end();
    await mongoose.disconnect();

    console.log(`\n🎉 ¡EXPORTACIÓN COMPLETADA CON ÉXITO!`);
    console.log(`📄 Archivo SQL generado en: d1/migration_data.sql`);
    console.log('\n========================================================================');
    console.log('🚀 PARA APLICAR LA MIGRACIÓN A TU CLOUDFLARE D1 EN LA NUBE:');
    console.log('1. Aplicar el esquema de tablas:');
    console.log('   npx wrangler d1 execute wappa-db --remote --file=./d1/schema.sql');
    console.log('2. Importar todos los datos:');
    console.log('   npx wrangler d1 execute wappa-db --remote --file=./d1/migration_data.sql');
    console.log('========================================================================\n');
  } catch (err) {
    console.error('\n❌ ERROR DURANTE LA EXPORTACIÓN:', err.message);
    process.exit(1);
  }
}

exportMongoToD1();
