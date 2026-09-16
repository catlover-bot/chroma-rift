import * as THREE from 'three';

type Section = { y: number; rx: number; rz: number; x?: number; z?: number };
type Surface = 'cloth' | 'cast' | 'leather';
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Editable cross sections, continuous ring topology, explicit UVs and authored
 * seam/fold shading. No texture upload, loader, skeleton package or frame work. */
function loft(name: string, sections: readonly Section[], radial: number, bands: number, surface: Surface = 'cloth') {
  const vertices: number[] = [], uv: number[] = [], colors: number[] = [], indices: number[] = [];
  for (let row = 0; row <= bands; row++) {
    const v = row / bands, segment = Math.min(sections.length - 2, Math.floor(v * (sections.length - 1)));
    const a = sections[segment]!, b = sections[segment + 1]!, t = smooth(v * (sections.length - 1) - segment);
    const mix = (a: number, b: number) => a + (b - a) * t;
    const y = mix(a.y, b.y), rx = mix(a.rx, b.rx), rz = mix(a.rz, b.rz);
    for (let edge = 0; edge <= radial; edge++) {
      const u = edge / radial, angle = u * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle);
      const fold = surface === 'cloth' ? 1 + .036 * Math.cos(angle * 7 + v * 1.6) * Math.sin(v * Math.PI) : 1;
      const seam = surface === 'cloth' ? Math.pow(Math.max(0, -s), 18) * Math.exp(-c * c * 160) : 0;
      vertices.push(mix(a.x ?? 0, b.x ?? 0) + c * rx * fold, y,
        mix(a.z ?? 0, b.z ?? 0) + s * rz * fold + seam * .002);
      uv.push(u, v);
      const shade = surface === 'cloth' ? .79 + .12 * Math.cos(angle * 7 + v * 1.6) * Math.sin(v * Math.PI) - seam * .13
        : surface === 'leather' ? .8 + .13 * v : .91 + .05 * Math.cos(angle * 3 + v * 8);
      colors.push(shade, shade, shade);
    }
  }
  for (let row = 0; row < bands; row++) for (let edge = 0; edge < radial; edge++) {
    const a = row * (radial + 1) + edge, b = a + radial + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  for (const end of [0, bands]) {
    const section = sections[end === 0 ? 0 : sections.length - 1]!, center = vertices.length / 3;
    vertices.push(section.x ?? 0, section.y, section.z ?? 0); uv.push(.5, end / bands); colors.push(.7, .7, .7);
    for (let edge = 0; edge < radial; edge++) {
      const a = end * (radial + 1) + edge;
      if (end === 0) indices.push(center, a, a + 1); else indices.push(center, a + 1, a);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.name = name;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
function combine(name: string, parts: THREE.BufferGeometry[]) {
  const p: number[] = [], n: number[] = [], uv: number[] = [], c: number[] = [], indices: number[] = [];
  for (const g of parts) {
    const offset = p.length / 3, position = g.getAttribute('position'), normal = g.getAttribute('normal');
    const tex = g.getAttribute('uv'), color = g.getAttribute('color');
    for (let i = 0; i < position.count; i++) {
      p.push(position.getX(i), position.getY(i), position.getZ(i)); n.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      uv.push(tex?.getX(i) ?? 0, tex?.getY(i) ?? 0); c.push(color?.getX(i) ?? 1, color?.getY(i) ?? 1, color?.getZ(i) ?? 1);
    }
    for (let i = 0; i < (g.index?.count ?? position.count); i++) indices.push(offset + (g.index?.getX(i) ?? i));
    g.dispose();
  }
  const g = new THREE.BufferGeometry(); g.name = name;
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.setIndex(indices); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}
function panel(points: readonly (readonly [number, number])[], z: number, low: boolean) {
  const shape = new THREE.Shape(); points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: .007, bevelEnabled: true, bevelThickness: .002, bevelSize: .003, bevelSegments: low ? 1 : 3, steps: 1 });
  g.translate(0, 0, z); return g;
}
function hand(side: -1 | 1, low: boolean) {
  const radial = low ? 8 : 16, bands = low ? 5 : 10;
  const palm = loft('cast-palm', [{ y: -.115, rx: .036, rz: .019, z: -.006 }, { y: -.075, rx: .044, rz: .024 },
    { y: -.025, rx: .032, rz: .023 }, { y: .013, rx: .025, rz: .021 }], radial, bands, 'cast');
  const parts = [palm];
  for (let finger = 0; finger < 4; finger++) {
    const x = (finger - 1.5) * .021, length = [.068, .092, .084, .06][finger]!;
    parts.push(loft('cast-finger', [{ y: -.102 - length, rx: .004, rz: .004, x, z: -.029 },
      { y: -.095 - length * .7, rx: .008, rz: .009, x, z: -.027 },
      { y: -.105, rx: .010, rz: .012, x, z: -.005 }, { y: -.082, rx: .009, rz: .012, x, z: .001 }], low ? 6 : 10, low ? 4 : 8, 'cast'));
  }
  parts.push(loft('cast-thumb', [{ y: -.101, rx: .006, rz: .008, x: side * .051, z: -.041 },
    { y: -.070, rx: .010, rz: .012, x: side * .061, z: -.026 }, { y: -.037, rx: .015, rz: .018, x: side * .039 }], low ? 6 : 10, low ? 4 : 8, 'cast'));
  return combine('patrol-cast-hand-' + side, parts);
}
/** A separate owned copy keeps actor paint/UVs away from the untouched illusion
 * mask/control. Source geometry remains Wael Tsar / cmglee, CC BY 4.0; see NOTICE. */
function paintedFace(source: THREE.BufferGeometry) {
  const g = source.clone(), p = g.getAttribute('position'), colors: number[] = [], uv: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const eye = Math.exp(-((Math.abs(x) - .15) ** 2 / .0025 + (y - .09) ** 2 / .0018));
    const mouth = Math.exp(-(x * x / .007 + (y + .21) ** 2 / .0007));
    const crack = Math.abs(x - (.22 + .018 * Math.sin(y * 46))) < .004 && y > -.06 && y < .30 ? .22 : 0;
    const shade = .96 - eye * .52 - mouth * .34 - crack;
    colors.push(shade, shade * .985, shade * .94); uv.push(x / .81 + .5, y + .5);
  }
  g.name = 'licensed-convex-patrol-mask-matte-cast-paint';
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return g;
}
export function createActorArtResources(low: boolean, faceSource: THREE.BufferGeometry) {
  const radial = low ? 20 : 48, bands = low ? 12 : 28;
  const coatSections: Section[] = [
    { y: .62, rx: .235, rz: .165, z: .034 }, { y: .70, rx: .252, rz: .177, z: .03 },
    { y: .98, rx: .224, rz: .174, z: .027 }, { y: 1.20, rx: .226, rz: .155, z: .018 },
    { y: 1.46, rx: .274, rz: .175, x: -.009 }, { y: 1.57, rx: .282, rz: .146, x: -.012 },
    { y: 1.65, rx: .215, rz: .114, x: -.016 }, { y: 1.72, rx: .12, rz: .088, x: .004 },
    { y: 1.79, rx: .093, rz: .071, x: .009 }, { y: 1.81, rx: .085, rz: .068, x: .009 },
  ];
  const coatPanel = (points: readonly (readonly [number, number])[]) => {
    // Subdivide the facing before wrapping it around the chest. A four-corner
    // flat polygon would cut through the coat between its fitted corners.
    const divisions = low ? 4 : 10, positions: number[] = [], uv: number[] = [], indices: number[] = [];
    for (let layer = 0; layer < 2; layer++) for (let row = 0; row <= divisions; row++) for (let edge = 0; edge <= divisions; edge++) {
      const u = edge / divisions, v = row / divisions;
      const a = points[0]!, b = points[1]!, c = points[2]!, d = points[3]!;
      const x = (a[0] * (1-u) + b[0]*u)*(1-v) + (d[0]*(1-u)+c[0]*u)*v;
      const y = (a[1] * (1-u) + b[1]*u)*(1-v) + (d[1]*(1-u)+c[1]*u)*v;
      const index = Math.max(0, coatSections.findIndex(section => section.y >= y) - 1);
      const first = coatSections[index]!, next = coatSections[index + 1]!;
      const t = Math.max(0, Math.min(1, (y - first.y) / (next.y - first.y)));
      const rx = first.rx + (next.rx - first.rx) * t, rz = first.rz + (next.rz - first.rz) * t;
      const cx = (first.x ?? 0) + ((next.x ?? 0) - (first.x ?? 0)) * t, cz = (first.z ?? 0) + ((next.z ?? 0) - (first.z ?? 0)) * t;
      positions.push(x, y, cz-rz*Math.sqrt(Math.max(.015,1-((x-cx)/rx)**2))-.009-layer*.006); uv.push(u,v);
    }
    const count = (divisions+1)**2;
    for (let row=0; row<divisions; row++) for(let edge=0; edge<divisions; edge++) {
      const a=row*(divisions+1)+edge,b=a+1,c=a+divisions+1,d=c+1;
      indices.push(a,b,c,b,d,c,a+count,c+count,b+count,b+count,c+count,d+count);
    }
    const edge = (a:number,b:number) => indices.push(a,a+count,b,b,a+count,b+count);
    for(let i=0;i<divisions;i++) {edge(i,i+1);edge(count-1-i,count-2-i);edge(i*(divisions+1),(i+1)*(divisions+1));edge((i+1)*(divisions+1)-1,(i+2)*(divisions+1)-1);}
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
  };
  const coat = loft('patrol-continuous-hem-shoulder-collar', coatSections, radial, bands); coat.translate(0, -1.23, 0);
  const lapels = combine('patrol-offset-lapels-and-repaired-pocket', [
    coatPanel([[-.098,1.73],[-.211,1.59],[-.118,1.33],[-.022,1.48]]),
    coatPanel([[.074,1.73],[.177,1.60],[.083,1.41],[.012,1.49]]),
    coatPanel([[-.175,1.05],[-.066,1.04],[-.066,1.17],[-.179,1.18]]),
  ]); lapels.translate(0, -1.23, 0);
  const hardwareParts: THREE.BufferGeometry[] = [];
  for (const y of [1.37, 1.23, 1.09]) hardwareParts.push(loft('coat-button', [{y:-.004,rx:.012,rz:.012},{y:.004,rx:.012,rz:.012}], low?6:12, 2, 'cast').rotateX(Math.PI / 2).translate(.025,y-1.23,-.174));
  hardwareParts.push(coatPanel([[.085,1.34],[.151,1.34],[.151,1.38],[.085,1.38]]).translate(0,-1.23,0));
  const hardware = combine('patrol-original-guide-badge-and-fasteners',hardwareParts);
  const upperSleeve = loft('patrol-tailored-upper-sleeve', [{y:-.405,rx:.058,rz:.063},{y:-.33,rx:.069,rz:.07},{y:-.19,rx:.079,rz:.081},{y:-.06,rx:.091,rz:.092},{y:.028,rx:.047,rz:.052}],low?12:24,low?9:22);
  const foreSleeve = loft('patrol-folded-fore-sleeve-and-cuff', [{y:-.342,rx:.046,rz:.049},{y:-.319,rx:.052,rz:.055},{y:-.293,rx:.045,rz:.048},{y:-.19,rx:.052,rz:.057},{y:-.02,rx:.061,rz:.067},{y:.035,rx:.053,rz:.058}],low?12:24,low?8:20);
  const thigh = loft('patrol-weighted-trouser-thigh', [{y:-.5,rx:.060,rz:.063},{y:-.28,rx:.068,rz:.077},{y:.28,rx:.079,rz:.093},{y:.5,rx:.084,rz:.094}],low?10:20,low?6:16);
  const shin = loft('patrol-trouser-calf-to-boot', [{y:-.5,rx:.047,rz:.052},{y:-.35,rx:.050,rz:.058},{y:.12,rx:.058,rz:.067},{y:.5,rx:.061,rz:.064}],low?10:20,low?6:16);
  const shoe = loft('patrol-shaped-leather-shoe-and-sole', [{y:0,rx:.065,rz:.126,z:-.004},{y:.014,rx:.070,rz:.132,z:-.002},{y:.035,rx:.068,rz:.126,z:-.006},{y:.08,rx:.062,rz:.12,z:-.009},{y:.13,rx:.052,rz:.087,z:.018},{y:.185,rx:.047,rz:.055,z:.024}],low?14:28,low?7:16,'leather');
  const shell = loft('patrol-fitted-mask-back-shell', [{y:-.19,rx:.034,rz:.028,z:.025},{y:-.13,rx:.123,rz:.083,z:.048},{y:.08,rx:.155,rz:.096,z:.045},{y:.18,rx:.105,rz:.067,z:.038},{y:.2,rx:.027,rz:.024,z:.025}],low?16:28,low?8:18,'leather'); shell.translate(0,0,-.03);
  const maskFasteners = combine('patrol-mask-repair-straps', [panel([[.135,-.105],[.154,-.086],[.146,.049],[.13,.045]], -.049, low), panel([[-.149,-.045],[-.131,-.039],[-.13,.074],[-.148,.070]],-.049,low)]);
  const face = paintedFace(faceSource), leftHand = hand(-1,low), rightHand=hand(1,low);
  const contact = new THREE.BufferGeometry(), contactPosition: number[] = [], contactColor: number[] = [], contactUV: number[] = [], contactIndices: number[] = [];
  const contactSegments = low ? 12 : 20;
  for (let ring = 0; ring <= 3; ring++) for (let i = 0; i <= contactSegments; i++) {
    const angle = i / contactSegments * Math.PI * 2, radius = ring / 3;
    contactPosition.push(Math.cos(angle)*.09*radius,.002,Math.sin(angle)*.155*radius);
    contactColor.push(1,1,1,.22*(1-radius)**2);contactUV.push(.5+Math.cos(angle)*radius*.5,.5+Math.sin(angle)*radius*.5);
  }
  for(let ring=0;ring<3;ring++)for(let i=0;i<contactSegments;i++){const a=ring*(contactSegments+1)+i,b=a+contactSegments+1;contactIndices.push(a,a+1,b,a+1,b+1,b);}
  contact.name='patrol-foot-contact-vertex-alpha';contact.setAttribute('position',new THREE.Float32BufferAttribute(contactPosition,3));contact.setAttribute('color',new THREE.Float32BufferAttribute(contactColor,4));contact.setAttribute('uv',new THREE.Float32BufferAttribute(contactUV,2));contact.setIndex(contactIndices);contact.computeVertexNormals();contact.computeBoundingBox();contact.computeBoundingSphere();
  const geometries = {contact,coat,lapels,hardware,upperSleeve,foreSleeve,thigh,shin,shoe,shell,maskFasteners,face,leftHand,rightHand};
  const material = (name: string,color: string,roughness: number,metalness=0) => {const m=new THREE.MeshStandardMaterial({color,roughness,metalness,vertexColors:true});m.name=name;return m;};
  const contactMaterial = new THREE.MeshBasicMaterial({color:'#141b17',vertexColors:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});contactMaterial.name='patrol-soft-foot-contact';
  const materials = { contact:contactMaterial, cloth:material('patrol-heavy-woven-coat','#555d55',.96), facing:material('patrol-repaired-collar-and-cuff','#77786b',.94),
    trousers:material('patrol-charcoal-trousers','#41483f',.98), cast:material('patrol-matte-cast-mask','#c7c1aa',.91), leather:material('patrol-worn-shoe-leather','#333a33',.83), hardware:material('patrol-oxidized-guide-fittings','#827760',.72,.55)};
  let disposed=false;
  return {low,geometries,materials,dispose(){if(disposed)return;disposed=true;Object.values(geometries).forEach(g=>g.dispose());Object.values(materials).forEach(m=>m.dispose());}};
}
export type ActorArtResources = ReturnType<typeof createActorArtResources>;
