import * as THREE from 'three';
import { CAFE_SPEC } from '../../domain/vault/specs';
export function createVaultResources() {
  const basic = (color: string) => new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false });
  const dark = basic(CAFE_SPEC.dark), light = basic(CAFE_SPEC.light), mortar = basic(CAFE_SPEC.mortar), board = basic('#B9B7A7'),
    shaft = basic('#303B38'), guide = basic('#776340');
  const wall = new THREE.MeshLambertMaterial({ color: '#676E66' }), rack = new THREE.MeshLambertMaterial({ color: '#575D54' }),
    floor = new THREE.MeshLambertMaterial({ color: '#62665B' }), cloth = new THREE.MeshLambertMaterial({ color: '#8B8677' });
  return { dark, light, mortar, board, shaft, guide, wall, rack, floor, cloth,
    dispose() { [dark, light, mortar, board, shaft, guide, wall, rack, floor, cloth].forEach(m => m.dispose()); } };
}
export type VaultResources = ReturnType<typeof createVaultResources>;
