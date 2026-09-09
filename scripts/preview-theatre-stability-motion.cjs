#!/usr/bin/env node
'use strict';
/* global __dirname */
// Goal010.1 uses the existing real Screen/controller/Scene capture runner.
// Full raw frames stay in ignored .expo; package only compact reviewed evidence.
const path=require('node:path');
const scenario=process.argv.find(a=>a.startsWith('--scenario='))?.slice(11)||'light';
if(!['light','maintenance','projector','projector-control'].includes(scenario))throw Error('Unsupported Goal010.1 scenario');
if(!process.argv.some(a=>a.startsWith('--out=')))process.argv.push('--out='+path.resolve(__dirname,'../.expo/goal010-1/motion-'+scenario));
if(!process.argv.some(a=>a.startsWith('--commit-label=')))process.argv.push('--commit-label=灯りを固定して扉を開く');
if(!process.argv.some(a=>a.startsWith('--solved-leave-label=')))process.argv.push('--solved-leave-label=観察を終える');
require('./preview-theatre-motion.cjs');
