export const environment = {
  production: true,
  // Emulador Android: use http://10.0.2.2:3000/api
  // Tablet físico na rede: use http://IP-DO-SEU-PC:3000/api (ex.: http://192.168.1.50:3000/api)
  apiBaseUrl: 'http://10.200.128.60:3000/api',
  kiosk: {
    localidade: 'Allianz',
    roomEmail: 'sala.fa@allianzparque.com.br',
    demoLocation: 'Andar 3, Ala Norte',
    demoTemperature: 22,
    demoTemperatureTarget: 22,
    /** Tempo sem interação antes do ticker em ecrã cheio (ms). */
    screensaverIdleMs: 120_000,
    /** PIN para abrir o menu de configuração oculto. */
    settingsPin: '124578',
    checkInModeEnabled: false,
    checkInGraceMinutes: 15,
  },
};
