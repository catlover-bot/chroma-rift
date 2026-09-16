'use strict';
// Node-only App-host QA: native Constants metadata is unavailable.
// Returning an empty object preserves the application's unknown/fallback values.
// No device identity, game state, renderer behavior or command is fabricated.
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'expo-constants') return {};
  return originalLoad.call(this, request, ...args);
};
