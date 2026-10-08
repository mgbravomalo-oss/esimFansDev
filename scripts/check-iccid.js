import 'dotenv/config';
import { connectToDatabase, UserEsimModel } from '../server/db.js';

async function check() {
  await connectToDatabase();
  const iccid = '8948010010013269385';
  const esim = await UserEsimModel.findOne({ iccid }).lean();
  console.log(`🔍 Búsqueda para ICCID ${iccid}:`, esim ? JSON.stringify(esim, null, 2) : 'NO ENCONTRADO EN MONGODB');

  const allEsims = await UserEsimModel.find({}).lean();
  console.log(`📦 Total eSIMs en DB: ${allEsims.length}`);
  allEsims.forEach(e => {
    console.log(`- ICCID: ${e.iccid}, Status: ${e.status}, Email: ${e.userEmail}`);
  });
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
