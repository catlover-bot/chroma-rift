const { execFileSync } = require('node:child_process') as {
  execFileSync: (executable: string, args: string[], options: { encoding: 'utf8' }) => string;
};

it('reproduces the real cross-module R3F failure, then preserves transforms with tuples', () => {
  const output = execFileSync(process.execPath, [`${process.cwd()}/src/rendering/firstPerson/__tests__/segmentModuleIdentity.node.cjs`], { encoding: 'utf8' });
  const evidence = JSON.parse(output) as {
    distinctConstructors: boolean;
    failures: { position: { message: string }; quaternion: { message: string } };
    tupleUpdates: number;
    transformIdentityPreserved: boolean;
  };
  expect(evidence.distinctConstructors).toBe(true);
  expect(evidence.failures.position.message).toContain("read only property 'position'");
  expect(evidence.failures.quaternion.message).toContain("read only property 'quaternion'");
  expect(evidence.tupleUpdates).toBe(4);
  expect(evidence.transformIdentityPreserved).toBe(true);
});
