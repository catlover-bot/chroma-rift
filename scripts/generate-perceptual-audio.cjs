#!/usr/bin/env node
'use strict';
/* global __dirname */
// Original deterministic synthesis; no downloaded recordings or runtime oscillator.
const fs = require('node:fs');
const path = require('node:path');
const { SAMPLE_RATE, encodeWav, inspectWav } = require('./generate-audio.cjs');
const TAU = 2 * Math.PI;
const SPECS = Object.freeze({
  cloth: { duration: .42, peak: .13, seed: 0x434c4f54 },
  'door-impact': { duration: .5, peak: .2, seed: 0x444f4f52 },
  shepard: { duration: 12, peak: .16, rms: .065, seed: 0, baseHz: 27.5, octaves: 8, centerHz: 440, sigmaOctaves: 1.05, edgeFadeSeconds: .08 },
});
function synthesize(name) {
  const spec = SPECS[name];
  if (!spec) throw new Error('Unknown source: ' + name);
  const result = new Float64Array(Math.round(SAMPLE_RATE * spec.duration));
  let seed = spec.seed >>> 0, smooth = 0, slow = 0;
  for (let i = 0; i < result.length; i++) {
    const t = i / SAMPLE_RATE;
    if (name === 'shepard') {
      // An octave ascent over 12 s. Fixed Gaussian spectral envelope lets high
      // voices fade out while lower voices enter; no increasing volume control.
      const pitch = 2 ** (t / spec.duration);
      let signal = 0, energy = 0;
      for (let octave = 0; octave < spec.octaves; octave++) {
        const initial = spec.baseHz * 2 ** octave, frequency = initial * pitch;
        const logDistance = Math.log2(frequency / spec.centerHz);
        const amplitude = Math.exp(-.5 * (logDistance / spec.sigmaOctaves) ** 2);
        const phase = TAU * initial * spec.duration / Math.LN2 * (pitch - 1);
        signal += amplitude * Math.sin(phase);
        energy += amplitude * amplitude;
      }
      const fade = Math.sin(Math.min(1, t / spec.edgeFadeSeconds, (spec.duration - t) / spec.edgeFadeSeconds) * Math.PI / 2) ** 2;
      result[i] = signal / Math.sqrt(energy) * fade;
    } else {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      const noise = (seed >>> 0) / 0x100000000 * 2 - 1;
      smooth += .24 * (noise - smooth); slow += .045 * (noise - slow);
      const attack = Math.min(1, t / .015), release = Math.sin(Math.PI * t / spec.duration) ** 2;
      result[i] = name === 'cloth'
        ? (smooth - slow) * attack * release * (.7 + .3 * Math.cos(TAU * 11 * t))
        : attack * Math.exp(-7 * t) * release * (Math.sin(TAU * 66 * t) + .3 * Math.sin(TAU * 111 * t) + .14 * slow);
    }
  }
  // Edge-zero DC removal and one fixed normalization, shared by every use.
  let total = 0, weights = 0;
  for (let i = 0; i < result.length; i++) { total += result[i]; weights += Math.sin(Math.PI * i / (result.length - 1)) ** 2; }
  let peak = 0;
  for (let i = 0; i < result.length; i++) {
    result[i] -= total / weights * Math.sin(Math.PI * i / (result.length - 1)) ** 2;
    peak = Math.max(peak, Math.abs(result[i]));
  }
  let squares = 0;
  for (const value of result) squares += value * value;
  const gain = Math.min(spec.peak / peak, spec.rms ? spec.rms / Math.sqrt(squares / result.length) : Infinity);
  for (let i = 0; i < result.length; i++) result[i] *= gain;
  return result;
}
function inspectDetailed(buffer) {
  const stats = inspectWav(buffer), count = (buffer.length - 44) / 2;
  let maxAdjacentDelta = 0, previous = 0;
  const rmsWindows = [];
  for (let begin = 0; begin < count; begin += SAMPLE_RATE) {
    let sum = 0;
    const end = Math.min(count, begin + SAMPLE_RATE);
    for (let i = begin; i < end; i++) {
      const sample = buffer.readInt16LE(44 + 2 * i) / 32768;
      maxAdjacentDelta = Math.max(maxAdjacentDelta, Math.abs(sample - previous)); previous = sample;
      sum += sample * sample;
    }
    rmsWindows.push(Math.sqrt(sum / (end - begin)));
  }
  return { ...stats, maxAdjacentDelta, rmsWindows };
}
function generateAssets(directory, check = false) {
  if (!check) fs.mkdirSync(directory, { recursive: true });
  const sources = {};
  for (const name of Object.keys(SPECS)) {
    const data = encodeWav(synthesize(name));
    const filename = path.join(directory, name + '.wav');
    if (check) { if (!fs.readFileSync(filename).equals(data)) throw new Error(name + ': reproducibility failure'); }
    else fs.writeFileSync(filename, data);
    const stats = inspectDetailed(data);
    if (stats.clippedSamples || Math.abs(stats.dc) > .0001 || stats.loopBoundaryDelta > .001 || stats.maxAdjacentDelta > .12 || stats.peak > SPECS[name].peak + 1/32768) throw new Error(name + ': acoustic bounds failure');
    if (name === 'shepard' && (Math.max(...stats.rmsWindows) > .08 || Math.max(...stats.rmsWindows) / Math.min(...stats.rmsWindows) > 1.2)) throw new Error('Shepard RMS drift');
    sources[name] = stats;
  }
  return { generatedBy: 'scripts/generate-perceptual-audio.cjs (original synthesis)', listeningVerified: false, parameters: SPECS,
    colorSpace: 'not applicable: mono linear PCM16', playback: '12-second finite optional cue; WAV edges are smoothed for looping but runtime does not force a loop', sources };
}
module.exports = { SPECS, synthesize, inspectDetailed, generateAssets };
if (require.main === module) {
  const directory = path.join(__dirname, '..', 'assets/audio');
  const check = process.argv.includes('--check'), report = generateAssets(directory, check);
  if (!check) fs.writeFileSync(path.join(directory, 'perceptual-analysis.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
