import 'dotenv/config';
import { connectToDatabase } from './db.js';
import { postEsimAccess } from './esimAccess.js';

async function main() {
  await connectToDatabase();
  const iccid = '8948010010052812129';

  const { UserEsimModel } = await import('./db.js');

  console.log(`\n-----------------------------------------`);
  console.log(`🔍 ICCID: ${iccid}`);
  console.log(`-----------------------------------------`);

  const queryRes = await postEsimAccess('/esim/query', {
    iccid,
    pager: { pageNum: 1, pageSize: 5 }
  });

  console.log('📶 eSIM Access API Response:');
  if (queryRes.success && queryRes.data?.obj?.esimList?.[0]) {
    console.log(JSON.stringify(queryRes.data.obj.esimList[0], null, 2));
  } else {
    console.log('No data found in eSIM Access or error:', JSON.stringify(queryRes, null, 2));
  }

  const dbEsim = await UserEsimModel.findOne({ iccid });
  console.log('💾 MongoDB Document:');
  console.log(JSON.stringify(dbEsim, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
