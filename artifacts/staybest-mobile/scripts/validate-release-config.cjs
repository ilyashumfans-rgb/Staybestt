const config = require('../app.json').expo;
const profiles = require('../eas.json').build;

function validateReleaseConfig(app, profile, env = {}) {
  const key = env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || app.extra?.clerkPublishableKey;
  const domain = env.EXPO_PUBLIC_DOMAIN || profile?.env?.EXPO_PUBLIC_DOMAIN;
  const proxy = env.EXPO_PUBLIC_CLERK_PROXY_URL || app.extra?.clerkProxyUrl;
  if (typeof key !== 'string' || !/^pk_live_[A-Za-z0-9+/=]+$/.test(key)) throw new Error('Release requires production Clerk client configuration.');
  if (!domain || !/^[a-z0-9.-]+$/i.test(domain)) throw new Error('Release requires a valid API hostname.');
  if (proxy !== `https://${domain}/api/__clerk`) throw new Error('Release sign-in must use the API Clerk proxy.');
  if (!app.android?.package || !Number.isInteger(app.android.versionCode)) throw new Error('Release requires the Android package and version code.');
}
module.exports = { validateReleaseConfig };
if (require.main === module) {
  if (process.env.EAS_BUILD_PROFILE === 'production') {
    validateReleaseConfig(config, profiles.production, process.env);
    console.log('Production API and sign-in proxy configuration validated.');
  }
}
