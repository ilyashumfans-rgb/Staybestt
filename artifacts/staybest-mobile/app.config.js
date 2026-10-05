const base = require('./app.json');

module.exports = () => {
  // Public client configuration verified against the published website.
  // Clerk custom-domain publishable keys encode the public frontend API host.
  // This is not a secret key and is safe to ship in the mobile application.
  const productionKey = `pk_live_${Buffer.from('clerk.www.staybestt.com$').toString('base64')}`;
  // EAS does not inherit the Replit dev workflow's environment aliases.
  const key = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    process.env.CLERK_PUBLISHABLE_KEY ||
    (process.env.EAS_BUILD_PROFILE === 'production' ? productionKey : undefined);
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const validKey = typeof key === 'string' && /^pk_(test|live)_[A-Za-z0-9+/=]+$/.test(key);
  if (process.env.EAS_BUILD === 'true') {
    if (!validKey) {
      throw new Error('Android/iOS build stopped: set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in the selected EAS environment before building. Replit Secrets are not automatically copied to EAS.');
    }
    if (process.env.EAS_BUILD_PROFILE === 'production' && !key.startsWith('pk_live_')) {
      throw new Error('Production builds require the production Clerk publishable key (pk_live_), not a development key.');
    }
    if (!domain || !/^[a-z0-9.-]+$/i.test(domain)) {
      throw new Error('Set EXPO_PUBLIC_DOMAIN to the API hostname before building.');
    }
  }
  return {
    ...base.expo,
    extra: {
      ...base.expo.extra,
      // Publishable keys are public client configuration, never secret keys.
      clerkPublishableKey: validKey ? key : undefined,
    },
  };
};
