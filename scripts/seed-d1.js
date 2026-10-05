import 'dotenv/config';
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

// Sample mock data matching the app
const sampleDestinations = [
  { id: 'dest-us', name: 'Estados Unidos', code: 'US', region: 'americas', flag: '🇺🇸', popularCities: 'Nueva York, Miami, Los Ángeles', isPopular: true, startingPriceEUR: 4.50, planCount: 6 },
  { id: 'dest-es', name: 'España', code: 'ES', region: 'europe', flag: '🇪🇸', popularCities: 'Madrid, Barcelona, Sevilla', isPopular: true, startingPriceEUR: 3.90, planCount: 5 },
  { id: 'dest-eu30', name: 'Europa (33 Países)', code: 'EU-33', region: 'europe', flag: '🇪🇺', popularCities: 'Francia, Italia, Alemania, España', isPopular: true, startingPriceEUR: 5.90, planCount: 7, isMultiCountry: 1, regionLabel: 'Multi-país' },
  { id: 'dest-jp', name: 'Japón', code: 'JP', region: 'asia', flag: '🇯🇵', popularCities: 'Tokio, Kioto, Osaka', isPopular: true, startingPriceEUR: 5.50, planCount: 4 },
  { id: 'dest-fr', name: 'Francia', code: 'FR', region: 'europe', flag: '🇫🇷', popularCities: 'París, Niza, Lyon', isPopular: true, startingPriceEUR: 4.20, planCount: 5 },
  { id: 'dest-mx', name: 'México', code: 'MX', region: 'americas', flag: '🇲🇽', popularCities: 'Ciudad de México, Cancún', isPopular: true, startingPriceEUR: 4.90, planCount: 4 },
  { id: 'dest-ec', name: 'Ecuador', code: 'EC', region: 'americas', flag: '🇪🇨', popularCities: 'Quito, Guayaquil, Cuenca', isPopular: true, startingPriceEUR: 6.90, planCount: 4 },
  { id: 'dest-gl', name: 'Global (139 Países)', code: 'GL-139', region: 'global', flag: '🌐', popularCities: 'América, Europa, Asia', isPopular: true, startingPriceEUR: 14.50, planCount: 6, isMultiCountry: 1, regionLabel: 'Mundial' },
];

const samplePlans = [
  { id: 'plan-es-1gb', planId: 'es-1gb-7d', name: 'España 1GB 7 Días', country: 'España', countryCode: 'ES', region: 'europe', dataGb: 1.0, durationDays: 7, priceEur: 3.90, operator: 'Movistar / Orange 5G', popular: 1 },
  { id: 'plan-es-5gb', planId: 'es-5gb-15d', name: 'España 5GB 15 Días', country: 'España', countryCode: 'ES', region: 'europe', dataGb: 5.0, durationDays: 15, priceEur: 8.50, operator: 'Movistar / Vodafone 5G', popular: 1 },
  { id: 'plan-es-10gb', planId: 'es-10gb-30d', name: 'España 10GB 30 Días', country: 'España', countryCode: 'ES', region: 'europe', dataGb: 10.0, durationDays: 30, priceEur: 13.90, operator: 'Movistar / Vodafone 5G', bestValue: 1 },
  { id: 'plan-us-5gb', planId: 'us-5gb-15d', name: 'USA 5GB 15 Días', country: 'Estados Unidos', countryCode: 'US', region: 'americas', dataGb: 5.0, durationDays: 15, priceEur: 11.50, operator: 'AT&T / T-Mobile 5G', popular: 1 },
  { id: 'plan-eu-10gb', planId: 'eu-10gb-30d', name: 'Europa 10GB 30 Días (33 Países)', country: 'Europa (33 Países)', countryCode: 'EU-33', region: 'europe', dataGb: 10.0, durationDays: 30, priceEur: 16.90, operator: 'Redes 5G Multi-operador', popular: 1, bestValue: 1 },
];

const sampleCustomer = {
  id: 'user-sofia-101',
  name: 'Sofía Valdiviezo',
  email: 'sofia.valdiviezo@wappa.com',
  phone: '+593 99 876 5432',
  role: 'user',
  country: 'Ecuador',
  countryCode: 'EC',
};

const sampleEsims = [
  {
    id: 'esim-active-01',
    userId: 'user-sofia-101',
    userEmail: 'sofia.valdiviezo@wappa.com',
    iccid: '8988228000004928172',
    planId: 'plan-es-10gb',
    planName: 'España 10GB 30 Días',
    country: 'España',
    countryCode: 'ES',
    flag: '🇪🇸',
    operator: 'Movistar / Vodafone 5G',
    qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=LPA:1\$smdp.wappa-esim.net\$ACT-ES-99281',
    smdpAddress: 'smdp.wappa-esim.net',
    activationCode: 'LPA:1\$smdp.wappa-esim.net\$ACT-ES-99281',
    manualCode: 'ACT-ES-99281',
    totalDataGB: 10.0,
    usedDataGB: 3.4,
    pricePaid: 13.90,
    purchaseDate: '2026-09-28',
    activationDate: '2026-09-29',
    expiryDate: '2026-10-29',
    status: 'active',
  },
  {
    id: 'esim-ready-02',
    userId: 'user-sofia-101',
    userEmail: 'sofia.valdiviezo@wappa.com',
    iccid: '8988228000005119283',
    planId: 'plan-us-5gb',
    planName: 'USA 5GB 15 Días',
    country: 'Estados Unidos',
    countryCode: 'US',
    flag: '🇺🇸',
    operator: 'AT&T / T-Mobile 5G',
    qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=LPA:1\$smdp.wappa-esim.net\$ACT-US-48201',
    smdpAddress: 'smdp.wappa-esim.net',
    activationCode: 'LPA:1\$smdp.wappa-esim.net\$ACT-US-48201',
    manualCode: 'ACT-US-48201',
    totalDataGB: 5.0,
    usedDataGB: 0.0,
    pricePaid: 11.50,
    purchaseDate: '2026-10-01',
    expiryDate: '2026-10-16',
    status: 'ready_to_install',
  }
];

function generateSeedSql() {
  const outputDir = path.join(process.cwd(), 'd1');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const sqlFile = path.join(outputDir, 'seed.sql');
  const stream = fs.createWriteStream(sqlFile, { encoding: 'utf8' });

  stream.write('-- ==========================================================\n');
  stream.write('-- Wappa eSIM - Seed Data para Cloudflare D1\n');
  stream.write('-- ==========================================================\n\n');

  // Destinos
  stream.write('DELETE FROM destinations;\n');
  for (const d of sampleDestinations) {
    stream.write(
      `INSERT INTO destinations (id, name, code, region, flag, popular_cities, is_popular, starting_price_eur, plan_count, is_multi_country, region_label) VALUES (${escapeSql(d.id)}, ${escapeSql(d.name)}, ${escapeSql(d.code)}, ${escapeSql(d.region)}, ${escapeSql(d.flag)}, ${escapeSql(d.popularCities)}, ${d.isPopular ? 1 : 0}, ${d.startingPriceEUR}, ${d.planCount}, ${d.isMultiCountry || 0}, ${escapeSql(d.regionLabel)});\n`
    );
  }

  // Planes
  stream.write('\nDELETE FROM esim_plans;\n');
  for (const p of samplePlans) {
    stream.write(
      `INSERT INTO esim_plans (id, plan_id, name, country, country_code, region, data_gb, duration_days, price_eur, operator, popular, best_value) VALUES (${escapeSql(p.id)}, ${escapeSql(p.planId)}, ${escapeSql(p.name)}, ${escapeSql(p.country)}, ${escapeSql(p.countryCode)}, ${escapeSql(p.region)}, ${p.dataGb}, ${p.durationDays}, ${p.priceEur}, ${escapeSql(p.operator)}, ${p.popular || 0}, ${p.bestValue || 0});\n`
    );
  }

  // Cliente
  stream.write('\nDELETE FROM customers;\n');
  stream.write(
    `INSERT INTO customers (id, name, email, phone, role, country, country_code) VALUES (${escapeSql(sampleCustomer.id)}, ${escapeSql(sampleCustomer.name)}, ${escapeSql(sampleCustomer.email)}, ${escapeSql(sampleCustomer.phone)}, ${escapeSql(sampleCustomer.role)}, ${escapeSql(sampleCustomer.country)}, ${escapeSql(sampleCustomer.countryCode)});\n`
  );

  // eSIMs de Usuario
  stream.write('\nDELETE FROM user_esims;\n');
  for (const e of sampleEsims) {
    stream.write(
      `INSERT INTO user_esims (id, user_id, user_email, iccid, plan_id, plan_name, country, country_code, flag, operator, qr_code_url, smdp_address, activation_code, manual_code, total_data_gb, used_data_gb, price_paid, purchase_date, expiry_date, status) VALUES (${escapeSql(e.id)}, ${escapeSql(e.userId)}, ${escapeSql(e.userEmail)}, ${escapeSql(e.iccid)}, ${escapeSql(e.planId)}, ${escapeSql(e.planName)}, ${escapeSql(e.country)}, ${escapeSql(e.countryCode)}, ${escapeSql(e.flag)}, ${escapeSql(e.operator)}, ${escapeSql(e.qrCodeUrl)}, ${escapeSql(e.smdpAddress)}, ${escapeSql(e.activationCode)}, ${escapeSql(e.manualCode)}, ${e.totalDataGB}, ${e.usedDataGB}, ${e.pricePaid}, ${escapeSql(e.purchaseDate)}, ${escapeSql(e.expiryDate)}, ${escapeSql(e.status)});\n`
    );
  }

  stream.end();
  console.log('✅ Archivo d1/seed.sql generado correctamente con datos de prueba listos.');
}

generateSeedSql();
