import type { ExpoConfig } from 'expo/config';

/**
 * 密钥都从环境变量读，不写进仓库。复制 .env.example 为 .env 填写。
 * 没有谷歌地图 key 时，App 会使用离线「纸上地图」，一切照常可用。
 */
const IOS_MAPS_KEY = process.env.GOOGLE_MAPS_IOS_KEY ?? '';
const ANDROID_MAPS_KEY = process.env.GOOGLE_MAPS_ANDROID_KEY ?? '';

const config: ExpoConfig = {
  name: 'Been',
  slug: 'been',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'been',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'app.been.core',
    supportsTablet: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'app.been.core',
    adaptiveIcon: {
      backgroundColor: '#F5F4EE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
  },
  web: {
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    [
      'expo-router',
      {
        // Web 端 SQLite（WASM）需要跨域隔离
        headers: {
          'Cross-Origin-Embedder-Policy': 'credentialless',
          'Cross-Origin-Opener-Policy': 'same-origin',
        },
      },
    ],
    'expo-sqlite',
    'expo-localization',
    'expo-sharing',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Been uses your location to mark where a trace was left. It is stored on your device and never shared unless you sign a place wall.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Been lets you add photos to a trace. Photos stay on your device unless you turn on sync.',
        cameraPermission: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#F5F4EE',
        dark: { backgroundColor: '#13161C' },
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    ['react-native-maps', { iosGoogleMapsApiKey: IOS_MAPS_KEY, androidGoogleMapsApiKey: ANDROID_MAPS_KEY }],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    googleMaps: !!(IOS_MAPS_KEY || ANDROID_MAPS_KEY),
  },
};

export default config;
