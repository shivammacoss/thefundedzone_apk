import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';

// The backend access token (Bearer) lives only ~45 minutes, but the refresh
// token cookie (pt_refresh) is valid for 7 days. Without refreshing, after 45
// min every API call 401s and the app shows empty wallet/account data even
// though the user is still "logged in". This keeper silently mints a fresh
// access token from the refresh cookie so data keeps loading for the whole
// week. It NEVER logs the user out — on any failure it just keeps the existing
// session untouched (per requirement: hold session ~1 week, no auto-logout).

let _lastRefresh = 0;

export async function refreshSession({ force = false } = {}) {
  try {
    const token = await SecureStore.getItemAsync('token');
    if (!token) return false; // not logged in — nothing to refresh

    // Throttle: avoid hammering /auth/refresh from multiple triggers.
    const now = Date.now();
    if (!force && now - _lastRefresh < 120000) return false;
    _lastRefresh = now;

    // The refresh cookie (pt_refresh) is sent automatically by the native
    // cookie store that was populated at login.
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    // Keep the existing session on any non-OK response — never logout.
    if (!res.ok) return false;

    const data = await res.json().catch(() => ({}));
    if (!data?.access_token) return false;

    await SecureStore.setItemAsync('token', data.access_token);

    // Keep the cached user record's metadata in sync (best-effort).
    try {
      const stored = await SecureStore.getItemAsync('user');
      if (stored) {
        const u = JSON.parse(stored);
        if (data.expires_at) u.expires_at = data.expires_at;
        if (data.role) u.role = data.role;
        if (data.user_id) u.id = data.user_id;
        await SecureStore.setItemAsync('user', JSON.stringify(u));
      }
    } catch (_) {}

    return true;
  } catch (_) {
    // Network/other error — hold the session as-is.
    return false;
  }
}
