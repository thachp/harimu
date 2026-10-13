import * as THREE from 'three';

export type CityLocation = 'square' | 'home' | 'workplace' | 'market' | 'government';
export type WorldBuilding = { location: CityLocation; label: string; position: THREE.Vector3; object: THREE.Object3D };
export type WorldArt = { group: THREE.Group; selectables: THREE.Object3D[]; buildings: WorldBuilding[]; bounds: number };

type Palette = { wall: number; roof: number; trim: number; stone: number };
const palettes: Record<string, Palette> = {
  kindle: { wall: 0xa76643, roof: 0x343e43, trim: 0xcda65b, stone: 0x555c5d },
  korund: { wall: 0x929890, roof: 0x465454, trim: 0xaabbb3, stone: 0x687774 },
  aurelle: { wall: 0xe8e2ca, roof: 0x7eaaa8, trim: 0xd0ad54, stone: 0xc9c9b9 },
};
const materials = new Map<number, THREE.MeshStandardMaterial>();
function material(color: number) {
  let value = materials.get(color);
  if (!value) { value = new THREE.MeshStandardMaterial({ color, roughness: 0.92, flatShading: true }); materials.set(color, value); }
  return value;
}
function box(parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, color: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function cylinder(parent: THREE.Object3D, x: number, y: number, z: number, top: number, bottom: number, h: number, color: number, sides = 8) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, h, sides), material(color));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function roof(parent: THREE.Object3D, width: number, depth: number, height: number, base: number, color: number) {
  // A rectangular gable, rather than a cone masquerading as a house.
  const points = new Float32Array([
    -width / 2, base, -depth / 2, width / 2, base, -depth / 2, 0, base + height, -depth / 2,
    -width / 2, base, depth / 2, 0, base + height, depth / 2, width / 2, base, depth / 2,
    -width / 2, base, -depth / 2, 0, base + height, -depth / 2, 0, base + height, depth / 2,
    -width / 2, base, -depth / 2, 0, base + height, depth / 2, -width / 2, base, depth / 2,
    width / 2, base, -depth / 2, width / 2, base, depth / 2, 0, base + height, depth / 2,
    width / 2, base, -depth / 2, 0, base + height, depth / 2, 0, base + height, -depth / 2,
  ]);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(points, 3)); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material(color)); mesh.castShadow = true; parent.add(mesh);
}
function tree(parent: THREE.Object3D, x: number, z: number, size = 1) {
  cylinder(parent, x, 0.45 * size, z, 0.07, 0.11, 0.8 * size, 0x765640, 5);
  cylinder(parent, x, 1.05 * size, z, 0.05, 0.55 * size, 1.35 * size, 0x496f53, 7);
  cylinder(parent, x, 1.55 * size, z, 0, 0.38 * size, 0.9 * size, 0x6e8a55, 7);
}
function facade(group: THREE.Group, p: Palette, w: number, h: number, d: number) {
  box(group, 0, h / 2 + 0.12, 0, w, h, d, p.wall);
  box(group, 0, 0.13, 0, w + 0.18, 0.26, d + 0.18, p.stone);
  box(group, 0, 0.55, d / 2 + 0.025, 0.42, 0.95, 0.08, 0x333a36);
  for (const x of [-w * 0.3, w * 0.3]) {
    box(group, x, 1.05, d / 2 + 0.025, 0.3, 0.42, 0.06, 0xdbc682);
    box(group, x, 1.05, d / 2 + 0.065, 0.035, 0.45, 0.025, p.trim);
  }
}

export function createCityWorld(nationId: string): WorldArt {
  materials.clear(); // Each world owns its materials; renderer may dispose the previous world.
  const key = nationId.toLowerCase(); const p = palettes[key] ?? palettes.kindle;
  const group = new THREE.Group(); const selectables: THREE.Object3D[] = []; const buildings: WorldBuilding[] = [];
  // All land cells are square, with shallow stepped shoreline and river channel.
  for (let x = -12; x < 12; x++) for (let z = -12; z < 12; z++) {
    const edge = Math.max(Math.abs(x + 0.5), Math.abs(z + 0.5));
    const river = x >= 7 && x <= 8;
    const road = Math.abs(x + 0.5) < 1 || Math.abs(z + 0.5) < 1;
    const plaza = Math.abs(x + 0.5) < 2 && Math.abs(z + 0.5) < 2;
    const water = edge > 10.5 || river;
    const color = water ? ((x + z) % 2 ? 0x527f85 : 0x58888d) : plaza ? 0xa3997e : road ? 0xb5a17a : ((x * 7 + z * 11) % 3 ? 0x75845b : 0x839165);
    const tile = box(group, x + 0.5, water ? -0.21 : -0.12, z + 0.5, 0.995, water ? 0.12 : 0.3, 0.995, color);
    tile.userData = { kind: 'tile', x, z, label: water ? 'River and coast' : road ? 'City street' : 'City square tile', detail: 'Square terrain cell' }; selectables.push(tile);
  }
  const addBuilding = (location: CityLocation, label: string, x: number, z: number, construct: (g: THREE.Group) => void) => {
    const building = new THREE.Group(); building.position.set(x, 0.06, z); construct(building);
    const metadata = { kind: 'building', location, label, detail: `${label} · ${key.charAt(0).toUpperCase() + key.slice(1)}` };
    building.traverse(child => { child.userData = metadata; }); group.add(building); selectables.push(building);
    buildings.push({ location, label, position: new THREE.Vector3(x, 0, z), object: building });
  };
  addBuilding('square', 'City square', 0, 0, g => {
    cylinder(g, 0, 0.11, 0, 0.8, 0.9, 0.22, p.stone);
    cylinder(g, 0, 0.35, 0, 0.65, 0.7, 0.22, p.trim);
    cylinder(g, 0, 0.46, 0, 0.54, 0.54, 0.08, 0x588f96);
    cylinder(g, 0, 0.75, 0, 0.11, 0.16, 0.7, p.stone);
    for (const x of [-1.4, 1.4]) { box(g, x, 0.26, 0, 0.24, 0.13, 0.8, 0x765540); box(g, x, 0.12, -0.27, 0.13, 0.25, 0.13, p.stone); box(g, x, 0.12, 0.27, 0.13, 0.25, 0.13, p.stone); }
    box(g, -1.4, 0.85, -1.2, 0.08, 1.7, 0.08, p.trim); box(g, -1.4, 1.2, -1.2, 0.9, 0.55, 0.12, 0x66513b);
  });
  addBuilding('home', 'Your home', -4.4, 3.7, g => {
    facade(g, p, 2.3, 1.5, 1.8); roof(g, 2.65, 2.1, 0.85, 1.62, p.roof);
    box(g, 0.65, 2.1, -0.4, 0.32, 0.9, 0.35, p.stone);
    box(g, -0.8, 0.24, 1.15, 0.7, 0.3, 0.35, 0x6d8354);
    box(g, 1.55, 0.16, 0.4, 0.2, 0.4, 2.6, 0x9b7950);
    tree(g, -1.75, -0.6, 0.8);
  });
  addBuilding('workplace', 'Work yard', -4.5, -4, g => {
    facade(g, p, 3.1, 1.8, 2.1); roof(g, 3.4, 2.4, 0.7, 1.92, p.roof);
    box(g, -0.9, 2.35, -0.65, 0.5, 1.8, 0.5, p.stone); box(g, -0.9, 3.28, -0.65, 0.65, 0.15, 0.65, p.trim);
    for (let i = 0; i < 3; i++) box(g, 2, 0.25 + i * 0.3, -0.5, 0.9 - i * 0.15, 0.3, 0.8, 0x906c46);
    for (let i = 0; i < 3; i++) cylinder(g, 1.9, 0.27, 0.7 + i * 0.4, 0.2, 0.2, 0.5, p.trim);
    box(g, -0.4, 0.3, 1.5, 1.9, 0.16, 0.5, 0x654b36);
  });
  addBuilding('market', 'Market stalls', 4, 3.8, g => {
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 1.25;
      box(g, x, 0.52, 0, 1.05, 0.65, 0.75, 0x806346);
      for (const dx of [-0.45, 0.45]) box(g, x + dx, 0.95, -0.26, 0.07, 1.8, 0.07, p.trim);
      box(g, x, 1.65, 0, 1.2, 0.13, 1.1, i % 2 ? 0xd1b673 : 0xb4694c);
      for (let n = 0; n < 3; n++) cylinder(g, x - 0.3 + n * 0.3, 0.9, 0.1, 0.11, 0.14, 0.18, i % 2 ? 0xb1b86d : 0xd1a65a, 6);
    }
    box(g, 0, 0.08, 0, 4.1, 0.1, 2.1, p.stone);
  });
  addBuilding('government', 'Civic hall', 3.7, -4.2, g => {
    const aurelle = key === 'aurelle', korund = key === 'korund';
    facade(g, p, 3.3, korund ? 2.5 : 2.1, 2.7);
    box(g, 0, 0.18, 1.65, 3.8, 0.3, 0.65, p.stone); box(g, 0, 0.08, 2, 4.1, 0.16, 0.45, p.stone);
    for (const x of [-1.2, -0.65, 0.65, 1.2]) cylinder(g, x, 1.12, 1.45, 0.13, 0.17, 2.1, p.wall, 6);
    box(g, 0, 2.23, 1.45, 3.65, 0.24, 0.5, p.trim);
    if (aurelle) {
      box(g, 0, 2.55, -0.3, 2.55, 0.7, 2.3, p.wall);
      for (const x of [-1.1, 1.1]) { cylinder(g, x, 3, -0.7, 0.25, 0.32, 2.3, p.wall); cylinder(g, x, 4.35, -0.7, 0, 0.4, 1.1, p.trim); }
    } else if (korund) {
      box(g, 0, 2.78, 0, 3.6, 0.55, 3, p.stone); box(g, 0, 3.25, -0.4, 1.15, 0.5, 1.8, p.trim);
    } else { roof(g, 3.7, 3.05, 0.85, 2.24, p.roof); cylinder(g, 0, 3.2, 0, 0.45, 0.5, 0.75, p.stone); cylinder(g, 0, 3.9, 0, 0, 0.52, 0.7, p.trim); }
    box(g, 1.8, 1.35, 1.8, 0.05, 2.7, 0.05, p.trim); box(g, 2.1, 2.32, 1.8, 0.6, 0.4, 0.05, p.roof);
  });
  // An inhabited district: small residences, fields and wharf surround the playable civic core.
  for (const [x, z] of [[-7, 6], [-7, 3], [-6, -7], [-2.7, -7], [3, -8]]) {
    const house = new THREE.Group(); house.position.set(x, 0.06, z); facade(house, p, 1.5, 1.1, 1.3); roof(house, 1.75, 1.5, 0.65, 1.22, p.roof); group.add(house);
  }
  for (let x = -7; x < -3; x++) for (let z = 7; z < 10; z++) { box(group, x + 0.5, 0.04, z + 0.5, 0.9, 0.06, 0.9, 0x7c6449); for (let r = 0; r < 3; r++) box(group, x + 0.5, 0.14, z + 0.2 + r * 0.25, 0.75, 0.16, 0.1, 0xb6ad63); }
  box(group, 8, 0.1, 0, 3.9, 0.16, 1.8, 0x8d7652);
  for (let i = -2; i <= 2; i++) { box(group, 6 + i * 0.5, 0.36, 1.1, 0.12, 0.7, 0.12, p.trim); }
  for (const [x, z] of [[-9, -8], [-8, -5], [-9, 0], [-9, 7], [5, 8], [6, -8], [6, -6], [-3, 5], [2, 7], [-6, 0]]) tree(group, x, z, 0.8 + (Math.abs(x) % 3) * 0.16);
  for (const [x, z] of [[-1.3, -3], [1.3, 3], [-3, 1.3], [3, -1.3]]) { cylinder(group, x, 0.8, z, 0.035, 0.05, 1.6, p.stone, 5); cylinder(group, x, 1.65, z, 0.16, 0.16, 0.25, p.trim, 6); }
  return { group, selectables, buildings, bounds: 14 };
}

export function createRegionWorld(nations: readonly { id: string; name?: string }[] = [{ id: 'kindle', name: 'Kindle' }, { id: 'korund', name: 'Korund' }, { id: 'aurelle', name: 'Aurelle' }]): WorldArt {
  materials.clear();
  const group = new THREE.Group(); const selectables: THREE.Object3D[] = [];
  for (let x = -16; x < 16; x++) for (let z = -12; z < 12; z++) {
    const land = Math.sin(x * 0.25) * 2 + 8 > Math.abs(z) && Math.abs(x) < 14;
    box(group, x + 0.5, land ? -0.12 : -0.3, z + 0.5, 0.99, land ? 0.3 : 0.1, 0.99, land ? ((x + z) % 3 ? 0x7b8961 : 0x959169) : 0x527f85);
  }
  nations.forEach((nation, i) => {
    const columns = nations.length <= 3 ? 3 : 4;
    const x = nations.length <= 3 ? -9 + i * 9 : -10.5 + (i % columns) * 7;
    const z = nations.length <= 3 ? (i % 2 ? -3 : 2) : -5 + Math.floor(i / columns) * 5; const p = palettes[nation.id.toLowerCase()] ?? palettes.kindle;
    const capital = new THREE.Group(); capital.position.set(x, 0, z);
    box(capital, 0, 0.14, 0, 4.5, 0.24, 4.5, p.stone);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) { box(capital, dx, 0.55, dz, 0.8, 0.9, 0.8, p.wall); cylinder(capital, dx, 1.2, dz, 0, 0.65, 0.6, p.roof, 4); }
    box(capital, 0, 1, 0, 1.2, 2, 1.2, p.wall); cylinder(capital, 0, 2.5, 0, 0, 0.9, 1, p.trim, 4);
    capital.traverse(child => { child.userData = { kind: 'nation', nationId: nation.id, label: nation.name ?? nation.id, detail: 'Explore the capital district' }; });
    group.add(capital); selectables.push(capital);
    if (i > 0) { for (let n = 0; n < 8; n++) box(group, x - 8.5 + n, 0.06, z + (i % 2 ? 5 : -5) * (1 - n / 8), 0.45, 0.04, 0.45, 0xc6b585); }
  });
  for (let i = 0; i < 12; i++) cylinder(group, -13 + i * 1.8, 0.7, -7 + Math.sin(i) * 0.8, 0, 0.8, 1.6 + (i % 3) * 0.6, 0x879187, 4);
  return { group, selectables, buildings: [], bounds: 18 };
}
