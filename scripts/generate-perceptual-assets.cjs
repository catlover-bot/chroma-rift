#!/usr/bin/env node
'use strict';
/* global __dirname, Buffer */
/** Offline, deterministic conversion. No network, runtime addons, or dependencies
 * beyond the installed canonical Three and Node standard library. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const THREE = require('three');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'assets/perceptual');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (name, data) => fs.writeFileSync(path.join(out, name), JSON.stringify(data) + '\n');
fs.mkdirSync(out, { recursive: true });
const original = fs.readFileSync(path.join(out, 'source/hollow-face-original.stl'));
if (sha(original) !== '3ab98617f246ff0b3616cec9656aecdcd670ce43e8c96d66a7e1acaa8a8a5a75') throw new Error('Original STL differs from the inspected source');
const count = original.readUInt32LE(80);
if (original.length !== 84 + count * 50) throw new Error('Invalid binary STL length');
const unique = [], indices = [], lookup = new Map(), sourceNormals = [];
for (let triangle = 0; triangle < count; triangle++) {
  const offset = 84 + triangle * 50;
  sourceNormals.push([0, 4, 8].map(i => original.readFloatLE(offset + i)));
  for (let vertex = 0; vertex < 3; vertex++) {
    const p = [0, 4, 8].map(i => original.readFloatLE(offset + 12 + vertex * 12 + i));
    if (!p.every(Number.isFinite)) throw new Error('Nonfinite STL vertex');
    const key = p.join(',');
    if (!lookup.has(key)) { lookup.set(key, unique.length); unique.push(p); }
    indices.push(lookup.get(key));
  }
}
const rotate = ([x, y, z]) => [(x - y) / Math.SQRT2, z, -(x + y) / Math.SQRT2];
const rotated = unique.map(rotate), bounds = vertices => ({ min: [0, 1, 2].map(i => Math.min(...vertices.map(p => p[i]))), max: [0, 1, 2].map(i => Math.max(...vertices.map(p => p[i]))) });
const rawBounds = bounds(unique), rotatedBounds = bounds(rotated), height = rotatedBounds.max[1] - rotatedBounds.min[1], middleY = (rotatedBounds.max[1] + rotatedBounds.min[1]) / 2;
const positions = rotated.map(([x, y, z]) => [x / height, (y - middleY) / height, (z - rotatedBounds.max[2]) / height].map(v => Number(v.toFixed(7))));
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.flat(), 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
const normals = [...geometry.getAttribute('normal').array].map(n => Number(n.toFixed(7)));
let degenerate = 0, inconsistentSourceNormals = 0;
for (let i = 0; i < count; i++) {
  const [a, b, c] = indices.slice(i * 3, i * 3 + 3).map(j => new THREE.Vector3(...positions[j]));
  const normal = b.sub(a).cross(c.sub(a));
  if (normal.lengthSq() < 1e-15) degenerate++;
  if (normal.dot(new THREE.Vector3(...rotate(sourceNormals[i]))) < 0) inconsistentSourceNormals++;
}
if (degenerate || inconsistentSourceNormals) throw new Error('STL normal/area validation failed');
const noseIndex = positions.reduce((best, p, i) => Math.abs(p[0]) < .025 && p[2] < positions[best][2] ? i : best, positions.findIndex(p => Math.abs(p[0]) < .025));
const model = { id: 'wael-tsar-hollow-face-normalized-v1', sourceSHA256: sha(original), coordinateConvention: '+X right, +Y up, +Z toward viewer; rim front z=0, nose recessed z<0', positions: positions.flat(), normals, indices };
json('hollow-mask.json', model);
geometry.dispose();

const width = 512, heightPx = 512, seed = 80873;
const low = new Float64Array(width * heightPx), high = new Float64Array(width * heightPx);
const ellipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const line = (x, y, x1, y1, x2, y2, w) => {
  const dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - x1 - t * dx, y - y1 - t * dy) <= w / 2;
};
const glyphs = { C: ['01110','10001','10000','10000','10000','10001','01110'], L:['10000','10000','10000','10000','10000','10000','11111'], O:['01110','10001','10001','10001','10001','10001','01110'], S:['01111','10000','10000','01110','00001','00001','11110'], E:['11111','10000','10000','11110','10000','10000','11111'], D:['11110','10001','10001','10001','10001','10001','11110'] };
const strokes = [];
// Original shelves and outlined dot-letter CLOSED notices. No external image/font.
for (let y = 30; y < 500; y += 42) {
  strokes.push([20,y,492,y,1.4]);
  for (let x = 26; x < 492; x += 24) {
    const offset = ((x * 13 + y * 7 + seed) % 13);
    strokes.push([x,y-23-offset/3,x,y-3,1.25],[x+3,y-23-offset/3,x+17,y-23-offset/3,1.25]);
  }
}
for (const baseY of [176, 284]) for (let ch = 0; ch < 6; ch++) {
  const bitmap = glyphs['CLOSED'[ch]];
  for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) if (bitmap[gy][gx] === '1') {
    const x = 45 + ch * 70 + gx * 10, y = baseY + gy * 10;
    strokes.push([x,y,x+7,y,1.8],[x,y+7,x+7,y+7,1.8],[x,y,x,y+7,1.8],[x+7,y,x+7,y+7,1.8]);
  }
}
for (let py = 0; py < heightPx; py++) for (let px = 0; px < width; px++) {
  const x = (px + .5) / width, y = (py + .5) / heightPx, index = py * width + px;
  let value = .22;
  if (ellipse(x,y,.5,.47,.285,.395)) value = .84;
  if (ellipse(x,y,.393,.415,.055,.035) || ellipse(x,y,.607,.415,.055,.035)) value = .1;
  if (ellipse(x,y,.5,.7,.115,.018)) value = .14;
  if (line(x,y,.5,.44,.478,.59,.025) || line(x,y,.478,.59,.535,.6,.022)) value = .34;
  if (y > .84 && Math.abs(x - .5) < .095) value = .66;
  low[index] = value;
  high[index] = strokes.some(s => line(px+.5,py+.5,...s)) ? .06 : .94;
}
function gaussian(input, sigma) {
  const radius = Math.ceil(3 * sigma), kernel = [];
  for (let i = -radius; i <= radius; i++) kernel.push(Math.exp(-i*i/(2*sigma*sigma)));
  const sum = kernel.reduce((a,b)=>a+b,0); kernel.forEach((v,i)=>{kernel[i]=v/sum;});
  const temp = new Float64Array(input.length), output = new Float64Array(input.length);
  for(let y=0;y<heightPx;y++) for(let x=0;x<width;x++) for(let k=-radius;k<=radius;k++) temp[y*width+x]+=input[y*width+Math.max(0,Math.min(width-1,x+k))]*kernel[k+radius];
  for(let y=0;y<heightPx;y++) for(let x=0;x<width;x++) for(let k=-radius;k<=radius;k++) output[y*width+x]+=temp[Math.max(0,Math.min(heightPx-1,y+k))*width+x]*kernel[k+radius];
  return output;
}
const sigmaLow = 12, sigmaHigh = 2.25, base = .46, a = .2, b = .28;
const lp = gaussian(low,sigmaLow), smoothHigh = gaussian(high,sigmaHigh), hp = high.map((v,i)=>v-smoothHigh[i]);
function normalize(input) { const mean=input.reduce((sum,n)=>sum+n,0)/input.length;let peak=0;for(const n of input)peak=Math.max(peak,Math.abs(n-mean));return { values:input.map(n=>(n-mean)/peak),mean,peak }; }
const ln=normalize(lp),hn=normalize(hp), composite=lp.map((_,i)=>base+a*ln.values[i]+b*hn.values[i]);
let clipped=0, minimum=Infinity,maximum=-Infinity;for(const v of composite){minimum=Math.min(minimum,v);maximum=Math.max(maximum,v);if(v<0||v>1)clipped++;}
const linearToSRGB = v => v <= .0031308 ? 12.92*v : 1.055*v**(1/2.4)-.055;
const bytes = values => Uint8Array.from(values,v=>Math.round(255*linearToSRGB(Math.max(0,Math.min(1,v)))));
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type,data){const tag=Buffer.from(type),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);let crc=0xffffffff;for(const n of Buffer.concat([tag,data]))crc=crcTable[(crc^n)&255]^(crc>>>8);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([head,tag,data,tail]);}
function png(name,values){const gray=bytes(values),scan=Buffer.alloc(heightPx*(1+width));for(let y=0;y<heightPx;y++)Buffer.from(gray.subarray(y*width,(y+1)*width)).copy(scan,y*(width+1)+1);const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(heightPx,4);ihdr[8]=8;ihdr[9]=0;const data=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('sRGB',Buffer.from([0])),chunk('IDAT',zlib.deflateSync(scan,{level:9})),chunk('IEND',Buffer.alloc(0))]);fs.writeFileSync(path.join(out,name),data);return gray;}
png('hybrid-source-low.png',low);png('hybrid-source-high.png',high);png('hybrid-low-pass.png',lp);png('hybrid-high-pass.png',hn.values.map(n=>.5+.45*n));const gray=png('hybrid-composite.png',composite);
json('hybrid-texture.json',{id:'original-closed-shelves-hybrid-v1',width,height:heightPx,format:'grayscale-sRGB8-top-row-first',pixelsBase64:Buffer.from(gray).toString('base64')});
const ledger={schema:1,mask:{sourcePage:'https://commons.wikimedia.org/wiki/File:Hollow_face_illusion.stl',sourceURL:'https://upload.wikimedia.org/wikipedia/commons/d/db/Hollow_face_illusion.stl',sourcePageRevision:881101748,title:'Hollow face illusion.stl',author:'Wael Tsar',previousChanges:'cmglee: recentred, symmetrised, converted to STL; 15 March 2022 rotated 135 degrees for hollow-side thumbnail',license:'CC BY 4.0',licenseURL:'https://creativecommons.org/licenses/by/4.0/',originalSHA256:sha(original),originalBytes:original.length,triangles:count,vertices:unique.length,rawBounds,rotatedBounds,rotationRows:[[Math.SQRT1_2,-Math.SQRT1_2,0],[0,0,1],[-Math.SQRT1_2,-Math.SQRT1_2,0]],rotationDeterminant:1,uniformScale:1/height,translationAfterRotation:[0,-middleY,-rotatedBounds.max[2]],changes:'Proper-axis rotation, uniform positive scale to 1 metre height, translation to centered Y and rim z=0, exact-vertex weld/indexing, area-weighted smooth vertex normals. Source is already hollow: no depth inversion in shipped mask; no negative runtime scale/backside rendering.',normalizedBounds:bounds(positions),nose:{vertexIndex:noseIndex,position:positions[noseIndex],normal:normals.slice(noseIndex*3,noseIndex*3+3)},degenerateTriangles:degenerate,inconsistentSourceNormals,normalPolicy:'Same winding as source after determinant +1 rotation; canonical Three computeVertexNormals; FrontSide material',fallbackUsed:false},hybrid:{author:'CHROMA RIFT project / original procedural artwork',thirdPartyImages:false,formula:'H = base + a * normalize(Gaussian(imageLow,sigmaLow)) + b * normalize(imageHigh-Gaussian(imageHigh,sigmaHigh))',normalization:'subtract mean, divide by maximum absolute deviation independently for LP/HP',seed,width,height:heightPx,sourceSpace:'linear-light grayscale, authored numerical luminance',outputSpace:'IEC sRGB transfer, opaque grayscale8, explicit sRGB PNG metadata',gaussian:{sigmaLow,sigmaHigh,radius:'ceil(3*sigma)',edge:'clamp',implementation:'separable normalized Gaussian convolution'},base,a,b,lowNormalization:{mean:ln.mean,peak:ln.peak},highNormalization:{mean:hn.mean,peak:hn.peak},minimumLinear:minimum,maximumLinear:maximum,clippedPixels:clipped,clippingRate:clipped/composite.length,filters:{runtimeMinification:'LinearMipmapLinearFilter',runtimeMagnification:'LinearFilter',generateMipmaps:true},runtimeRGBABytes:width*heightPx*4,runtimeRGBAWithMipmapsBytes:1398100},files:{}};
for(const name of ['source/hollow-face-original.stl','hollow-mask.json','hybrid-source-low.png','hybrid-source-high.png','hybrid-low-pass.png','hybrid-high-pass.png','hybrid-composite.png','hybrid-texture.json'])ledger.files[name]={bytes:fs.statSync(path.join(out,name)).size,sha256:sha(fs.readFileSync(path.join(out,name)))};
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify({mask:ledger.mask.normalizedBounds,nose:ledger.mask.nose,triangles:count,clippingRate:ledger.hybrid.clippingRate,files:ledger.files},null,2));
