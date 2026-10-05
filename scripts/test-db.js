import 'dotenv/config';
import mongoose from 'mongoose';

async function testConnection() {
  const uri = (process.env.MONGODB_URI || process.env.MONGO_URI || '').trim();

  console.log('\n🔍 ================= MONGODB ATLAS DIAGNOSTIC =================');
  
  if (!uri) {
    console.error('❌ ERROR: MONGODB_URI no está definido en tu archivo .env');
    console.log('👉 Añade en tu .env: MONGODB_URI="mongodb+srv://tu_usuario:tu_contraseña@tu-cluster.mongodb.net/plan?retryWrites=true&w=majority"\n');
    process.exit(1);
  }

  // Sanitize URI for safe display
  const maskedUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
  console.log(`📌 URI detectada: ${maskedUri}`);

  try {
    console.log('⏳ Probando conexión a MongoDB Atlas (timeout 8s)...');
    
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });

    console.log('✅ ¡CONEXIÓN EXITOSA A MONGODB ATLAS!');
    console.log(`📂 Base de datos activa: "${mongoose.connection.name}"`);
    console.log(`🌐 Host: ${mongoose.connection.host}`);

    if (mongoose.connection.db) {
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log(`📋 Colecciones encontradas (${collections.length}):`, collections.map(c => c.name).join(', '));
      
      for (const col of collections) {
        const count = await mongoose.connection.db.collection(col.name).countDocuments();
        console.log(`   - ${col.name}: ${count} documentos`);
      }
    }

    await mongoose.disconnect();
    console.log('\n🎉 Tu base de datos MongoDB Atlas está perfectamente configurada y funcionando.\n');
  } catch (error) {
    console.error('\n❌ ERROR AL CONECTAR A MONGODB:');
    console.error('Mensaje exacto:', error.message);
    console.error('Código de error:', error.code || error.name);

    console.log('\n🛠️ DIAGNÓSTICO Y SOLUCIÓN:');
    if (error.message.includes('bad auth') || error.message.includes('Authentication failed') || error.message.includes('auth failed')) {
      console.log('🔑 Causa: USUARIO O CONTRASEÑA INCORRECTOS.');
      console.log('👉 Solución: Verifica el usuario y la contraseña en MongoDB Atlas > Database Access.');
      console.log('👉 Si tu contraseña tiene caracteres especiales (como @, #, $, %), debes codificarlos en URL (ej: @ -> %40).');
    } else if (error.message.includes('Server selection timed out') || error.message.includes('ECONNREFUSED') || error.message.includes('queryTxt ETIMEOUT')) {
      console.log('🌐 Causa: BLOQUEO DE IP POR FIREWALL DE MONGODB ATLAS.');
      console.log('👉 Solución: Entra a MongoDB Atlas > Network Access > IP Access List.');
      console.log('👉 Haz clic en "ADD IP ADDRESS" y añade "0.0.0.0/0" (Allow Access From Anywhere).');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('querySrv')) {
      console.log('🌍 Causa: NOMBRE DE CLUSTER / HOST NO ENCONTRADO EN DNS.');
      console.log('👉 Solución: Copia la cadena exacta desde MongoDB Atlas > Connect > Drivers.');
    } else {
      console.log('👉 Revisa tu cadena MONGODB_URI en el archivo .env.');
    }
    console.log('===============================================================\n');
    process.exit(1);
  }
}

testConnection();
