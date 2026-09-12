#!/usr/bin/env node
'use strict';
/* global __dirname, Buffer */
const fs = require('node:fs');
const path = require('node:path');
const { openBrowser, sha256 } = require('./lib/three-scene-qa.cjs');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'assets', 'branding');
fs.mkdirSync(output, { recursive: true });

// A geometric door and split chromatic contour, drawn as vectors so both
// native raster assets can be regenerated at exactly 1024 pixels.
const mark = `<g fill="none" stroke-linecap="round" stroke-linejoin="round">
  <path d="M491 222 C351 231 267 331 267 512 C267 688 365 790 490 801" stroke="#5DC6D6" stroke-width="60"/>
  <path d="M533 222 C673 231 757 331 757 512 C757 688 659 790 534 801" stroke="#E88988" stroke-width="60"/>
  <path d="M512 299 L512 720" stroke="#ECEAE7" stroke-width="30"/>
  <path d="M430 707 L512 763 L594 707" stroke="#ECEAE7" stroke-width="27"/>
  <path d="M407 514 L454 514 M570 514 L617 514" stroke="#ECEAE7" stroke-width="21"/>
</g>`;
const svg = opaque => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${opaque ? '<rect width="1024" height="1024" fill="#09090C"/>' : ''}${mark}</svg>`;

async function main() {
  const temp = fs.mkdtempSync(path.join(output, '.brand-render-'));
  fs.writeFileSync(path.join(temp, 'index.html'), '<!doctype html><meta charset="utf-8">');
  const browser = await openBrowser(temp);
  try {
    for (const [name, opaque] of [['icon.png', true], ['splash-icon.png', false]]) {
      const payload = await browser.evaluate(`(async () => {
        const svg = ${JSON.stringify(svg(opaque))};
        const image = new Image();
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1024;
        canvas.getContext('2d').drawImage(image, 0, 0);
        return canvas.toDataURL('image/png').split(',')[1];
      })()`);
      const file = path.join(output, name);
      fs.writeFileSync(file, Buffer.from(payload, 'base64'));
      console.log(`${name} ${sha256(fs.readFileSync(file))}`);
    }
    if (browser.errors.length) throw new Error(`Brand render errors: ${JSON.stringify(browser.errors)}`);
  } finally {
    await browser.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
