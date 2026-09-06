#!/usr/bin/env node
'use strict';
/* global Buffer, __dirname */
// Original procedural sounds for CHROMA RIFT. Node standard library only.
// No recording, external samples, downloaded loops, or other game's material.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SAMPLE_RATE = 24000;
const SPECS = Object.freeze({
  footstep: { duration: 0.18, peak: 0.22, seed: 0x534f4c45 },
  interaction: { duration: 0.14, peak: 0.18, seed: 0x534c4f54 },
  mechanism: { duration: 0.68, peak: 0.26, seed: 0x4c415443 },
  ambience: { duration: 4, peak: 0.045, seed: 0x524f4f4d },
});
const TAU = Math.PI * 2;
function randomSequence(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000 * 2 - 1;
  };
}
function envelope(t, duration, attack) {
  if (t < 0 || t >= duration) return 0;
  return Math.min(1, t / attack) * Math.pow(1 - t / duration, 2);
}
function synthesize(name) {
  const spec = SPECS[name];
  if (!spec) throw new Error(`Unknown audio source: ${name}`);
  const samples = new Float64Array(Math.round(spec.duration * SAMPLE_RATE));
  const noise = randomSequence(spec.seed);
  let lowNoise = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const t = i / SAMPLE_RATE;
    lowNoise += 0.11 * (noise() - lowNoise);
    if (name === 'footstep') {
      samples[i] = envelope(t, spec.duration, 0.008) * (0.6 * lowNoise + 0.24 * Math.sin(TAU * 146 * t) * Math.exp(-30 * t) + 0.08 * Math.sin(TAU * 237 * t));
    } else if (name === 'interaction') {
      samples[i] = envelope(t, spec.duration, 0.005) * (0.28 * lowNoise + 0.16 * Math.sin(TAU * 480 * t) * Math.exp(-32 * t) + 0.1 * Math.sin(TAU * 725 * t) * Math.exp(-45 * t));
    } else if (name === 'mechanism') {
      const latch = (offset) => {
        const q = t - offset;
        return envelope(q, 0.2, 0.006) * (0.25 * Math.sin(TAU * 173 * q) + 0.13 * Math.sin(TAU * 281 * q) + 0.08 * Math.sin(TAU * 467 * q));
      };
      samples[i] = latch(0) + 0.75 * latch(0.31) + 0.22 * lowNoise * envelope(t, spec.duration, 0.035);
    } else {
      // Integer cycles in four seconds, including the slow modulation: a
      // periodic bed with continuous endpoints, not a repeated attack/beep.
      const bed = 0.45 * Math.sin(TAU * 48 * t) + 0.22 * Math.sin(TAU * 73.5 * t) + 0.15 * Math.sin(TAU * 98.25 * t) + 0.07 * Math.sin(TAU * 126 * t);
      samples[i] = bed * (0.78 + 0.22 * Math.cos(TAU * t / spec.duration));
    }
  }
  // Remove numerical/transient DC with a zero-at-edges weight, keeping attacks
  // and releases smooth. Ambience's periodic waveform already has zero DC.
  let total = 0; let weights = 0;
  for (let i = 0; i < samples.length; i += 1) { total += samples[i]; weights += Math.sin(Math.PI * i / (samples.length - 1)) ** 2; }
  if (name !== 'ambience') for (let i = 0; i < samples.length; i += 1) samples[i] -= total / weights * Math.sin(Math.PI * i / (samples.length - 1)) ** 2;
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  for (let i = 0; i < samples.length; i += 1) samples[i] = samples[i] / peak * spec.peak;
  return samples;
}
function encodeWav(samples) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i += 1) buffer.writeInt16LE(Math.round(samples[i] * 32767), 44 + i * 2);
  return buffer;
}
function inspectWav(buffer) {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE' || buffer.toString('ascii', 12, 16) !== 'fmt ' || buffer.toString('ascii', 36, 40) !== 'data') throw new Error('Invalid canonical WAV header');
  const format = buffer.readUInt16LE(20), channels = buffer.readUInt16LE(22), sampleRate = buffer.readUInt32LE(24), bits = buffer.readUInt16LE(34);
  if (format !== 1 || channels !== 1 || bits !== 16 || sampleRate !== SAMPLE_RATE || buffer.readUInt32LE(4) !== buffer.length - 8 || buffer.readUInt32LE(40) !== buffer.length - 44 || buffer.readUInt32LE(28) !== SAMPLE_RATE * 2 || buffer.readUInt16LE(32) !== 2 || buffer.length % 2 !== 0) throw new Error('Invalid PCM WAV format or length');
  const count = (buffer.length - 44) / 2;
  let peak = 0, sum = 0, squares = 0, clippedSamples = 0;
  for (let offset = 44; offset < buffer.length; offset += 2) {
    const sample = buffer.readInt16LE(offset);
    if (Math.abs(sample) >= 32767) clippedSamples += 1;
    const value = sample / 32768;
    peak = Math.max(peak, Math.abs(value)); sum += value; squares += value * value;
  }
  return {
    format: 'PCM16LE', channels, sampleRate, duration: count / sampleRate,
    peak, peakDbfs: 20 * Math.log10(peak), rms: Math.sqrt(squares / count), dc: sum / count,
    clippedSamples, loopBoundaryDelta: Math.abs(buffer.readInt16LE(44) - buffer.readInt16LE(buffer.length - 2)) / 32768,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}
function generateAssets(directory, checkOnly = false) {
  if (!checkOnly) fs.mkdirSync(directory, { recursive: true });
  const result = {};
  for (const name of Object.keys(SPECS)) {
    const generated = encodeWav(synthesize(name));
    const filename = path.join(directory, `${name}.wav`);
    if (checkOnly) {
      if (!fs.readFileSync(filename).equals(generated)) throw new Error(`${name}.wav differs from the reproducible generator`);
    } else fs.writeFileSync(filename, generated);
    const stats = inspectWav(generated);
    if (stats.clippedSamples || Math.abs(stats.dc) > 0.0001 || stats.peak > SPECS[name].peak + 1 / 32768 || stats.rms === 0) throw new Error(`${name}.wav failed audio asset validation`);
    if (name === 'ambience' && stats.loopBoundaryDelta > 0.005) throw new Error('Ambient loop has an excessive boundary discontinuity');
    result[name] = stats;
  }
  return result;
}
module.exports = { SAMPLE_RATE, SPECS, synthesize, encodeWav, inspectWav, generateAssets };
if (require.main === module) {
  const result = generateAssets(path.join(__dirname, '..', 'assets', 'audio'), process.argv.includes('--check'));
  console.log(JSON.stringify({ generatedBy: 'scripts/generate-audio.cjs (original synthesis)', listeningVerified: false, sources: result }, null, 2));
}
