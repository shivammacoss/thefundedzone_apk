import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { API_URL } from '../config';
import { useTheme } from '../context/ThemeContext';

const OXAPAY_METHOD = 'oxapay';

// UI grid for crypto selection — sent with OxaPay payout details for finance matching.
const CRYPTO_ASSETS = [
  { id: 'BTC', label: 'BTC', sub: 'Bitcoin' },
  { id: 'ETH', label: 'ETH', sub: 'Ethereum' },
  { id: 'USDT_ERC', label: 'USDT', sub: 'ERC20' },
  { id: 'USDC_ERC', label: 'USDC', sub: 'ERC20' },
  { id: 'TRX', label: 'TRX', sub: 'Tron' },
  { id: 'USDT_TRC', label: 'USDT', sub: 'TRC20' },
  { id: 'USDC_TRC', label: 'USDC', sub: 'TRC20' },
  { id: 'USDT_SOL', label: 'USDT', sub: 'SOL' },
  { id: 'USDC_SOL', label: 'USDC', sub: 'SOL' },
  { id: 'SOL', label: 'SOL', sub: 'Solana' },
  { id: 'XRP', label: 'XRP', sub: 'XRP' },
];

const WalletScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState({ balance: 0 });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Deposit state ──
  // depositMethod: 'oxapay' (auto crypto) | 'manual' (bank/UPI) | 'crypto_manual'
  const [depositMethod, setDepositMethod] = useState('oxapay');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositTxId, setDepositTxId] = useState('');
  const [depositProof, setDepositProof] = useState(null); // ImagePicker asset
  const [bankInfo, setBankInfo] = useState(null);
  const [cryptoWallets, setCryptoWallets] = useState([]);
  const [selectedCryptoWalletId, setSelectedCryptoWalletId] = useState('');
  const [loadingExtra, setLoadingExtra] = useState(false);

  // ── Withdraw state ──
  // withdrawMethod: 'oxapay' (crypto address) | 'manual' (UPI / QR)
  const [withdrawMethod, setWithdrawMethod] = useState('oxapay');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [selectedWithdrawCrypto, setSelectedWithdrawCrypto] = useState(CRYPTO_ASSETS[0].id);
  const [withdrawCryptoAddress, setWithdrawCryptoAddress] = useState('');
  const [withdrawUpi, setWithdrawUpi] = useState('');
  const [withdrawNotes, setWithdrawNotes] = useState('');
  const [withdrawQrFile, setWithdrawQrFile] = useState(null);

  // ── Withdrawal OTP (email verification) ──
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpRequesting, setOtpRequesting] = useState(false);
  const [otpResending, setOtpResending] = useState(false);
  const [otpMaskedEmail, setOtpMaskedEmail] = useState('');

  // Refresh wallet data every time screen is focused
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const init = async () => {
        try {
          const userData = await SecureStore.getItemAsync('user');
          if (!userData) {
            navigation.replace('Login');
            return;
          }
          const parsed = JSON.parse(userData);
          setUser(parsed);
          await fetchWalletData();
        } catch (e) {
          console.error('Error loading wallet screen:', e);
        }
        if (!cancelled) setLoading(false);
      };
      init();
      return () => { cancelled = true; };
    }, [])
  );

  const getToken = async () => SecureStore.getItemAsync('token');

  const authHeaders = (token) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  const fetchWalletData = async () => {
    try {
      const token = await getToken();
      if (!token) {
        setRefreshing(false);
        navigation.replace('Login');
        return;
      }

      const headers = authHeaders(token);

      const [walletRes, transRes] = await Promise.all([
        fetch(`${API_URL}/wallet/summary`, { headers }),
        fetch(`${API_URL}/wallet/transactions`, { headers }),
      ]);

      // Persistent login: 401/403 par auto-logout/redirect nahi. Bas refresh ko skip karo.
      if (walletRes.status === 401 || walletRes.status === 403) {
        console.log('[The Funded Zone] Wallet API returned', walletRes.status, '— session kept');
        setRefreshing(false);
        return;
      }

      if (walletRes.ok) {
        const walletData = await walletRes.json();
        let mainBal = walletData.main_wallet_balance ?? walletData.wallet_balance ?? walletData.balance;

        // Fallback: /wallet/summary returned 0, missing, or NaN — try /wallet/:userId
        if (mainBal == null || Number(mainBal) === 0 || Number.isNaN(Number(mainBal))) {
          try {
            const userData = await SecureStore.getItemAsync('user');
            if (userData) {
              const u = JSON.parse(userData);
              const userId = u._id || u.id;
              if (userId) {
                const wRes2 = await fetch(`${API_URL}/wallet/${userId}`, { headers });
                if (wRes2.ok) {
                  const wData2 = await wRes2.json().catch(() => ({}));
                  const walletObj = wData2.wallet || wData2;
                  const fallback = walletObj.main_wallet_balance ?? walletObj.wallet_balance ?? walletObj.balance;
                  if (fallback != null && Number(fallback) > 0) mainBal = fallback;
                }
              }
            }
          } catch (_) {}
        }

        setWallet({ ...walletData, balance: Number(mainBal) || 0 });
      }

      if (transRes.ok) {
        const transData = await transRes.json();
        setTransactions(transData.items || []);
      }
    } catch (e) {
      console.error('Error fetching wallet:', e);
    }
    setRefreshing(false);
  };

  // Manual bank/UPI deposit target (admin-configured). Unauthenticated, amount-tiered.
  const fetchBankInfo = async (amount) => {
    try {
      const res = await fetch(`${API_URL}/wallet/bank-info?amount=${amount || 100}`);
      if (res.ok) {
        const data = await res.json();
        setBankInfo(data);
      }
    } catch (e) {
      console.error('Error fetching bank info:', e);
    }
  };

  // Admin-configured crypto wallets for manual crypto deposits.
  const fetchCryptoWallets = async (amount) => {
    setLoadingExtra(true);
    try {
      const token = await getToken();
      const amt = parseFloat(amount);
      const body = !Number.isNaN(amt) && amt > 0 ? { amount: amt } : {};
      const res = await fetch(`${API_URL}/wallet/deposit/crypto-wallets`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data?.wallets) ? data.wallets : [];
        setCryptoWallets(list);
        setSelectedCryptoWalletId((prev) =>
          prev && list.some((w) => w.id === prev) ? prev : list[0]?.id || ''
        );
      } else {
        setCryptoWallets([]);
        setSelectedCryptoWalletId('');
      }
    } catch (e) {
      setCryptoWallets([]);
      setSelectedCryptoWalletId('');
    }
    setLoadingExtra(false);
  };

  // Switch deposit method tabs and lazy-load the data each one needs.
  const selectDepositMethod = (method) => {
    setDepositMethod(method);
    if (method === 'manual') fetchBankInfo(depositAmount || 100);
    if (method === 'crypto_manual') fetchCryptoWallets(depositAmount);
  };

  const pickImage = async (setter) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload payment screenshots.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
        Alert.alert('Error', 'Image must be less than 10MB');
        return;
      }
      setter(asset);
    }
  };

  // Build a multipart file part from an ImagePicker asset for fetch FormData.
  const filePart = (asset, fallbackName) => {
    const name = asset.fileName || fallbackName || `upload_${Date.now()}.jpg`;
    const type = asset.mimeType || 'image/jpeg';
    return { uri: asset.uri, name, type };
  };

  const sanitizeAmount = (val) => {
    const cleaned = String(val).replace(/[^0-9.]/g, '');
    const num = parseFloat(cleaned);
    if (!Number.isFinite(num) || num <= 0) return null;
    if (num > 1000000) return null; // Max $1M per transaction
    return Math.round(num * 100) / 100;
  };

  const parseError = async (res) => {
    try {
      const data = await res.json();
      const d = data.detail ?? data.message;
      if (typeof d === 'string') return d;
      if (Array.isArray(d)) return d.map((x) => x.msg || x).join(', ');
    } catch (_) {}
    return `Request failed (${res.status})`;
  };

  const resetDepositForm = () => {
    setDepositAmount('');
    setDepositTxId('');
    setDepositProof(null);
    setDepositMethod('oxapay');
    setBankInfo(null);
    setCryptoWallets([]);
    setSelectedCryptoWalletId('');
  };

  // ─────────────────────────────────────────────────────────────
  // DEPOSIT
  // ─────────────────────────────────────────────────────────────
  const handleDeposit = async () => {
    const amt = sanitizeAmount(depositAmount);
    if (!amt) {
      Alert.alert('Error', 'Please enter a valid amount (max $1,000,000)');
      return;
    }

    const token = await getToken();

    // ── OxaPay automated crypto deposit ──
    if (depositMethod === 'oxapay') {
      setIsSubmitting(true);
      try {
        const res = await fetch(`${API_URL}/wallet/deposit`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({ amount: amt, method: OXAPAY_METHOD }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.payment_url) {
            const can = await Linking.canOpenURL(data.payment_url);
            if (can) {
              await Linking.openURL(data.payment_url);
              setShowDepositModal(false);
              resetDepositForm();
              Alert.alert(
                'Complete Payment',
                'Finish your crypto payment in the browser. Pull down to refresh once it is confirmed.'
              );
            } else {
              Alert.alert('Error', 'Could not open the payment page.');
            }
          } else {
            Alert.alert('Error', 'Failed to create OxaPay payment link. Please try again or contact support.');
          }
        } else {
          Alert.alert('Error', await parseError(res));
        }
      } catch (e) {
        Alert.alert('Error', 'Failed to start crypto deposit');
      }
      setIsSubmitting(false);
      return;
    }

    // ── Manual crypto deposit (pay admin wallet, upload TXID + proof) ──
    if (depositMethod === 'crypto_manual') {
      if (!depositTxId.trim()) {
        Alert.alert('Error', 'Enter the on-chain transaction hash / TXID');
        return;
      }
      if (!selectedCryptoWalletId) {
        Alert.alert('Error', 'Select the wallet you paid to');
        return;
      }
      if (!depositProof) {
        Alert.alert('Error', 'Upload a screenshot of your crypto payment');
        return;
      }
      setIsSubmitting(true);
      try {
        const fd = new FormData();
        fd.append('amount', String(amt));
        fd.append('crypto_wallet_id', selectedCryptoWalletId);
        fd.append('tx_hash', depositTxId.trim());
        fd.append('file', filePart(depositProof, 'crypto_proof.jpg'));
        const res = await fetch(`${API_URL}/wallet/deposit/crypto-manual`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        if (res.ok) {
          Alert.alert('Success', 'Crypto deposit submitted! Awaiting approval.');
          setShowDepositModal(false);
          resetDepositForm();
          fetchWalletData();
        } else {
          Alert.alert('Error', await parseError(res));
        }
      } catch (e) {
        Alert.alert('Error', 'Failed to submit crypto deposit');
      }
      setIsSubmitting(false);
      return;
    }

    // ── Manual bank / UPI deposit (upload reference + proof) ──
    if (!depositTxId.trim()) {
      Alert.alert('Error', 'Enter your bank / UPI transaction or reference ID');
      return;
    }
    if (!depositProof) {
      Alert.alert('Error', 'Upload a screenshot of your payment');
      return;
    }
    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('amount', String(amt));
      fd.append('transaction_id', depositTxId.trim());
      fd.append('file', filePart(depositProof, 'payment_proof.jpg'));
      const res = await fetch(`${API_URL}/wallet/deposit/manual`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        Alert.alert('Success', 'Deposit request submitted! Awaiting approval.');
        setShowDepositModal(false);
        resetDepositForm();
        fetchWalletData();
      } else {
        Alert.alert('Error', await parseError(res));
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to submit deposit request');
    }
    setIsSubmitting(false);
  };

  // ─────────────────────────────────────────────────────────────
  // WITHDRAW (two-step: request OTP → confirm with OTP)
  // ─────────────────────────────────────────────────────────────
  const submitWithdraw = async () => {
    const amt = sanitizeAmount(withdrawAmount);
    if (!amt) {
      Alert.alert('Error', 'Please enter a valid amount (max $1,000,000)');
      return;
    }
    if (amt > (wallet.balance || 0)) {
      Alert.alert('Error', 'Insufficient main wallet balance');
      return;
    }

    if (withdrawMethod === 'oxapay') {
      if (!withdrawCryptoAddress.trim()) {
        Alert.alert('Error', 'Enter your wallet address / payout details');
        return;
      }
    } else {
      if (!withdrawUpi.trim() && !withdrawQrFile) {
        Alert.alert('Error', 'Enter your UPI ID and/or upload a QR code for manual payout');
        return;
      }
    }

    setOtpRequesting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/wallet/withdraw/otp/request`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setOtpMaskedEmail(data?.email || '');
        setOtpCode('');
        setOtpModalOpen(true);
      } else {
        Alert.alert('Error', await parseError(res));
      }
    } catch (e) {
      Alert.alert('Error', 'Could not send verification code');
    }
    setOtpRequesting(false);
  };

  const resendWithdrawOtp = async () => {
    setOtpResending(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/wallet/withdraw/otp/request`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setOtpMaskedEmail(data?.email || otpMaskedEmail);
        setOtpCode('');
        Alert.alert('Sent', `New code sent to ${data?.email || 'your email'}`);
      } else {
        Alert.alert('Error', await parseError(res));
      }
    } catch (e) {
      Alert.alert('Error', 'Could not resend code');
    }
    setOtpResending(false);
  };

  const resetWithdrawForm = () => {
    setWithdrawAmount('');
    setWithdrawCryptoAddress('');
    setWithdrawUpi('');
    setWithdrawNotes('');
    setWithdrawQrFile(null);
    setWithdrawMethod('oxapay');
  };

  const confirmWithdrawWithOtp = async () => {
    const amt = sanitizeAmount(withdrawAmount);
    const otp = otpCode.trim();
    if (!otp) {
      Alert.alert('Error', 'Enter the verification code from your email');
      return;
    }

    const token = await getToken();
    setIsSubmitting(true);

    try {
      if (withdrawMethod === 'oxapay') {
        const detail = withdrawCryptoAddress.trim();
        const payout = `[${selectedWithdrawCrypto}] ${detail}`.trim();
        const res = await fetch(`${API_URL}/wallet/withdraw`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            amount: amt,
            method: OXAPAY_METHOD,
            bank_details: { oxapay_payout: payout },
            otp,
          }),
        });
        if (res.ok) {
          Alert.alert('Success', 'Withdrawal request submitted! Awaiting approval.');
          setOtpModalOpen(false);
          setShowWithdrawModal(false);
          resetWithdrawForm();
          fetchWalletData();
        } else {
          Alert.alert('Error', await parseError(res));
        }
      } else {
        // Manual UPI / QR payout (multipart)
        const fd = new FormData();
        fd.append('amount', String(amt));
        fd.append('upi_id', withdrawUpi.trim());
        fd.append('payout_notes', withdrawNotes.trim());
        fd.append('otp', otp);
        if (withdrawQrFile) fd.append('file', filePart(withdrawQrFile, 'payout_qr.jpg'));
        const res = await fetch(`${API_URL}/wallet/withdraw/manual`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        if (res.ok) {
          Alert.alert('Success', 'Withdrawal request submitted! Awaiting approval.');
          setOtpModalOpen(false);
          setShowWithdrawModal(false);
          resetWithdrawForm();
          fetchWalletData();
        } else {
          Alert.alert('Error', await parseError(res));
        }
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to submit withdrawal request');
    }
    setIsSubmitting(false);
  };

  const getStatusColor = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'approved' || s === 'completed' || s === 'success') return '#22c55e';
    if (s === 'pending' || s === 'processing' || s === 'initiated') return '#eab308';
    if (s === 'rejected' || s === 'failed' || s === 'cancelled' || s === 'expired') return '#ef4444';
    return '#666';
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // Small reusable method tab pill
  const MethodTab = ({ active, label, onPress }) => (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.methodTab,
        { borderColor: active ? colors.accent : colors.border },
        active && { backgroundColor: colors.accent + '20' },
      ]}
    >
      <Text style={[styles.methodTabText, { color: active ? colors.accent : colors.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.bgPrimary }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Wallet</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchWalletData(); }} tintColor={colors.accent} />
        }
      >
        {/* Balance Card */}
        <View style={[styles.balanceCard, { backgroundColor: colors.bgCard }]}>
          <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>Main Wallet Balance</Text>
          <Text style={[styles.balanceAmount, { color: colors.textPrimary }]}>${wallet.balance?.toLocaleString() || '0.00'}</Text>

          <View style={styles.actionButtons}>
            <TouchableOpacity style={[styles.depositBtn, { backgroundColor: colors.accent }]} onPress={() => { resetDepositForm(); setShowDepositModal(true); }}>
              <Ionicons name="arrow-down-circle" size={20} color="#000" />
              <Text style={styles.depositBtnText}>Deposit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.withdrawBtn, { backgroundColor: colors.bgSecondary, borderColor: colors.accent }]} onPress={() => { resetWithdrawForm(); setShowWithdrawModal(true); }}>
              <Ionicons name="arrow-up-circle" size={20} color={colors.accent} />
              <Text style={[styles.withdrawBtnText, { color: colors.accent }]}>Withdraw</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Transactions */}
        <View style={styles.transactionsSection}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recent Transactions</Text>

          {transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No transactions yet</Text>
            </View>
          ) : (
            transactions.map((tx) => {
              const isPositive = tx.type === 'deposit' || tx.type === 'DEPOSIT' || tx.type === 'Deposit'
                || tx.type === 'adjustment' || tx.type === 'credit'
                || tx.type === 'Admin_Fund_Add' || tx.type === 'Admin_Credit_Add'
                || tx.type === 'Transfer_From_Account' || tx.type === 'Account_Transfer_In'
                || (tx.amount > 0);
              const getTypeLabel = (type) => {
                switch(type) {
                  case 'deposit': return 'Deposit';
                  case 'withdrawal': return 'Withdrawal';
                  case 'adjustment': return 'Admin Adjustment';
                  case 'credit': return 'Credit';
                  case 'profit': return 'Trade Profit';
                  case 'loss': return 'Trade Loss';
                  case 'Admin_Fund_Add': return 'Admin Fund Addition';
                  case 'Admin_Credit_Add': return 'Admin Credit Addition';
                  case 'Admin_Credit_Remove': return 'Admin Credit Removal';
                  case 'Transfer_To_Account': return 'To Trading Account';
                  case 'Transfer_From_Account': return 'From Trading Account';
                  default: return type || 'Transaction';
                }
              };
              const getIcon = (type) => {
                if (type === 'deposit' || type === 'credit' || type === 'adjustment') return 'arrow-down';
                if (type === 'withdrawal') return 'arrow-up';
                if (type === 'profit') return 'trending-up';
                if (type === 'loss') return 'trending-down';
                if (isPositive) return 'arrow-down';
                return 'arrow-up';
              };
              return (
                <View key={tx.id || tx._id} style={[styles.transactionItem, { backgroundColor: colors.bgCard }]}>
                  <View style={styles.txLeft}>
                    <View style={[styles.txIcon, { backgroundColor: isPositive ? colors.success + '20' : colors.error + '20' }]}>
                      <Ionicons name={getIcon(tx.type)} size={20} color={isPositive ? colors.success : colors.error} />
                    </View>
                    <View>
                      <Text style={[styles.txType, { color: colors.textPrimary }]}>{getTypeLabel(tx.type)}</Text>
                      {tx.method && tx.method !== 'admin' && (
                        <Text style={[styles.txDate, { color: colors.textMuted }]}>{tx.method.replace('_', ' ').toUpperCase()}</Text>
                      )}
                      <Text style={[styles.txDate, { color: colors.textMuted }]}>{formatDate(tx.created_at || tx.createdAt)}</Text>
                    </View>
                  </View>
                  <View style={styles.txRight}>
                    <Text style={[styles.txAmount, { color: isPositive ? colors.success : colors.error }]}>
                      {isPositive ? '+' : '-'}${Math.abs(tx.amount || 0).toLocaleString()}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(tx.status) + '20' }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(tx.status) }]}>{tx.status}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ───────────────────────── Deposit Modal ───────────────────────── */}
      <Modal visible={showDepositModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <SafeAreaView style={{ flex: 1, justifyContent: 'flex-end' }}>
            <ScrollView
              style={[styles.modalContent, { backgroundColor: colors.bgCard, maxHeight: '90%' }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Deposit Funds</Text>
                <TouchableOpacity onPress={() => { setShowDepositModal(false); resetDepositForm(); }} style={{ padding: 4 }}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Method tabs */}
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Payment Method</Text>
              <View style={styles.methodTabRow}>
                <MethodTab active={depositMethod === 'oxapay'} label="Crypto (OxaPay)" onPress={() => selectDepositMethod('oxapay')} />
                <MethodTab active={depositMethod === 'manual'} label="Bank / UPI" onPress={() => selectDepositMethod('manual')} />
                <MethodTab active={depositMethod === 'crypto_manual'} label="Crypto (Manual)" onPress={() => selectDepositMethod('crypto_manual')} />
              </View>

              {/* Amount */}
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Amount (USD)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                value={depositAmount}
                onChangeText={setDepositAmount}
                onBlur={() => { if (depositMethod === 'manual') fetchBankInfo(depositAmount || 100); if (depositMethod === 'crypto_manual') fetchCryptoWallets(depositAmount); }}
                placeholder="Enter amount in USD"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />

              {/* ── OxaPay (auto) ── */}
              {depositMethod === 'oxapay' && (
                <View style={[styles.infoBox, { backgroundColor: '#f59e0b15', borderColor: '#f59e0b50' }]}>
                  <Text style={[styles.infoTitle, { color: '#f59e0b' }]}>Processing Fee: 1.5%</Text>
                  <Text style={[styles.infoText, { color: colors.textMuted }]}>
                    You'll be redirected to OxaPay to choose your cryptocurrency (BTC, ETH, USDT, USDC, etc.) and complete payment securely.
                    {depositAmount && parseFloat(depositAmount) > 0
                      ? ` Fee ≈ $${(parseFloat(depositAmount) * 0.015).toFixed(2)}.`
                      : ''}
                  </Text>
                </View>
              )}

              {/* ── Manual Bank / UPI ── */}
              {depositMethod === 'manual' && (
                <>
                  <View style={[styles.methodDetails, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
                    <Text style={[styles.infoTitle, { color: colors.textPrimary, marginBottom: 8 }]}>Pay to this account (from admin)</Text>
                    {!bankInfo ? (
                      <ActivityIndicator size="small" color={colors.accent} style={{ margin: 12 }} />
                    ) : (
                      <>
                        {bankInfo.bank_name ? (
                          <TouchableOpacity style={styles.copyRow} onPress={() => { Clipboard.setStringAsync(bankInfo.bank_name); Alert.alert('Copied', 'Bank name copied!'); }}>
                            <Text style={styles.detailRow}>
                              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Bank: </Text>
                              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{bankInfo.bank_name}</Text>
                            </Text>
                            <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
                          </TouchableOpacity>
                        ) : null}
                        {bankInfo.account_number ? (
                          <TouchableOpacity style={styles.copyRow} onPress={() => { Clipboard.setStringAsync(bankInfo.account_number); Alert.alert('Copied', 'Account number copied!'); }}>
                            <Text style={styles.detailRow}>
                              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Account: </Text>
                              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{bankInfo.account_number}</Text>
                            </Text>
                            <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
                          </TouchableOpacity>
                        ) : null}
                        {(bankInfo.account_name || bankInfo.account_holder) ? (
                          <TouchableOpacity style={styles.copyRow} onPress={() => { Clipboard.setStringAsync(bankInfo.account_name || bankInfo.account_holder); Alert.alert('Copied', 'Name copied!'); }}>
                            <Text style={styles.detailRow}>
                              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Name: </Text>
                              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{bankInfo.account_name || bankInfo.account_holder}</Text>
                            </Text>
                            <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
                          </TouchableOpacity>
                        ) : null}
                        {bankInfo.ifsc_code ? (
                          <TouchableOpacity style={styles.copyRow} onPress={() => { Clipboard.setStringAsync(bankInfo.ifsc_code); Alert.alert('Copied', 'IFSC copied!'); }}>
                            <Text style={styles.detailRow}>
                              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>IFSC: </Text>
                              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{bankInfo.ifsc_code}</Text>
                            </Text>
                            <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
                          </TouchableOpacity>
                        ) : null}
                        {bankInfo.upi_id ? (
                          <TouchableOpacity style={styles.copyRow} onPress={() => { Clipboard.setStringAsync(bankInfo.upi_id); Alert.alert('Copied', 'UPI ID copied!'); }}>
                            <Text style={styles.detailRow}>
                              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>UPI ID: </Text>
                              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{bankInfo.upi_id}</Text>
                            </Text>
                            <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
                          </TouchableOpacity>
                        ) : null}
                        {bankInfo.qr_code_url ? (
                          <View style={styles.qrContainer}>
                            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Scan QR Code to Pay:</Text>
                            <Image source={{ uri: bankInfo.qr_code_url }} style={styles.qrImage} resizeMode="contain" />
                          </View>
                        ) : null}
                        {!bankInfo.bank_name && !bankInfo.upi_id ? (
                          <Text style={{ color: '#f59e0b', fontSize: 12 }}>No bank details configured yet. Enter an amount and reopen, or contact support.</Text>
                        ) : null}
                      </>
                    )}
                  </View>

                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Transaction / Reference ID *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                    value={depositTxId}
                    onChangeText={setDepositTxId}
                    placeholder="UTR or reference from your bank/UPI app"
                    placeholderTextColor={colors.textMuted}
                  />

                  {renderProofUpload()}
                </>
              )}

              {/* ── Manual Crypto ── */}
              {depositMethod === 'crypto_manual' && (
                <>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Pay to wallet (select)</Text>
                  {loadingExtra ? (
                    <ActivityIndicator size="small" color={colors.accent} style={{ margin: 12 }} />
                  ) : cryptoWallets.length === 0 ? (
                    <Text style={{ color: '#f59e0b', fontSize: 12, marginTop: 4 }}>No crypto wallets configured yet. Enter an amount and reopen, or contact support.</Text>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.methodsScroll}>
                      {cryptoWallets.map((w) => {
                        const active = selectedCryptoWalletId === w.id;
                        return (
                          <TouchableOpacity
                            key={w.id}
                            onPress={() => setSelectedCryptoWalletId(w.id)}
                            style={[styles.methodCard, { backgroundColor: colors.bgSecondary, borderColor: active ? colors.accent : colors.border }, active && { backgroundColor: colors.accent }]}
                          >
                            <Text style={[styles.methodName, { color: active ? '#fff' : colors.textPrimary }]}>
                              {w.coin || w.label || 'Wallet'}{w.network ? ` · ${w.network}` : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}

                  {/* Selected wallet address + QR */}
                  {(() => {
                    const w = cryptoWallets.find((x) => x.id === selectedCryptoWalletId);
                    if (!w) return null;
                    return (
                      <View style={[styles.methodDetails, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
                        {w.address ? (
                          <TouchableOpacity style={styles.copyRow} onPress={() => { Clipboard.setStringAsync(w.address); Alert.alert('Copied', 'Address copied!'); }}>
                            <Text style={[styles.detailRow, { flex: 1 }]}>
                              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Address: </Text>
                              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{w.address}</Text>
                            </Text>
                            <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
                          </TouchableOpacity>
                        ) : null}
                        {w.qr_code_url ? (
                          <View style={styles.qrContainer}>
                            <Image source={{ uri: w.qr_code_url }} style={styles.qrImage} resizeMode="contain" />
                          </View>
                        ) : null}
                      </View>
                    );
                  })()}

                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Transaction Hash / TXID *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                    value={depositTxId}
                    onChangeText={setDepositTxId}
                    placeholder="On-chain transaction hash"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                  />

                  {renderProofUpload()}
                </>
              )}

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.accent }, isSubmitting && styles.submitBtnDisabled]}
                onPress={handleDeposit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.submitBtnText, { color: '#fff' }]}>
                    {depositMethod === 'oxapay' ? 'Pay with Crypto' : 'Submit Deposit Request'}
                  </Text>
                )}
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ───────────────────────── Withdraw Modal ───────────────────────── */}
      <Modal visible={showWithdrawModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <SafeAreaView style={{ flex: 1, justifyContent: 'flex-end' }}>
            <ScrollView
              style={[styles.modalContent, { backgroundColor: colors.bgCard, maxHeight: '90%' }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Withdraw Funds</Text>
                <TouchableOpacity onPress={() => { setShowWithdrawModal(false); resetWithdrawForm(); }} style={{ padding: 4 }}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={[styles.availableBalance, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
                <Text style={[styles.availableLabel, { color: colors.textMuted }]}>Available Balance</Text>
                <Text style={[styles.availableAmount, { color: colors.accent }]}>${wallet.balance?.toLocaleString()}</Text>
              </View>

              {/* Method tabs */}
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Payout Method</Text>
              <View style={styles.methodTabRow}>
                <MethodTab active={withdrawMethod === 'oxapay'} label="Crypto (OxaPay)" onPress={() => setWithdrawMethod('oxapay')} />
                <MethodTab active={withdrawMethod === 'manual'} label="Manual (UPI / QR)" onPress={() => setWithdrawMethod('manual')} />
              </View>

              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Amount (USD)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                placeholder="Enter amount"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />

              {/* ── OxaPay crypto payout ── */}
              {withdrawMethod === 'oxapay' && (
                <>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Cryptocurrency</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.methodsScroll}>
                    {CRYPTO_ASSETS.map((c) => {
                      const active = selectedWithdrawCrypto === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          onPress={() => setSelectedWithdrawCrypto(c.id)}
                          style={[styles.currencyCard, { backgroundColor: colors.bgSecondary, borderColor: active ? colors.accent : colors.border }, active && { backgroundColor: colors.accent }]}
                        >
                          <Text style={[styles.currencySymbol, { color: active ? '#fff' : colors.textPrimary, fontSize: 14 }]}>{c.label}</Text>
                          <Text style={[styles.currencyName, { color: active ? '#fff' : colors.textMuted }]}>{c.sub}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Wallet Address / Payout Details *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                    value={withdrawCryptoAddress}
                    onChangeText={setWithdrawCryptoAddress}
                    placeholder="Your crypto wallet address"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                  />
                </>
              )}

              {/* ── Manual UPI / QR payout ── */}
              {withdrawMethod === 'manual' && (
                <>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>UPI ID</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                    value={withdrawUpi}
                    onChangeText={setWithdrawUpi}
                    placeholder="name@upi"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                  />
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Notes (optional)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                    value={withdrawNotes}
                    onChangeText={setWithdrawNotes}
                    placeholder="Bank / payout details"
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>QR Code (optional)</Text>
                  {withdrawQrFile ? (
                    <View style={{ marginBottom: 8 }}>
                      <Image source={{ uri: withdrawQrFile.uri }} style={{ width: '100%', height: 180, borderRadius: 8, borderWidth: 1, borderColor: colors.border }} resizeMode="contain" />
                      <TouchableOpacity
                        onPress={() => setWithdrawQrFile(null)}
                        style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#ef4444', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => pickImage(setWithdrawQrFile)}
                      style={{ marginBottom: 8, padding: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 8, alignItems: 'center', gap: 6 }}
                    >
                      <Ionicons name="cloud-upload-outline" size={24} color={colors.textMuted} />
                      <Text style={{ color: colors.textMuted, fontSize: 13 }}>Upload payout QR (optional)</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={{ color: colors.textMuted, fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                    Enter your UPI ID and/or upload a QR for finance to pay out.
                  </Text>
                </>
              )}

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.accent }, otpRequesting && styles.submitBtnDisabled]}
                onPress={submitWithdraw}
                disabled={otpRequesting}
              >
                {otpRequesting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.submitBtnText, { color: '#fff' }]}>Continue (Verify Email)</Text>
                )}
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ───────────────────────── OTP Modal ───────────────────────── */}
      <Modal visible={otpModalOpen} animationType="fade" transparent>
        <View style={styles.otpOverlay}>
          <View style={[styles.otpCard, { backgroundColor: colors.bgCard }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Verify Withdrawal</Text>
              <TouchableOpacity onPress={() => { setOtpModalOpen(false); setOtpCode(''); }} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16 }}>
              We emailed a 6-digit code{otpMaskedEmail ? ` to ${otpMaskedEmail}` : ''}. Enter it below to confirm your withdrawal.
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary, textAlign: 'center', letterSpacing: 8, fontSize: 22 }]}
              value={otpCode}
              onChangeText={setOtpCode}
              placeholder="••••••"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={10}
            />
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.accent }, isSubmitting && styles.submitBtnDisabled]}
              onPress={confirmWithdrawWithOtp}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.submitBtnText, { color: '#fff' }]}>Confirm Withdrawal</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={resendWithdrawOtp} disabled={otpResending} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.accent, fontSize: 13 }}>{otpResending ? 'Sending…' : 'Resend code'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );

  // Shared screenshot upload control (manual + crypto_manual deposits).
  function renderProofUpload() {
    return (
      <>
        <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Payment Screenshot (Proof) *</Text>
        {depositProof ? (
          <View style={{ marginBottom: 8 }}>
            <Image source={{ uri: depositProof.uri }} style={{ width: '100%', height: 200, borderRadius: 8, borderWidth: 1, borderColor: colors.border }} resizeMode="contain" />
            <TouchableOpacity
              onPress={() => setDepositProof(null)}
              style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#ef4444', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => pickImage(setDepositProof)}
            style={{ marginBottom: 8, padding: 20, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 8, alignItems: 'center', gap: 8 }}
          >
            <Ionicons name="cloud-upload-outline" size={28} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>Tap to upload payment screenshot</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, opacity: 0.6 }}>JPG, PNG, PDF, WEBP up to 10MB</Text>
          </TouchableOpacity>
        )}
      </>
    );
  }
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  scrollContent: { flex: 1 },
  scrollContentContainer: { paddingBottom: 40 },

  balanceCard: { margin: 16, padding: 20, borderRadius: 16 },
  balanceLabel: { fontSize: 14 },
  balanceAmount: { fontSize: 36, fontWeight: 'bold', marginTop: 8 },

  actionButtons: { flexDirection: 'row', gap: 12, marginTop: 24 },
  depositBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1a73e8', paddingVertical: 14, borderRadius: 12 },
  depositBtnText: { color: '#000', fontSize: 16, fontWeight: '600' },
  withdrawBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, paddingVertical: 14, borderRadius: 12 },
  withdrawBtnText: { color: '#1a73e8', fontSize: 16, fontWeight: '600' },

  transactionsSection: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 16 },

  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#666', fontSize: 14, marginTop: 12 },

  transactionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 8 },
  txLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  txIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  txType: { fontSize: 14, fontWeight: '600' },
  txDate: { color: '#666', fontSize: 12, marginTop: 2 },
  txRight: { alignItems: 'flex-end' },
  txAmount: { fontSize: 16, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginTop: 4 },
  statusText: { fontSize: 10, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },

  inputLabel: { color: '#666', fontSize: 12, marginBottom: 8, marginTop: 16 },
  input: { borderRadius: 12, padding: 16, fontSize: 16, borderWidth: 1 },

  methodTabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodTab: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginRight: 4, marginBottom: 4 },
  methodTabText: { fontSize: 13, fontWeight: '600' },

  methodsScroll: { marginTop: 8 },
  methodCard: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, marginRight: 8, borderWidth: 1 },
  methodName: { fontSize: 14, fontWeight: '500' },

  infoBox: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 16 },
  infoTitle: { fontSize: 13, fontWeight: 'bold' },
  infoText: { fontSize: 12, marginTop: 6, lineHeight: 18 },

  availableBalance: { padding: 16, borderRadius: 12, marginBottom: 8, borderWidth: 1 },
  availableLabel: { color: '#666', fontSize: 12 },
  availableAmount: { color: '#1a73e8', fontSize: 24, fontWeight: 'bold', marginTop: 4 },

  submitBtn: { backgroundColor: '#1a73e8', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },

  currencyCard: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginRight: 8, alignItems: 'center', minWidth: 60, borderWidth: 1 },
  currencySymbol: { fontSize: 18, fontWeight: 'bold' },
  currencyName: { color: '#666', fontSize: 10, marginTop: 2 },

  methodDetails: { borderRadius: 12, padding: 16, marginTop: 12, borderWidth: 1 },
  copyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#333' },
  detailRow: { marginBottom: 8 },
  detailLabel: { color: '#666', fontSize: 13 },
  detailValue: { fontSize: 13 },

  qrContainer: { alignItems: 'center', marginTop: 8 },
  qrImage: { width: 200, height: 200, marginTop: 12, borderRadius: 8 },

  otpOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  otpCard: { width: '100%', borderRadius: 20, padding: 20 },
});

export default WalletScreen;
