import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ornamentFactory } from './ornaments';
import type { Blessing } from './types';

const TAU = Math.PI * 2;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function random(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function ornamentPosition(seed: number) {
  const rand = random(seed), h = .13 + rand() * .72;
  const angle = h * TAU * 3.65;
  const radius = (1 - h) * 2.14;
  return new THREE.Vector3(Math.cos(angle) * radius, -2.55 + h * 5.7 - .33, Math.sin(angle) * radius);
}

export class TreeScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(45, 1, .1, 100);
  private tree = new THREE.Group();
  private ornamentGroup = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private clock = new THREE.Clock();
  private materials: THREE.ShaderMaterial[] = [];
  private records: Blessing[] = [];
  private ornaments = new Map<string, THREE.Group>();
  private pickMeshes: THREE.Object3D[] = [];
  private pointers = new Map<number, {x: number; y: number}>();
  private press = { x: 0, y: 0, time: 0, moved: false, pinched: false };
  private pinchDistance = 0;
  private rotationTarget = .22;
  private panTarget = new THREE.Vector2();
  private pan = new THREE.Vector2();
  private zoomTarget = .93;
  private zoom = .93;
  private baseDistance = 11;
  private focusId: string | null = null;
  private focusUntil = 0;
  private closeup = false;
  private wishOpen = false;
  private focusDepth = 0;
  private lastInteraction = 0;
  private stars: THREE.Points;
  private star: THREE.Sprite;
  private running = true;
  private frame = 0;
  private lastFrame = 0;
  private paused = false;
  private mobile = innerWidth < 700;
  private highlightGeometry = new THREE.PlaneGeometry(.9, .9);
  private highlightMaterial: THREE.MeshBasicMaterial;

  constructor(private canvas: HTMLCanvasElement, private onSelect: (id: string) => void) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x030305);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.6 : 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .95;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const environment = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(environment, .04).texture;
    environment.dispose(); pmrem.dispose();
    this.scene.add(new THREE.AmbientLight(0xf1edff, .6));
    const key = new THREE.DirectionalLight(0xffedf4, 1.7); key.position.set(-3, 6, 5); this.scene.add(key);
    const pink = new THREE.PointLight(0xffbbda, 6, 15); pink.position.set(2, 0, 3); this.scene.add(pink);
    const rim = new THREE.DirectionalLight(0xc1cbff, 1.1); rim.position.set(3, 2, -2); this.scene.add(rim);
    this.scene.add(this.tree); this.tree.scale.set(1,1,1); this.tree.add(this.ornamentGroup);
    this.createTree();
    this.stars = this.createStars(); this.scene.add(this.stars);
    const starTexture = this.makeGlow(false);
    const starCanvas = starTexture.image as HTMLCanvasElement;
    const starContext = starCanvas.getContext('2d')!;
    // Ten triangular gold facets meet at a luminous raised center.
    const vertices = Array.from({ length: 10 }, (_, i) => {
      const angle = -Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? 40 : 100;
      return { x: 128 + Math.cos(angle) * radius, y: 128 + Math.sin(angle) * radius };
    });
    const outline = () => {
      starContext.beginPath();
      vertices.forEach((v, i) => { if (i) starContext.lineTo(v.x, v.y); else starContext.moveTo(v.x, v.y); });
      starContext.closePath();
    };
    outline(); starContext.shadowColor = '#ffdcb5'; starContext.shadowBlur = 16;
    starContext.fillStyle = '#e88b12'; starContext.fill(); starContext.shadowBlur = 0;
    for (let i = 0; i < 10; i++) {
      const v = vertices[i], next = vertices[(i + 1) % 10];
      const facet = starContext.createLinearGradient(128, 128, v.x, v.y);
      facet.addColorStop(0, '#fff5e5');
      facet.addColorStop(.35, i % 2 ? '#ffe4c6' : '#f8d3a9');
      facet.addColorStop(1, i % 2 ? '#efc492' : '#c99563');
      starContext.beginPath(); starContext.moveTo(128, 128);
      starContext.lineTo(v.x, v.y); starContext.lineTo(next.x, next.y); starContext.closePath();
      starContext.fillStyle = facet; starContext.fill();
      starContext.strokeStyle = 'rgba(255,238,215,.65)'; starContext.lineWidth = .9; starContext.stroke();
    }
    outline(); starContext.strokeStyle = '#ffe9cf'; starContext.lineWidth = 2.4;
    starContext.shadowColor = '#ffdbb5'; starContext.shadowBlur = 9; starContext.stroke();
    starContext.shadowBlur = 0;
    starContext.save(); outline(); starContext.clip();
    const glitter = random(2512);
    for (let i = 0; i < 180; i++) {
      const x = 28 + glitter() * 200, y = 28 + glitter() * 200;
      const size = .45 + glitter() * 1.2;
      starContext.fillStyle = i % 3 ? 'rgba(255,248,194,.8)' : '#fffef0';
      starContext.fillRect(x, y, size, size);
    }
    starContext.restore();
    const starShine = starContext.createRadialGradient(128, 128, 0, 128, 128, 38);
    starShine.addColorStop(0, 'rgba(255,255,246,1)');
    starShine.addColorStop(.18, 'rgba(255,252,216,.95)');
    starShine.addColorStop(1, 'rgba(255,225,193,0)');
    starContext.fillStyle = starShine; starContext.fillRect(90, 90, 76, 76);
    // A narrow radiant cross keeps the center brilliant without whitening the gold facets.
    starContext.save(); starContext.translate(128, 128);
    starContext.shadowColor = '#ffe1bf'; starContext.shadowBlur = 8;
    for (let ray = 0; ray < 4; ray++) {
      starContext.rotate(Math.PI / 2);
      const beam = starContext.createLinearGradient(0, 0, 0, -64);
      beam.addColorStop(0, 'rgba(255,255,224,1)');
      beam.addColorStop(.35, 'rgba(255,232,204,.7)');
      beam.addColorStop(1, 'rgba(255,218,178,0)');
      starContext.fillStyle = beam; starContext.beginPath();
      starContext.moveTo(-3, 0); starContext.lineTo(0, -64); starContext.lineTo(3, 0);
      starContext.closePath(); starContext.fill();
    }
    starContext.restore();
    starTexture.colorSpace = THREE.SRGBColorSpace;
    starTexture.needsUpdate = true;
    this.star = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture, color: 0xffffff, toneMapped: false, transparent: true, blending: THREE.NormalBlending, depthWrite: false }));
    this.star.position.set(0, 3.38, 0); this.star.scale.setScalar(1.0); this.tree.add(this.star);
    const floorGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.makeGlow(false), color: 0xffa4b8, opacity: .48, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    floorGlow.position.set(0, -2.72, .05); floorGlow.scale.set(4.8, .65, 1); this.tree.add(floorGlow);
    this.highlightMaterial = new THREE.MeshBasicMaterial({ map: this.makeGlow(false), color: 0xffdce9, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .4 });
    this.setBlessings([]); this.bindEvents(); this.resize(); this.animate();
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.paused = true; canvas.dispatchEvent(new CustomEvent('scene-error', { detail: '画面暂时中断，请刷新页面恢复' })); });
  }

  private makeGlow(star: boolean) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const c = canvas.getContext('2d')!;
    const glow = c.createRadialGradient(128, 128, 0, 128, 128, 125);
    glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(.07, 'rgba(255,250,255,.95)');
    glow.addColorStop(.22, 'rgba(255,225,244,.28)'); glow.addColorStop(.6, 'rgba(255,195,230,.05)'); glow.addColorStop(1, 'rgba(255,180,220,0)');
    c.fillStyle = glow; c.fillRect(0, 0, 256, 256);
    if (star) {
      c.translate(128, 128);
      for (let i = 0; i < 4; i++) {
        c.rotate(Math.PI / 4); c.fillStyle = i % 2 ? 'rgba(255,220,238,.55)' : 'rgba(255,245,250,1)';
        const length = i % 2 ? 65 : 116;
        c.beginPath(); c.moveTo(-length, 0); c.lineTo(-4, -2); c.lineTo(0, -length); c.lineTo(3, -3); c.lineTo(length, 0); c.lineTo(3, 2); c.lineTo(0, length); c.lineTo(-2, 3); c.closePath(); c.fill();
      }
    }
    return new THREE.CanvasTexture(canvas);
  }

  private points(positions: number[], colors: number[], sizes: number[], phases: number[], opacity = 1, maxSize = 7) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { uMax: {value:maxSize}, uTime: { value: 0 }, uDpr: { value: this.renderer.getPixelRatio() }, uOpacity: { value: opacity }, uFocus: { value: 0 }, uDepth: { value: 0 } },
      vertexShader: `attribute float aSize; attribute float aPhase; varying vec3 vColor; varying float vLight; varying float vBlur;
        uniform float uMax; uniform float uTime; uniform float uDpr; uniform float uFocus; uniform float uDepth;
        void main(){vColor=color; vLight=0.65+0.35*sin(uTime*1.1+aPhase);
        vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
        vLight *= mix(.42,1.,smoothstep(-1.8,1.8,(modelMatrix*vec4(position,1.)).z));
        vBlur=uFocus*min(abs(-mv.z-uDepth)*.7,1.);
        gl_PointSize=clamp(aSize*440.*uDpr/(-mv.z),1.2*uDpr,uMax*uDpr)+vBlur*3.*uDpr;}`,
      fragmentShader: `varying vec3 vColor; varying float vLight; varying float vBlur; uniform float uOpacity;
        void main(){vec2 p=gl_PointCoord*2.-1.; float r=dot(p,p); if(r>1.)discard;
        float core=exp(-r*9.); float halo=exp(-r*4.)*0.20;
        gl_FragColor=vec4(pow(vColor,vec3(.4545)),(core+halo)*vLight*uOpacity*mix(1.,.22,vBlur));}`,
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    this.materials.push(material);
    return new THREE.Points(geometry, material);
  }

  private createTree() {
    const rand = random(61504);
    // Three independent point clouds: suspended dust, a braided stream, and soft emissive halos.
    const dust = {p:[] as number[],c:[] as number[],s:[] as number[],t:[] as number[]};
    const stream = {p:[] as number[],c:[] as number[],s:[] as number[],t:[] as number[]};
    const halos = {p:[] as number[],c:[] as number[],s:[] as number[],t:[] as number[]};
    const palette = ['#ff80b5','#ffc78a','#dd518f','#ffe3b5'].map(c=>new THREE.Color(c));
    const add=(cloud:typeof dust,x:number,y:number,z:number,size:number,col:THREE.Color)=>{
      cloud.p.push(x,y,z);cloud.c.push(col.r,col.g,col.b);cloud.s.push(size);cloud.t.push(rand()*TAU);
    };
    const gaussian=()=>Math.sqrt(-2*Math.log(Math.max(rand(),.00001)))*Math.cos(rand()*TAU);
    // Shells at different radii build volume between turns; secondary wisps bridge the main stream.
    const middle = {p:[] as number[],c:[] as number[],s:[] as number[],t:[] as number[]};
    const wisps = {p:[] as number[],c:[] as number[],s:[] as number[],t:[] as number[]};
    for(let i=0;i<19000;i++) {
      const h=1-Math.pow(1-rand(),.65), center=h*TAU*3.65;
      const shell=rand();
      const a=rand()<.45?center+gaussian()*.9:rand()*TAU;
      const radial=shell<.30?.25+rand()*.40:.72+rand()*.34;
      const r=(1-h)*2.12*radial;
      const bright=rand();
      add(dust,Math.cos(a)*r,-2.55+h*5.7,Math.sin(a)*r,
        bright<.85?.035+rand()*.075:.14+rand()*.20,palette[Math.floor(rand()*palette.length)]);
    }
    for(let i=0;i<6200;i++) {
      const h=1-Math.pow(1-rand(),.65),a=rand()*TAU;
      const tier=Math.floor(h*9),local=h*9-tier;
      const radius=(1-h)*2.12*(.78+.22*Math.sin(local*Math.PI));
      const cloud=(i%4===0)?middle:wisps;
      const y=-2.55+h*5.7+Math.sin(a*3+tier)*.035;
      add(cloud,Math.cos(a)*radius,y,Math.sin(a)*radius,
          cloud===middle?.13+rand()*.17:.045+rand()*.09,palette[i%4]);
    }
    // Faint secondary helices provide sweeping layered edges without competing with the main spiral.
    for(let arm=0;arm<3;arm++) for(let i=0;i<1800;i++) {
      const h=1-Math.pow(1-rand(),.65),a=h*TAU*3.65+.6+arm*.52;
      const r=(1-h)*2.1+gaussian()*.035;
      add(wisps,Math.cos(a)*r,-2.55+h*5.7+gaussian()*.026,Math.sin(a)*r,.06+rand()*.10,palette[arm%3]);
    }
    this.tree.add(this.points(middle.p,middle.c,middle.s,middle.t,.9));
    this.tree.add(this.points(wisps.p,wisps.c,wisps.s,wisps.t,.58));
    // Multiple crossing filaments have independent radial and vertical drift. No solid ribbon mesh.
    for(let strand=0;strand<7;strand++) {
      for(let i=0;i<2200;i++) {
        const h=1-Math.pow(1-(i+rand())/2200,.64),a=h*TAU*3.65;
        const spread=strand===0?.008:.025+strand*.009;
        const drift=Math.sin(h*47+strand*1.9)*spread;
        const r=(1-h)*2.14+gaussian()*spread;
        const y=-2.55+h*5.7+drift+gaussian()*spread*.7;
        add(stream,Math.cos(a)*r,y,Math.sin(a)*r,.045+Math.pow(rand(),4)*.20,palette[strand % 2 === 0 ? 1 : 3]);
        if(i%5===0) add(halos,Math.cos(a)*r,y,Math.sin(a)*r,.35+rand()*.35,palette[1]);
      }
    }
    this.tree.add(this.points(dust.p,dust.c,dust.s,dust.t,.82));
    this.tree.add(this.points(stream.p,stream.c,stream.s,stream.t,.62));
    this.tree.add(this.points(halos.p,halos.c,halos.s,halos.t,.11,24));
    // Discrete starbursts carry the brightest highlights and a warm pink halo.
    const sparkleMap=this.makeGlow(true);
    for(let i=0;i<105;i++) {
      const h=rand(),a=rand()<.8?h*TAU*3.65:rand()*TAU,r=(1-h)*2.15;
      const material=new THREE.SpriteMaterial({map:sparkleMap,color:i%5===0?0xffdab6:0xffbdd7,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
      const sprite=new THREE.Sprite(material);sprite.position.set(Math.cos(a)*r,-2.55+h*5.7,Math.sin(a)*r);
      sprite.scale.setScalar(.15+Math.pow(rand(),3)*.38);this.tree.add(sprite);
    }
    const floor={p:[] as number[],c:[] as number[],s:[] as number[],t:[] as number[]};
    for(let i=0;i<11000;i++) {
      const a=rand()*TAU, ring=Math.floor(rand()*11);
      const r=.12+ring*.215+Math.sin(a*3+ring)*.023+gaussian()*.023;
      add(floor,Math.cos(a)*r,-2.77+gaussian()*.012,Math.sin(a)*r,.035+Math.pow(rand(),3)*.13,palette[i%3]);
    }
    this.tree.add(this.points(floor.p,floor.c,floor.s,floor.t,.9));
  }

  private createStars() {
    const rand = random(1099), p: number[] = [], c: number[] = [], s: number[] = [], t: number[] = [];
    for (let i = 0; i < 1900; i++) {
      p.push((rand() - .5) * 80, (rand() - .5) * 80, -12 - rand() * 35);
      const color = new THREE.Color().setRGB(.73 + rand() * .27, .76 + rand() * .24, 1);
      c.push(color.r, color.g, color.b); s.push(.08 + Math.pow(rand(), 5) * .65); t.push(rand() * TAU);
    }
    return this.points(p, c, s, t, .85);
  }

  setBlessings(records: Blessing[], preferredId?: string) {
    this.records = records;
    const selectedIndex = preferredId ? records.findIndex(row => row.id === preferredId) : -1;
    const start = selectedIndex >= 0 ? Math.floor(selectedIndex / 60) * 60 : 0;
    const visible = records.slice(start, start + 60), ids = new Set(visible.map(row => row.id));
    for (const [id, group] of this.ornaments) if (!ids.has(id)) { this.ornamentGroup.remove(group); this.ornaments.delete(id); }
    for (const row of visible) {
      const style = row.ornament_style || 'jewel';
      const existing = this.ornaments.get(row.id);
      if (existing?.userData.style === style) continue;
      if (existing) { this.ornamentGroup.remove(existing); this.ornaments.delete(row.id); }
      const group = ornamentFactory.create(style, row.id), position = ornamentPosition(row.ornament_seed);
      group.position.copy(position); group.userData.id = row.id; group.userData.baseY = position.y;
      group.userData.style = style;
      const halo = new THREE.Mesh(this.highlightGeometry, this.highlightMaterial); halo.name = 'highlight'; halo.visible = false; group.add(halo);
      this.ornamentGroup.add(group); this.ornaments.set(row.id, group);
    }
    this.pickMeshes = [...this.ornaments.values()].map(group => group.children[0]);
  }

  resetView() {
    this.closeup = false;
    this.zoomTarget = .93;
    this.panTarget.set(0, 0);
    this.rotationTarget = .22;
    this.focusId = null;
    this.focusUntil = 0;
    this.lastInteraction = 0;
  }

  setWishOpen(open: boolean) { this.wishOpen = open; }

  focus(id: string) {
    const row = this.records.find(record => record.id === id); if (!row) return;
    if (!this.ornaments.has(id)) this.setBlessings(this.records, id);
    const p = ornamentPosition(row.ornament_seed);
    const target = Math.atan2(-p.x, p.z);
    const delta = ((target - this.rotationTarget + Math.PI) % TAU + TAU) % TAU - Math.PI;
    this.rotationTarget += delta; this.zoomTarget = .8 / this.baseDistance;
    this.panTarget.set(0, p.y - .35); this.closeup = true;
    this.focusId = id; this.focusUntil = performance.now() + 6500; this.lastInteraction = performance.now();
  }

  private resize = () => {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.camera.aspect = w / Math.max(h, 1); this.camera.updateProjectionMatrix();
    this.baseDistance = Math.max(10.8, 6.1 / this.camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(22.5)));
    this.renderer.setSize(w, h, false);
  };

  private bindEvents() {
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', () => { this.paused = document.hidden; if (!this.paused) this.clock.getDelta(); });
    this.canvas.addEventListener('pointerdown', event => {
      this.canvas.setPointerCapture(event.pointerId); this.pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
      this.closeup = false; this.lastInteraction = performance.now();
      if (this.pointers.size === 1) this.press = { x: event.clientX, y: event.clientY, time: performance.now(), moved: false, pinched: false };
      if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y); this.press.pinched = true; }
    });
    this.canvas.addEventListener('pointermove', event => {
      const before = this.pointers.get(event.pointerId); if (!before) return;
      if (Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) > 7) this.press.moved = true;
      this.pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
      if (this.pointers.size === 1 && !this.press.pinched) {
        if (event.buttons === 2 || event.shiftKey) this.panBy(event.clientX - before.x, 0);
        else this.rotationTarget += (event.clientX - before.x) * .007;
        this.panBy(0, event.clientY - before.y);
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()], distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDistance > 0) this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget * this.pinchDistance / Math.max(distance, 1), .22, 1.65);
        this.panBy((event.clientX - before.x) / 2, (event.clientY - before.y) / 2);
        this.pinchDistance = distance;
      }
      this.lastInteraction = performance.now();
    });
    this.canvas.addEventListener('pointerup', event => {
      this.pointers.delete(event.pointerId);
      if (!this.press.moved && !this.press.pinched && performance.now() - this.press.time < 650) this.pick(event.clientX, event.clientY);
    });
    this.canvas.addEventListener('pointercancel', event => { this.pointers.delete(event.pointerId); this.press.pinched = true; });
    this.canvas.addEventListener('contextmenu', event => event.preventDefault());
    this.canvas.addEventListener('wheel', event => { event.preventDefault(); this.closeup = false; this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget * Math.exp(event.deltaY * .0007), .22, 1.65); this.lastInteraction = performance.now(); }, { passive: false });
  }

  private panBy(dx: number, dy: number) {
    const units = 2 * this.baseDistance * this.zoomTarget * Math.tan(Math.PI / 8) / Math.max(this.canvas.clientHeight, 1);
    this.panTarget.x = THREE.MathUtils.clamp(this.panTarget.x - dx * units, -3, 3);
    this.panTarget.y = THREE.MathUtils.clamp(this.panTarget.y + dy * units, -3.5, 3.5);
  }

  private pick(x: number, y: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const direct = this.raycaster.intersectObjects(this.pickMeshes, false)[0];
    let id = direct?.object.userData.id as string | undefined;
    if (!id) {
      let nearest = 23;
      for (const mesh of this.pickMeshes) {
        const world = mesh.getWorldPosition(new THREE.Vector3());
        // Keep the near-side spheres selectable; do not pick through the tree.
        if (world.z < -.18) continue;
        const projected = world.project(this.camera);
        const px = (projected.x + 1) * rect.width / 2, py = (1 - projected.y) * rect.height / 2;
        const distance = Math.hypot(px - (x - rect.left), py - (y - rect.top));
        if (distance < nearest) { nearest = distance; id = mesh.userData.id; }
      }
    }
    if (id) { this.focusId = id; this.focusUntil = performance.now() + 5000; this.onSelect(id); }
  }

  private animate = () => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.animate);
    const now = performance.now();
    if (this.paused || (reducedMotion && now - this.lastFrame < 1000 / 24)) return;
    const delta = Math.min((now - (this.lastFrame || now)) / 1000, .05); this.lastFrame = now;
    const time = this.clock.getElapsedTime();
    if (!reducedMotion && (this.wishOpen || now - this.lastInteraction > 9500) && !this.pointers.size) this.rotationTarget += delta * .035;
    const factor = 1 - Math.exp(-delta * 7);
    this.tree.rotation.y = THREE.MathUtils.lerp(this.tree.rotation.y, this.rotationTarget, factor);
    this.pan.lerp(this.panTarget, factor);
    this.zoom = THREE.MathUtils.lerp(this.zoom, this.zoomTarget, factor);
    const focal = this.closeup && this.focusId ? this.ornaments.get(this.focusId)?.getWorldPosition(new THREE.Vector3()) : undefined;
    const focalZ = focal?.z || 0;
    this.camera.position.set(this.pan.x, (this.closeup ? .35 : 1.15) + this.pan.y, focalZ + this.baseDistance * this.zoom); this.camera.lookAt(this.pan.x, .35 + this.pan.y, focalZ);
    const focused = this.focusId ? this.ornaments.get(this.focusId) : undefined;
    const worldFocus = focused?.getWorldPosition(new THREE.Vector3());
    this.focusDepth = worldFocus ? -worldFocus.applyMatrix4(this.camera.matrixWorldInverse).z : 0;
    for (const material of this.materials) {
      material.uniforms.uTime.value = reducedMotion ? 0 : time;
      material.uniforms.uFocus.value = this.closeup ? 1 : 0;
      material.uniforms.uDepth.value = this.focusDepth;
    }
    this.star.material.rotation = Math.sin(time * .08) * .035;
    this.star.material.opacity = reducedMotion ? 1 : .94 + Math.sin(time * 2.4) * .04 + Math.sin(time * 5.1) * .02;
    for (const [id, group] of this.ornaments) {
      const sway = reducedMotion ? 0 : Math.sin(time * 1.1 + group.userData.baseY) * .025;
      if (group.userData.style !== 'jewel') {
        group.quaternion.copy(this.camera.quaternion).premultiply(this.tree.quaternion.clone().invert());
        group.rotateZ(sway);
      } else group.rotation.z = sway;
      const halo = group.getObjectByName('highlight')!;
      halo.visible = this.focusId === id && now < this.focusUntil;
      halo.quaternion.copy(this.camera.quaternion).premultiply(this.tree.quaternion.clone().invert());
    }
    this.renderer.render(this.scene, this.camera);
  };
}

