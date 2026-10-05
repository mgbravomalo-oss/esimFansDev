import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import QRCode from 'react-native-qrcode-svg';
import {
  Globe,
  Smartphone,
  HelpCircle,
  Search,
  RefreshCw,
  QrCode,
  X,
  Copy,
  Clock,
  CheckCircle2,
  Zap,
} from 'lucide-react-native';

const API_BASE = 'https://ais-pre-ekngdkmv2vh66hbft47jyy-432865196074.us-east5.run.app';

// -------------------------------------------------------------
// PANTALLA 1: TIENDA / CATÁLOGO
// -------------------------------------------------------------
function StoreScreen() {
  const [destinations, setDestinations] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/destinations`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setDestinations(data);
      })
      .catch((e) => console.log(e))
      .finally(() => setLoading(false));
  }, []);

  const filtered = destinations.filter((d) =>
    (d.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" />
      <View style={styles.header}>
        <Text style={styles.brandTitle}>
          eSIM <Text style={{ color: '#06b6d4' }}>Global</Text>
        </Text>
        <Text style={styles.subtitle}>Paquetes de datos para viajeros internacionales</Text>
        <View style={styles.searchBox}>
          <Search size={16} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar país (ej. Venezuela, España)..."
            placeholderTextColor="#64748b"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, index) => item.id || String(index)}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 28 }}>{item.flagEmoji || '🌐'}</Text>
                <View>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Text style={styles.cardSub}>{item.region || 'Internacional'}</Text>
                </View>
              </View>
              <Text style={styles.price}>
                Desde €{(item.packages?.[0]?.priceEUR || 4.5).toFixed(2)}
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

// -------------------------------------------------------------
// PANTALLA 2: MIS ESIMS & CONSUMO EN VIVO
// -------------------------------------------------------------
function MyEsimsScreen() {
  const [esims, setEsims] = useState<any[]>([
    {
      id: '1',
      iccid: '8948010010013269385',
      destinationName: 'Venezuela',
      flagEmoji: '🇻🇪',
      totalDataGB: 3.0,
      usedDataGB: 0.08,
      status: 'in_use',
      expiryDate: '29/10/2026 (30 días restantes)',
      ac: 'LPA:1$rsp.truphone.com$matching-id-8948010010013269385',
    },
  ]);
  const [selectedEsim, setSelectedEsim] = useState<any>(null);

  const fetchLive = () => {
    fetch(`${API_BASE}/api/user/user-admin/esims`, {
      headers: { 'x-user-email': 'mgbravomalo@gmail.com' },
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setEsims(data);
      })
      .catch((e) => console.log(e));
  };

  useEffect(() => {
    fetchLive();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" />
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.brandTitle}>Mis eSIMs</Text>
          <TouchableOpacity onPress={fetchLive} style={styles.refreshBtn}>
            <RefreshCw size={12} color="#10b981" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#10b981' }}>Actualizar Saldo</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>Saldos y perfiles en tiempo real</Text>
      </View>

      <FlatList
        data={esims}
        keyExtractor={(item) => item.iccid || item.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          const used = item.usedDataGB || 0;
          const total = item.totalDataGB || 3;
          const remaining = Math.max(0, total - used).toFixed(2);
          const pct = Math.min(100, Math.round(((total - used) / total) * 100));

          return (
            <View style={styles.esimCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 24 }}>{item.flagEmoji || '🌐'}</Text>
                  <Text style={styles.cardTitle}>{item.destinationName}</Text>
                </View>
                <View style={styles.badgeOnline}>
                  <Text style={styles.badgeOnlineText}>● En Uso</Text>
                </View>
              </View>

              <View style={styles.meter}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 11, color: '#94a3b8' }}>Saldo Restante:</Text>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#10b981' }}>
                    {remaining} GB / {total} GB
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct}%` }]} />
                </View>
                <Text style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                  Vigencia: {item.expiryDate || '30 Días'}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setSelectedEsim(item)}
                style={styles.qrBtn}
              >
                <QrCode size={14} color="#ffffff" />
                <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>
                  Ver Código QR &amp; Activación
                </Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />

      {/* Modal QR */}
      <Modal visible={!!selectedEsim} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
                {selectedEsim?.flagEmoji} {selectedEsim?.destinationName}
              </Text>
              <TouchableOpacity onPress={() => setSelectedEsim(null)}>
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <View style={{ alignItems: 'center', marginVertical: 12, backgroundColor: '#fff', padding: 16, borderRadius: 16 }}>
              <QRCode
                value={selectedEsim?.qrCodeUrl || selectedEsim?.ac || 'LPA:1$rsp.truphone.com$demo'}
                size={180}
              />
            </View>
            <Text style={{ color: '#94a3b8', fontSize: 11, textAlign: 'center', marginBottom: 12 }}>
              Escanea desde Ajustes &gt; Red Celular &gt; Añadir eSIM
            </Text>

            <TouchableOpacity
              onPress={() => setSelectedEsim(null)}
              style={{ backgroundColor: '#10b981', padding: 12, borderRadius: 12, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// -------------------------------------------------------------
// PANTALLA 3: SOPORTE
// -------------------------------------------------------------
function SupportScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" />
      <View style={styles.header}>
        <Text style={styles.brandTitle}>Soporte &amp; Guía</Text>
        <Text style={styles.subtitle}>Verifica la compatibilidad de tu teléfono</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.card}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, marginBottom: 8 }}>
            ¿Tu teléfono soporta eSIM?
          </Text>
          <Text style={{ color: '#94a3b8', fontSize: 12, marginBottom: 12 }}>
            Abre el marcador telefónico de llamadas y pulsa:
          </Text>
          <View style={{ backgroundColor: '#0f172a', padding: 10, borderRadius: 8, alignItems: 'center' }}>
            <Text style={{ color: '#10b981', fontSize: 18, fontWeight: '800', letterSpacing: 2 }}>
              *#06#
            </Text>
          </View>
          <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 8 }}>
            Si aparece un número de 32 dígitos llamado EID, tu móvil es compatible con eSIM.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#0f172a',
            borderTopColor: '#1e293b',
          },
          tabBarActiveTintColor: '#10b981',
          tabBarInactiveTintColor: '#64748b',
        }}
      >
        <Tab.Screen
          name="Tienda"
          component={StoreScreen}
          options={{ tabBarIcon: ({ color, size }) => <Globe color={color} size={size} /> }}
        />
        <Tab.Screen
          name="Mis eSIMs"
          component={MyEsimsScreen}
          options={{ tabBarIcon: ({ color, size }) => <Smartphone color={color} size={size} /> }}
        />
        <Tab.Screen
          name="Soporte"
          component={SupportScreen}
          options={{ tabBarIcon: ({ color, size }) => <HelpCircle color={color} size={size} /> }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1d' },
  header: { padding: 16, backgroundColor: '#0f172a', borderBottomWidth: 1, borderColor: '#1e293b' },
  brandTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 11, color: '#94a3b8', marginTop: 2, marginBottom: 8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, gap: 8 },
  searchInput: { color: '#fff', fontSize: 12, flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#111827', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#1f2937', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cardSub: { color: '#94a3b8', fontSize: 11 },
  price: { color: '#10b981', fontWeight: '800', fontSize: 14 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(16,185,129,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  esimCard: { backgroundColor: '#111827', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#1f2937' },
  badgeOnline: { backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeOnlineText: { color: '#10b981', fontSize: 10, fontWeight: '700' },
  meter: { backgroundColor: '#1e293b', borderRadius: 10, padding: 10, marginVertical: 10 },
  barTrack: { height: 6, backgroundColor: '#334155', borderRadius: 3, marginVertical: 6, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#10b981', borderRadius: 3 },
  qrBtn: { backgroundColor: '#059669', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalBox: { backgroundColor: '#111827', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#1e293b' },
});
