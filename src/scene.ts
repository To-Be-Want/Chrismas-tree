import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Blessing } from './types';

const TAU = Math.PI * 2;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function random(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function ornamentPosition(seed: number) {
  const rand = random(seed), h = .12 + rand() * .74, angle = rand() * TAU;
  const radius = (1 - h) * 1.92 + .03;
  return new THREE.Vector3(Math.cos(angle) * radius, -2.5 + h * 5.7, Math.sin(angle) * radius);
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
  private pitchTarget = 0;
  private zoomTarget = 1;
  private zoom = 1;
  private baseDistance = 11;
  private focusId: string | null = null;
  private focusUntil = 0;
  private lastInteraction = 0;
  private stars: THREE.Points;
  private star: THREE.Sprite;
  private running = true;
  private frame = 0;
  private lastFrame = 0;
  private paused = false;
  private mobile = innerWidth < 700;
  private sphereGeometry = new THREE.SphereGeometry(.09, 24, 16);
  private sphereMaterial = new THREE.MeshPhysicalMaterial({ color: 0xf3f1f8, metalness: .12, roughness: .24, clearcoat: 1, clearcoatRoughness: .12, envMapIntensity: .75 });
  private silverMaterial = new THREE.MeshStandardMaterial({ color: 0xcdd1dd, metalness: .9, roughness: .27 });
  private capGeometry = new THREE.CylinderGeometry(.027, .035, .035, 12);
  private loopGeometry = new THREE.TorusGeometry(.017, .003, 5, 12);
  private threadGeometry = new THREE.CylinderGeometry(.0015, .0015, .15, 4);
  private highlightGeometry = new THREE.PlaneGeometry(.9, .9);
  private highlightMaterial: THREE.MeshBasicMaterial;

  constructor(private canvas: HTMLCanvasElement, private onSelect: (id: string) => void) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x030305);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.6 : 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const environment = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(environment, .04).texture;
    environment.dispose(); pmrem.dispose();
    this.scene.add(new THREE.AmbientLight(0xf1edff, .6));
    const key = new THREE.DirectionalLight(0xffffff, 2.5); key.position.set(-3, 6, 5); this.scene.add(key);
    const pink = new THREE.PointLight(0xffbbda, 6, 15); pink.position.set(2, 0, 3); this.scene.add(pink);
    const rim = new THREE.DirectionalLight(0xc1cbff, 1.1); rim.position.set(3, 2, -2); this.scene.add(rim);
    this.scene.add(this.tree); this.tree.add(this.ornamentGroup);
    this.createTree();
    this.stars = this.createStars(); this.scene.add(this.stars);
    const starTexture = this.makeGlow(true);
    this.star = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture, color: 0xffe6f0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.star.position.set(0, 3.27, 0); this.star.scale.setScalar(.9); this.tree.add(this.star);
    const floorGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.makeGlow(false), color: 0xffa2c8, opacity: .65, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    floorGlow.position.set(0, -2.72, .05); floorGlow.scale.set(1.1, .45, 1); this.tree.add(floorGlow);
    this.highlightMaterial = new THREE.MeshBasicMaterial({ map: this.makeGlow(false), color: 0xffdce9, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .4 });
    this.bindEvents(); this.resize(); this.animate();
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
        c.rotate(Math.PI / 4); c.fillStyle = i % 2 ? 'rgba(255,245,250,.5)' : 'rgba(255,255,255,.95)';
        const length = i % 2 ? 65 : 116;
        c.beginPath(); c.moveTo(-length, 0); c.lineTo(-6, -3); c.lineTo(0, -length); c.lineTo(5, -5); c.lineTo(length, 0); c.lineTo(5, 4); c.lineTo(0, length); c.lineTo(-4, 5); c.closePath(); c.fill();
      }
    }
    return new THREE.CanvasTexture(canvas);
  }

  private points(positions: number[], colors: number[], sizes: number[], phases: number[], opacity = 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDpr: { value: this.renderer.getPixelRatio() }, uOpacity: { value: opacity } },
      vertexShader: `attribute float aSize; attribute float aPhase; varying vec3 vColor; varying float vLight;
        uniform float uTime; uniform float uDpr;
        void main(){vColor=color; vLight=0.65+0.35*sin(uTime*1.1+aPhase);
        vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(aSize*240.*uDpr/(-mv.z),1.8*uDpr,44.*uDpr);}`,
      fragmentShader: `varying vec3 vColor; varying float vLight; uniform float uOpacity;
        void main(){vec2 p=gl_PointCoord*2.-1.; float r=dot(p,p); if(r>1.)discard;
        float core=exp(-r*18.); float halo=exp(-r*4.5)*0.34;
        gl_FragColor=vec4(vColor*(1.+core*.7),(core+halo)*vLight*uOpacity);}`,
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    this.materials.push(material);
    return new THREE.Points(geometry, material);
  }

  private createTree() {
    const rand = random(24512), p: number[] = [], c: number[] = [], s: number[] = [], phase: number[] = [];
    const white = new THREE.Color('#fff5fc'), pink = new THREE.Color('#ff83b5'), lavender = new THREE.Color('#c9bcff');
    const count = this.mobile ? 10500 : 15500;
    const push = (x: number, y: number, z: number, color: THREE.Color, size: number) => {
      p.push(x, y, z); c.push(color.r, color.g, color.b); s.push(size); phase.push(rand() * TAU);
    };
    for (let i = 0; i < count; i++) {
      const h = rand(), a = rand() * TAU;
      const contour = (1 - h) * 1.88 * (1 + .055 * Math.sin(h * 42));
      const r = contour * (.32 + .68 * Math.pow(rand(), .3));
      const color = rand() < .48 ? white : rand() < .9 ? pink : lavender;
      push(Math.cos(a) * r, -2.55 + h * 5.7, Math.sin(a) * r, color, .07 + Math.pow(rand(), 4) * .29);
    }
    for (let band = 0; band < 2; band++) {
      const n = this.mobile ? 5500 : 8500;
      for (let i = 0; i < n; i++) {
        const h = rand(), a = h * TAU * 3.25 + band * .43;
        const width = .025 + (1 - h) * .075;
        const r = (1 - h) * 1.99 + (rand() - .5) * width * 2;
        const color = rand() < .58 ? white : pink;
        push(Math.cos(a) * r, -2.55 + h * 5.7 + (rand() - .5) * width, Math.sin(a) * r, color, .07 + Math.pow(rand(), 4) * .31);
      }
    }
    for (let i = 0; i < 1000; i++) {
      const h = rand(), a = rand() * TAU, r = (1 - h) * 2.05 + rand() * .22;
      push(Math.cos(a) * r, -2.55 + h * 5.7, Math.sin(a) * r, rand() < .5 ? white : pink, .05 + rand() * .12);
    }
    this.tree.add(this.points(p, c, s, phase));
    // Sparse soft sprites give glints without a costly full-screen bloom pass.
    const glintMap = this.makeGlow(false);
    const glintMaterial = new THREE.SpriteMaterial({ map: glintMap, color: 0xffcadf, opacity: .38, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 90; i++) {
      const h = rand(), a = h * TAU * 3.25, r = (1 - h) * 1.99;
      const glint = new THREE.Sprite(glintMaterial); glint.position.set(Math.cos(a) * r, -2.55 + h * 5.7, Math.sin(a) * r);
      glint.scale.setScalar(.1 + Math.pow(rand(), 3) * .3); this.tree.add(glint);
    }
    const rp: number[] = [], rc: number[] = [], rs: number[] = [], rt: number[] = [];
    for (let i = 0; i < (this.mobile ? 7800 : 12000); i++) {
      const ring = Math.floor(rand() * 5), a = rand() * TAU;
      const radius = [.75, 1.25, 1.65, 1.95, 2.2][ring] + (rand() - .5) * (rand() < .7 ? .035 : .18);
      rp.push(Math.cos(a) * radius, -2.77 + (rand() - .5) * .025, Math.sin(a) * radius);
      const col = rand() < .4 ? white : pink; rc.push(col.r, col.g, col.b); rs.push(.045 + rand() * .12); rt.push(rand() * TAU);
    }
    const rings = this.points(rp, rc, rs, rt, .95); rings.rotation.x = .07; this.tree.add(rings);
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
      if (this.ornaments.has(row.id)) continue;
      const group = new THREE.Group(), position = ornamentPosition(row.ornament_seed);
      group.position.copy(position); group.userData.id = row.id; group.userData.baseY = position.y;
      const ball = new THREE.Mesh(this.sphereGeometry, this.sphereMaterial); ball.userData.id = row.id; group.add(ball);
      const cap = new THREE.Mesh(this.capGeometry, this.silverMaterial); cap.position.y = .097; group.add(cap);
      const loop = new THREE.Mesh(this.loopGeometry, this.silverMaterial); loop.position.y = .128; group.add(loop);
      const thread = new THREE.Mesh(this.threadGeometry, this.silverMaterial); thread.position.y = .217; group.add(thread);
      const halo = new THREE.Mesh(this.highlightGeometry, this.highlightMaterial); halo.name = 'highlight'; halo.visible = false; group.add(halo);
      this.ornamentGroup.add(group); this.ornaments.set(row.id, group);
    }
    this.pickMeshes = [...this.ornaments.values()].map(group => group.children[0]);
  }

  focus(id: string) {
    const row = this.records.find(record => record.id === id); if (!row) return;
    if (!this.ornaments.has(id)) this.setBlessings(this.records, id);
    const p = ornamentPosition(row.ornament_seed);
    const target = Math.atan2(-p.x, p.z);
    const delta = ((target - this.rotationTarget + Math.PI) % TAU + TAU) % TAU - Math.PI;
    this.rotationTarget += delta; this.zoomTarget = Math.min(this.zoomTarget, 1.15);
    this.focusId = id; this.focusUntil = performance.now() + 6500; this.lastInteraction = performance.now();
  }

  private resize = () => {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.camera.aspect = w / Math.max(h, 1); this.camera.updateProjectionMatrix();
    this.baseDistance = Math.max(9.25, 4.7 / this.camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(22.5)));
    this.renderer.setSize(w, h, false);
  };

  private bindEvents() {
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', () => { this.paused = document.hidden; if (!this.paused) this.clock.getDelta(); });
    this.canvas.addEventListener('pointerdown', event => {
      this.canvas.setPointerCapture(event.pointerId); this.pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
      this.lastInteraction = performance.now();
      if (this.pointers.size === 1) this.press = { x: event.clientX, y: event.clientY, time: performance.now(), moved: false, pinched: false };
      if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y); this.press.pinched = true; }
    });
    this.canvas.addEventListener('pointermove', event => {
      const before = this.pointers.get(event.pointerId); if (!before) return;
      if (Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) > 7) this.press.moved = true;
      this.pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
      if (this.pointers.size === 1 && !this.press.pinched) {
        this.rotationTarget += (event.clientX - before.x) * .007;
        this.pitchTarget = THREE.MathUtils.clamp(this.pitchTarget + (event.clientY - before.y) * .001, -.1, .1);
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()], distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDistance > 0) this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget * this.pinchDistance / Math.max(distance, 1), .52, 1.35);
        this.pinchDistance = distance;
      }
      this.lastInteraction = performance.now();
    });
    this.canvas.addEventListener('pointerup', event => {
      this.pointers.delete(event.pointerId);
      if (!this.press.moved && !this.press.pinched && performance.now() - this.press.time < 650) this.pick(event.clientX, event.clientY);
    });
    this.canvas.addEventListener('pointercancel', event => { this.pointers.delete(event.pointerId); this.press.pinched = true; });
    this.canvas.addEventListener('wheel', event => { event.preventDefault(); this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget * Math.exp(event.deltaY * .0007), .52, 1.35); this.lastInteraction = performance.now(); }, { passive: false });
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
    if (!reducedMotion && now - this.lastInteraction > 9500 && !this.pointers.size) this.rotationTarget += delta * .035;
    const factor = 1 - Math.exp(-delta * 7);
    this.tree.rotation.y = THREE.MathUtils.lerp(this.tree.rotation.y, this.rotationTarget, factor);
    this.tree.rotation.x = THREE.MathUtils.lerp(this.tree.rotation.x, this.pitchTarget, factor);
    this.zoom = THREE.MathUtils.lerp(this.zoom, this.zoomTarget, factor);
    this.camera.position.set(0, 1.05, this.baseDistance * this.zoom); this.camera.lookAt(0, .02, 0);
    for (const material of this.materials) material.uniforms.uTime.value = reducedMotion ? 0 : time;
    this.star.material.rotation = Math.sin(time * .08) * .035;
    this.star.material.opacity = reducedMotion ? 1 : .85 + Math.sin(time * 1.8) * .15;
    for (const [id, group] of this.ornaments) {
      group.rotation.z = reducedMotion ? 0 : Math.sin(time * 1.1 + group.userData.baseY) * .025;
      const halo = group.getObjectByName('highlight')!;
      halo.visible = this.focusId === id && now < this.focusUntil;
      halo.quaternion.copy(this.camera.quaternion).premultiply(this.tree.quaternion.clone().invert());
    }
    this.renderer.render(this.scene, this.camera);
  };
}
