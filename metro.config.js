const { getDefaultConfig } = require('expo/metro-config');
const { withNativeThree } = require('./metro/withNativeThree');
const { withReleaseComposition } = require('./metro/withReleaseComposition');

// Resolve from this project, then give both app imports and R3F requires the
// same implementation. Keep Expo's resolver and web exports behavior intact.
module.exports = withReleaseComposition(withNativeThree(getDefaultConfig(__dirname), require.resolve('three')));
