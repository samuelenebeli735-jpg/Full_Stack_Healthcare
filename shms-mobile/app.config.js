/**
 * Extends app.json. Plain HTTP (cleartext) is allowed only when the build
 * sets SHMS_ALLOW_CLEARTEXT=1 — the "test-apk" EAS profile does, so that test
 * APK can reach the SHMS API on the local network over http://. Other builds
 * keep Android's default (HTTPS only).
 */
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    [
      'expo-build-properties',
      { android: { usesCleartextTraffic: process.env.SHMS_ALLOW_CLEARTEXT === '1' } },
    ],
  ],
});
