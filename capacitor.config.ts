import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.apexvelocity.app',
  appName: 'Apex Velocity',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
