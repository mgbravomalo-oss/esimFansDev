import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Linking,
} from 'react-native';
import {
  Smartphone,
  CheckCircle2,
  HelpCircle,
  ExternalLink,
  Shield,
  Send,
} from 'lucide-react-native';

export const SupportScreen: React.FC = () => {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Ayuda &amp; Soporte</Text>
          <Text style={styles.subtitle}>Guías de activación y compatibilidad técnica</Text>
        </View>

        {/* Compatibility Quick Check Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Smartphone size={20} color="#10b981" />
            <Text style={styles.cardTitle}>¿Cómo saber si mi móvil soporta eSIM?</Text>
          </View>
          <Text style={styles.cardBody}>
            En tu teléfono abre el marcador de llamadas y marca el código estándar:
          </Text>
          <View style={styles.codePill}>
            <Text style={styles.codePillText}>*#06#</Text>
          </View>
          <Text style={styles.cardBody}>
            Si entre los datos que aparecen en pantalla ves un número de 32 dígitos llamado <Text style={styles.bold}>EID</Text>, tu teléfono es 100% compatible con eSIM.
          </Text>
        </View>

        {/* 3 Step Installation Guide */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <CheckCircle2 size={20} color="#06b6d4" />
            <Text style={styles.cardTitle}>Guía Rápida de Instalación</Text>
          </View>

          <View style={styles.stepRow}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Conéctate a una red Wi-Fi</Text>
              <Text style={styles.stepDesc}>Necesitas internet unos segundos para descargar el perfil en el chip.</Text>
            </View>
          </View>

          <View style={styles.stepRow}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Escanea el código QR</Text>
              <Text style={styles.stepDesc}>Ve a Ajustes &gt; Red Móvil &gt; Añadir eSIM y apunta con la cámara.</Text>
            </View>
          </View>

          <View style={styles.stepRow}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Activa la itinerancia (Data Roaming)</Text>
              <Text style={styles.stepDesc}>Al aterrizar en el país de destino, activa la itinerancia para navegar.</Text>
            </View>
          </View>
        </View>

        {/* WhatsApp / Direct Support */}
        <TouchableOpacity
          onPress={() => Linking.openURL('https://wa.me/')}
          style={styles.contactBtn}
          activeOpacity={0.8}
        >
          <Send size={18} color="#ffffff" />
          <Text style={styles.contactBtnText}>Contactar con Soporte Técnico</Text>
        </TouchableOpacity>

        {/* Version Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>eSIM Global App v1.0.0 (Native React Native)</Text>
          <Text style={styles.footerSub}>Desarrollada para Android e iOS</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1d',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
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
  card: {
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
    flex: 1,
  },
  cardBody: {
    fontSize: 12,
    color: '#cbd5e1',
    lineHeight: 18,
    marginBottom: 10,
  },
  codePill: {
    backgroundColor: '#1e293b',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  codePillText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#10b981',
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  bold: {
    fontWeight: '700',
    color: '#f8fafc',
  },
  stepRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#06b6d4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    color: '#0a0f1d',
    fontSize: 12,
    fontWeight: '800',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8fafc',
  },
  stepDesc: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
    lineHeight: 16,
  },
  contactBtn: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    marginVertical: 10,
  },
  contactBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  footerSub: {
    fontSize: 10,
    color: '#475569',
    marginTop: 2,
  },
});
