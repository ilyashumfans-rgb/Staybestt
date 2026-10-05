const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app.config.js'), 'utf8');
function config(env) {
  const context = {
    module: { exports: {} },
    Buffer,
    require: () => ({ expo: { extra: { eas: { projectId: 'fixture' } } } }),
    process: { env },
  };
  vm.runInNewContext(source, context);
  return context.module.exports();
}
test('EAS fails instead of shipping a missing key', () => {
  assert.throws(() => config({ EAS_BUILD: 'true' }), /PUBLISHABLE/);
});
test('production rejects development authentication', () => {
  assert.throws(() => config({
    EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'production',
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_Zml4dHVyZSQ=',
  }), /production Clerk/);
});
test('EAS rejects malformed API host', () => {
  assert.throws(() => config({
    EAS_BUILD: 'true', EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_Zml4dHVyZSQ=',
    EXPO_PUBLIC_DOMAIN: 'https://example.com',
  }), /hostname/);
});
test('public configuration survives in the app manifest and preserves project metadata', () => {
  const result = config({
    EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'production',
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_Zml4dHVyZSQ=',
    EXPO_PUBLIC_DOMAIN: 'example.com',
  });
  assert.equal(result.extra.clerkPublishableKey, 'pk_live_Zml4dHVyZSQ=');
  assert.equal(result.extra.eas.projectId, 'fixture');
});
test('workspace public-key alias works without exposing a secret key', () => {
  const result = config({ CLERK_PUBLISHABLE_KEY: 'pk_test_Zml4dHVyZSQ=', CLERK_SECRET_KEY: 'never-copy' });
  assert.equal(result.extra.clerkPublishableKey, 'pk_test_Zml4dHVyZSQ=');
  assert.ok(!JSON.stringify(result).includes('never-copy'));
});
test('production EAS uses verified public website configuration when no key alias exists', () => {
  const result = config({
    EAS_BUILD: 'true', EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_DOMAIN: 'www.staybestt.com',
  });
  assert.equal(Buffer.from(result.extra.clerkPublishableKey.slice(8), 'base64').toString(), 'clerk.www.staybestt.com$');
});
