// Intentionally loads both real package entries only in this isolated Node
// regression process. This file is never imported by the application bundle.
const assert = require('node:assert/strict');
const localThree = require('three');
const { applyProps } = require('@react-three/fiber');

async function main() {
  const foreignThree = await import('three');
  assert.notEqual(localThree.Vector3, foreignThree.Vector3);
  assert.notEqual(localThree.Quaternion, foreignThree.Quaternion);
  const object = new localThree.Object3D();
  const identities = {
    position: object.position,
    quaternion: object.quaternion,
    rotation: object.rotation,
    scale: object.scale,
  };
  const failures = {};
  for (const [property, value] of [
    ['position', new foreignThree.Vector3(2, 3, 4)],
    ['quaternion', new foreignThree.Quaternion().setFromAxisAngle(new foreignThree.Vector3(1, 0, 0), 0.5)],
  ]) {
    assert.equal(Object.getOwnPropertyDescriptor(object, property).writable, false);
    try {
      applyProps(object, { [property]: value });
      assert.fail(`Cross-constructor ${property} unexpectedly succeeded`);
    } catch (error) {
      assert.match(error.message, new RegExp(`Cannot assign to read only property '${property}'`));
      failures[property] = { message: error.message, frame: error.stack.split('\n')[1].trim() };
    }
  }
  for (let index = 0; index < 4; index++) {
    const position = new foreignThree.Vector3(index, 2 + index, -3);
    const quaternion = new foreignThree.Quaternion().setFromAxisAngle(new foreignThree.Vector3(0, 1, 0), index / 4);
    applyProps(object, {
      position: [position.x, position.y, position.z],
      quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
      scale: [0.017, 1 + index, 0.017],
    });
    assert.deepEqual(object.position.toArray(), position.toArray());
    assert.deepEqual(object.quaternion.toArray(), quaternion.toArray());
    for (const property of Object.keys(identities)) assert.equal(object[property], identities[property]);
  }
  process.stdout.write(`${JSON.stringify({
    threeVersion: localThree.REVISION,
    cjsEntry: require.resolve('three'),
    r3fEntry: require.resolve('@react-three/fiber'),
    distinctConstructors: true,
    failures,
    tupleUpdates: 4,
    transformIdentityPreserved: true,
  }, null, 2)}\n`);
}

main().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
