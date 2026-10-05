import 'dotenv/config';
import mongoose from 'mongoose';
import { connectToDatabase, UserEsimModel, AtlasCustomerModel } from './db.js';
import { postEsimAccess } from './esimAccess.js';

// Map wholesaler statuses to internal app states
function mapStatus(providerStatus: string): string {
  const statusLower = (providerStatus || '').toLowerCase().trim();
  if (['got_resource', 'new', 'in_stock', 'ready_to_install', 'ready_for_install'].includes(statusLower)) {
    return 'ready_to_install';
  } else if (['downloaded', 'installed'].includes(statusLower)) {
    return 'installed';
  } else if (['active', 'in_use', 'enabled'].includes(statusLower)) {
    return 'active';
  } else if (['depleted', 'used_up'].includes(statusLower)) {
    return 'depleted';
  } else if (['expired', 'overdue', 'used_expired'].includes(statusLower)) {
    return 'expired';
  } else if (['canceled', 'cancelled', 'revoked', 'deleted', 'suspended', 'cancel'].includes(statusLower)) {
    return 'canceled';
  }
  return statusLower || 'ready_to_install';
}

async function syncAllEsims() {
  await connectToDatabase();

  console.log('🔍 Consultando eSIMs en el mayorista eSIM Access...');
  const queryRes = await postEsimAccess('/esim/query', {
    pager: { pageNum: 1, pageSize: 100 }
  });

  if (!queryRes.success || !queryRes.data?.obj?.esimList) {
    console.error('🔴 Error al consultar eSIM Access:', queryRes.error || queryRes);
    process.exit(1);
  }

  const esimList = queryRes.data.obj.esimList;
  console.log(`📋 eSIM Access devolvió ${esimList.length} eSIMs.`);

  let updatedCount = 0;

  for (const esim of esimList) {
    const iccid = esim.iccid;
    const providerStatus = esim.esimStatus || 'GOT_RESOURCE';
    const status = mapStatus(providerStatus);

    const totalGB = esim.totalVolume ? Number((esim.totalVolume / (1024 * 1024 * 1024)).toFixed(2)) : 0.5;
    const usedGB = esim.orderUsage ? Number((esim.orderUsage / (1024 * 1024 * 1024)).toFixed(2)) : 0;

    // Check if we have this eSIM locally
    const localEsim = await UserEsimModel.findOne({ iccid });
    if (!localEsim) {
      continue; // Skip eSIMs not registered locally
    }

    console.log(`🔄 Sincronizando ICCID: ${iccid}...`);
    console.log(`   └─ Estado: [Local: ${localEsim.status}] -> [Mayorista: ${providerStatus}] -> [Mapeado: ${status}]`);
    console.log(`   └─ Consumo: [Local: ${localEsim.usedDataGB} GB] -> [Real: ${usedGB} / ${totalGB} GB]`);

    // 1. Update in UserEsimModel
    const updateFields: any = {
      status,
      providerStatus,
      usedDataGB: usedGB,
      totalDataGB: totalGB,
    };

    const { resolveDeviceByEid } = await import('./esimAccess.js');

    if (esim.eid) {
      updateFields.eid = esim.eid;
      const devInfo = resolveDeviceByEid(esim.eid);
      updateFields.deviceBrand = devInfo.brand;
      updateFields.deviceModel = devInfo.model;
      updateFields.deviceType = devInfo.type;
    }
    if (esim.installationTime) {
      updateFields.installationTime = esim.installationTime;
    }

    await UserEsimModel.updateOne(
      { iccid },
      { $set: updateFields }
    );

    // 2. Update nested activeEsims in AtlasCustomerModel
    const nestedUpdateFields: any = {
      "activeEsims.$[elem].status": status,
      "activeEsims.$[elem].usedDataGB": usedGB,
      "activeEsims.$[elem].totalDataGB": totalGB,
    };

    if (esim.eid) {
      nestedUpdateFields["activeEsims.$[elem].eid"] = esim.eid;
      const devInfo = resolveDeviceByEid(esim.eid);
      nestedUpdateFields["activeEsims.$[elem].deviceBrand"] = devInfo.brand;
      nestedUpdateFields["activeEsims.$[elem].deviceModel"] = devInfo.model;
      nestedUpdateFields["activeEsims.$[elem].deviceType"] = devInfo.type;
    }
    if (esim.installationTime) {
      nestedUpdateFields["activeEsims.$[elem].installationTime"] = esim.installationTime;
    }

    await AtlasCustomerModel.updateMany(
      { "activeEsims.iccid": iccid },
      { $set: nestedUpdateFields },
      { 
        arrayFilters: [ { "elem.iccid": iccid } ] 
      } as any
    );

    updatedCount++;
  }

  console.log(`\n🎉 ¡Sincronización completada! Se actualizaron ${updatedCount} eSIMs locales.`);
  await mongoose.disconnect();
}

syncAllEsims().catch(err => {
  console.error('🔴 Error durante la sincronización:', err);
  process.exit(1);
});
