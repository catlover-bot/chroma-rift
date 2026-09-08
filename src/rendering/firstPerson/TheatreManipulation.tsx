import { useLayoutEffect, useMemo } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent, type NativeTouchEvent } from 'react-native';
import { evaluateLight } from '../../domain/theatre/lightGate';
import type { TheatreAction } from '../../domain/theatre/types';
import type { RuntimeController } from './runtimeController';
import { theatreAction, theatreDeviceScreenBounds, theatrePointer } from './theatreController';
import { SceneActionButton } from './SceneActionButton';
import { observeReleaseBarrier, requireAllPointersReleased, targetChangedTouches } from './touchInput';

type Common = { controller: RuntimeController; enabled: boolean; onChange: () => void };
function lifetime(enabled: boolean, key = '') {
  let active = enabled;
  return { key, current: () => active, activate: () => { active = enabled; }, dispose: () => { active = false; } };
}
function touchLifetime(controller: RuntimeController, enabled: boolean, mode: string) {
  const owner = lifetime(enabled);
  return { ...owner, dispose: () => {
    owner.dispose();
    if ((controller.runtime.theatre?.mode === 'light' ? 'light' : controller.runtime.theatre?.projectorArmed ? 'projector' : 'explore') !== mode || controller.retired) return;
    const drag = controller.runtime.theatre?.activeDrag;
    if (drag) { requireAllPointersReleased(controller.input); if (!controller.input.releaseBarrier.includes(drag.pointerId)) controller.input.releaseBarrier.push(drag.pointerId); }
    theatreAction(controller, { type: 'cancel' });
  } };
}
function retainPausePointers(controller: RuntimeController, pointers: number[]) {
  controller.input.releaseBarrier = [...new Set([...controller.input.releaseBarrier, ...pointers.filter(Number.isSafeInteger)])];
}
/** Only the projected board owns a geometry hit view. Native local coordinates
 * are translated back to the one gameplay Canvas before ray/plane hit testing. */
export function TheatreTouchLayer({ controller, enabled, onChange, width, height, onPause }: Common & { width: number; height: number; onPause: () => void }) {
  const mode = controller.runtime.theatre?.mode === 'light' ? 'light' : controller.runtime.theatre?.projectorArmed ? 'projector' : 'explore';
  const owner = useMemo(() => touchLifetime(controller, enabled, mode), [controller, enabled, mode]);
  useLayoutEffect(() => { owner.activate(); return () => owner.dispose(); }, [owner]);
  const bounds = theatreDeviceScreenBounds(controller);
  const send = (phase: 'start' | 'move' | 'end' | 'cancel', event: GestureResponderEvent) => {
    if (!enabled || !owner.current() || !bounds) return;
    const native = event.nativeEvent;
    const all = native.touches ?? [];
    observeReleaseBarrier(controller.input, all.map(point => Number(point.identifier)));
    const changed = native.changedTouches?.length ? native.changedTouches : [native];
    const targets = (native as NativeTouchEvent & { targetTouches?: NativeTouchEvent[] }).targetTouches;
    const touches = phase === 'start' ? targetChangedTouches(changed, targets) : changed;
    if (phase === 'start' && all.length >= 3) {
      retainPausePointers(controller, all.map(point => Number(point.identifier)));
      onPause(); return;
    }
    for (const point of touches) {
      const accepted = theatrePointer(controller, phase, Number(point.identifier), { x: point.locationX + bounds.left, y: point.locationY + bounds.top }, width, height);
      if (accepted && phase !== 'move') onChange();
    }
  };
  if (!bounds || mode === 'explore') return null;
  return <View testID="theatre-device-touch" accessible={false} pointerEvents={enabled ? 'auto' : 'none'}
    style={{ position: 'absolute', left: bounds.left, top: bounds.top, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top }}
    onTouchStart={event => send('start', event)} onTouchMove={event => send('move', event)}
    onTouchEnd={event => send('end', event)} onTouchCancel={event => send('cancel', event)} />;
}
export function TheatreDeviceHeading({ controller }: { controller: RuntimeController }) {
  const light=controller.runtime.theatre?.mode==='light';
  return <View pointerEvents="none" style={styles.heading} testID="theatre-device-heading">
    <Text style={styles.caption}>{light?'灯りを動かし、2つの受光窓に光を届ける':'取っ手を回して、映写機を動かす'}</Text>
  </View>;
}
function Button({label,disabled,onPress,sessionKey}:{label:string;disabled:boolean;onPress:()=>void;sessionKey:string}) {
  return <SceneActionButton label={label} disabled={disabled} onPress={onPress} sessionKey={sessionKey} style={[styles.button,disabled&&styles.disabled]}>
    <Text pointerEvents="none" style={styles.caption}>{label}</Text>
  </SceneActionButton>;
}
export function TheatreDeviceControls({controller,enabled,onChange,simple,reader,sessionKey}:Common&{simple:boolean;reader:boolean;sessionKey:string}) {
  const live=controller.runtime.theatre,saved=controller.runtime.progress.theatre;
  const mode=live?.mode==='light'?'light':live?.projectorArmed?'projector':'explore';
  const owner=useMemo(()=>lifetime(enabled,sessionKey+':'+mode),[enabled,sessionKey,mode]);
  useLayoutEffect(()=>{owner.activate();return()=>owner.dispose();},[owner]);
  if(!live||!saved||mode==='explore')return null;
  const light=mode==='light',dragging=!!live.activeDrag, available=enabled&&!!controller.matrices&&!controller.retired;
  const optical=evaluateLight(live.rail),status=light?optical.windows.map(w=>(w.id==='left'?'左':'右')+'の窓に'+(w.lit?'光':'影')).join(' ／ '):'映写機の操作中も、周囲は動いています。';
  const run=(action:TheatreAction)=>{if(!available||!owner.current())return;theatreAction(controller,action,reader);onChange();};
  return <View style={styles.controls} testID="theatre-device-controls">
    <Text accessibilityLiveRegion="polite" style={styles.caption} testID="theatre-device-status">{status}</Text>
    {light&&saved.light.accepted?<Text style={styles.caption}>灯りを固定した。開いた戸から映写室へ</Text>:null}
    {light&&(simple||reader)&&!saved.light.accepted?<View>
      <View accessible accessibilityRole="adjustable" accessibilityLabel="灯りのレール位置" accessibilityState={{disabled:!available||dragging}}
        accessibilityValue={{min:-1,max:1,now:live.rail,text:status}} accessibilityActions={[{name:'decrement',label:'手前へ'},{name:'increment',label:'奥へ'}]}
        onAccessibilityAction={event=>{if(!dragging&&['increment','decrement'].includes(event.nativeEvent.actionName))run({type:'adjust-light',delta:event.nativeEvent.actionName==='increment'?.1:-.1});}} style={styles.semantic}>
        <Text style={styles.caption}>灯りの位置を調整</Text>
      </View>
      <View style={styles.row}><Button label="手前へ" disabled={!available||dragging} sessionKey={sessionKey} onPress={()=>run({type:'adjust-light',delta:-.1})}/>
        <Button label="奥へ" disabled={!available||dragging} sessionKey={sessionKey} onPress={()=>run({type:'adjust-light',delta:.1})}/></View>
    </View>:null}
    {!light&&(simple||reader)?<Button label="取っ手を1/4回す" disabled={!available||dragging||live.projectorCooldown>0} sessionKey={sessionKey} onPress={()=>run({type:'crank-step',delta:Math.PI/2})}/>:null}
    <View style={styles.row}>
      {light&&!saved.light.accepted?<Button label="灯りを固定する" disabled={!available||dragging||!optical.canLock} sessionKey={sessionKey} onPress={()=>run({type:'commit-light'})}/>:null}
      <Button label="探索へ戻る" disabled={!available} sessionKey={sessionKey} onPress={()=>run({type:'leave'})}/>
    </View>
  </View>;
}
const styles=StyleSheet.create({
  heading:{padding:8,gap:3,borderRadius:10,backgroundColor:'#20252DE8'},
  controls:{padding:8,gap:6,borderRadius:10,backgroundColor:'#20252DE8'},
  caption:{color:'#E8DFC6',fontSize:14,textAlign:'center'},
  row:{flexDirection:'row',flexWrap:'wrap',gap:6,alignItems:'center'},
  button:{minHeight:48,minWidth:48,flexGrow:1,paddingHorizontal:9,paddingVertical:8,borderWidth:1,borderColor:'#ABA795',borderRadius:10,backgroundColor:'#343D44',alignItems:'center',justifyContent:'center'},
  disabled:{opacity:.5},semantic:{minHeight:44,justifyContent:'center',padding:6},
});
