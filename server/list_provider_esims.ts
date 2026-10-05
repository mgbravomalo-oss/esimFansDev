import 'dotenv/config';
import { connectToDatabase, UserEsimModel } from './db.js';
import { postEsimAccess } from './esimAccess.js';

async function listOrphanedEsims() {
  await connectToDatabase();

  console.log('🔍 Obteniendo eSIMs registradas en la base de datos local...');
  const registeredEsims = await UserEsimModel.find({}, { iccid: 1 });
  const registeredIccids = new Set(registeredEsims.map(e => e.iccid));

  console.log(`📋 Encontradas ${registeredIccids.size} eSIMs registradas en la DB local.`);

  console.log('🔍 Consultando eSIMs en el mayorista eSIM Access...');
  const queryRes = await postEsimAccess('/esim/query', {
    pager: { pageNum: 1, pageSize: 50 }
  });

  if (!queryRes.success || !queryRes.data?.obj?.esimList) {
    console.error('🔴 Error al obtener eSIMs de eSIM Access:', queryRes.error || queryRes);
    process.exit(1);
  }

  const allEsims = queryRes.data.obj.esimList;
  console.log(`📋 Mayorista devolvió ${allEsims.length} eSIMs en total.`);

  const orphaned = allEsims.filter((e: any) => !registeredIccids.has(e.iccid));

  console.log(`\n💎 --- eSIMS HUÉRFANAS DETECTADAS (${orphaned.length}) ---`);
  orphaned.forEach((e: any, idx: number) => {
    const pkg = e.packageList?.[0] || {};
    console.log(`${idx + 1}. ICCID: ${e.iccid} | Plan: ${pkg.packageName || 'Sin Plan'} (${pkg.packageCode || ''}) | Estado: ${e.esimStatus || 'N/A'}`);
  });

  process.exit(0);
}

listOrphanedEsims().catch(err => {
  console.error('🔴 Error:', err);
  process.exit(1);
});
