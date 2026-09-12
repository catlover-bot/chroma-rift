/* global __dirname */
const path = require('node:path');

const DEV_SCREENS = new Set([
  'DeveloperLabScreen', 'IllusionMazeScreen', 'JourneyResultScreen',
  'MicroMazeScreen', 'StageSelectScreen', 'FirstPersonResultScreen',
]);
const emptyModule = path.resolve(__dirname, 'releaseDevStubs.js');

/** Production Metro must not traverse the legacy/probe source graph. Runtime
 * routes are also guarded by __DEV__; this protects the packaged code itself. */
function withReleaseComposition(config) {
  const upstreamResolve = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (!context.dev && (platform === 'ios' || platform === 'android') && (
      DEV_SCREENS.has(path.basename(moduleName)) && moduleName.includes('screens/') ||
      /stage-kit-probe\/(binding|scene)$/.test(moduleName)
    )) return { type: 'sourceFile', filePath: emptyModule };
    return upstreamResolve
      ? upstreamResolve(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  };
  return config;
}

module.exports = { withReleaseComposition };
