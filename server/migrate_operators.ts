import 'dotenv/config';
import { connectToDatabase, UserEsimModel, AtlasCustomerModel } from './db.js';

async function main() {
  await connectToDatabase();

  const operatorMap: Record<string, string> = {
    'EC': 'Claro / Movistar',
    'CL': 'Entel / Movistar',
    'ES': 'Orange / Movistar',
    'MX': 'Telcel / AT&T',
    'US': 'T-Mobile / AT&T',
    'CO': 'Claro / Movistar',
    'PE': 'Claro / Movistar',
    'AR': 'Claro / Personal',
  };

  const esims = await UserEsimModel.find({}).lean();
  for (const e of esims) {
    const code = (e.countryCode || '').toUpperCase();
    const realOperator = operatorMap[code] || 
      (e.country === 'Ecuador' ? 'Claro / Movistar' : 
       e.country === 'Chile' ? 'Entel / Movistar' : 
       e.country === 'España' ? 'Orange / Movistar' : 'Red Local 5G');
    
    await UserEsimModel.updateOne(
      { _id: e._id },
      { $set: { operator: realOperator } }
    );
    
    await AtlasCustomerModel.updateMany(
      { 'activeEsims.iccid': e.iccid },
      { $set: { 'activeEsims.$[elem].operator': realOperator } },
      { arrayFilters: [{ 'elem.iccid': e.iccid }] } as any
    );
  }

  console.log('✅ Operadores actualizados exitosamente en MongoDB Atlas.');
  const updated = await UserEsimModel.find({}, 'iccid country operator apn').lean();
  console.table(updated.map((e: any) => ({ iccid: e.iccid, country: e.country, operator: e.operator, apn: e.apn })));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
