import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { QrCode, Wifi, Clock, Signal } from 'lucide-react-native';
import { UserEsim } from '../types';

interface EsimCardProps {
  esim: UserEsim;
  onViewQr: (esim: UserEsim) => void;
}

export const EsimCard: React.FC<EsimCardProps> = ({ esim, onViewQr }) => {
  const usedGB = esim.usedDataGB || 0;
  const totalGB = esim.totalDataGB || 1;
  const remainingGB = Math.max(0, totalGB - usedGB);
  const remainingPct = esim.isUnlimited
    ? 100
    : Math.max(0, Math.min(100, Math.round((remainingGB / totalGB) * 100)));

  const usedMB = Math.round(usedGB * 1024);
  const usedDisplay = usedGB > 0 && usedGB < 0.1
    ? `${usedMB} MB (${usedGB.toFixed(2)} GB)`
    : `${usedGB.toFixed(2)} GB`;
  const remainingDisplay = remainingGB < 10 ? remainingGB.toFixed(2) : remainingGB.toFixed(1);

  // Status badge config
  const isOnline = esim.status === 'in_use' || esim.providerStatus === 'IN_USE';

  return (
    <View style={styles.card}>
      {/* Top Row: Country & Status Badge */}
      <View style={styles.headerRow}>
        <View style={styles.countryInfo}>
          <Text style={styles.flag}>{esim.flagEmoji || '🌐'}</Text>
          <View>
            <Text style={styles.destinationName}>{esim.destinationName}</Text>
            <Text style={styles.iccid}>ICCID: •••• {esim.iccid.slice(-6)}</Text>
          </View>
        </View>

        <View style={[styles.badge, isOnline ? styles.badgeActive : styles.badgePending]}>
          <View style={[styles.dot, isOnline ? styles.dotActive : styles.dotPending]} />
          <Text style={[styles.badgeText, isOnline ? styles.badgeTextActive : styles.badgeTextPending]}>
            {isOnline ? 'En Uso (Online)' : (esim.status === 'active' ? 'Lista' : 'Pendiente')}
          </Text>
        </View>
      </View>

      {/* Data Usage Section */}
      <View style={styles.usageBox}>
        <View style={styles.usageLabels}>
          <Text style={styles.usageTitle}>Saldo de Datos</Text>
          <Text style={styles.remainingText}>
            <Text style={styles.boldGreen}>{remainingDisplay} GB</Text> / {totalGB} GB
          </Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${remainingPct}%`,
                backgroundColor: remainingPct > 30 ? '#10b981' : '#f59e0b',
              },
            ]}
          />
        </View>

        {/* Sub-labels: Consumed & Expiry */}
        <View style={styles.subMetaRow}>
          <View style={styles.inlineMeta}>
            <Clock size={12} color="#94a3b8" />
            <Text style={styles.metaText}>Vigencia: {esim.expiryDate || '30 Días'}</Text>
          </View>
          <Text style={styles.metaText}>Consumido: {usedDisplay}</Text>
        </View>
      </View>

      {/* Bottom Actions */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          onPress={() => onViewQr(esim)}
          style={styles.qrButton}
          activeOpacity={0.8}
        >
          <QrCode size={16} color="#ffffff" />
          <Text style={styles.qrButtonText}>Ver Código QR &amp; Activación</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  countryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  flag: {
    fontSize: 28,
  },
  destinationName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  iccid: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
  },
  badgeActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  badgePending: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: '#10b981',
  },
  dotPending: {
    backgroundColor: '#38bdf8',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextActive: {
    color: '#10b981',
  },
  badgeTextPending: {
    color: '#38bdf8',
  },
  usageBox: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 12,
    marginVertical: 4,
  },
  usageLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  usageTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  remainingText: {
    fontSize: 13,
    color: '#cbd5e1',
  },
  boldGreen: {
    fontWeight: '800',
    color: '#10b981',
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#334155',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  subMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  inlineMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  actionRow: {
    marginTop: 12,
  },
  qrButton: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
  },
  qrButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
