import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import ScreenHeader from '../components/ui/ScreenHeader';
import EmptyState from '../components/ui/EmptyState';
import ApiService from '../services/ApiService';

const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const fmtDate = (s) => {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function CertificatesScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState({ trader_name: '', items: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await ApiService.getCertificates();
      setData({ trader_name: res?.trader_name || 'Trader', items: Array.isArray(res?.items) ? res.items : [] });
    } catch { setData({ trader_name: '', items: [] }); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <ScreenHeader title="Certificates" subtitle="Your achievements" onBack={() => navigation.goBack()} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
        >
          {data.items.length === 0 ? (
            <EmptyState icon="medal-outline" title="No certificates yet" subtitle="Pass an evaluation or get funded to earn a certificate." />
          ) : (
            data.items.map((c) => {
              const funded = c.type === 'funded';
              const accent = funded ? '#22C55E' : colors.accent;
              return (
                <View key={c.challenge_account_id} style={[styles.cert, { backgroundColor: colors.bgCard, borderColor: accent + '55' }]}>
                  <View style={[styles.ribbon, { backgroundColor: accent + '18' }]}>
                    <Ionicons name={funded ? 'ribbon' : 'trophy'} size={26} color={accent} />
                  </View>
                  <Text style={[styles.certKicker, { color: accent }]}>{c.challenge_type} · {money(c.fund_size)}</Text>
                  <Text style={[styles.certTitle, { color: colors.textPrimary }]}>{c.title}</Text>
                  <Text style={[styles.certName, { color: colors.textSecondary }]}>Awarded to {data.trader_name}</Text>
                  <View style={[styles.certFooter, { borderTopColor: colors.border }]}>
                    <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>#{c.account_number}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>{fmtDate(c.issued_at)}</Text>
                  </View>
                  {c.profit_split_percent != null && (
                    <Text style={{ color: accent, fontSize: 12, fontWeight: '700', marginTop: 8 }}>
                      {Number(c.profit_split_percent).toFixed(0)}% profit split
                    </Text>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cert: { borderWidth: 1.5, borderRadius: 18, padding: 20, marginBottom: 14, alignItems: 'center' },
  ribbon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  certKicker: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  certTitle: { fontSize: 18, fontWeight: '800', marginTop: 6, textAlign: 'center' },
  certName: { fontSize: 13, marginTop: 6 },
  certFooter: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
