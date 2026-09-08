import { AMES_FACES,AMES_OBSERVATION_POINTS,AMES_PROPS,AMES_REFERENCE_VERTICES,AMES_SPEC,AMES_VERTICES,amesWorldPoint } from '../perspectiveExhibit';
import { createTheatreRuntime } from '../runtime';
import { getTheatreWorld } from '../world';
import { isSafePose,segmentOccluded } from '../../firstPerson/geometry';
import { THEATRE_CHECKPOINTS } from '../definition';
const cross=(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number})=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const sub=(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number})=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dot=(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number})=>a.x*b.x+a.y*b.y+a.z*b.z;
describe('true fixed Ames exhibit',()=>{
  test('all front/back/floor/ceiling vertices preserve ordinary-room reference projection with actual skew',()=>{
    AMES_VERTICES.forEach((v,i)=>{const p=AMES_REFERENCE_VERTICES[i]!;expect(v.x/v.z).toBeCloseTo(p.x/p.z,12);expect((v.y-1.6)/v.z).toBeCloseTo((p.y-1.6)/p.z,12);});
    expect(AMES_VERTICES[5]!.z/AMES_VERTICES[4]!.z).toBeGreaterThan(1.9);
    expect(Math.abs(AMES_VERTICES[5]!.y-AMES_VERTICES[4]!.y)).toBeGreaterThan(.7);
    expect(Math.abs(AMES_VERTICES[6]!.y-AMES_VERTICES[7]!.y)).toBeGreaterThan(.8);
  });
  test('six outward planar faces form a closed finite solid',()=>{
    const center=AMES_VERTICES.reduce((s,p)=>({x:s.x+p.x/8,y:s.y+p.y/8,z:s.z+p.z/8}),{x:0,y:0,z:0}),edges=new Map<string,number>();
    for(const face of AMES_FACES){
      const [a,b,c,d]=face.indices.map(i=>AMES_VERTICES[i]!) as [typeof center,typeof center,typeof center,typeof center];
      const n=cross(sub(b,a),sub(c,a));expect(dot(n,sub(a,center))).toBeGreaterThan(0);expect(Math.abs(dot(n,sub(d,a)))).toBeLessThan(1e-9);
      face.indices.forEach((a,i)=>{const b=face.indices[(i+1)%4]!,key=[a,b].sort().join('/');edges.set(key,(edges.get(key)??0)+1);});
    }
    expect([...edges.values()].every(n=>n===2)).toBe(true);expect(AMES_VERTICES.every(v=>Object.values(v).every(Number.isFinite)&&v.y>=0)).toBe(true);
  });
  test('two rigid props share true dimensions/scale but have clearly different projected heights',()=>{
    const [a,b]=AMES_PROPS;expect(a!.size).toEqual(b!.size);expect(a!.scale).toEqual({x:1,y:1,z:1});expect(b!.scale).toEqual(a!.scale);
    expect((AMES_SPEC.propHeight/a!.localPosition.z)/(AMES_SPEC.propHeight/b!.localPosition.z)).toBeGreaterThan(1.6);
    const before=JSON.stringify({vertices:AMES_VERTICES,props:AMES_PROPS});
    for(const view of Object.values(AMES_OBSERVATION_POINTS))expect(view.position.y).toBe(1.6);
    expect(JSON.stringify({vertices:AMES_VERTICES,props:AMES_PROPS})).toBe(before);
  });
  test('authored front opening exposes the actual room and the side shutter is the removable opaque blocker',()=>{
    const r=createTheatreRuntime(),world=getTheatreWorld(r),front=AMES_OBSERVATION_POINTS.front.position,side=AMES_OBSERVATION_POINTS.side.position;
    for(const p of AMES_VERTICES)expect(segmentOccluded(front,amesWorldPoint(p),world)).toBe(false);
    for(const p of AMES_PROPS){const target={...p.position,y:p.position.y+p.size.y*.7};expect(segmentOccluded(side,target,world)).toBe(true);}
    const opened={...r,progress:{...r.progress,theatre:{...r.progress.theatre!,inspectionShutterOpen:true}}};
    for(const p of AMES_PROPS){const target={...p.position,y:p.position.y+p.size.y*.7};expect(segmentOccluded(side,target,getTheatreWorld(opened))).toBe(false);}
  });
  test('outside inspection/entry/booth checkpoints use supported flat navigation; actual exhibit remains nonwalkable',()=>{
    const r=createTheatreRuntime(),world=getTheatreWorld(r);
    for(const pose of Object.values(AMES_OBSERVATION_POINTS))expect(isSafePose(pose,world)).toBe(true);
    for(const pose of Object.values(THEATRE_CHECKPOINTS))expect(isSafePose(pose,world)).toBe(true);
    expect(isSafePose({position:{x:-8,y:1.6,z:7},yaw:0,pitch:0},world)).toBe(false);
  });
});
