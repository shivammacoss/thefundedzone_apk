import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useTheme } from '../context/ThemeContext';
import ScreenHeader from '../components/ui/ScreenHeader';
import EmptyState from '../components/ui/EmptyState';
import ApiService from '../services/ApiService';

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n) || 0);

const programLabel = (steps) => (steps <= 0 ? 'Instant' : steps === 1 ? '1-Step' : '2-Step');

const STATUS_STYLE = {
  PENDING: { c: '#FBBF24', label: 'Pending' },
  ACTIVE: { c: '#5E7BFF', label: 'Active' },
  PASSED: { c: '#22C55E', label: 'Passed' },
  FUNDED: { c: '#22C55E', label: 'Funded' },
  FAILED: { c: '#EF4444', label: 'Failed' },
  EXPIRED: { c: '#EF4444', label: 'Expired' },
  CANCELLED: { c: '#71717A', label: 'Cancelled' },
};

export default function MyChallengesScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await ApiService.getMyChallengeAccounts();
      const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
      // Show evaluation + funded accounts (skip cancelled).
      setAccounts(items.filter((a) => a.status !== 'CANCELLED'));
    } catch (e) {
      // keep last list on transient error
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const openInTerminal = async (a) => {
    try {
      await SecureStore.setItemAsync('selectedAccountId', String(a.trading_account_id));
    } catch {}
    navigation.navigate('MainTrading', { screen: 'Chart', accountId: a.trading_account_id });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <ScreenHeader
        title="My Challenges"
        subtitle="Your evaluation & funded accounts"
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity onPress={() => navigation.navigate('BuyChallenge')} hitSlop={8}>
            <Ionicons name="add-circle" size={26} color={colors.accent} />
          </TouchableOpacity>
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        >
          <TouchableOpacity
            onPress={() => navigation.navigate('BuyChallenge')}
            activeOpacity={0.85}
            style={[styles.buyBtn, { backgroundColor: colors.accent }]}
          >
            <Ionicons name="rocket" size={18} color="#fff" />
            <Text style={styles.buyBtnText}>Buy a Challenge</Text>
          </TouchableOpacity>

          {accounts.length === 0 ? (
            <EmptyState
              icon="trophy-outline"
              title="No challenges yet"
              subtitle="Buy a challenge to start your evaluation and get funded."
            />
          ) : (
            accounts.map((a) => {
              const st = STATUS_STYLE[a.status] || { c: colors.textMuted, label: a.status };
              const profit = Number(a.current_profit_percent || 0);
              const dd = Number(a.current_overall_drawdown_percent || 0);
              const payLaterDue = a.is_pay_later && a.status === 'PASSED' && a.final_payment_status === 'pending';
              return (
                <TouchableOpacity
                  key={a.challenge_account_id}
                  activeOpacity={0.85}
                  onPress={() => openInTerminal(a)}
                  style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
                >
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.fund, { color: colors.textPrimary }]}>{fmt(a.fund_size)}</Text>
                        <View style={[styles.pill, { backgroundColor: colors.accent + '22' }]}>
                          <Text style={[styles.pillText, { color: colors.accent }]}>{programLabel(a.steps_total)}</Text>
                        </View>
                      </View>
                      <Text style={[styles.acctNo, { color: colors.textMuted }]}>#{a.account_number}</Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: st.c + '22' }]}>
                      <Text style={[styles.statusText, { color: st.c }]}>{st.label}</Text>
                    </View>
                  </View>

                  {a.account_type !== 'FUNDED' && a.status === 'ACTIVE' && (
                    <Text style={[styles.phase, { color: colors.textSecondary }]}>
                      Phase {a.current_phase} of {a.steps_total || 1}
                    </Text>
                  )}

                  <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
                    <Stat colors={colors} label="Balance" value={fmt(a.balance)} />
                    <Stat colors={colors} label="Profit" value={`${profit >= 0 ? '+' : ''}${profit.toFixed(2)}%`} color={profit >= 0 ? '#22C55E' : '#EF4444'} />
                    <Stat colors={colors} label="Drawdown" value={`${dd.toFixed(2)}%`} />
                  </View>

                  {payLaterDue && (
                    <TouchableOpacity
                      onPress={() => navigation.navigate('PassedChallenges')}
                      style={[styles.payLater, { backgroundColor: colors.accent + '18', borderColor: colors.accent + '44' }]}
                    >
                      <Ionicons name="cash-outline" size={15} color={colors.accent} />
                      <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 12.5 }}>
                        Complete payment {fmt(a.final_payment_amount)} to unlock funding
                      </Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Stat({ colors, label, value, color }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.textMuted, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ color: color || colors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 3 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  buyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginBottom: 16 },
  buyBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  fund: { fontSize: 20, fontWeight: '800' },
  acctNo: { fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  pillText: { fontSize: 10.5, fontWeight: '800' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11.5, fontWeight: '800' },
  phase: { fontSize: 12.5, marginTop: 8, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  payLater: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 10, borderRadius: 10, borderWidth: 1 },
});
