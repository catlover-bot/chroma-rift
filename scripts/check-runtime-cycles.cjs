#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { scanProject, formatSummary } = require('./lib/runtime-dependency-graph.cjs');
function main() {
  const args = process.argv.slice(2), options = {}; let output;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) options.root = args[++i];
    else if (args[i] === '--report' && args[i + 1]) output = args[++i];
    else if (args[i] === '--platforms' && args[i + 1]) options.platforms = args[++i].split(',');
    else throw new Error('Usage: node scripts/check-runtime-cycles.cjs [--root project] [--report file.json] [--platforms ios,android,neutral]');
  }
  const report = scanProject(options);
  if (output) { const file = path.resolve(output); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n'); }
  console.log(formatSummary(report));
  process.exitCode = report.ok ? 0 : 1;
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 2; }
