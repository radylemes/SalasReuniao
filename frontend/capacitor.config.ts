import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.realarenas.salasreuniao',
  appName: 'Salas Reuniao Tablet',
  webDir: 'dist/frontend-app/browser',
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
    },
    StatusBar: {
      overlaysWebView: true,
    },
  },
};

export default config;
