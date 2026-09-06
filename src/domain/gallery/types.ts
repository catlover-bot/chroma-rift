import type { Vec3 } from '../firstPerson/types';

export type GalleryPuzzle = 'shadow' | 'contour';
export type Point2 = { x: number; y: number };
export type SampleId = 'sample-a' | 'sample-b' | 'sample-c';
export type SourceSlotId = 'source-a' | 'source-b' | 'source-c';
export type SocketId = 'socket-left' | 'socket-right';
export type ShadowSlotId = SourceSlotId | SocketId;
export type DiscId = 0 | 1 | 2;
export type DiscAngles = [number, number, number];
export type ShadowCheckpoint = { seed: number; variant: number; inspected: boolean; solved: boolean; assignments: Record<SampleId, ShadowSlotId>; attempts: number };
export type ContourCheckpoint = { seed: number; inspected: boolean; solved: boolean; angles: DiscAngles; attempts: number };
export type GalleryProgress = { schemaVersion: 1; seed: number; shadow: ShadowCheckpoint; contour: ContourCheckpoint; order: ('B' | 'C')[] };
export type GalleryDrag = { kind: 'shadow'; sampleId: SampleId; pointerId: number; point: Point2; offset: Point2 } |
  { kind: 'contour'; discId: DiscId; pointerId: number; lastPointerAngle: number | null; startAngle: number };
export type GalleryTransient = {
  sessionId: string; lastSeq: number; lastNowMs: number; mode: 'explore' | GalleryPuzzle;
  activeDrag: GalleryDrag | null; contourAngles: DiscAngles; shadowCompare: boolean; contourGuide: boolean;
  lastCompareMs: number | null; doorDOpen: number; doorShadowOpen: number; doorContourOpen: number;
  feedback?: { puzzle: GalleryPuzzle; correct: boolean; sequence: number; remainingSeconds: number } | undefined;
};
export type GalleryAction =
  | { type: 'enter'; puzzle: GalleryPuzzle }
  | { type: 'leave' | 'cancel' | 'compare' | 'shadow-commit' | 'contour-commit' }
  | { type: 'guide'; enabled: boolean }
  | { type: 'shadow-start'; sampleId: SampleId; pointerId: number; point: Point2 }
  | { type: 'shadow-move'; pointerId: number; point: Point2 }
  | { type: 'shadow-drop'; pointerId: number; slotId: ShadowSlotId | null }
  | { type: 'shadow-place'; sampleId: SampleId; slotId: ShadowSlotId }
  | { type: 'shadow-return'; sampleId: SampleId }
  | { type: 'contour-start'; discId: DiscId; pointerId: number; point: Point2 }
  | { type: 'contour-move'; pointerId: number; point: Point2 }
  | { type: 'contour-end'; pointerId: number }
  | { type: 'contour-adjust'; discId: DiscId; delta: number };
export type GalleryCommand = { sessionId: string; seq: number; nowMs: number; action: GalleryAction };
export type GalleryEffect = { type: 'gallery-released'; puzzle: GalleryPuzzle; sequence: number } | { type: 'message'; text: string } | { type: 'stop-input' } | { type: 'manipulated'; puzzle: GalleryPuzzle };
export type GalleryContext = { rendererReady: boolean; foreground: boolean; targetId: string | null };
export type GalleryFixture = { center: Vec3; width: number; height: number; normal: Vec3; right: Vec3; maxDistance: number };
