import { render } from '@testing-library/react-native';
import { useFrame } from '@react-three/fiber/native';
import { createGalleryRuntime } from '../../../domain/gallery';
import { GalleryActor } from '../GalleryActor';
import { createSceneResources } from '../resources';

jest.mock('@react-three/fiber/native', () => ({ useFrame: jest.fn() }));

it.each([true, false])('propagates the original authoritative actor frame failure through the optional owner handler: %s', async withHandler => {
  const runtime = createGalleryRuntime(), resources = createSceneResources(false, null, true);
  const failure = new Error('actor source failed during frame'), onFrameError = jest.fn();
  let fail = false;
  const source = () => { if (fail) throw failure; return runtime.gallery!.actor; };
  const view = await render(<GalleryActor runtime={{ current: runtime }} resources={resources} reducedMotion={false} actorSource={source} {...(withHandler ? { onFrameError } : {})} />);
  try {
    fail = true;
    const callback = jest.mocked(useFrame).mock.calls.at(-1)![0];
    const invoke = () => callback({} as Parameters<typeof callback>[0], 1 / 60);
    if (withHandler) {
      expect(invoke).not.toThrow(); expect(onFrameError).toHaveBeenCalledTimes(1); expect(onFrameError).toHaveBeenCalledWith(failure);
    } else { expect(invoke).toThrow(failure); expect(onFrameError).not.toHaveBeenCalled(); }
  } finally { await view.unmount(); resources.dispose(); }
});
