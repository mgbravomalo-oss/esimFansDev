import 'dotenv/config';
import fetch from 'node-fetch';
import { d1Client } from '../server/d1Client.ts';

async function syncEsimAccessToD1() {
  console.log('\n🚀 ================= SINCRONIZACIÓN DE PLANES (ESIM ACCESS API -> CLOUDFLARE D1) =================');

  const baseUrl = process.env.ESIMACCESS_BASE_URL || 'https://api.esimaccess.com';
  const accessCode = process.env.ESIM_ACCESS_ACCESS_CODE || '38f030c49baf4a0fb9eff8a99b550641';

  if (!d1Client.isConfigured()) {
    console.error('❌ ERROR: Cloudflare D1 no está configurado (Falta CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID o CLOUDFLARE_API_TOKEN).');
    process.exit(1);
  }

  console.log('⏳ Conectando con eSIM Access API (/api/v1/open/package/list)...');

  try {
    const response = await fetch(`${baseUrl}/api/v1/open/package/list`, {
      method: 'POST',
      headers: {
        'RT-AccessCode': accessCode,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const data = await response.json();
    
    if (data.success !== true && data.code !== '0000' && !data.obj && !data.packageList) {
      console.error('❌ Error en respuesta de eSIM Access API:', data);
      process.exit(1);
    }

    const packages = data.obj?.packageList || data.obj || data.packageList || [];
    console.log(`📦 Se obtuvieron ${packages.length} planes desde eSIM Access API.`);

    if (packages.length === 0) {
      console.log('⚠️ No se encontraron paquetes para sincronizar.');
      return;
    }

    console.log('🧹 Limpiando tablas esim_plans y destinations en Cloudflare D1...');
    await d1Client.query('DELETE FROM esim_plans;');
    await d1Client.query('DELETE FROM destinations;');

    console.log('⏳ Insertando planes y destinos en lotes a Cloudflare D1...');
    let count = 0;
    const destinationMap = new Map();

    for (const pkg of packages) {
      const id = pkg.packageCode || pkg.planId || `pkg_${Math.random()}`;
      const planId = pkg.packageCode || id;
      const name = pkg.packageName || pkg.name || 'Plan eSIM Global';
      const country = pkg.locationName || pkg.country || 'Destino';
      const countryCode = (pkg.locationCode || pkg.countryCode || 'GL').toUpperCase();
      const region = pkg.region || 'global';
      const dataGb = pkg.volume ? pkg.volume / (1024 * 1024 * 1024) : (pkg.dataGb || 1.0);
      const isUnlimited = (pkg.isUnlimited || pkg.dataType === 2 || (/day|daily|unlimited|ilimitado/i).test(name) || (pkg.dataGb && pkg.dataGb >= 999)) ? 1 : 0;
      const durationDays = pkg.duration || pkg.durationDays || 30;
      const priceUsd = pkg.price ? pkg.price / 10000 : (pkg.priceUsd || 5.0);
      const priceEur = priceUsd * 0.92;
      const operator = pkg.operator || 'Red 5G Global';
      const popular = pkg.popular ? 1 : 0;

      const fupPolicy = pkg.fupPolicy || pkg.rawSource?.fupPolicy || (isUnlimited ? '512 Kbps' : null);

      await d1Client.query(
        `INSERT INTO esim_plans (id, plan_id, name, country, country_code, region, data_gb, is_unlimited, duration_days, price_usd, price_eur, operator, popular, fup_policy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, planId, name, country, countryCode, region, dataGb, isUnlimited, durationDays, priceUsd, priceEur, operator, popular, fupPolicy]
      );

      const destinationKey = `${countryCode}|${country}`;
      if (!destinationMap.has(destinationKey)) {
        destinationMap.set(destinationKey, {
          id: `dest-${countryCode.toLowerCase()}`,
          name: country,
          code: countryCode,
          region,
          flag: pkg.flag || '🌍',
          is_popular: popular,
          starting_price_eur: priceEur,
          plan_count: 1,
          region_label: pkg.regionLabel || region,
          is_multi_country: pkg.isMultiCountry ? 1 : 0,
        });
      } else {
        const existing = destinationMap.get(destinationKey);
        existing.plan_count += 1;
        existing.starting_price_eur = Math.min(existing.starting_price_eur || priceEur, priceEur);
        existing.is_popular = existing.is_popular || popular;
      }

      count++;
      if (count % 50 === 0) {
        process.stdout.write(`\r   ✓ Insertados ${count} / ${packages.length} planes...`);
      }
    }

    for (const destination of [...destinationMap.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      await d1Client.query(
        `INSERT INTO destinations (id, name, code, region, flag, is_popular, starting_price_eur, plan_count, is_multi_country, region_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          destination.id,
          destination.name,
          destination.code,
          destination.region,
          destination.flag,
          destination.is_popular,
          destination.starting_price_eur,
          destination.plan_count,
          destination.is_multi_country,
          destination.region_label,
        ]
      );
    }

    console.log(`\n\n🎉 ¡SINCRONIZACIÓN EXITOSA! ${count} planes guardados en Cloudflare D1 y ${destinationMap.size} destinos registrados.`);

  } catch (err) {
    console.error('❌ Error en la sincronización:', err.message);
    process.exit(1);
  }
}

syncEsimAccessToD1();
