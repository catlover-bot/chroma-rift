import { requireOptionalNativeModule } from 'expo';

import { hasNative3D } from '../native3D';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));

describe('native first-person availability boundary', () => {
  it('checks the ExpoGL registration name used by the installed native module', () => {
    jest.mocked(requireOptionalNativeModule).mockReturnValue({} as ReturnType<typeof requireOptionalNativeModule>);
    expect(hasNative3D()).toBe(true);
    expect(requireOptionalNativeModule).toHaveBeenLastCalledWith('ExpoGL');
  });

  it('guides an older Development Build when the native module is absent', () => {
    jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
    expect(hasNative3D()).toBe(false);
  });

  it('handles lookup failure without evaluating the 3D native import graph', () => {
    jest.mocked(requireOptionalNativeModule).mockImplementation(() => { throw new Error('native lookup failed'); });
    expect(hasNative3D()).toBe(false);
  });
});
