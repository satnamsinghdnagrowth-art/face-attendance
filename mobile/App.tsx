import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { StyleSheet } from 'react-native';

import { store } from '@/store';
import { logoutThunk } from '@/store/slices/auth.slice';
import { setOnSessionExpired } from '@/api/client';
import { AppNavigator } from '@/navigation/AppNavigator';
import { paperTheme } from '@/constants/theme';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

// When both access + refresh tokens expire the Axios interceptor clears SecureStore
// and calls this handler so Redux reflects the logged-out state and navigation resets.
setOnSessionExpired(() => {
  store.dispatch(logoutThunk());
});

export default function App() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <ErrorBoundary>
        <Provider store={store}>
          <SafeAreaProvider>
            <PaperProvider theme={paperTheme}>
              <NavigationContainer>
                <StatusBar style="auto" />
                {/* Inner ErrorBoundary catches navigation-level crashes */}
                <ErrorBoundary>
                  <AppNavigator />
                </ErrorBoundary>
              </NavigationContainer>
            </PaperProvider>
          </SafeAreaProvider>
        </Provider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
