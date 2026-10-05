import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Search, Globe, ChevronRight, Zap } from 'lucide-react-native';
import { api } from '../api/client';
import { DestinationPlan } from '../types';

export const StoreScreen: React.FC = () => {
  const [destinations, setDestinations] = useState<DestinationPlan[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const data = await api.getDestinations();
      setDestinations(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const normalizeText = (str: string = '') =>
    (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '');

  const isMulti = (d: any) =>
    Boolean(d.isMultiCountry || (d.coveredCountries && d.coveredCountries.length > 1) || (d.coveredCountriesCount && d.coveredCountriesCount > 1));

  const getCount = (d: any) =>
    d.coveredCountriesCount || (d.coveredCountries?.length) || (isMulti(d) ? 2 : 1);

  const normQuery = normalizeText(searchQuery);

  const filteredDestinations = destinations
    .filter(d => {
      if (!normQuery) return true;
      const nameNorm = normalizeText(d.name);
      const codeNorm = normalizeText(d.isoCode);
      return nameNorm.includes(normQuery) || codeNorm.includes(normQuery);
    })
    .sort((a, b) => {
      const aIsMulti = isMulti(a);
      const bIsMulti = isMulti(b);

      // 1. Destinos individuales primero
      if (!aIsMulti && bIsMulti) return -1;
      if (aIsMulti && !bIsMulti) return 1;

      // 2. Multipaís ordenados por número de países
      if (aIsMulti && bIsMulti) {
        const diff = getCount(a) - getCount(b);
        if (diff !== 0) return diff;
      }

      // 3. Coincidencia exacta o inicio si hay búsqueda activa
      if (normQuery) {
        const aExact = normalizeText(a.name) === normQuery || normalizeText(a.isoCode) === normQuery;
        const bExact = normalizeText(b.name) === normQuery || normalizeText(b.isoCode) === normQuery;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
      }

      return (a.name || '').localeCompare(b.name || '', 'es');
    });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.brandTitle}>eSIM <Text style={styles.brandAccent}>Global</Text></Text>
          <View style={styles.instantBadge}>
            <Zap size={12} color="#10b981" />
            <Text style={styles.instantBadgeText}>Entrega Inmediata</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>Conectividad internacional instantánea sin cambiar de SIM</Text>

        {/* Search bar */}
        <View style={styles.searchBox}>
          <Search size={18} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar país o región (ej. Venezuela, España)..."
            placeholderTextColor="#64748b"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Catalog List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#10b981" />
          <Text style={styles.loadingText}>Cargando destinos en vivo...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredDestinations}
          keyExtractor={(item) => item.id || item.isoCode}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadData();
          }}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const minPrice = item.packages?.[0]?.priceEUR || 4.50;
            return (
              <TouchableOpacity style={styles.card} activeOpacity={0.7}>
                <View style={styles.cardLeft}>
                  <Text style={styles.flagEmoji}>{item.flagEmoji || '🌐'}</Text>
                  <View>
                    <Text style={styles.countryName}>{item.name}</Text>
                    <Text style={styles.regionName}>{item.region || 'Internacional'} • {item.networks?.join(', ') || '4G/5G'}</Text>
                  </View>
                </View>

                <View style={styles.cardRight}>
                  <Text style={styles.pricePrefix}>Desde</Text>
                  <Text style={styles.priceValue}>€{minPrice.toFixed(2)}</Text>
                  <ChevronRight size={16} color="#64748b" />
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Text style={styles.emptyText}>No se encontraron países para "{searchQuery}"</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1d',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f8fafc',
  },
  brandAccent: {
    color: '#06b6d4',
  },
  instantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  instantBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10b981',
  },
  subtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
    marginBottom: 16,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  searchInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111827',
    padding: 16,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  flagEmoji: {
    fontSize: 32,
  },
  countryName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
  },
  regionName: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  pricePrefix: {
    fontSize: 10,
    color: '#64748b',
  },
  priceValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#10b981',
    marginVertical: 2,
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
  emptyText: {
    color: '#64748b',
    fontSize: 14,
  },
});
