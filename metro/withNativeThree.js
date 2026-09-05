/** Pin only the native bare import. Addons and renderer-specific exports keep
 * their original meaning and are deliberately delegated to Expo/Metro. */
function withNativeThree(config, canonicalThree) {
  const upstreamResolve = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === 'three' && (platform === 'ios' || platform === 'android')) {
      return { type: 'sourceFile', filePath: canonicalThree };
    }
    return upstreamResolve
      ? upstreamResolve(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  };
  return config;
}

module.exports = { withNativeThree };
