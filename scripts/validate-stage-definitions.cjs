#!/usr/bin/env node
'use strict';
/* global __dirname */
const path=require('node:path');
const {spawnSync}=require('node:child_process');
if(process.argv.includes('--help')){
  process.stdout.write('Usage: node scripts/validate-stage-definitions.cjs\nRuns the app definition validator through the installed Jest TypeScript pipeline.\n');
  process.exit(0);
}
if(process.argv.length>2){process.stderr.write('Unknown option. Use --help.\n');process.exit(2);}
const root=path.resolve(__dirname,'..');
const jest=path.join(root,'node_modules','jest','bin','jest.js');
const result=spawnSync(process.execPath,[jest,'--runInBand','--runTestsByPath','src/domain/stageKit/__tests__/validateDefinitions.test.ts'],{cwd:root,stdio:'inherit'});
process.exit(result.status??1);
