const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The generated API hooks live in a workspace package whose pnpm-installed
// react-query may otherwise resolve against the web app's React peer. Always
// resolve these singletons from this app so hooks and providers share one copy.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (/^(react|react-dom|@tanstack\/react-query)(\/|$)/.test(moduleName)) {
    return context.resolveRequest(
      { ...context, originModulePath: __filename },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
