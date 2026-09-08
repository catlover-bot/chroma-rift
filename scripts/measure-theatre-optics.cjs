#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
const fs = require('node:fs'), path = require('node:path');
const { installSourceBridge, openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');
const root = path.resolve(__dirname, '..'), directory = path.join(root, '.expo/goal010/optics');
fs.mkdirSync(directory, { recursive: true });
const bridge = installSourceBridge(root), THREE = require('three');
const L = require('../src/domain/theatre/lightGate.ts'), P = require('../src/domain/theatre/projection.ts');
const A = require('../src/domain/theatre/perspectiveExhibit.ts');
const vector = p => new THREE.Vector3(p.x, p.y, p.z);
const round = x => Number(x.toFixed(8));
function rayCoverage(source, window, nx = 65, ny = 49) {
  // Independent Three ray/triangle visibility test. It never calls the
  // application's projected polygons, area clipper, or point projector.
  const triangles = L.COAT_TRIANGLES.map(t => t.map(vector)), origin = vector(source), destination = new THREE.Vector3(), direction = new THREE.Vector3(), hit = new THREE.Vector3(), ray = new THREE.Ray();
  let blocked = 0;
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    destination.set(window.minX + (x + .5) / nx * (window.maxX - window.minX), window.minY + (y + .5) / ny * (window.maxY - window.minY), L.LIGHT_RECEIVER.point.z);
    const distance2 = origin.distanceToSquared(destination); ray.set(origin, direction.subVectors(destination, origin).normalize());
    if (triangles.some(t => ray.intersectTriangle(t[0], t[1], t[2], false, hit) && origin.distanceToSquared(hit) < distance2 - 1e-8)) blocked++;
  }
  return blocked / (nx * ny);
}
function measure() {
  const intervals = [], samples = [], oracle = [];
  let start, maxVertices = 0, invalidRailSamples = 0, maxOracleDifference = 0;
  for (let index = 0; index <= 2000; index++) {
    const rail = -1 + index / 1000, model = L.evaluateLight(rail);
    if (!model.valid) invalidRailSamples++;
    maxVertices = Math.max(maxVertices, model.polygons.reduce((sum, p) => sum + Math.max(0, p.length - 2) * 3, 0));
    if (model.canLock && start === undefined) start = rail;
    if ((!model.canLock || index === 2000) && start !== undefined) { intervals.push([round(start), round(model.canLock ? rail : rail - .001)]); start = undefined; }
    if (index % 10 === 0) samples.push([round(rail), ...model.windows.map(w => round(w.coverage))]);
    if (index % 50 === 0) {
      const independent = L.LIGHT_WINDOWS.map(w => rayCoverage(model.source, w));
      const error = Math.max(...independent.map((value, i) => Math.abs(value - model.windows[i].coverage)));
      maxOracleDifference = Math.max(maxOracleDifference, error);
      oracle.push({ rail: round(rail), analytic: model.windows.map(w => round(w.coverage)), raySample: independent.map(round), difference: round(error) });
    }
  }
  const invalid = [NaN, Infinity, -Infinity, -1.01, 1.01].map(value => ({ rail: String(value), rejected: !L.evaluateLight(value).valid && !L.evaluateLight(value).canLock }));
  const singular = [{ x: 0, y: 1.1, z: 2 }, { x: 0, y: 1.1, z: 4 }, { x: 0, y: 1.1, z: 6 }].map(source => ({ source, rejected: !P.projectSilhouette(source, L.COAT_TRIANGLES, L.LIGHT_RECEIVER, L.LIGHT_WINDOWS).canLock }));
  const eye = vector(A.AMES_SPEC.referenceEye), maxRayError = Math.max(...A.AMES_VERTICES.map((v, i) => vector(v).sub(eye).normalize().distanceTo(vector(A.AMES_REFERENCE_VERTICES[i]).sub(eye).normalize())));
  let maxPlaneError = 0; const edgeCounts = new Map();
  for (const face of A.AMES_FACES) {
    const points = face.indices.map(i => vector(A.AMES_VERTICES[i])), normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
    maxPlaneError = Math.max(maxPlaneError, ...points.map(p => Math.abs(normal.dot(p.clone().sub(points[0])))));
    for (let i = 0; i < face.indices.length; i++) { const edge = [face.indices[i], face.indices[(i + 1) % face.indices.length]].sort().join('-'); edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1); }
  }
  const amesViews = Object.entries(A.AMES_OBSERVATION_POINTS).flatMap(([name, pose]) => [[320, 568], [390, 844], [430, 932]].map(([width, height]) => {
    const camera = new THREE.PerspectiveCamera(65, width / height, .08, 60); camera.position.copy(vector(pose.position)); camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
    const props = A.AMES_PROPS.map(prop => {
      const lo = vector(prop.position).project(camera), hi = vector(prop.position).add(new THREE.Vector3(0, prop.size.y, 0)).project(camera);
      return { id: prop.id, position: prop.position, scale: prop.scale, size: prop.size, projectedHeightPx: round(Math.abs(hi.y - lo.y) * height / 2) };
    });
    return { name, viewport: [width, height], pose, props, apparentHeightRatio: round(props[0].projectedHeightPx / props[1].projectedHeightPx) };
  }));
  const result = { boundary: 'Pure canonical geometry audit, not perceived illusion or real-scene visibility. Independent Three.Ray sampling approximates covered area at finite resolution; renderer images are a separate gate.',
    sourceHash: Object.fromEntries(bridge.hashes), toolHash: sha256(fs.readFileSync(__filename)), light: { railSweepSamples: 2001, step: .001, samples, intervals, initial: L.evaluateLight(0).windows,
      triangles: L.COAT_TRIANGLES.length, maxRenderedShadowVertices: maxVertices, invalidRailSamples, invalid, singular, oracle: { nx: 65, ny: 49, rails: 41, maxAbsoluteCoverageDifference: maxOracleDifference, allowedRasterDifference: .015, comparisons: oracle } },
    ames: { mathematicalClosedFaces: A.AMES_FACES.length, edges: edgeCounts.size, everyEdgeTwice: [...edgeCounts.values()].every(n => n === 2), maxPlaneError, maxReferenceRayError: maxRayError,
      rearDepthRatio: A.AMES_VERTICES[5].z / A.AMES_VERTICES[4].z, identicalPropSizesAndScales: A.AMES_PROPS.every(p => JSON.stringify(p.size) === JSON.stringify(A.AMES_PROPS[0].size) && JSON.stringify(p.scale) === JSON.stringify(A.AMES_PROPS[0].scale)), views: amesViews } };
  if (invalidRailSamples || invalid.some(r => !r.rejected) || singular.some(r => !r.rejected) || maxOracleDifference > .015 || maxRayError > 1e-10 || maxPlaneError > 1e-10 || !result.ames.everyEdgeTwice || !result.ames.identicalPropSizesAndScales) throw Error('Optical numerical audit failed: ' + JSON.stringify(result));
  return result;
}
function chart(result) {
  const w = 840, h = 430, x = s => 70 + (s + 1) * 345, y = c => 340 - c * 260;
  const line = (index, color) => '<polyline fill="none" stroke="' + color + '" stroke-width="2.5" points="' + result.light.samples.map(v => x(v[0]) + ',' + y(v[index])).join(' ') + '"/>';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '"><rect width="100%" height="100%" fill="#f7f6ef"/><g font-family="sans-serif" fill="#192a2c"><text x="40" y="35" font-size="21">Physical light rail: receiver-window coverage</text><text x="40" y="60" font-size="13">2,001 analytic positions; 41 independent ray-sampled comparisons; no perception claim</text>' +
    [0, .25, .5, .75, 1].map(v => '<path d="M70 ' + y(v) + 'H760" stroke="#c7ccc4"/><text x="25" y="' + (y(v) + 5) + '" font-size="13">' + Math.round(v * 100) + '%</text>').join('') +
    result.light.intervals.map(([a, b]) => '<rect x="' + x(a) + '" y="355" width="' + (x(b) - x(a)) + '" height="12" fill="#699c79"/>').join('') +
    line(1, '#a05334') + line(2, '#34598a') + '<path d="M70 ' + y(P.MAX_WINDOW_COVERAGE) + 'H760" stroke="#346a45" stroke-dasharray="3 4"/>' +
    [-1, -.5, 0, .5, 1].map(v => '<text x="' + (x(v) - 10) + '" y="390" font-size="14">' + v + '</text>').join('') +
    '<text x="690" y="418" font-size="14">rail s</text><text x="80" y="418" font-size="13" fill="#a05334">left window</text><text x="190" y="418" font-size="13" fill="#34598a">right window</text><text x="320" y="418" font-size="13" fill="#346a45">green: both windows within 2% coverage</text></g></svg>';
}
async function main() {
  const result = measure(); bridge.verify();
  fs.writeFileSync(path.join(directory, 'geometry-report.json'), JSON.stringify(result));
  const svg = chart(result); fs.writeFileSync(path.join(directory, 'coverage.svg'), svg);
  fs.writeFileSync(path.join(directory, 'index.html'), '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden}svg{display:block}</style>' + svg + '<script>window.ready=true</script>');
  const browser = await openBrowser(directory);
  try {
    for (let i = 0; i < 100 && !await browser.evaluate('window.ready===true'); i++) await delay(100);
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 840, height: 430, deviceScaleFactor: 1, mobile: false });
    const screenshot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(directory, 'coverage.png'), Buffer.from(screenshot.data, 'base64'));
    if (browser.errors.length) throw Error(JSON.stringify(browser.errors));
  } finally { await browser.close(); }
  bridge.verify(); console.log(JSON.stringify({ directory, intervals: result.light.intervals, oracleError: result.light.oracle.maxAbsoluteCoverageDifference, maxPlaneError: result.ames.maxPlaneError, maxReferenceRayError: result.ames.maxReferenceRayError }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
