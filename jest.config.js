module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleDirectories: ['node_modules', 'node_modules/expo/node_modules'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/rendering/**'],
};
