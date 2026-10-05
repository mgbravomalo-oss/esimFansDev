import 'dotenv/config';
import mongoose from 'mongoose';
import { connectToDatabase, UserEsimModel, AtlasCustomerModel } from '../server/db.js';

async function clear() {
  console.log('🔄 Conectando a la base de datos para limpiar eSIMs...');
  const connected = await connectToDatabase();
  if (!connected) {
    console.error('🔴 No se pudo conectar a la base de datos.');
    process.exit(1);
  }
  
  console.log('🗑️ Eliminando todas las eSIMs del sistema...');
  const esimRes = await UserEsimModel.deleteMany({});
  console.log(`✅ eSIMs eliminadas: ${esimRes.deletedCount}`);
  
  console.log('🧹 Limpiando listas de eSIMs y compras activas de los clientes...');
  const customerRes = await AtlasCustomerModel.updateMany({}, { $set: { activeEsims: [], purchases: [] } });
  console.log(`✅ Clientes actualizados: ${customerRes.modifiedCount}`);
  
  await mongoose.disconnect();
  console.log('🏁 Proceso de limpieza finalizado con éxito.');
}

clear().catch(err => {
  console.error('🔴 Error durante la limpieza:', err);
  process.exit(1);
});
