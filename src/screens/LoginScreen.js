import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { Image } from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { API_URL, GOOGLE_AUTH } from '../config';

const { width, height } = Dimensions.get('window');
const AUTH_URL = `${API_URL}/auth`;
const GOOGLE_ENABLED = !!(GOOGLE_AUTH?.webClientId || GOOGLE_AUTH?.androidClientId || GOOGLE_AUTH?.iosClientId);

// Native Google Sign-In. webClientId mints the ID token (aud = webClientId,
// which the backend verifies); the Android OAuth client (package + SHA-1)
// authorises the app automatically.
if (GOOGLE_ENABLED && GOOGLE_AUTH.webClientId) {
  GoogleSignin.configure({ webClientId: GOOGLE_AUTH.webClientId, offlineAccess: false });
}

const LoginScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(0);

  const handleGoogleLogin = async (idToken) => {
    setLoading(true);
    try {
      const res = await fetch(`${AUTH_URL}/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message || 'Google sign-in failed');
      const token = data.access_token;
      if (!token) throw new Error('No access token received');
      await SecureStore.setItemAsync('token', token);
      await SecureStore.setItemAsync('user', JSON.stringify({
        id: data.user_id, email: data.email, role: data.role, expires_at: data.expires_at,
      }));
      navigation.replace('MainTrading');
    } catch (e) {
      Alert.alert('Google Sign-In Failed', e.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Check if user is already logged in
  useEffect(() => {
    checkExistingAuth();
  }, []);

  const checkExistingAuth = async () => {
    // Persistent login: agar token device par save hai, seedha MainTrading par jao.
    // Token expiry ya server-verify check intentionally hata diya hai — user manual
    // "Logout" dabaye bina kabhi sign-out nahi hoga.
    try {
      const userData = await SecureStore.getItemAsync('user');
      const token = await SecureStore.getItemAsync('token');
      if (userData && token) {
        navigation.replace('MainTrading');
        return;
      }
    } catch (e) {
      console.error('Error checking auth:', e);
    }
    setCheckingAuth(false);
  };

  const handleLogin = async () => {
    // Normalize: trim whitespace + lowercase email
    const email = formData.email.trim().toLowerCase();
    const password = formData.password.trim();

    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    // Rate limiting: max 5 attempts, then 30s cooldown
    if (Date.now() < lockoutUntil) {
      const secs = Math.ceil((lockoutUntil - Date.now()) / 1000);
      Alert.alert('Too Many Attempts', `Please wait ${secs} seconds before trying again.`);
      return;
    }

    setLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${AUTH_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();
      if (!response.ok) {
        const newAttempts = loginAttempts + 1;
        setLoginAttempts(newAttempts);
        if (newAttempts >= 5) {
          setLockoutUntil(Date.now() + 30000);
          setLoginAttempts(0);
          throw new Error('Too many failed attempts. Please wait 30 seconds.');
        }
        const errMsg = data.detail || data.message || `Login failed (${response.status})`;
        throw new Error(errMsg);
      }
      setLoginAttempts(0);

      const token = data.access_token;
      if (!token) throw new Error('No access token received from server');

      await SecureStore.setItemAsync('token', token);
      await SecureStore.setItemAsync('user', JSON.stringify({
        id: data.user_id,
        email,
        role: data.role,
        expires_at: data.expires_at,
      }));

      navigation.replace('MainTrading');
    } catch (error) {
      console.error('Login error:', error);
      let errorMsg = error.message;
      if (error.name === 'AbortError') {
        errorMsg = 'Connection timeout. Please check your internet connection.';
      } else if (error.message === 'Network request failed') {
        errorMsg = 'Cannot connect to server. Please check your internet connection.';
      } else if (error.message === 'Invalid credentials') {
        errorMsg = 'Email or password is incorrect. Please check and try again.';
      }
      Alert.alert('Login Failed', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#1a73e8" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0A0E17" />
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../../assets/logo-shield.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.brandName}>
            <Text style={{ color: '#F5F7FA' }}>The Funded Zone</Text>
          </Text>
          <Text style={styles.brandTagline}>Trade with confidence</Text>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={styles.tab}
            onPress={() => navigation.navigate('Signup')}
          >
            <Text style={styles.tabText}>Sign up</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, styles.activeTab]}>
            <Text style={styles.activeTabText}>Sign in</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue trading</Text>

        {/* Email Input */}
        <View style={styles.inputContainer}>
          <Ionicons name="mail-outline" size={20} color="#8A94A6" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Email address"
            placeholderTextColor="#8A94A6"
            keyboardType="email-address"
            autoCapitalize="none"
            value={formData.email}
            onChangeText={(text) => setFormData({ ...formData, email: text })}
          />
        </View>

        {/* Password Input */}
        <View style={styles.inputContainer}>
          <Ionicons name="lock-closed-outline" size={20} color="#8A94A6" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#8A94A6"
            secureTextEntry={!showPassword}
            value={formData.password}
            onChangeText={(text) => setFormData({ ...formData, password: text })}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
            <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color="#8A94A6" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={styles.forgotPassword}
          onPress={() => navigation.navigate('ForgotPassword')}
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        {/* Login Button */}
        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </TouchableOpacity>

        {/* Google Sign-In — shown only when a client id is configured. */}
        {GOOGLE_ENABLED && (
          <GoogleSignInButton loading={loading} onToken={handleGoogleLogin} />
        )}

        {/* Sign Up Link */}
        <View style={styles.signupContainer}>
          <Text style={styles.signupText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
            <Text style={styles.signupLink}>Sign up</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E17',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
    minHeight: height,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 60,
    height: 60,
    backgroundColor: '#1a73e8',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 120,
    height: 120,
  },
  logoText: {
    color: '#000',
    fontSize: 24,
    fontWeight: 'bold',
  },
  brandName: {
    color: '#F5F7FA',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 12,
    letterSpacing: -0.3,
  },
  brandTagline: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1A2130',
    borderRadius: 12,
    padding: 4,
    marginBottom: 32,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#1a73e8',
  },
  tabText: {
    color: '#8A94A6',
    fontSize: 15,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F5F7FA',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#8A94A6',
    marginBottom: 32,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131A26',
    borderWidth: 1,
    borderColor: '#232B3A',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    color: '#F5F7FA',
    fontSize: 16,
  },
  eyeIcon: {
    padding: 4,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotText: {
    color: '#1a73e8',
    fontSize: 14,
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#1a73e8',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 32,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#232B3A',
  },
  dividerText: {
    color: '#8A94A6',
    fontSize: 13,
    marginHorizontal: 16,
  },
  socialContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  socialButton: {
    width: 56,
    height: 56,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  signupText: {
    color: '#8A94A6',
    fontSize: 15,
  },
  signupLink: {
    color: '#1a73e8',
    fontSize: 15,
    fontWeight: '600',
  },
});

// Native Google Sign-In button. Uses the device's Google account picker
// (@react-native-google-signin) — the ID token's aud is the Web client ID,
// which the backend verifies.
const GoogleSignInButton = ({ loading, onToken }) => {
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    try {
      setBusy(true);
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();
      // v13+ returns { type, data: { idToken } }; older returns { idToken }.
      const idToken = result?.data?.idToken || result?.idToken;
      if (idToken) {
        await onToken(idToken);
      } else {
        Alert.alert('Google Sign-In', 'No ID token was returned. Please try again.');
      }
    } catch (e) {
      if (e?.code === statusCodes.SIGN_IN_CANCELLED || e?.code === statusCodes.IN_PROGRESS) {
        // user cancelled or a sign-in is already in progress — no-op
      } else if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Google Sign-In', 'Google Play Services is not available on this device.');
      } else {
        Alert.alert('Google Sign-In Failed', e?.message || 'Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 18 }}>
        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#e2e8f0' }} />
        <Text style={{ marginHorizontal: 12, color: '#94a3b8', fontSize: 12, fontWeight: '600' }}>or</Text>
        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#e2e8f0' }} />
      </View>
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' }}
        disabled={loading || busy}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <Ionicons name="logo-google" size={18} color="#EA4335" />
        <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 15 }}>
          {busy ? 'Please wait…' : 'Continue with Google'}
        </Text>
      </TouchableOpacity>
    </>
  );
};

export default LoginScreen;
