import { COAT_OUTLINE,COAT_TRIANGLES,evaluateLight,LIGHT_RECEIVER,LIGHT_WINDOWS,lightSource,opticalWorldPoint } from '../lightGate';
import { MAX_WINDOW_COVERAGE,polygonArea,projectPoint,projectSilhouette,type ReceiverPlane,type ReceiverWindow,type Triangle3 } from '../projection';
import type { Vec3 } from '../../firstPerson/types';
const sub=(a:Vec3,b:Vec3):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a:Vec3,b:Vec3):Vec3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
/** Independent finite-segment Moller-Trumbore oracle against the actual prop
 * triangles, with no shadow projection, clipping or window-center shortcut. */
function blocked(source:Vec3,end:Vec3,triangles:readonly Triangle3[]) {
  const d=sub(end,source);
  return triangles.some(([a,b,c])=>{
    const e1=sub(b,a),e2=sub(c,a),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)<1e-10)return false;
    const s=sub(source,a),u=dot(s,h)/det;if(u<0||u>1)return false;
    const q=cross(s,e1),v=dot(d,q)/det;if(v<0||u+v>1)return false;
    const t=dot(e2,q)/det;return t>1e-8&&t<1-1e-8;
  });
}
function sampledCoverage(source:Vec3,w:ReceiverWindow,triangles=COAT_TRIANGLES,z=6,size=100) {
  let hits=0;for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(blocked(source,{x:w.minX+(x+.5)/size*(w.maxX-w.minX),y:w.minY+(y+.5)/size*(w.maxY-w.minY),z},triangles))hits++;
  return hits/(size*size);
}
describe('theatre canonical physical projection',()=>{
  test('known oblique-plane points recover the independently constructed segment end',()=>{
    const normal={x:0,y:.6,z:.8},plane={point:{x:0,y:0,z:5},normal};
    for(const fraction of [.12,.4,.85])for(const x of [-1.2,.1,2]){
      const source={x:.2,y:.3,z:-1},end={x,y:1.6,z:3.8};
      const point={x:source.x+fraction*(end.x-source.x),y:source.y+fraction*(end.y-source.y),z:source.z+fraction*(end.z-source.z)};
      const projected=projectPoint(source,point,plane)!;
      expect(Math.hypot(projected.x-end.x,projected.y-end.y,projected.z-end.z)).toBeLessThan(1e-10);
    }
  });
  test.each([
    [{x:0,y:0,z:6},{x:0,y:0,z:2}],
    [{x:0,y:0,z:0},{x:1,y:0,z:0}],
    [{x:0,y:0,z:0},{x:0,y:0,z:7}],
    [{x:0,y:0,z:0},{x:0,y:0,z:-2}],
    [{x:NaN,y:0,z:0},{x:0,y:0,z:2}],
  ])('degenerate, parallel, behind and nonfinite rays fail closed (%#)',(source,point)=>{
    expect(projectPoint(source,point,LIGHT_RECEIVER)).toBeUndefined();
    const result=projectSilhouette(source,[[point,{...point,x:1},{...point,y:1}]],LIGHT_RECEIVER,LIGHT_WINDOWS);
    expect(result.valid).toBe(false);expect(result.canLock).toBe(false);expect(result.windows.every(w=>!w.lit)).toBe(true);
  });
  test('a triangulated connected silhouette partitions its area and clips opaque polygons inside the receiver',()=>{
    expect(COAT_TRIANGLES).toHaveLength(COAT_OUTLINE.length-2);
    expect(COAT_TRIANGLES.reduce((sum,t)=>sum+polygonArea(t),0)).toBeCloseTo(polygonArea(COAT_OUTLINE),12);
    for(const s of [-1,-.5,0,.5,1])for(const polygon of evaluateLight(s).polygons)for(const p of polygon){
      expect(p.x).toBeGreaterThanOrEqual(LIGHT_RECEIVER.bounds.minX-1e-9);expect(p.x).toBeLessThanOrEqual(LIGHT_RECEIVER.bounds.maxX+1e-9);
      expect(p.y).toBeGreaterThanOrEqual(0-1e-9);expect(p.y).toBeLessThanOrEqual(LIGHT_RECEIVER.bounds.maxY+1e-9);
    }
  });
  test('two-thousand-step sweep begins fully shaded and has two broad comfortable success intervals',()=>{
    const first=evaluateLight(0);expect(first.windows.map(w=>w.coverage)).toEqual([1,1]);
    const intervals:[number,number][]=[];let start:number|undefined;
    for(let i=0;i<=2000;i++){
      const s=-1+i*.001,r=evaluateLight(s);expect(r.valid).toBe(true);
      expect(r.canLock).toBe(r.windows.every(w=>w.lit));
      if(r.canLock&&start===undefined)start=s;
      if(start!==undefined&&(!r.canLock||i===2000)){intervals.push([start,r.canLock?s:s-.001]);start=undefined;}
    }
    expect(intervals).toHaveLength(2);expect(intervals[0]![1]-intervals[0]![0]).toBeGreaterThan(.24);expect(intervals[1]![1]-intervals[1]![0]).toBeGreaterThan(.49);
    expect(evaluateLight(-.9).canLock).toBe(true);expect(evaluateLight(.65).canLock).toBe(true);
  });
  test('window area agrees with independent rays at narrow and partial edge shadows',()=>{
    for(const s of [-.75,-.74,-.5,0,.25,.48,.492,.5]){
      const result=evaluateLight(s);
      for(let i=0;i<2;i++)expect(Math.abs(result.windows[i]!.coverage-sampledCoverage(lightSource(s),LIGHT_WINDOWS[i]!))).toBeLessThan(.012);
    }
  });
  test('a thin shadow missing the window center still blocks the 2% area criterion',()=>{
    const triangles:Triangle3[]=[[{x:0,y:0,z:2},{x:.015,y:0,z:2},{x:.015,y:.5,z:2}],[{x:0,y:0,z:2},{x:.015,y:.5,z:2},{x:0,y:.5,z:2}]];
    const plane:ReceiverPlane={...LIGHT_RECEIVER,point:{x:0,y:0,z:4},bounds:{minX:-1,maxX:4,minY:-1,maxY:2}};
    const windows:ReceiverWindow[]=[{id:'left',minX:0,maxX:1,minY:0,maxY:1},{id:'right',minX:2,maxX:3,minY:0,maxY:1}],source={x:0,y:0,z:0};
    expect(blocked(source,{x:.5,y:.5,z:4},triangles)).toBe(false);
    const result=projectSilhouette(source,triangles,plane,windows);
    expect(result.windows[0]!.coverage).toBeCloseTo(.03,10);expect(result.windows[0]!.coverage).toBeGreaterThan(MAX_WINDOW_COVERAGE);expect(result.canLock).toBe(false);
    expect(sampledCoverage(source,windows[0]!,triangles,4)).toBeCloseTo(.03,10);
  });
  test('world translation/uniform scale preserves canonical window coverage and the cache cannot be mutated',()=>{
    const s=.3,r=evaluateLight(s),scale=.55;
    const scaleBounds=(w:ReceiverWindow)=>({...w,minX:w.minX*scale,maxX:w.maxX*scale,minY:w.minY*scale,maxY:w.maxY*scale});
    const plane={...LIGHT_RECEIVER,point:opticalWorldPoint(LIGHT_RECEIVER.point),bounds:scaleBounds({...LIGHT_RECEIVER.bounds,id:'left'})};
    const world=projectSilhouette(opticalWorldPoint(lightSource(s)),COAT_TRIANGLES.map(t=>t.map(opticalWorldPoint) as unknown as Triangle3),plane,LIGHT_WINDOWS.map(scaleBounds));
    world.windows.forEach((w,i)=>expect(w.coverage).toBeCloseTo(r.windows[i]!.coverage,12));
    expect(evaluateLight(s)).toBe(r);expect(Object.isFrozen(r)).toBe(true);expect(Object.isFrozen(r.polygons[0])).toBe(true);expect(Object.isFrozen(r.windows[0])).toBe(true);
    expect(evaluateLight(NaN).canLock).toBe(false);expect(evaluateLight(1.001).canLock).toBe(false);
  });
});
