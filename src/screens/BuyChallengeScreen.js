import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import ScreenHeader from '../components/ui/ScreenHeader';
import ApiService from '../services/ApiService';

const money = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n) || 0);
const sizeLabel = (n) => (n >= 1000 ? `$${(n / 1000).toLocaleString('en-US')}K` : `$${n}`);
const programLabel = (steps) => (steps <= 0 ? 'Instant Funding' : steps === 1 ? '1-Step Challenge' : '2-Step Challenge');
const pct = (n) => (n == null ? '—' : `${n}%`);

const ERR = {
  INSUFFICIENT_BALANCE: 'Not enough wallet balance — top up your wallet and try again.',
  GATEWAY_UNAVAILABLE: 'Crypto payment is not available right now.',
  GATEWAY_ERROR: 'Could not start the crypto payment. Try again.',
};

/** The buy-challenge content — reusable as a full screen or embedded in a tab. */
export function BuyChallengePanel({ navigation }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [tier, setTier] = useState(null);
  const [payVia, setPayVia] = useState('wallet');
  const [payLater, setPayLater] = useState(false);
  const [buying, setBuying] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await ApiService.getChallenges();
      const items = Array.isArray(res?.items) ? res.items : [];
      items.sort((a, b) => (a.steps_count || 0) - (b.steps_count || 0));
      setChallenges(items);
      if (items.length) setSelectedId(items[0].id);
    } catch (e) {
      Alert.alert('Error', 'Failed to load challenges');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selected = useMemo(() => challenges.find((c) => c.id === selectedId) || null, [challenges, selectedId]);
  const profitTarget = selected
    ? selected.steps_count <= 0
      ? selected.profit_target_instant_percent
      : selected.profit_target_phase1_percent
    : null;

  const selectProgram = (c) => { setSelectedId(c.id); setTier(null); setPayVia('wallet'); setPayLater(false); };

  // Pay Later: pay a small fee now; on passing, pay the tier's original_price
  // (falls back to the standard fee) to unlock the funded account.
  const payLaterFee = selected?.pay_later_fee ?? 9;
  const payLaterFinal = tier
    ? (tier.original_price != null && Number(tier.original_price) > 0 ? Number(tier.original_price) : tier.fee)
    : 0;
  const payStep = selected?.pay_later_enabled ? 4 : 3;

  const confirmBuy = async () => {
    if (!selected || !tier) return;
    setBuying(true);
    try {
      const res = await ApiService.buyChallenge({
        challenge_id: selected.id,
        fund_size: tier.fund_size,
        purchase_type: payLater ? 'pay_later' : 'standard',
        payment_method: payVia,
      });
      if (res?.pending_payment && res.payment?.checkout_url) {
        Linking.openURL(res.payment.checkout_url);
        navigation?.navigate('MyChallenges');
        return;
      }
      Alert.alert('Success', res?.pending_approval ? 'Purchase submitted — pending approval' : 'Challenge account created!');
      navigation?.navigate('MyChallenges');
    } catch (e) {
      const code = e?.message || '';
      Alert.alert('Could not buy', ERR[code] || code || 'Please try again.');
    } finally {
      setBuying(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  }

  return (
    <View style={{ paddingBottom: 24 }}>
      <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>1. Choose your program</Text>
      <View style={{ gap: 10, marginBottom: 20 }}>
        {challenges.map((c) => {
          const active = selectedId === c.id;
          return (
            <TouchableOpacity
              key={c.id}
              activeOpacity={0.85}
              onPress={() => selectProgram(c)}
              style={[
                styles.programCard,
                { backgroundColor: colors.bgCard, borderColor: active ? colors.accent : colors.border },
                active && { borderWidth: 2 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.programName, { color: colors.textPrimary }]}>{c.name || programLabel(c.steps_count)}</Text>
                <Text style={[styles.programSub, { color: colors.textMuted }]}>
                  {c.steps_count <= 0 ? 'No evaluation' : `${c.steps_count}-step evaluation`}
                </Text>
              </View>
              <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={22} color={active ? colors.accent : colors.textMuted} />
            </TouchableOpacity>
          );
        })}
      </View>

      {selected && (
        <View style={[styles.rules, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Rule colors={colors} label="Profit target" value={pct(profitTarget)} />
          <Rule colors={colors} label="Profit split" value={pct(selected.profit_split_percent)} />
          <Rule colors={colors} label="Daily DD" value={pct(selected.max_daily_drawdown_percent)} />
          <Rule colors={colors} label="Max DD" value={pct(selected.max_overall_drawdown_percent)} />
        </View>
      )}

      <Text style={[styles.stepTitle, { color: colors.textPrimary, marginTop: 6 }]}>2. Choose funding size</Text>
      <View style={styles.tierGrid}>
        {(selected?.tiers || []).map((t) => {
          const active = tier?.fund_size === t.fund_size;
          return (
            <TouchableOpacity
              key={t.fund_size}
              activeOpacity={0.85}
              onPress={() => setTier(t)}
              style={[
                styles.tier,
                { backgroundColor: colors.bgCard, borderColor: active ? colors.accent : colors.border },
                active && { borderWidth: 2 },
              ]}
            >
              {t.is_popular && (
                <View style={[styles.popular, { backgroundColor: colors.accent }]}>
                  <Text style={styles.popularText}>POPULAR</Text>
                </View>
              )}
              <Text style={[styles.tierSize, { color: colors.textPrimary }]}>{t.label || sizeLabel(t.fund_size)}</Text>
              <Text style={[styles.tierFee, { color: colors.textSecondary }]}>{money(t.fee)} fee</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {selected?.pay_later_enabled && tier && (
        <>
          <Text style={[styles.stepTitle, { color: colors.textPrimary, marginTop: 18 }]}>3. Purchase mode</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => setPayLater(false)}
              activeOpacity={0.85}
              style={[styles.modeCard, { backgroundColor: colors.bgCard, borderColor: !payLater ? colors.accent : colors.border }, !payLater && { borderWidth: 2 }]}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 13 }}>Standard</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>Pay {money(tier.fee)} now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPayLater(true)}
              activeOpacity={0.85}
              style={[styles.modeCard, { backgroundColor: colors.bgCard, borderColor: payLater ? colors.accent : colors.border }, payLater && { borderWidth: 2 }]}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 13 }}>Pay Later</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>Pay {money(payLaterFee)} now</Text>
            </TouchableOpacity>
          </View>
          {payLater && (
            <Text style={{ color: colors.textMuted, fontSize: 11.5, lineHeight: 17, marginTop: 8 }}>
              Pay {money(payLaterFee)} now to start the evaluation. If you pass, pay {money(payLaterFinal)} to unlock your funded account.
            </Text>
          )}
        </>
      )}

      {selected?.gateway_enabled && tier && (
        <>
          <Text style={[styles.stepTitle, { color: colors.textPrimary, marginTop: 18 }]}>{payStep}. Payment method</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[{ id: 'wallet', label: 'Wallet' }, { id: 'gateway', label: 'Pay via Crypto' }].map((m) => {
              const active = payVia === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => setPayVia(m.id)}
                  style={[
                    styles.payBtn,
                    { backgroundColor: colors.bgCard, borderColor: active ? colors.accent : colors.border },
                    active && { borderWidth: 2 },
                  ]}
                >
                  <Text style={{ color: active ? colors.accent : colors.textSecondary, fontWeight: '700' }}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {tier && (
        <TouchableOpacity
          disabled={buying}
          onPress={confirmBuy}
          activeOpacity={0.85}
          style={[styles.confirm, { backgroundColor: colors.accent, opacity: buying ? 0.6 : 1, marginTop: 22 }]}
        >
          {buying ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.confirmText}>
              {payVia === 'gateway'
                ? 'Continue to payment'
                : payLater
                  ? `Pay ${money(payLaterFee)} & start`
                  : `Confirm & pay ${money(tier.fee)}`}
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function BuyChallengeScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <ScreenHeader title="Buy a Challenge" subtitle="Pick a program and funding size" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        <BuyChallengePanel navigation={navigation} />
      </ScrollView>
    </View>
  );
}

function Rule({ colors, label, value }) {
  return (
    <View style={{ flex: 1, minWidth: '22%' }}>
      <Text style={{ color: colors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 3 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  stepTitle: { fontSize: 15, fontWeight: '800', marginBottom: 12 },
  programCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 16 },
  programName: { fontSize: 15, fontWeight: '800' },
  programSub: { fontSize: 12, marginTop: 2 },
  rules: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 6 },
  tierGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tier: { width: '31%', borderWidth: 1, borderRadius: 14, padding: 14, alignItems: 'flex-start' },
  popular: { position: 'absolute', top: -8, right: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  popularText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  tierSize: { fontSize: 17, fontWeight: '800' },
  tierFee: { fontSize: 11.5, marginTop: 4 },
  payBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  modeCard: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12, alignItems: 'flex-start' },
  confirm: { paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  confirmText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
