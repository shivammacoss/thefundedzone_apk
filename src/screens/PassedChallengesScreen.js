import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import ScreenHeader from '../components/ui/ScreenHeader';
import EmptyState from '../components/ui/EmptyState';
import ApiService from '../services/ApiService';

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n) || 0);

const PAYOUT_ERR = {
  AGE: 'Your funded account is too new for a payout yet.',
  TRADING_DAYS: 'Not enough unique trading days yet.',
  MIN_PROFIT: 'Profit is below the minimum for a payout.',
  CONSISTENCY: 'Consistency rule not met.',
  COOLDOWN: 'You are within the cooldown since your last payout.',
  PENDING_PAYOUT_EXISTS: 'You already have a pending payout on this account.',
  NOTHING_TO_WITHDRAW: 'No withdrawable profit yet.',
  ACCOUNT_NOT_FUNDED: "This account isn't eligible for a payout.",
};

export default function PassedChallengesScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await ApiService.getMyChallengeAccounts();
      const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
      setAccounts(items);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const funded = accounts.filter((a) => a.account_type === 'FUNDED' && a.status === 'FUNDED');
  const payLaterDue = accounts.filter((a) => a.is_pay_later && a.status === 'PASSED' && a.final_payment_status === 'pending');

  const completePayment = async (a) => {
    setBusyId(a.challenge_account_id);
    try {
      await ApiService.completeChallengePayment(a.challenge_account_id);
      Alert.alert('Success', 'Payment received — your funded account is live!');
      load();
    } catch (e) {
      Alert.alert('Payment failed', e?.message || 'Could not complete the payment. Deposit first if your wallet is short.');
    } finally { setBusyId(null); }
  };

  const requestPayout = async (a) => {
    setBusyId(a.challenge_account_id);
    try {
      await ApiService.requestPropPayout(a.challenge_account_id);
      Alert.alert('Payout requested', 'Pending admin approval.');
      load();
    } catch (e) {
      Alert.alert('Cannot request payout', PAYOUT_ERR[e?.message] || e?.message || 'Please try again.');
    } finally { setBusyId(null); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <ScreenHeader title="Passed Challenges" subtitle="Funded accounts & payouts" onBack={() => navigation.goBack()} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
        >
          {payLaterDue.map((a) => (
            <View key={a.challenge_account_id} style={[styles.card, { backgroundColor: colors.accent + '14', borderColor: colors.accent + '44' }]}>
              <Text style={[styles.congrats, { color: colors.textPrimary }]}>Congratulations — you passed! 🎉</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
                Complete the final payment to receive your funded account #{a.account_number}.
              </Text>
              <View style={{ flexDirection: 'row', gap: 18, marginTop: 12 }}>
                <Mini colors={colors} label="Fund size" value={fmt(a.fund_size)} />
                <Mini colors={colors} label="Amount due" value={fmt(a.final_payment_amount)} color={colors.accent} />
              </View>
              <TouchableOpacity
                disabled={busyId === a.challenge_account_id}
                onPress={() => completePayment(a)}
                style={[styles.btn, { backgroundColor: colors.accent, marginTop: 14 }]}
              >
                {busyId === a.challenge_account_id ? <ActivityIndicator color="#fff" /> :
                  <Text style={styles.btnText}>Complete Payment · {fmt(a.final_payment_amount)}</Text>}
              </TouchableOpacity>
            </View>
          ))}

          {funded.length === 0 && payLaterDue.length === 0 ? (
            <EmptyState icon="ribbon-outline" title="No funded accounts yet" subtitle="Pass an evaluation to get funded, then request payouts here." />
          ) : (
            funded.map((a) => {
              const profit = Number(a.current_profit_percent || 0);
              return (
                <View key={a.challenge_account_id} style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fund, { color: colors.textPrimary }]}>{fmt(a.fund_size)} Funded</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>#{a.account_number}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: '#22C55E22' }]}>
                      <Text style={{ color: '#22C55E', fontWeight: '800', fontSize: 11.5 }}>FUNDED</Text>
                    </View>
                  </View>
                  <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
                    <Mini colors={colors} label="Balance" value={fmt(a.balance)} />
                    <Mini colors={colors} label="Profit" value={`${profit >= 0 ? '+' : ''}${profit.toFixed(2)}%`} color={profit >= 0 ? '#22C55E' : '#EF4444'} />
                    <Mini colors={colors} label="Split" value={`${Number(a.profit_split_percent || 0).toFixed(0)}%`} />
                  </View>
                  <TouchableOpacity
                    disabled={busyId === a.challenge_account_id}
                    onPress={() => requestPayout(a)}
                    style={[styles.btn, { backgroundColor: colors.accent, marginTop: 14 }]}
                  >
                    {busyId === a.challenge_account_id ? <ActivityIndicator color="#fff" /> :
                      <Text style={styles.btnText}>Request Payout</Text>}
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Mini({ colors, label, value, color }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.textMuted, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
      <Text style={{ color: color || colors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 3 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
  congrats: { fontSize: 15, fontWeight: '800' },
  fund: { fontSize: 18, fontWeight: '800' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  btn: { paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
