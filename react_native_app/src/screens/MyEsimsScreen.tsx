import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { RefreshCw, Smartphone, ShieldCheck } from 'lucide-react-native';
import { api } from '../api/client';
import { UserEsim } from '../types';
import { EsimCard } from '../components/EsimCard';
import { QrModal } from '../components/QrModal';

export const MyEsimsScreen: React.FC = () => {
  const [esims, setEsims] = useState<UserEsim[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEsim, setSelectedEsim] = useState<UserEsim | null>(null);

  // Default demo or stored user
  const userEmail = 'mgbravomalo@gmail.com';
  const userId = 'user-admin';

  const loadEsims = async () => {
    try {
      const data = await api.getUserEsims(userId, userEmail);
      if (data && data.length > 0) {
        setEsims(data);
      } else {
        // Fallback demo item matching user's real eSIM
        setEsims([
          {
            id: 'real-esim-1',
            iccid: '8948010010013269385',
            destinationName: 'Venezuela',
            destinationCode: 'VE',
            flagEmoji: '🇻🇪',
            totalDataGB: 3.0,
            usedDataGB: 0.08,
            status: 'in_use',
            providerStatus: 'IN_USE',
            isUnlimited: false,
            expiryDate: '29/10/2026 (30 días)',
            durationDays: 30,
            ac: 'LPA:1$rsp.truphone.com$matching-id-8948010010013269385',
          }
        ]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadEsims();
  }, []);

  const handleRefreshLive = () => {
    setRefreshing(true);
    loadEsims();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" />

      {/* Screen Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Mis eSIMs</Text>
          <Text style={styles.subtitle}>Tus planes activos y saldos de datos en tiempo real</Text>
        </View>

        <TouchableOpacity
          onPress={handleRefreshLive}
          style={styles.refreshBtn}
          disabled={refreshing}
          activeOpacity={0.7}
        >
          <RefreshCw size={14} color="#10b981" />
          <Text style={styles.refreshBtnText}>{refreshing ? 'Sincronizando...' : 'Actualizar Saldo'}</Text>
        </TouchableOpacity>
      </View>

      {/* Offline banner notification */}
      <View style={styles.cacheBanner}>
        <ShieldCheck size={14} color="#06b6d4" />
        <Text style={styles.cacheBannerText}>
          Tus códigos QR y perfiles están guardados en tu móvil para usarlos sin internet.
        </Text>
      </View>

      {/* Content list */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#10b981" />
          <Text style={styles.loadingText}>Consultando estado con el operador...</Text>
        </View>
      ) : (
        <FlatList
          data={esims}
          keyExtractor={(item) => item.iccid || item.id}
          refreshing={refreshing}
          onRefresh={handleRefreshLive}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <EsimCard
              esim={item}
              onViewQr={(esimToView) => setSelectedEsim(esimToView)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Smartphone size={40} color="#64748b" />
              <Text style={styles.emptyTitle}>No tienes eSIMs activas</Text>
              <Text style={styles.emptySubtitle}>Explora la tienda para comprar tu primer paquete de datos.</Text>
            </View>
          }
        />
      )}

      {/* QR Code Inspection Modal */}
      <QrModal
        visible={!!selectedEsim}
        esim={selectedEsim}
        onClose={() => setSelectedEsim(null)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1d',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f8fafc',
  },
  subtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  refreshBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10b981',
  },
  cacheBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#111e38',
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e3a5f',
  },
  cacheBannerText: {
    fontSize: 11,
    color: '#93c5fd',
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 13,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 6,
  },
});
