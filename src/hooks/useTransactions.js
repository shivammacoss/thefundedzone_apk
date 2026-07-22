import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL } from '../config';
import { getJsonAuthHeaders } from '../utils/authHeaders';

const PAGE_SIZE = 20;

// Statuses that mean the deposit/withdrawal request is DONE and has therefore
// already been written into the wallet ledger (/wallet/transactions). We must
// NOT also pull these from the request tables (/wallet/deposits,
// /wallet/withdrawals) or every completed deposit & withdrawal shows twice.
const DONE_STATUSES = new Set(['approved', 'auto_approved', 'completed', 'success', 'confirmed']);

function mapStatus(s) {
  const x = String(s || '').toLowerCase();
  if (['approved', 'auto_approved', 'completed', 'success', 'confirmed'].includes(x)) return 'completed';
  if (['rejected', 'cancelled', 'canceled', 'failed', 'declined', 'expired'].includes(x)) return 'failed';
  return 'pending'; // pending, processing, initiated, review, …
}

function normalizeTransaction(raw) {
  return {
    id: String(raw.id || raw._id || `${raw.type}-${raw.created_at}-${raw.amount}`),
    type: raw.type || raw.transaction_type || 'other',
    amount: Number(raw.amount || 0),
    currency: raw.currency || 'USD',
    status: mapStatus(raw.status),
    reference: raw.reference || raw.txn_ref || '',
    description: raw.description || raw.notes || '',
    created_at: raw.created_at || raw.createdAt || new Date().toISOString(),
  };
}

function pickItems(settled) {
  if (settled.status !== 'fulfilled' || !settled.value) return [];
  const v = settled.value;
  const arr = v.items ?? v;
  return Array.isArray(arr) ? arr : [];
}

export default function useTransactions() {
  // fullList = the complete merged dataset (ledger + pending requests). We
  // paginate over THIS in memory — no re-fetching per page, so nothing is ever
  // appended twice.
  const fullListRef = useRef([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState({ total_deposited: 0, total_withdrawn: 0 });

  // Filters + client-side pagination window
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const headers = await getJsonAuthHeaders();
      const res = await fetch(`${API_URL}/wallet/summary`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      if (mounted.current) setSummary({
        total_deposited: Number(data.total_deposited || 0),
        total_withdrawn: Number(data.total_withdrawn || 0),
      });
    } catch (_) {}
  }, []);

  const fetchTransactions = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const headers = await getJsonAuthHeaders();
      const [txRes, depRes, wdRes] = await Promise.allSettled([
        fetch(`${API_URL}/wallet/transactions`, { headers }).then(r => (r.ok ? r.json() : null)),
        fetch(`${API_URL}/wallet/deposits`, { headers }).then(r => (r.ok ? r.json() : null)),
        fetch(`${API_URL}/wallet/withdrawals`, { headers }).then(r => (r.ok ? r.json() : null)),
      ]);

      // The ledger is the single source of truth for every COMPLETED money
      // movement — deposits, withdrawals, transfers, trading P/L, commissions.
      const ledger = pickItems(txRes).map(normalizeTransaction);

      // From the request tables take ONLY entries that are not yet finalised
      // (pending / processing / failed). Completed ones already live in the
      // ledger; including them here is exactly what made each deposit and
      // withdrawal appear twice.
      const pendingReqs = [...pickItems(depRes), ...pickItems(wdRes)]
        .filter((raw) => !DONE_STATUSES.has(String(raw.status || '').toLowerCase()))
        .map(normalizeTransaction);

      // Merge, dedup by id (belt-and-braces), newest first.
      const seen = new Set();
      const all = [...pendingReqs, ...ledger].filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      if (mounted.current) {
        fullListRef.current = all;
        setVisibleCount(PAGE_SIZE);
        setTransactions(all);
      }
    } catch (e) {
      if (mounted.current) setError(e?.message || 'Failed to load transactions');
    }
    if (mounted.current) { setLoading(false); setRefreshing(false); setLoadingMore(false); }
  }, []);

  useEffect(() => {
    fetchSummary();
    fetchTransactions(false);
  }, [fetchSummary, fetchTransactions]);

  // Reset the pagination window whenever a filter changes so the user starts
  // from the top of the (re-)filtered list.
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [typeFilter, statusFilter]);

  // Apply filters over the FULL dataset, then slice to the visible window.
  let filtered = transactions;
  if (typeFilter !== 'all') {
    filtered = filtered.filter((t) => t.type.toLowerCase().includes(typeFilter));
  }
  if (statusFilter !== 'all') {
    filtered = filtered.filter((t) => t.status.toLowerCase() === statusFilter);
  }
  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const loadMore = () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    setVisibleCount((prev) => prev + PAGE_SIZE);
    setLoadingMore(false);
  };

  return {
    transactions: visible,
    allTransactions: transactions,
    summary, loading, refreshing, loadingMore, error, hasMore,
    typeFilter, setTypeFilter,
    statusFilter, setStatusFilter,
    refresh: () => { fetchSummary(); fetchTransactions(true); },
    loadMore,
  };
}
