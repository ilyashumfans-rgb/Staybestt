const assert = require('node:assert/strict');
const test = require('node:test');
const { validateReleaseConfig } = require('./validate-release-config.cjs');
const app = require('../app.json').expo;
const profile = require('../eas.json').build.production;
test('static Android release includes production authentication and working proxy wiring', () => {
  assert.doesNotThrow(() => validateReleaseConfig(app, profile));
  assert.equal(app.android.package, 'com.replit.staybest');
  assert.ok(app.android.versionCode >= 4);
  assert.equal(Buffer.from(app.extra.clerkPublishableKey.slice(8), 'base64').toString(), 'clerk.www.staybestt.com$');
});
test('release rejects missing keys, development keys and direct auth host configuration', () => {
  assert.throws(() => validateReleaseConfig({ ...app, extra: {} }, profile), /production Clerk/);
  assert.throws(() => validateReleaseConfig(app, profile, { EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_Zml4dHVyZSQ=' }), /production Clerk/);
  assert.throws(() => validateReleaseConfig(app, profile, { EXPO_PUBLIC_CLERK_PROXY_URL: 'https://clerk.www.staybestt.com' }), /proxy/);
  assert.throws(() => validateReleaseConfig(app, profile, { EXPO_PUBLIC_DOMAIN: 'https://wrong.example' }), /hostname/);
});
