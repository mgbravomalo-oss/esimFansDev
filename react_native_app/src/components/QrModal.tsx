import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { X, Copy, Check, Smartphone, Info } from 'lucide-react-native';
import { UserEsim } from '../types';
import { colors } from '../constants/theme';

interface QrModalProps {
  visible: boolean;
  esim: UserEsim | null;
  onClose: () => void;
}

export const QrModal: React.FC<QrModalProps> = ({ visible, esim, onClose }) => {
  const [copied, setCopied] = React.useState(false);

  if (!esim) return null;

  const qrValue = esim.qrCodeUrl || esim.ac || `LPA:1$${esim.smdpAddress || 'rsp.truphone.com'}$${esim.matchingId || esim.iccid}`;

  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    Alert.alert('Copiado', 'Código de activación copiado al portapapeles');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.countryTitle}>
                {esim.flagEmoji || '🌐'} {esim.destinationName}
              </Text>
              <Text style={styles.subtitle}>Perfil eSIM #{esim.iccid.slice(-6)}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
            {/* QR Code Canvas */}
            <View style={styles.qrContainer}>
              <View style={styles.qrBox}>
                <QRCode
                  value={qrValue}
                  size={200}
                  color="#0f172a"
                  backgroundColor="#ffffff"
                />
              </View>
              <Text style={styles.qrHelpText}>
                Escanea con la cámara de tu teléfono en Ajustes &gt; Datos Móviles &gt; Añadir eSIM
              </Text>
            </View>

            {/* LPA / Manual Code Card */}
            <View style={styles.codeCard}>
              <View style={styles.codeHeader}>
                <Text style={styles.codeLabel}>Código de Activación Manual (LPA)</Text>
                <TouchableOpacity
                  onPress={() => copyToClipboard(qrValue)}
                  style={styles.copyBtn}
                >
                  {copied ? (
                    <Check size={14} color="#10b981" />
                  ) : (
                    <Copy size={14} color="#38bdf8" />
                  )}
                  <Text style={[styles.copyBtnText, copied && { color: '#10b981' }]}>
                    {copied ? 'Copiado' : 'Copiar'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.codeText} numberOfLines={2} ellipsizeMode="middle">
                {qrValue}
              </Text>
            </View>

            {/* Technical metadata */}
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>ICCID</Text>
                <Text style={styles.metaValue}>{esim.iccid}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Capacidad Total</Text>
                <Text style={styles.metaValue}>{esim.totalDataGB} GB</Text>
              </View>
            </View>

            {/* Step-by-step instructions */}
            <View style={styles.guideCard}>
              <Text style={styles.guideTitle}>Pasos de Instalación:</Text>
              <Text style={styles.guideStep}>
                1. Ve a <Text style={styles.bold}>Ajustes &gt; Red Celular / Datos Móviles</Text>.
              </Text>
              <Text style={styles.guideStep}>
                2. Pulsa en <Text style={styles.bold}>Añadir plan móvil / eSIM</Text>.
              </Text>
              <Text style={styles.guideStep}>
                3. Escanea el código o pega el código manual copiado.
              </Text>
              <Text style={styles.guideStep}>
                4. Activa la <Text style={styles.bold}>Itinerancia de datos (Data Roaming)</Text> al llegar a {esim.destinationName}.
              </Text>
            </View>
          </ScrollView>

        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    padding: 20,
    borderTopWidth: 1,
    borderColor: '#1e293b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  countryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  subtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  closeBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#1e293b',
  },
  scrollBody: {
    paddingBottom: 24,
  },
  qrContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  qrBox: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  qrHelpText: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 20,
  },
  codeCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  codeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  codeLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  copyBtnText: {
    fontSize: 11,
    color: '#38bdf8',
    fontWeight: '700',
  },
  codeText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#f8fafc',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  metaItem: {
    flex: 1,
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  metaLabel: {
    fontSize: 10,
    color: '#94a3b8',
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8fafc',
  },
  guideCard: {
    backgroundColor: '#131d33',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  guideTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#38bdf8',
    marginBottom: 8,
  },
  guideStep: {
    fontSize: 12,
    color: '#cbd5e1',
    marginBottom: 6,
    lineHeight: 18,
  },
  bold: {
    fontWeight: '700',
    color: '#f8fafc',
  },
});
