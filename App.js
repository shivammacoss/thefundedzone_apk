import React, { Component, useEffect } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, LogBox, AppState } from 'react-native';
import * as Updates from 'expo-updates';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { I18nProvider } from './src/i18n';
import { refreshSession } from './src/utils/sessionRefresh';

// Ignore specific warnings for better performance
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
  'VirtualizedLists should never be nested',
]);

// Disable all console logs in production for better performance
if (!__DEV__) {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
}

import SignupScreen from './src/screens/SignupScreen';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import MainTradingScreen from './src/screens/MainTradingScreen';
import WalletScreen from './src/screens/WalletScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SupportScreen from './src/screens/SupportScreen';
import IBScreen from './src/screens/IBScreen';
import MyChallengesScreen from './src/screens/MyChallengesScreen';
import BuyChallengeScreen from './src/screens/BuyChallengeScreen';
import PassedChallengesScreen from './src/screens/PassedChallengesScreen';
import LeaderboardScreen from './src/screens/LeaderboardScreen';
import CertificatesScreen from './src/screens/CertificatesScreen';
import OrderBookScreen from './src/screens/OrderBookScreen';
import InstructionsScreen from './src/screens/InstructionsScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import PortfolioScreen from './src/screens/PortfolioScreen';
import BusinessScreen from './src/screens/BusinessScreen';
import KycScreen from './src/screens/KycScreen';
import RiskCalculatorScreen from './src/screens/RiskCalculatorScreen';
import EconomicCalendarScreen from './src/screens/EconomicCalendarScreen';
import AcademyScreen from './src/screens/AcademyScreen';
import TransactionHistoryScreen from './src/screens/TransactionHistoryScreen';

const Stack = createNativeStackNavigator();

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={[styles.errorContainer, { backgroundColor: this.props.bgColor || '#121212' }]}>
          <Text style={styles.errorText}>Something went wrong</Text>
          <Text style={styles.errorSubtext}>Please restart the app</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

const AppContent = () => {
  const { colors, isDark } = useTheme();

  // Force-check OTA updates on launch AND when app returns to foreground.
  // If an update is available, download + reload immediately so user sees latest.
  useEffect(() => {
    const checkAndApply = async () => {
      try {
        if (__DEV__) return;
        const res = await Updates.checkForUpdateAsync();
        if (res?.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (_) {}
    };

    checkAndApply();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') checkAndApply();
    });
    return () => sub.remove();
  }, []);

  // Keep the session alive for the full 7-day refresh window. The access token
  // expires every ~45 min, so refresh it on launch, on foreground, and every
  // 30 min — this keeps wallet/account data loading without ever logging out.
  useEffect(() => {
    refreshSession({ force: true });
    const interval = setInterval(() => refreshSession({ force: true }), 30 * 60 * 1000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshSession({ force: true });
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack.Navigator 
        initialRouteName="Login"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bgPrimary }
        }}
      >
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen name="MainTrading" component={MainTradingScreen} />
        <Stack.Screen name="Wallet" component={WalletScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="Support" component={SupportScreen} />
        <Stack.Screen name="IB" component={IBScreen} />
        <Stack.Screen name="Business" component={BusinessScreen} />
        <Stack.Screen name="MyChallenges" component={MyChallengesScreen} />
        <Stack.Screen name="BuyChallenge" component={BuyChallengeScreen} />
        <Stack.Screen name="PassedChallenges" component={PassedChallengesScreen} />
        <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
        <Stack.Screen name="Certificates" component={CertificatesScreen} />
        <Stack.Screen name="OrderBook" component={OrderBookScreen} />
        <Stack.Screen name="Instructions" component={InstructionsScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="Portfolio" component={PortfolioScreen} />
        <Stack.Screen name="Kyc" component={KycScreen} />
        <Stack.Screen name="RiskCalculator" component={RiskCalculatorScreen} />
        <Stack.Screen name="EconomicCalendar" component={EconomicCalendarScreen} />
        <Stack.Screen name="Academy" component={AcademyScreen} />
        <Stack.Screen name="TransactionHistory" component={TransactionHistoryScreen} />
      </Stack.Navigator>
    </>
  );
};

function AppWithNavigation() {
  const { colors, isDark } = useTheme();
  const navTheme = isDark ? DarkTheme : DefaultTheme;
  const mergedTheme = {
    ...navTheme,
    colors: {
      ...navTheme.colors,
      primary: colors.primary,
      background: colors.bgPrimary,
      card: colors.bgCard,
      text: colors.textPrimary,
      border: colors.border,
      notification: colors.accent,
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <SafeAreaProvider>
        <AuthProvider>
          <ErrorBoundary bgColor={colors.bgPrimary}>
            <NavigationContainer
              theme={{
                ...mergedTheme,
                fonts: {
                  regular: { fontFamily: 'System', fontWeight: '400' },
                  medium: { fontFamily: 'System', fontWeight: '500' },
                  bold: { fontFamily: 'System', fontWeight: '700' },
                  heavy: { fontFamily: 'System', fontWeight: '900' },
                },
              }}
            >
              <AppContent />
            </NavigationContainer>
          </ErrorBoundary>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AppWithNavigation />
      </I18nProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorSubtext: {
    color: '#64748b',
    fontSize: 14,
  },
});
