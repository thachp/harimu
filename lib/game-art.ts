import * as THREE from 'three';

export type CityLocation = 'square' | 'home' | 'workplace' | 'market' | 'government';
export type WorldBuilding = { location: CityLocation; label: string; position: THREE.Vector3; object: THREE.Object3D };
export type WorldArt = { group: THREE.Group; selectables: THREE.Object3D[]; buildings: WorldBuilding[]; bounds: number };

type Palette = { wall: number; roof: number; trim: number; stone: number };
type CapitalProfile = { capital: string; institution: string; palette: Palette; angle: number; spacing: number; riverX: number; landmark: 'fountain' | 'spire' | 'forum' | 'beacon' };
// Visual interpretations of the fictional capitals, not authoritative city maps.
export const capitalProfiles: Record<string, CapitalProfile> = {
  kindle: { capital: 'Forgehaven', institution: 'Assembly hall', palette: { wall: 0xa76643, roof: 0x343e43, trim: 0xcda65b, stone: 0x555c5d }, angle: 0, spacing: 1, riverX: 8, landmark: 'fountain' },
  confluence: { capital: 'Meetwater', institution: 'Party congress', palette: { wall: 0x9abcc4, roof: 0x315e78, trim: 0x579ab5, stone: 0x6b8389 }, angle: .1, spacing: .94, riverX: -8, landmark: 'forum' },
  meridian: { capital: 'Steamgate', institution: 'Party-state offices', palette: { wall: 0xad969f, roof: 0x574659, trim: 0xb88cac, stone: 0x716975 }, angle: -.12, spacing: .92, riverX: 8, landmark: 'beacon' },
  korund: { capital: 'Stonehearth', institution: 'Planning bureau', palette: { wall: 0x929890, roof: 0x465454, trim: 0xaabbb3, stone: 0x687774 }, angle: 0, spacing: .88, riverX: -8, landmark: 'spire' },
  aurelle: { capital: 'Highspire', institution: 'Royal court', palette: { wall: 0xe8e2ca, roof: 0x7eaaa8, trim: 0xd0ad54, stone: 0xc9c9b9 }, angle: .18, spacing: .9, riverX: 8, landmark: 'spire' },
  ilmar: { capital: 'Mirrorhall', institution: 'Canon hall', palette: { wall: 0xe4d9b5, roof: 0x8b7840, trim: 0xe0bb59, stone: 0xa69f82 }, angle: -.18, spacing: .86, riverX: -8, landmark: 'beacon' },
  hoarvale: { capital: 'Rimehall', institution: 'Moot hall', palette: { wall: 0xb4c8c9, roof: 0x42747e, trim: 0x8ac1c6, stone: 0x71888d }, angle: .08, spacing: 1.04, riverX: 8, landmark: 'fountain' },
  varkand: { capital: 'Watchfast', institution: 'Command directorate', palette: { wall: 0x7e8a78, roof: 0x364a43, trim: 0xa6a078, stone: 0x535f59 }, angle: -.08, spacing: 1.02, riverX: -8, landmark: 'spire' },
  veldwood: { capital: 'Ringhall', institution: 'Grove council', palette: { wall: 0xb1a981, roof: 0x426b42, trim: 0x96b66d, stone: 0x7e8d70 }, angle: .22, spacing: .84, riverX: 8, landmark: 'forum' },
  fulmara: { capital: 'Arcport', institution: 'Grand Council', palette: { wall: 0xc5b4d1, roof: 0x574075, trim: 0xb598d3, stone: 0x8a8098 }, angle: -.22, spacing: .98, riverX: -8, landmark: 'beacon' },
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

export function createCityWorld(nationId: string, cityName?: string, options: { marketOpen?: boolean } = {}): WorldArt {
  materials.clear(); // Each world owns its materials; renderer may dispose the previous world.
  const key = nationId.toLowerCase(); const profile = capitalProfiles[key] ?? capitalProfiles.kindle; const p = profile.palette;
  const displayedCity = cityName?.trim() || profile.capital;
  const group = new THREE.Group(); const selectables: THREE.Object3D[] = []; const buildings: WorldBuilding[] = [];
  group.userData = { capital: profile.capital, nationId: key, detail: 'Procedural capital illustration' };
  // All land cells are square, with shallow stepped shoreline and river channel.
  for (let x = -12; x < 12; x++) for (let z = -12; z < 12; z++) {
    const edge = Math.max(Math.abs(x + 0.5), Math.abs(z + 0.5));
    const river = x >= profile.riverX - 1 && x <= profile.riverX;
    const road = Math.abs(x + 0.5) < 1 || Math.abs(z + 0.5) < 1;
    const plaza = Math.abs(x + 0.5) < 2 && Math.abs(z + 0.5) < 2;
    const water = edge > 10.5 || river;
    const color = water ? ((x + z) % 2 ? 0x527f85 : 0x58888d) : plaza ? 0xa3997e : road ? 0xb5a17a : ((x * 7 + z * 11) % 3 ? 0x75845b : 0x839165);
    const tile = box(group, x + 0.5, water ? -0.21 : -0.12, z + 0.5, 0.995, water ? 0.12 : 0.3, 0.995, color);
    tile.userData = { kind: 'tile', x, z, label: water ? 'River and coast' : road ? 'City street' : 'City square tile', detail: 'Square terrain cell' }; selectables.push(tile);
  }
  const addBuilding = (location: CityLocation, label: string, x: number, z: number, construct: (g: THREE.Group) => void) => {
    const building = new THREE.Group(); const px = (x * Math.cos(profile.angle) - z * Math.sin(profile.angle)) * profile.spacing;
    const pz = (x * Math.sin(profile.angle) + z * Math.cos(profile.angle)) * profile.spacing;
    building.position.set(px, 0.06, pz); building.rotation.y = -profile.angle; construct(building);
    const metadata = { kind: 'building', location, label, detail: `${label} · ${key.charAt(0).toUpperCase() + key.slice(1)}` };
    building.traverse(child => { child.userData = metadata; }); group.add(building); selectables.push(building);
    buildings.push({ location, label, position: new THREE.Vector3(px, 0, pz), object: building });
  };
  addBuilding('square', `${displayedCity} square`, 0, 0, g => {
    cylinder(g, 0, 0.11, 0, 0.8, 0.9, 0.22, p.stone);
    cylinder(g, 0, 0.35, 0, 0.65, 0.7, 0.22, p.trim);
    cylinder(g, 0, 0.46, 0, 0.54, 0.54, 0.08, 0x588f96);
    if (profile.landmark === 'spire') cylinder(g, 0, 1.1, 0, .04, .22, 1.5, p.trim);
    else if (profile.landmark === 'beacon') { box(g, 0, 1, 0, .35, 1.2, .35, p.stone); cylinder(g, 0, 1.75, 0, .35, .35, .3, p.trim); }
    else if (profile.landmark === 'forum') { for (const x of [-.6, .6]) box(g, x, .7, -.5, .25, .9, .25, p.stone); }
    else cylinder(g, 0, 0.75, 0, 0.11, 0.16, 0.7, p.stone);
    for (const x of [-1.4, 1.4]) { box(g, x, 0.26, 0, 0.24, 0.13, 0.8, 0x765540); box(g, x, 0.12, -0.27, 0.13, 0.25, 0.13, p.stone); box(g, x, 0.12, 0.27, 0.13, 0.25, 0.13, p.stone); }
    box(g, -1.4, 0.85, -1.2, 0.08, 1.7, 0.08, p.trim); box(g, -1.4, 1.2, -1.2, 0.9, 0.55, 0.12, 0x66513b);
  });
  addBuilding('home', 'Your household', -4.4, 3.7, g => {
    facade(g, p, 2.3, 1.5, 1.8); roof(g, 2.65, 2.1, 0.85, 1.62, p.roof);
    box(g, 0.65, 2.1, -0.4, 0.32, 0.9, 0.35, p.stone);
    box(g, -0.8, 0.24, 1.15, 0.7, 0.3, 0.35, 0x6d8354);
    box(g, 1.55, 0.16, 0.4, 0.2, 0.4, 2.6, 0x9b7950);
    tree(g, -1.75, -0.6, 0.8);
  });
  addBuilding('workplace', key === 'korund' ? 'Assignment board' : `${displayedCity} work yard`, -4.5, -4, g => {
    facade(g, p, 3.1, 1.8, 2.1); roof(g, 3.4, 2.4, 0.7, 1.92, p.roof);
    box(g, -0.9, 2.35, -0.65, 0.5, 1.8, 0.5, p.stone); box(g, -0.9, 3.28, -0.65, 0.65, 0.15, 0.65, p.trim);
    for (let i = 0; i < 3; i++) box(g, 2, 0.25 + i * 0.3, -0.5, 0.9 - i * 0.15, 0.3, 0.8, 0x906c46);
    for (let i = 0; i < 3; i++) cylinder(g, 1.9, 0.27, 0.7 + i * 0.4, 0.2, 0.2, 0.5, p.trim);
    box(g, -0.4, 0.3, 1.5, 1.9, 0.16, 0.5, 0x654b36);
  });
  // #344: with the market flag off the Kindle-style market building is not drawn (callers pass marketVisible(nation, flag) from lib/market-visibility.ts, which keeps Korund's State ration store and Aurelle's royal store).
  if (options.marketOpen !== false) addBuilding('market', key === 'korund' ? 'State ration store' : `${displayedCity} market`, 4, 3.8, g => {
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 1.25;
      box(g, x, 0.52, 0, 1.05, 0.65, 0.75, 0x806346);
      for (const dx of [-0.45, 0.45]) box(g, x + dx, 0.95, -0.26, 0.07, 1.8, 0.07, p.trim);
      box(g, x, 1.65, 0, 1.2, 0.13, 1.1, i % 2 ? 0xd1b673 : 0xb4694c);
      for (let n = 0; n < 3; n++) cylinder(g, x - 0.3 + n * 0.3, 0.9, 0.1, 0.11, 0.14, 0.18, i % 2 ? 0xb1b86d : 0xd1a65a, 6);
    }
    box(g, 0, 0.08, 0, 4.1, 0.1, 2.1, p.stone);
  });
  addBuilding('government', profile.institution, 3.7, -4.2, g => {
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
  box(group, profile.riverX, 0.1, 0, 3.9, 0.16, 1.8, 0x8d7652);
  for (let i = -2; i <= 2; i++) { box(group, profile.riverX - 2 + i * 0.5, 0.36, 1.1, 0.12, 0.7, 0.12, p.trim); }
  for (const [x, z] of [[-9, -8], [-8, -5], [-9, 0], [-9, 7], [5, 8], [6, -8], [6, -6], [-3, 5], [2, 7], [-6, 0]]) tree(group, x, z, 0.8 + (Math.abs(x) % 3) * 0.16);
  for (const [x, z] of [[-1.3, -3], [1.3, 3], [-3, 1.3], [3, -1.3]]) { cylinder(group, x, 0.8, z, 0.035, 0.05, 1.6, p.stone, 5); cylinder(group, x, 1.65, z, 0.16, 0.16, 0.25, p.trim, 6); }
  return { group, selectables, buildings, bounds: 14 };
}

// Procedural fictional geography: no external map assets or real-country boundaries.
export function globePoint(latitude: number, longitude: number, radius = 7): THREE.Vector3 {
  const lat = THREE.MathUtils.degToRad(latitude), lon = THREE.MathUtils.degToRad(longitude);
  return new THREE.Vector3(radius * Math.cos(lat) * Math.sin(lon), radius * Math.sin(lat), radius * Math.cos(lat) * Math.cos(lon));
}
// Euler XYZ rotation that brings a spherical anchor to the camera-facing centre.
export function globeFocusRotation(point: THREE.Vector3): { x: number; y: number } {
  return { x: Math.atan2(point.y, Math.hypot(point.x, point.z)), y: -Math.atan2(point.x, point.z) };
}
export function globeAnchorVisible(point: THREE.Vector3, facing: 'z' | 'y' = 'z'): boolean {
  // Hide the back hemisphere and the limb where labels would overlap the globe edge. #1039: overhead view faces +Y.
  const axis = facing === 'y' ? point.y : point.z;
  return axis / point.length() > .16;
}
/** Each nation's latitude/longitude comes from lib/globe-mapping.ts (nationGlobeCoordinates), the same mapping the Ownership overlay uses. */
export function createRegionWorld(nations: readonly { id: string; name?: string; color?: string; latitude: number; longitude: number }[] = []): WorldArt {
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(7, 144, 96);
  const landSeeds = nations.map(n => globePoint(n.latitude, n.longitude, 1));
  // Preserve the same fictional continental lobes, sampled independently of mesh vertices.
  [[60,-120],[22,-105],[-15,-80],[-48,-70],[52,8],[20,25],[-18,35],[48,70],[28,100],[-30,135]].forEach(([lat, lon]) => landSeeds.push(globePoint(lat, lon, 1)));
  const width = 2048, height = 1024;
  const pixels = new Uint8Array(width * height * 4);
  const blend = (value: number, start: number, end: number) => {
    const t = THREE.MathUtils.clamp((value - start) / (end - start), 0, 1);
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < height; y++) {
    const lat = ((y + .5) / height - .5) * Math.PI;
    const cosLat = Math.cos(lat), py = Math.sin(lat);
    for (let x = 0; x < width; x++) {
      // SphereGeometry starts its UV seam at the negative X axis.
      const lon = (x + .5) / width * Math.PI * 2 - Math.PI / 2;
      const px = cosLat * Math.sin(lon), pz = cosLat * Math.cos(lon);
      let proximity = -1;
      for (const seed of landSeeds) proximity = Math.max(proximity, px * seed.x + py * seed.y + pz * seed.z);
      const ripple = .05 * Math.sin(lon * 13 + lat * 7) + .025 * Math.sin(lon * 29 - lat * 17);
      const coastDistance = proximity - .91 - ripple;
      const land = blend(coastDistance, -.0015, .0015);
      const inland = blend(coastDistance, .003, .025);
      const polar = blend(Math.abs(py), .925, .955);
      const variation = Math.sin(lon * 41 + lat * 31) * Math.sin(lat * 53 - lon * 17) * 3;
      const oceanDepth = blend(-coastDistance, .005, .12);
      const ocean = [40 - oceanDepth * 13, 104 - oceanDepth * 24, 134 - oceanDepth * 24];
      const ground = [164 - inland * 86 + variation, 177 - inland * 53 + variation, 118 - inland * 34 + variation];
      const ice = [217, 232, 229];
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) pixels[offset + channel] = Math.round((ocean[channel] * (1 - land) + ground[channel] * land) * (1 - polar) + ice[channel] * polar);
      pixels[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  const planet = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, roughness: .84 }));
  group.add(planet);
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(7.13, 64, 48), new THREE.MeshBasicMaterial({ color: '#78bfdc', transparent: true, opacity: .09, side: THREE.BackSide, depthWrite: false }));
  atmosphere.name = 'atmosphere'; // #1039: hidden on the phone top-down view
  group.add(atmosphere);
  const selectables: THREE.Object3D[] = [];
  nations.forEach(nation => {
    const marker = new THREE.Mesh(new THREE.SphereGeometry(.19, 16, 12), new THREE.MeshStandardMaterial({ color: nation.color || '#f4cc79', emissive: '#665023', emissiveIntensity: .45, roughness: .45 }));
    marker.position.copy(globePoint(nation.latitude, nation.longitude, 7.22));
    marker.userData = { kind: 'nation', nationId: nation.id, label: nation.name || nation.id, detail: 'A fictional Harimu nation. Select it to explore its city and citizen life.' };
    group.add(marker); selectables.push(marker);
  });
  return { group, selectables, buildings: [], bounds: Math.PI };
}
