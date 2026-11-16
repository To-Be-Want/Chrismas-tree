import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ornamentFactory } from './ornaments';

let renderer: THREE.WebGLRenderer | undefined;
const images = new Map<string, string>();
export function ornamentPreview(style: string) {
  if (images.has(style)) return images.get(style)!;
  renderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(480, 480); renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer), environment = new RoomEnvironment();
  const texture = pmrem.fromScene(environment, .04).texture;
  scene.environment = texture;
  scene.add(new THREE.AmbientLight(0xf1edff, .6));
  const key = new THREE.DirectionalLight(0xffedf4, 1.7); key.position.set(-3,6,5); scene.add(key);
  const pink = new THREE.PointLight(0xffbbda,6,15); pink.position.set(2,0,3); scene.add(pink);
  const rim = new THREE.DirectionalLight(0xc1cbff,1.1); rim.position.set(3,2,-2); scene.add(rim);
  const ornament = ornamentFactory.create(style); scene.add(ornament);
  const camera = new THREE.PerspectiveCamera(35,1,.01,10); camera.position.set(0,.022,.46); camera.lookAt(0,.022,0);
  renderer.render(scene,camera);
  const url = renderer.domElement.toDataURL('image/png'); images.set(style,url);
  texture.dispose(); environment.dispose(); pmrem.dispose();
  return url;
}
