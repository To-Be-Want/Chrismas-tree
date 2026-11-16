import * as THREE from 'three';
const TAU = Math.PI * 2;
export const ornamentDesigns = [['jewel','粉晶珠宝球'],['star','香槟星星'],['snowflake','冰晶雪花'],['heart','玫瑰爱心']] as const;
class OrnamentFactory {
  private sphereGeometry = new THREE.SphereGeometry(.09, 40, 28);
  private sphereMaterial = new THREE.MeshPhysicalMaterial({ color: 0xf4bfd6, metalness: .38, roughness: .19, clearcoat: 1, clearcoatRoughness: .06, envMapIntensity: .85 });
  private silverMaterial = new THREE.MeshStandardMaterial({ color: 0xf0d3ad, metalness: .88, roughness: .22 });
  private capGeometry = new THREE.CylinderGeometry(.027, .035, .035, 12);
  private loopGeometry = new THREE.TorusGeometry(.017, .003, 5, 12);
  private trimGeometry = new THREE.TorusGeometry(.0905, .0018, 5, 64);
  private jewelGeometry = new THREE.OctahedronGeometry(.006, 0);
  private jewelMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffe8f5, metalness: .25, roughness: .08, clearcoat: 1, emissive: 0xc96891, emissiveIntensity: .18 });
  private pearlGeometry = new THREE.SphereGeometry(.0028, 6, 4);
  private shapedOrnament(style: string) {
    const shape = new THREE.Shape();
    if (style === 'heart') {
      shape.moveTo(0, .045);
      shape.bezierCurveTo(-.09,.14,-.15,.025,0,-.095);
      shape.bezierCurveTo(.15,.025,.09,.14,0,.045);
    } else if (style === 'star') {
      for (let i=0;i<10;i++) {
        const a=Math.PI/2+i*Math.PI/5, r=i%2 ? .047 : .108;
        if (!i) shape.moveTo(Math.cos(a)*r,Math.sin(a)*r); else shape.lineTo(Math.cos(a)*r,Math.sin(a)*r);
      }
      shape.closePath();
    } else {
      // A six-armed crystal silhouette with forked tips.
      for (let arm=0;arm<6;arm++) {
        const a=arm*TAU/6;
        for (const [x,y] of [[-.009,.025],[-.009,.063],[-.027,.079],[-.021,.086],[-.007,.074],[-.007,.105],[.007,.105],[.007,.074],[.021,.086],[.027,.079],[.009,.063],[.009,.025]]) {
          const px=x*Math.cos(a)-y*Math.sin(a), py=x*Math.sin(a)+y*Math.cos(a);
          if (!arm && x===-.009 && y===.025) shape.moveTo(px,py); else shape.lineTo(px,py);
        }
      }
      shape.closePath();
    }
    return new THREE.ExtrudeGeometry(shape, { depth:.018, bevelEnabled:true, bevelSegments:2, steps:1, bevelSize:.003, bevelThickness:.004, curveSegments:16 }).translate(0,0,-.009);
  }
  private starFacets?: THREE.BufferGeometry;
  private shapedGeometries = new Map<string, THREE.BufferGeometry>();
  private ornamentMaterials = {
    star: new THREE.MeshPhysicalMaterial({color:0xe8c58c,metalness:.8,roughness:.22,clearcoat:1}),
    heart: new THREE.MeshPhysicalMaterial({color:0xe18bb5,metalness:.45,roughness:.18,clearcoat:1}),
    snowflake: new THREE.MeshPhysicalMaterial({color:0xcceaff,metalness:.4,roughness:.12,clearcoat:1,emissive:0x619bbb,emissiveIntensity:.12})
  };

  create(style: string, id = '') {
    const group = new THREE.Group();
      if (style === 'jewel') {
      const ball = new THREE.Mesh(this.sphereGeometry, this.sphereMaterial); ball.userData.id = id; group.add(ball);
      const cap = new THREE.Mesh(this.capGeometry, this.silverMaterial); cap.position.y = .097; group.add(cap);
      const loop = new THREE.Mesh(this.loopGeometry, this.silverMaterial); loop.position.y = .128; group.add(loop);
      // Jewel-like meridians and a pearl-set equator; no hanging thread.
      for (let i = 0; i < 6; i++) {
        const rib = new THREE.Mesh(this.trimGeometry, this.silverMaterial);
        rib.rotation.y = i * Math.PI / 6; group.add(rib);
      }
      const equator = new THREE.Mesh(this.trimGeometry, this.silverMaterial);
      equator.rotation.x = Math.PI / 2; group.add(equator);
      for (let i = 0; i < 24; i++) {
        const angle = i * TAU / 24;
        const pearl = new THREE.Mesh(this.pearlGeometry, this.jewelMaterial);
        pearl.position.set(Math.cos(angle) * .092, 0, Math.sin(angle) * .092); group.add(pearl);
      }
      for (let i = 0; i < 12; i++) {
        const angle = i * TAU / 12;
        for (const side of [-1, 1]) {
          const jewel = new THREE.Mesh(this.jewelGeometry, this.jewelMaterial);
          jewel.position.set(Math.cos(angle) * .077, side * .047, Math.sin(angle) * .077);
          jewel.scale.set(.65, 1.35, .65); group.add(jewel);
        }
      }
      } else {
        const key = style in this.ornamentMaterials ? style as 'star' | 'heart' | 'snowflake' : 'star';
        if (!this.shapedGeometries.has(key)) this.shapedGeometries.set(key, this.shapedOrnament(key));
        const ornament = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(this.shapedGeometries.get(key)!, this.ornamentMaterials[key]);
        ornament.userData.id = id; group.add(ornament);
        if (key === 'heart') {
          ornament.material = this.silverMaterial;
          const inset = new THREE.Mesh(this.shapedGeometries.get(key)!, this.ornamentMaterials.heart);
          inset.scale.set(.92,.92,1); inset.position.z = .006; group.add(inset);
        }
        if (key === 'star') {
          if (!this.starFacets) {
          const vertices: number[] = [];
          for (let i=0;i<10;i++) {
            const a=Math.PI/2+i*Math.PI/5, b=a+Math.PI/5;
            const r=i%2?.047:.108, next=i%2?.108:.047;
            vertices.push(0,0,.037,Math.cos(a)*r,Math.sin(a)*r,.013,Math.cos(b)*next,Math.sin(b)*next,.013);
          }
          const facets = new THREE.BufferGeometry(); facets.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); facets.computeVertexNormals();
          this.starFacets = facets;
          }
          group.add(new THREE.Mesh(this.starFacets,this.ornamentMaterials.star));
        }
        // Small brilliant stones follow the face without a hanging cord.
        for (let i=0;i<6;i++) {
          const gem = new THREE.Mesh(this.jewelGeometry, this.jewelMaterial);
          const a=Math.PI/2+i*TAU/6, r=key==='snowflake'?.068:.035; gem.position.set(Math.cos(a)*r,Math.sin(a)*r,key==='star'?.04:.025);
          gem.scale.setScalar(.65); group.add(gem);
        }
      }
    return group;
  }
}
export const ornamentFactory = new OrnamentFactory();
