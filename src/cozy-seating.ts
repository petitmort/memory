import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createBeanbagFabric } from "./beanbag-fabric";

/** A gravity-filled cotton cover, in metres, facing local +Z. */
export function createCozySeating() {
  const group = new THREE.Group();
  group.name = "oatmeal-linen-beanbag";
  const fabric = createBeanbagFabric();
  const { shell: linen, cushion: cushionLinen, seam: stitch } = fabric;
  const v = (x:number,y:number,z:number) => new THREE.Vector3(x,y,z);
  const smooth = (a:number,b:number,x:number) => THREE.MathUtils.smoothstep(x,a,b);
  const gaussian = (x:number,centre:number,width:number) => Math.exp(-(((x-centre)/width)**2));
  const signedPower = (x:number,power:number) => Math.sign(x)*Math.abs(x)**power;
  const outlinePower = .56;
  const shoulderWidth = (back:number) => .400-.040*back;
  const outlineDepth = (front:boolean) => front?.366:.401;
  const add = (geometry:THREE.BufferGeometry,material:THREE.Material,name:string) => {
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;
    mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);return mesh;
  };

  function outline(angle:number,floor=false) {
    const s=Math.sin(angle),back=Math.max(0,-s);
    // The front slopes outward into a broad weighted base. It is not a tall
    // vertical bucket wall: the sitting edge sits behind the weighted hem.
    return v((floor?.479:shoulderWidth(back))*signedPower(Math.cos(angle),outlinePower),0,
      (floor?.433:outlineDepth(s>0))*signedPower(s,outlinePower));
  }
  function topPoint(radius:number,angle:number) {
    const r=radius;
    const edge=outline(angle),x=edge.x*r,z=edge.z*r;
    const back=smooth(.035,.365,-z);
    const side=smooth(.239,.398,Math.abs(x));
    let y=.335+.433*back+.130*side*(.52+.48*back)*(1-.89*back);
    // A broad, almost level rectangular back defines the reference chair.
    // Only the outer corners yield; rounding the whole crest makes an egg.
    y-=.042*back**2*smooth(.235,.355,Math.abs(x));
    y-=.004*back*gaussian(x,-.20,.11);
    y-=.024*smooth(.82,1,r)*(back+.68*side*(1-back));
    y+=.009*gaussian(x,-.025,.24)*gaussian(z,-.26,.14);
    // The lower and upper back are one cloth panel. A shallow compressed fold
    // gives its loose filling somewhere to settle, without floating pillows.
    y-=.005*gaussian(z,-.180,.026)*(1-smooth(.27,.36,Math.abs(x)));
    y-=.008*gaussian(Math.abs(x),.302,.018)*smooth(.10,.28,-z);
    const left=gaussian(angle,2.48-.22*(1-r),.046);
    const right=gaussian(angle,.65+.18*(1-r),.043);
    y-=.014*(left+right)*gaussian(r,.86,.19);
    y-=.007*gaussian(angle,2.98,.055)*gaussian(r,.82,.18);
    y+=.003*Math.sin(angle*3+.8)*smooth(.6,1,r);
    // On the steep back, cloth gathers displace along its outward normal,
    // rather than merely sliding vertices vertically along the same surface.
    const backFace=smooth(.07,.13,-z)*(1-smooth(.365,.402,-z));
    const panel=1-smooth(.270,.345,Math.abs(x));
    const pinch=.023*gaussian(z,-.180,.022);
    const upperFill=.045*gaussian(z,-.285,.078);
    const lumbarFill=.032*gaussian(z,-.120,.051);
    const leftTuck=.016*gaussian(x,-.276+.34*(z+.35),.020)*gaussian(z,-.322,.069);
    const rightTuck=.014*gaussian(x,.268-.28*(z+.35),.022)*gaussian(z,-.324,.072);
    const branching=.010*gaussian(x,-.192+.67*(z+.32),.015)*gaussian(z,-.29,.055);
    // Two wide, shallow filled zones share one continuous cover, with a
    // compressed waist between them instead of separate rigid cushions.
    const clothDepth=((upperFill+lumbarFill-pinch)*panel-leftTuck-rightTuck-branching)*backFace;
    return v(x,y,z+clothDepth);
  }
  function backPointAt(x:number,rawZ:number) {
    let angle=Math.atan2(signedPower(rawZ/.401,1/outlinePower),signedPower(x/.40,1/outlinePower));
    for(let i=0;i<5;i++) {
      const back=Math.max(0,-Math.sin(angle));
      angle=Math.atan2(signedPower(rawZ/outlineDepth(rawZ>0),1/outlinePower),
        signedPower(x/shoulderWidth(back),1/outlinePower));
    }
    const edge=outline(angle),radius=Math.abs(edge.x)>.02?x/edge.x:rawZ/edge.z;
    return topPoint(radius,angle);
  }
  function bodyHeightAt(x:number,z:number) {
    // Account for the puffed back's real depth when fitting the seat. This
    // authoring calculation runs once, never during animation or a click.
    let low=z-.075,high=z+.075;
    for(let i=0;i<14;i++) {
      const middle=(low+high)/2;
      if(backPointAt(x,middle).z<z)low=middle;else high=middle;
    }
    return backPointAt(x,(low+high)/2).y;
  }
  function sidePoint(t:number,angle:number) {
    const top=topPoint(1,angle),floor=outline(angle,true);
    const blend=smooth(0,1,t),normal=v(Math.cos(angle),0,Math.sin(angle));
    const point=top.clone().lerp(floor,blend);
    point.y=.001+(top.y-.001)*Math.cos(t*Math.PI/2)**1.55;
    // Modest broad bulges describe beads spreading under the weight. The few
    // narrower creases start at sewn corners and taper out within their panel.
    const spread=.024*(1-.36*Math.max(0,-Math.sin(angle)));
    point.addScaledVector(normal,spread*Math.sin(t*Math.PI));
    const gathers=(gaussian(angle,.65+.20*t,.042)
      +gaussian(angle,2.49-.16*t,.044))*.024*Math.sin(t*Math.PI)**.8;
    const branch=(gaussian(angle,.90+.32*t,.042)
      +gaussian(angle,2.20-.24*t,.040))*.010*gaussian(t,.29,.22);
    const front=smooth(.25,.85,Math.sin(angle));
    const compressed=(.009*gaussian(t,.69+.19*(angle-1.1),.035)*gaussian(angle,1.05,.47)
      +.006*gaussian(t,.83-.13*(angle-2.2),.028)*gaussian(angle,2.15,.35))*front;
    point.addScaledVector(normal,-gathers-branch-compressed);
    point.y-=.009*gaussian(t,.89,.11)*front*gaussian(angle,1.18,.8)*Math.sin(Math.PI*t);
    const weightedHem=(.004*gaussian(angle,.80,.28)-.002*gaussian(angle,1.55,.32)
      +.003*gaussian(angle,2.28,.24))*smooth(.7,1,t);
    point.addScaledVector(normal,weightedHem);
    return point;
  }

  function radialSurface(columns:number,topRings:number,sideRings:number,
    top:(r:number,a:number)=>THREE.Vector3,side:(t:number,a:number)=>THREE.Vector3,bottomY=.001) {
    const positions:number[]=[],uvs:number[]=[],indices:number[]=[],rings:number[]=[];
    const centre=top(0,0);positions.push(centre.x,centre.y,centre.z);uvs.push(.5,.5);
    // Inverse-power angles distribute samples around the actual rounded
    // outline: uniform input angles leave long, visibly faceted spans at axes.
    const angleAt=(column:number)=>{
      const a=column/columns*Math.PI*2;
      return Math.atan2(signedPower(Math.sin(a),1/outlinePower),signedPower(Math.cos(a),1/outlinePower));
    };
    // Unwrap the outer panel by actual arc length, keeping the weave at the
    // same sub-millimetre pitch as the sitting/back surfaces.
    const perimeter:number[]=[0];
    for(let c=1;c<=columns;c++)perimeter.push(perimeter[c-1]+side(.55,angleAt(c))
      .distanceTo(side(.55,angleAt(c-1))));
    function ring(point:(a:number)=>THREE.Vector3,isSide:boolean) {
      const start=positions.length/3;rings.push(start);
      for(let c=0;c<=columns;c++) {
        const angle=angleAt(c),p=point(angle);positions.push(p.x,p.y,p.z);
        if(isSide)uvs.push(perimeter[c]*2,side(0,angle).distanceTo(p)*2);
        else uvs.push(p.x*2+.5,p.z*2+.5);
      }
    }
    for(let row=1;row<=topRings;row++)ring(a=>top(row/topRings,a),false);
    // Separate panel UVs at the shoulder; the coincident rim shares normals.
    ring(a=>side(0,a),true);
    for(let row=1;row<=sideRings;row++)ring(a=>side(row/sideRings,a),true);
    for(let c=0;c<columns;c++)indices.push(0,rings[0]+c+1,rings[0]+c);
    for(let row=0;row<rings.length-1;row++)for(let c=0;c<columns;c++) {
      if(row===topRings-1)continue;
      const a=rings[row]+c,b=rings[row+1]+c;indices.push(a,b+1,b,a,a+1,b+1);
    }
    const bottom=positions.length/3;positions.push(0,bottomY,0);uvs.push(.5,.5);
    for(let c=0;c<columns;c++)indices.push(rings.at(-1)!+c,rings.at(-1)!+c+1,bottom);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const normals=geometry.getAttribute("normal");
    for(const start of rings) {
      const normal=v(0,0,0).fromBufferAttribute(normals,start)
        .add(v(0,0,0).fromBufferAttribute(normals,start+columns)).normalize();
      normals.setXYZ(start,normal.x,normal.y,normal.z);
      normals.setXYZ(start+columns,normal.x,normal.y,normal.z);
    }
    for(let c=0;c<=columns;c++) {
      const a=rings[topRings-1]+c,b=rings[topRings]+c;
      const n=v(0,0,0).fromBufferAttribute(normals,a).add(v(0,0,0).fromBufferAttribute(normals,b)).normalize();
      normals.setXYZ(a,n.x,n.y,n.z);normals.setXYZ(b,n.x,n.y,n.z);
    }
    return geometry;
  }
  const bodyMesh=add(radialSurface(112,28,24,topPoint,sidePoint),linen,"beanbag-soft-linen-shell");

  // A low, supple sitting panel sinks into the same filling. Its rolled front
  // is broad and drops gently, rather than a narrow rim above a hollow shell.
  function seatTop(radius:number,angle:number) {
    const x=.332*signedPower(Math.cos(angle),.56)*radius;
    const z=.140+.240*signedPower(Math.sin(angle),.56)*radius;
    const front=smooth(.14,.37,z),edge=smooth(.70,1,radius);
    const pressure=.006*gaussian(x,-.025,.20)*gaussian(z,.142,.21);
    const floating=.348-pressure-.009*front*edge;
    const fitted=bodyHeightAt(x,z)+.0035;
    const difference=floating-fitted;
    // Keep the entire cloth panel above the filling, including the transition
    // into the back. Blending a lower seat through the shell creates a hard cut.
    let y=(floating+fitted+Math.sqrt(difference*difference+.002*.002))/2;
    y-=.009*(gaussian(x,-.274+.25*(z-.12),.017)
      +gaussian(x,.272-.19*(z-.14),.020))*smooth(.11,.29,z)*(1-smooth(.90,1,radius));
    y-=.005*gaussian(z,-.20,.020)*smooth(.15,.32,Math.abs(x));
    return v(x,y,z);
  }
  function seatSide(t:number,angle:number) {
    const top=seatTop(1,angle),point=top.clone();
    const roll=Math.sin(t*Math.PI)*.009;
    point.x+=Math.cos(angle)*roll;point.z+=Math.sin(angle)*roll;
    point.y-=.019*(1-Math.cos(t*Math.PI))/2;
    return point;
  }
  add(radialSurface(64,10,5,seatTop,seatSide,.323),cushionLinen,"beanbag-yielding-seat-cushion");

  const seams:THREE.BufferGeometry[]=[];
  function seam(points:THREE.Vector3[],closed=false,radius=.0009,segments=48) {
    seams.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,closed,"centripetal"),
      segments,radius,4,closed));
  }
  const hem:THREE.Vector3[]=[],seatJoin:THREE.Vector3[]=[];
  for(let i=0;i<112;i++)hem.push(sidePoint(.91,i/112*Math.PI*2));
  for(let i=0;i<64;i++)seatJoin.push(seatSide(.63,i/64*Math.PI*2));
  seam(hem,true,.00085,80);seam(seatJoin,true,.00055,72);
  // The reference has one quiet horizontal join dividing upper and lumbar
  // filling. Fit the thread to the actual tessellated cover, not a floating pad.
  const waist:THREE.Vector3[]=[],seamRay=new THREE.Raycaster();
  bodyMesh.updateMatrixWorld(true);
  for(let i=0;i<=40;i++) {
    const x=-.274+i/40*.548,p=backPointAt(x,-.180+.0015*Math.sin(x*13));
    seamRay.set(v(x,p.y,.60),v(0,0,-1));
    const hit=seamRay.intersectObject(bodyMesh,false)[0];
    if(hit)waist.push(hit.point.addScaledVector(hit.face!.normal,.0007));
  }
  if(waist.length>2)seam(waist,false,.00055,40);
  for(const angle of [.65,2.49]) {
    const points:THREE.Vector3[]=[];
    for(let i=0;i<=28;i++) {
      const t=i/28*.90,p=sidePoint(t,angle+(angle<1?1:-1)*.18*t);
      p.add(v(Math.cos(angle)*.0008,0,Math.sin(angle)*.0008));points.push(p);
    }
    seam(points,false,.0008,36);
  }
  add(mergeGeometries(seams)!,stitch,"beanbag-tailored-panel-seams");
  for(const geometry of seams)geometry.dispose();

  const catNest=new THREE.Group();catNest.name="beanbag-cat-nest";
  catNest.position.set(-.025,.342,.142);group.add(catNest);
  return {group,catNest,ready:fabric.ready,dispose:fabric.dispose};
}
