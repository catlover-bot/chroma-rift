# Goal015 branding asset assessment

The existing wordless geometric icon and splash artwork is preserved. Both images were opened and inspected: a cyan/coral doorway contour with a light central line/chevron, with no baked English, Japanese, logo letters, small text or rounded-square mask. Renaming the displayed app to **錯視館（さくしかん）** requires no artwork change.

| Input | Dimensions / encoding | Pixel alpha | Bytes | SHA-256 |
| --- | --- | --- | --- | --- |
| [icon.png](../../assets/branding/icon.png) | 1024×1024, 8-bit RGBA, PNG color type 6 | All 1,048,576 pixels are 255; four corners are `#09090C` | 40,238 | `f12a4fafbf122569d2a777e93c7c401ba5cd41b8d013a6e3cc60de040b1103f4` |
| [splash-icon.png](../../assets/branding/splash-icon.png) | 1024×1024, 8-bit RGBA, PNG color type 6 | Intentional transparent background; 925,930 pixels below 255 | 41,021 | `bad36d0324a1f26f213d8510e99fd3034108b05d5c93636b0ce80053ea791472` |

The icon master has an alpha channel whose pixels are all opaque. This is distinct from a PNG with no alpha channel. The installed Expo iOS icon path was checked, then its exact normal-appearance `generateImageAsync` options were exercised in an isolated QA directory: 1024×1024, `resizeMode: 'cover'`, `removeTransparency: true`, and `backgroundColor: '#ffffff'`. The resulting [iOS icon derivative](brand-layout/ios-icon-1024.png) is 24,059 bytes, RGB PNG color type 2 (no alpha channel), with decoded pixels identical to the master. SHA-256: `d88d17c6cc139ff946aea676ad5d76a23823c0cffca0e92b88aabed7418a823d`. No prebuild, native folder, signed archive, IPA or original asset was changed.

The [generator](../../scripts/generate-brand-assets.cjs) consists of repository-authored SVG paths rasterized with Chromium Canvas. It uses no fonts, external images or generated AI bitmap. Existing [provenance](../ASSET-PROVENANCE.md#goal-013-の公開用図形) records that origin. This inspection establishes the asset inputs; it does not infer a copyright-owner name or change the project's license.

The product's Japanese name is ordinary React Native text with no bundled font family. No TTF/OTF/WOFF font was found in `assets/`. Browser layout QA uses the local Noto Sans CJK JP font already documented for existing facility-sign generation; it does not add that font to the app. Local font SHA-256 is `b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a`; the existing source/license record is [ASSET-PROVENANCE.md](../ASSET-PROVENANCE.md).

**FINAL_SCREENSHOTS=PENDING.** The environment is Linux with no `xcrun`/iOS Simulator. The derivative above is a local Expo pipeline output, not proof of the final uploaded binary or actual iPhone home/splash presentation. [Rendered UI evidence and limits](brand-layout/README.md) are separate from final App Store screenshots.
