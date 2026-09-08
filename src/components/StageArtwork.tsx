import { Canvas, Circle, Rect, Line, vec } from '@shopify/react-native-skia';
import type { StageId } from '../app/stages';
/** Original small architectural vignettes. Static Skia primitives only: no
 * gameplay Canvas/controller, copied cover art, emojis or completion badge. */
export function StageArtwork({ id }: { id: StageId }) {
  const theatre = id === 'shadow-theatre-v1';
  const vault = id === 'uncanny-vault-v1', legacy = id === 'returnless-entrance';
  return <Canvas style={{ width: '100%', height: 92 }} pointerEvents="none" testID={'stage-art-' + id}>
    <Rect x={0} y={0} width={600} height={92} color="#172923" />
    <Rect x={12} y={10} width={200} height={70} color={vault ? '#3B3A2F' : '#304D43'} />
    {theatre ? <>
      <Rect x={44} y={14} width={117} height={58} color="#C3B99B" />
      <Rect x={92} y={38} width={18} height={34} color="#2F3031" /><Circle cx={101} cy={34} r={9} color="#2F3031" />
      <Rect x={24} y={70} width={166} height={4} color="#85745B" />
      <Rect x={172} y={36} width={25} height={24} color="#495657" /><Circle cx={174} cy={28} r={12} color="#7F856F" /><Circle cx={194} cy={30} r={10} color="#7F856F" />
      <Line p1={vec(45, 17)} p2={vec(186, 52)} strokeWidth={1} color="#9F9B7F" />
    </> : vault ? <>
      {[24, 90, 156].map(x => <Rect key={x} x={x} y={14} width={6} height={62} color="#A29B77" />)}
      {[30, 51, 72].map(y => <Rect key={y} x={24} y={y} width={140} height={4} color="#887E5B" />)}
      <Rect x={178} y={20} width={22} height={54} color="#151E1A" /><Circle cx={187} cy={45} r={7} color="#9EA990" />
    </> : <>
      <Rect x={80} y={15} width={53} height={65} color="#101B18" />
      <Rect x={87} y={22} width={39} height={58} color={legacy ? '#777B62' : '#8FAD8B'} />
      <Line p1={vec(12, 80)} p2={vec(82, 59)} strokeWidth={2} color="#718779" />
      <Line p1={vec(210, 80)} p2={vec(130, 59)} strokeWidth={2} color="#718779" />
      <Circle cx={legacy ? 108 : 45} cy={42} r={legacy ? 14 : 12} color={legacy ? '#3C4033' : '#91917C'} />
    </>}
  </Canvas>;
}
