import {
  API_BASE_URL as ENV_API_BASE_URL,
  API_URL as ENV_API_URL,
  WS_URL as ENV_WS_URL,
} from '@env';

const DEFAULT_BASE = 'https://thefundedzone.com';

function trimOrEmpty(v) {
  if (v == null || typeof v !== 'string') return '';
  return v.trim();
}

export const API_BASE_URL =
  trimOrEmpty(ENV_API_BASE_URL) || DEFAULT_BASE;

const baseNoSlash = API_BASE_URL.replace(/\/$/, '');

export const API_URL =
  trimOrEmpty(ENV_API_URL) || `${baseNoSlash}/api/v1`;

const derivedWs = API_BASE_URL.startsWith('https')
  ? API_BASE_URL.replace(/^https/, 'wss')
  : API_BASE_URL.replace(/^http/, 'ws');

export const WS_URL = trimOrEmpty(ENV_WS_URL) || derivedWs;

// ── Google Sign-In ──
// Fill these from Google Cloud Console → Credentials (OAuth 2.0 Client IDs).
// Web client id is required (used to verify the id_token on the backend); add
// the Android/iOS ids for native builds. Google sign-in button hides itself
// until at least one id is set.
export const GOOGLE_AUTH = {
  webClientId: '',
  androidClientId: '',
  iosClientId: '',
};

