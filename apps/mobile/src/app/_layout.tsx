import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
} from '@expo-google-fonts/archivo';
import {
  Literata_400Regular,
  Literata_400Regular_Italic,
  Literata_500Medium,
} from '@expo-google-fonts/literata';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProviders, useTheme } from '@/theme';
import { DB_NAME, migrate } from '@/data/db';
import { useAutoSync } from '@/data/sync';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Literata_400Regular,
    Literata_400Regular_Italic,
    Literata_500Medium,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName={DB_NAME} onInit={migrate}>
        <AppProviders>
          <Navigator />
        </AppProviders>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

function Navigator() {
  const { c, dark } = useTheme();
  useAutoSync();
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.paper },
          animation: 'fade_from_bottom',
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="compose" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="teleport" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="import" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="trace/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="wall/[key]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="person/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="person/edit" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="person/memorial" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="memorial/[id]" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </>
  );
}
