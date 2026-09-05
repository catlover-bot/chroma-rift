const { withNativeThree } = require('../../../metro/withNativeThree');
const { createRequire } = require('node:module');

describe('native Three resolver scope (actual Metro graph is checked separately)', () => {
  const canonical = createRequire(`${process.cwd()}/package.json`).resolve('three');
  const origins = ['src/rendering/firstPerson/ChapterScene.tsx', 'node_modules/@react-three/fiber/native/dist/react-three-fiber-native.cjs.dev.js'];

  it.each(['ios', 'android'])('unifies app/dependency import/require requests on %s', (platform) => {
    const fallback = jest.fn();
    const config = withNativeThree({ resolver: {} }, canonical);
    for (const originModulePath of origins) for (const isESMImport of [true, false]) {
      const context = Object.freeze({ originModulePath, isESMImport, resolveRequest: fallback });
      expect(config.resolver.resolveRequest(context, 'three', platform)).toEqual({ type: 'sourceFile', filePath: canonical });
    }
    expect(fallback).not.toHaveBeenCalled();
  });

  it('preserves upstream configuration and delegates all web/deep/unrelated requests unchanged', () => {
    const resolved = { type: 'sourceFile', filePath: '/upstream/result' };
    const upstream = jest.fn(() => resolved);
    const fallback = jest.fn();
    const transformer = { customOption: true };
    const extensions = ['js', 'ts'];
    const original = { transformer, resolver: { resolveRequest: upstream, sourceExts: extensions, unstable_enablePackageExports: true } };
    const config = withNativeThree(original, canonical);
    expect(config).toBe(original);
    expect(config.transformer).toBe(transformer);
    expect(config.resolver.sourceExts).toBe(extensions);
    expect(config.resolver.unstable_enablePackageExports).toBe(true);
    for (const platform of ['ios', 'android', 'web', undefined]) {
      for (const name of ['three', 'three/addons/controls/OrbitControls.js', 'three/src/math/Vector3.js', 'three/webgpu', 'three/tsl', 'react']) {
        if (name === 'three' && (platform === 'ios' || platform === 'android')) continue;
        const context = Object.freeze({ originModulePath: origins[0], isESMImport: true, resolveRequest: fallback });
        expect(config.resolver.resolveRequest(context, name, platform)).toBe(resolved);
        expect(upstream).toHaveBeenLastCalledWith(context, name, platform);
      }
    }
    expect(fallback).not.toHaveBeenCalled();
  });

  it('uses the Metro context resolver when there is no previous custom resolver', () => {
    const result = { type: 'sourceFile', filePath: '/web/three.module.js' };
    const fallback = jest.fn(() => result);
    const context = { originModulePath: origins[0], isESMImport: true, resolveRequest: fallback };
    const config = withNativeThree({ resolver: {} }, canonical);
    expect(config.resolver.resolveRequest(context, 'three', 'web')).toBe(result);
    expect(fallback).toHaveBeenCalledWith(context, 'three', 'web');
  });
});
