'use strict';
// Local QA boundary: real React hosts/Three refs, then browser WebGL.
// This does not emulate native R3F scheduling, EXGL presentation, or device timing.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const cp = require('node:child_process'), http = require('node:http');
const crypto = require('node:crypto'), Module = require('node:module'), ts = require('typescript');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function installSourceBridge(root) {
  const hashes = new Map(), callbacks = [];
  for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (mod, filename) => {
    const source = fs.readFileSync(filename, 'utf8'), key = path.relative(root, filename), hash = sha256(source);
    if (hashes.has(key) && hashes.get(key) !== hash) throw new Error('Source changed during extraction: ' + key);
    hashes.set(key, hash);
    mod._compile(ts.transpileModule(source, { fileName: filename, compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022,
    } }).outputText, filename);
  };
  const load = Module._load;
  Module._load = function (name, ...args) {
    if (name === '@react-three/fiber/native') return { useFrame: callback => callbacks.push(callback) };
    return load.call(this, name, ...args);
  };
  return { callbacks, hashes, verify() {
    for (const [filename, expected] of hashes) if (sha256(fs.readFileSync(path.join(root, filename))) !== expected) throw new Error('Source changed during capture: ' + filename);
  }, loadBaseline(relative, revision) {
    const filename = path.join(root, relative), source = cp.execFileSync('git', ['show', revision + ':' + relative], { cwd: root, encoding: 'utf8' });
    const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
    mod._compile(ts.transpileModule(source, { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
    return { exports: mod.exports, source, sha256: sha256(source) };
  } };
}
async function mountThree(element, THREE) {
  const R = require('react-test-renderer'), cache = new WeakMap();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  function host(node) {
    if (cache.has(node.props)) return cache.get(node.props);
    const p = node.props;
    const object = node.type === 'primitive' ? p.object : node.type === 'mesh' ? new THREE.Mesh(p.geometry, p.material)
      : node.type === 'lineSegments' ? new THREE.LineSegments(p.geometry, p.material)
      : node.type === 'line' ? new THREE.Line(p.geometry, p.material)
      : node.type === 'ambientLight' ? new THREE.AmbientLight(p.color ?? 0xffffff, p.intensity)
      : node.type === 'directionalLight' ? new THREE.DirectionalLight(p.color ?? 0xffffff, p.intensity) : new THREE.Group();
    if (!object?.isObject3D) throw new Error('Unsupported Three host: ' + node.type);
    if (p.name) object.name = p.name;
    for (const property of ['position', 'scale', 'quaternion']) if (p[property] !== undefined) {
      if (typeof p[property] === 'number') object[property].setScalar(p[property]);
      else if (Array.isArray(p[property])) object[property].fromArray(p[property]);
      else object[property].copy(p[property]);
    }
    if (p.rotation) object.rotation.fromArray(p.rotation);
    for (const property of ['visible', 'castShadow', 'receiveShadow', 'frustumCulled', 'renderOrder']) if (p[property] !== undefined) object[property] = p[property];
    cache.set(p, object); return object;
  }
  function convert(node) {
    if (typeof node === 'string') return [];
    const children = node.children.flatMap(convert);
    if (typeof node.type !== 'string') return children;
    const object = host(node); for (const child of children) object.add(child); return [object];
  }
  let tree;
  await R.act(async () => { tree = R.create(element, { createNodeMock: host }); });
  return { objects: convert(tree.root), unmount: () => R.act(async () => tree.unmount()) };
}
async function openBrowser(directory) {
  const chrome = process.env.GALLERY_CHROME ?? path.join(os.homedir(), '.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell');
  if (!fs.existsSync(chrome)) throw new Error('Chromium missing; set GALLERY_CHROME. No dependency is installed by this tool.');
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const filename = path.resolve(directory, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(directory + path.sep)) { response.writeHead(403); response.end(); return; }
    fs.readFile(filename, (error, bytes) => {
      if (error) { response.writeHead(404); response.end(); return; }
      response.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8'); response.end(bytes);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chroma-motion-'));
  const child = cp.spawn(chrome, ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], {
    stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH || path.join(os.homedir(), '.local/opt/playwright-libs-ubuntu24/usr/lib/x86_64-linux-gnu') },
  });
  let stderr = '', socket;
  const pending = new Map(), errors = [];
  child.stderr.on('data', data => { stderr += data; });
  async function close() {
    socket?.close(); child.kill('SIGTERM'); server.close();
    fs.writeFileSync(path.join(directory, 'chromium.log'), stderr);
  }
  try {
    for (let i = 0; i < 100 && !stderr.includes('DevTools listening on'); i++) { if (child.exitCode !== null) throw new Error(stderr); await delay(100); }
    const endpoint = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
    if (!endpoint) throw new Error('No Chromium debug endpoint: ' + stderr);
    const targets = await (await fetch('http://127.0.0.1:' + new URL(endpoint).port + '/json/list')).json();
    socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let id = 0;
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) { const entry = pending.get(message.id); pending.delete(message.id); if (message.error) entry.reject(new Error(JSON.stringify(message.error))); else entry.resolve(message.result); }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const seq = ++id; pending.set(seq, { resolve, reject }); socket.send(JSON.stringify({ id: seq, method, params })); });
    const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
    await send('Runtime.enable'); await send('Page.enable');
    await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/' });
    return { send, evaluate, errors, pending, close };
  } catch (error) { await close(); throw error; }
}
module.exports = { installSourceBridge, mountThree, openBrowser, sha256, delay };
