import * as THREE from 'three';
import { act, fireEvent, render } from '@testing-library/react-native';
import { theatreComparisonGeometry } from '../../content/theatreComparisons';
import { AMES_VERTICES, AMES_PROPS, AMES_PROP_PARTS, AMES_OBSERVATION_POINTS } from '../../domain/theatre/perspectiveExhibit';
import { evaluateLight } from '../../domain/theatre/lightGate';
import { theatreCheckpoint } from '../../storage/testFixtures/theatre';
import { TheatreNotebook } from '../TheatreNotebook';
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

it('hides both unobserved entries until allowed and does not forge discovery during post-clear free comparison', async () => {
  const progress = theatreCheckpoint().progress.theatre!, before = JSON.stringify(progress), onClose = jest.fn();
  const view = await render(<TheatreNotebook progress={progress} completed={false} onClose={onClose} />);
  expect(view.queryByText('影の大きさ')).toBeNull(); expect(view.queryByText('部屋の奥行き')).toBeNull();
  await view.rerender(<TheatreNotebook progress={progress} completed onClose={onClose} />);
  await fireEvent.press(view.getByRole('button', { name: '影の大きさ（自由比較）' }));
  const slider = view.getByRole('adjustable', { name: '比較する灯りの位置' }), stale = slider.props.onAccessibilityAction;
  await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(view.getByText('クリア後の自由比較。本編の発見記録には追加しません。')).toBeTruthy();
  expect(JSON.stringify(progress)).toBe(before);
  await fireEvent.press(view.getByRole('button', { name: 'メモ一覧へ' }));
  await fireEvent.press(view.getByRole('button', { name: '部屋の奥行き（自由比較）' }));
  await fireEvent.press(view.getByRole('button', { name: '横から見る' }));
  expect(view.getByText('視点：横')).toBeTruthy(); expect(JSON.stringify(progress)).toBe(before);
  await view.unmount(); await act(() => stale({ nativeEvent: { actionName: 'increment' } })); expect(onClose).not.toHaveBeenCalled();
});

it('projects the canonical shadow polygons and immutable three-part props into interactive explanatory views', () => {
  const original = JSON.stringify({ room: AMES_VERTICES, props: AMES_PROPS, parts: AMES_PROP_PARTS });
  const initial = theatreComparisonGeometry('shadow', { rail: 0, view: 'front' }), moved = theatreComparisonGeometry('shadow', { rail: .65, view: 'front' });
  expect(initial.polygons).toHaveLength(evaluateLight(0).polygons.length);
  const index = evaluateLight(.65).polygons.findIndex(polygon => polygon.length > 0);
  expect(index).toBeGreaterThanOrEqual(0);
  const modelPoint = evaluateLight(.65).polygons[index]![0]!, diagramPoint = moved.polygons[index]!.points[0]!;
  expect(diagramPoint.x).toBeCloseTo((modelPoint.x + 2.4) / 4.8 * 300 + 10);
  expect(diagramPoint.y).toBeCloseTo((3.6 - modelPoint.y) / 3.6 * 225 + 5);
  expect(moved.polygons).not.toEqual(initial.polygons);
  const views = (['front', 'intermediate', 'side'] as const).map(view => theatreComparisonGeometry('depth', { rail: 0, view }));
  views.forEach(view => expect(view.polygons).toHaveLength(2 * AMES_PROP_PARTS.length * 6));
  expect(views[0]!.polygons).not.toEqual(views[2]!.polygons);
  expect(JSON.stringify({ room: AMES_VERTICES, props: AMES_PROPS, parts: AMES_PROP_PARTS })).toBe(original);
});

it.each(['front', 'intermediate', 'side'] as const)('matches the independent Three camera projection for the %s observation pose', view => {
  const geometry = theatreComparisonGeometry('depth', { rail: 0, view });
  const pose = AMES_OBSERVATION_POINTS[view];
  const camera = new THREE.PerspectiveCamera(65, geometry.width / geometry.height, .08, 60);
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
  camera.updateMatrixWorld(true);
  for (const prop of AMES_PROPS) {
    const part = AMES_PROP_PARTS[0]!;
    const point = new THREE.Vector3(prop.position.x - part.width / 2,
      prop.position.y + part.centerY - part.height / 2, prop.position.z - part.depth / 2).project(camera);
    const actual = geometry.polygons.find(polygon => polygon.id === prop.id + '-0-face-0')!.points[0]!;
    expect(actual.x).toBeCloseTo((point.x + 1) * geometry.width / 2, 8);
    expect(actual.y).toBeCloseTo((1 - point.y) * geometry.height / 2, 8);
  }
});
