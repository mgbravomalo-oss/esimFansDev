import 'dotenv/config';
import mongoose from 'mongoose';
import { connectToDatabase, UserEsimModel, AtlasCustomerModel, getAtlasPlanModel } from './db.js';
import { postEsimAccess } from './esimAccess.js';

// Dictionary of countries and flags
const countryData: Record<string, { name: string; flag: string; operator: string }> = {
  'ES': { name: 'España', flag: '🇪🇸', operator: 'Orange' },
  'CL': { name: 'Chile', flag: '🇨🇱', operator: 'Movistar' },
  'EC': { name: 'Ecuador', flag: '🇪🇨', operator: 'Claro' },
};

async function assignEsim(iccid: string, targetEmail: string) {
  await connectToDatabase();

  const emailClean = targetEmail.toLowerCase().trim();
  const customer = await AtlasCustomerModel.findOne({ email: emailClean });
  if (!customer) {
    console.error(`🔴 No se encontró el usuario con email: ${emailClean}`);
    process.exit(1);
  }

  // Check if already exists in UserEsimModel
  const existing = await UserEsimModel.findOne({ iccid });
  if (existing) {
    console.log(`🟡 eSIM con ICCID ${iccid} ya está registrada en el sistema para ${existing.userEmail}.`);
    process.exit(0);
  }

  // Fetch eSIM details from esimaccess API
  console.log(`🔍 Consultando detalles de eSIM ${iccid} en el mayorista...`);
  const queryRes = await postEsimAccess('/esim/query', {
    iccid,
    pager: { pageNum: 1, pageSize: 5 }
  });

  if (!queryRes.success || !queryRes.data?.obj?.esimList?.[0]) {
    console.error('🔴 No se pudo obtener la información de la eSIM de eSIM Access.', queryRes);
    process.exit(1);
  }

  const esimInfo = queryRes.data.obj.esimList[0];
  const pkg = esimInfo.packageList?.[0] || {};
  const countryCode = pkg.locationCode || 'ES';
  const cInfo = countryData[countryCode] || { name: 'Internacional', flag: '🌐', operator: 'Global Operator' };

  const totalGB = esimInfo.totalVolume ? Number((esimInfo.totalVolume / (1024 * 1024 * 1024)).toFixed(2)) : 0.5;

  const esimId = `esim-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const expiryStr = esimInfo.expiredTime ? esimInfo.expiredTime.split('T')[0] : new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString().split('T')[0];

  // Retrieve plan pricing from MongoDB Atlas dynamic catalog
  const AtlasPlanModel = getAtlasPlanModel();
  const planDoc = (await AtlasPlanModel.findOne({
    $or: [
      { planId: pkg.packageCode },
      { packageCode: pkg.packageCode }
    ]
  })) as any;

  const costPrice = planDoc?.price || 0;
  const salePrice = planDoc?.retailPrice || planDoc?.priceEUR || planDoc?.priceUsd || 0;
  const profit = Number((salePrice - costPrice).toFixed(2));

  const newEsimDoc = new UserEsimModel({
    id: esimId,
    userId: customer.id,
    userEmail: customer.email,
    iccid: esimInfo.iccid,
    planId: pkg.packageCode || 'MANUAL_PLAN',
    planName: pkg.packageName || 'eSIM Access Plan',
    country: cInfo.name,
    countryCode: countryCode,
    flag: cInfo.flag,
    operator: cInfo.operator || 'Red Local 5G',
    network5G: true,
    qrCodeUrl: esimInfo.qrCodeUrl || '',
    smdpAddress: esimInfo.ac ? esimInfo.ac.split('$')[1] : 'rsp-eu.simlessly.com',
    activationCode: esimInfo.ac ? esimInfo.ac.split('$')[2] : '',
    manualCode: esimInfo.ac || '',
    totalDataGB: totalGB,
    usedDataGB: esimInfo.orderUsage ? Number((esimInfo.orderUsage / (1024 * 1024 * 1024)).toFixed(2)) : 0,
    isUnlimited: false,
    durationDays: pkg.duration || 1,
    preInstallValidity: '180 Días',
    unusedValidTimeDays: 180,
    pricePaid: salePrice,
    costPriceEUR: costPrice,
    salePriceEUR: salePrice,
    profitEUR: profit,
    purchaseDate: new Date().toISOString().split('T')[0],
    expiryDate: expiryStr,
    status: 'ready_to_install',
    providerStatus: esimInfo.esimStatus || 'GOT_RESOURCE',
    apn: esimInfo.apn || 'globaldata',
    orderNo: esimInfo.orderNo,
    packageCode: pkg.packageCode,
    provisionSource: 'esimaccess_api',
    supportTopUpType: esimInfo.supportTopUpType || 1,
    isReloadable: esimInfo.supportTopUpType === 1,
  });

  await newEsimDoc.save();
  console.log(`✅ eSIM guardada en UserEsimModel con ID: ${esimId}`);

  // Link in AtlasCustomer Model
  const activeEsimData = {
    esimId: esimId,
    iccid: esimInfo.iccid,
    planName: pkg.packageName || 'eSIM Access Plan',
    country: cInfo.name,
    countryCode: countryCode,
    flag: cInfo.flag,
    totalDataGB: totalGB,
    usedDataGB: 0,
    expiryDate: expiryStr,
    status: 'ready_to_install',
    activationCode: esimInfo.ac ? esimInfo.ac.split('$')[2] : '',
    smdpAddress: esimInfo.ac ? esimInfo.ac.split('$')[1] : 'rsp-eu.simlessly.com',
    qrCodeUrl: esimInfo.qrCodeUrl || '',
    pricePaid: salePrice,
    costPriceEUR: costPrice,
    salePriceEUR: salePrice,
    profitEUR: profit,
  };

  const purchaseData = {
    orderId: `ord-${Date.now()}`,
    planId: pkg.packageCode || 'MANUAL_PLAN',
    planName: pkg.packageName || 'eSIM Access Plan',
    iccid: esimInfo.iccid,
    price: salePrice,
    currency: 'USD',
    purchaseDate: new Date().toISOString(),
    status: 'completed',
  };

  await AtlasCustomerModel.updateOne(
    { email: emailClean },
    { 
      $push: { 
        activeEsims: activeEsimData,
        purchases: purchaseData
      } 
    }
  );

  console.log(`✅ eSIM enlazada al panel del cliente ${customer.email} correctamente.`);
  await mongoose.disconnect();
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: npx tsx server/assign_esim.ts <ICCID> <EMAIL>');
  process.exit(1);
}

assignEsim(args[0], args[1]).catch(err => {
  console.error('🔴 Error:', err);
  process.exit(1);
});
