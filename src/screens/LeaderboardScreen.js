import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import ScreenHeader from '../components/ui/ScreenHeader';
import EmptyState from '../components/ui/EmptyState';
import ApiService from '../services/ApiService';

const money = (n) => `${n >= 0 ? '+' : ''}$${Math.abs(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const PERIODS = [{ id: 'daily', label: 'Daily' }, { id: 'weekly', label: 'Weekly' }, { id: 'monthly', label: 'Monthly' }];
const METRICS = [{ id: 'profit', label: 'Profit' }, { id: 'win_rate', label: 'Win rate' }];
const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`);

export default function LeaderboardScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState('weekly');
  const [metric, setMetric] = useState('profit');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await ApiService.getPropLeaderboard(period, metric);
      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch { setItems([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, [period, metric]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <ScreenHeader title="Leaderboard" subtitle="Top prop traders" onBack={() => navigation.goBack()} />
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
        <Segmented colors={colors} options={PERIODS} value={period} onChange={setPeriod} />
        <Segmented colors={colors} options={METRICS} value={metric} onChange={setMetric} />
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
        >
          {items.length === 0 ? (
            <EmptyState icon="podium-outline" title="No ranking yet" subtitle="Trade a challenge to appear on the leaderboard." />
          ) : (
            items.map((it) => (
              <View
                key={it.user_id + it.rank}
                style={[
                  styles.row,
                  { backgroundColor: it.is_me ? colors.accent + '18' : colors.bgCard, borderColor: it.is_me ? colors.accent + '55' : colors.border },
                ]}
              >
                <Text style={[styles.rank, { color: it.rank <= 3 ? colors.textPrimary : colors.textMuted }]}>{medal(it.rank)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>
                    {it.name}{it.is_me ? ' (You)' : ''}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2 }}>
                    {it.trades} trades · {Number(it.win_rate || 0).toFixed(0)}% win
                  </Text>
                </View>
                <Text style={{ color: Number(it.profit) >= 0 ? '#22C55E' : '#EF4444', fontWeight: '800', fontSize: 15 }}>
                  {metric === 'win_rate' ? `${Number(it.win_rate || 0).toFixed(1)}%` : money(it.profit)}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Segmented({ colors, options, value, onChange }) {
  return (
    <View style={[styles.seg, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      {options.map((o) => {
        const active = value === o.id;
        return (
          <TouchableOpacity
            key={o.id}
            onPress={() => onChange(o.id)}
            style={[styles.segBtn, active && { backgroundColor: colors.accent }]}
          >
            <Text style={{ color: active ? '#fff' : colors.textSecondary, fontWeight: '700', fontSize: 12.5 }}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, gap: 3 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  rank: { width: 34, fontSize: 16, fontWeight: '800', textAlign: 'center' },
});
