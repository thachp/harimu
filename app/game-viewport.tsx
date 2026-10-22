'use client';

import { useEffect, useRef, useState } from 'react';
import {useDisplayPreferences} from './display-preferences';
import {graphicsOptions} from '../lib/display-preferences';
import * as THREE from 'three';
import { createCityWorld, createRegionWorld, globeFocusRotation, globeAnchorVisible } from '../lib/game-art';
import { clampCamera, clampZoom, readCameraSnapshot, saveCameraSnapshot, locationSelection, locationLabel, placeLabels, type LocationId, type ViewportSelection } from '../lib/game-viewport';
import { nationSymbolElement } from './nation-symbol';
import { MapOverlaysControl } from './map-overlays';
import { nationPlaces, projectOwnershipCells, WORLD_GRID } from '../lib/globe-mapping';
import { mapFitRules, nationOpenings } from '../lib/nation-openings';

export type GameViewportProps = {
  mode: 'world' | 'city'; nationId: string;
  /** #379: the viewer is not a citizen, so the household is not "Your household". Defaults to false (citizen wording). */
  visitor?: boolean;
  cityName?: string;
  /** #344: false hides the Market building (market flag off). Defaults to true. */
  marketOpen?: boolean;
  nations?: readonly { id: string; name?: string; color?: string }[];
  selectedNationId?: string | null;
  nationFocusRevision?: number;
  cameraTourNationId?: string | null;
  onUserCamera?: () => void;
  selectedLocation?: LocationId | null;
  onSelect: (selection: ViewportSelection) => void;
  className?: string;
  /** #82: GET /api/citizen flags.mapOverlays. False renders no Overlays group. */
  overlays?: boolean;
};
type CameraControls = { zoom: (delta: number) => void; pan: (x: number, z: number) => void; reset: () => void; focus: (id: LocationId) => void; focusNation: (id: string, select?: boolean) => void };

export function GameViewport({ mode, nationId, visitor = false, cityName, marketOpen = true, nations, selectedNationId, nationFocusRevision, cameraTourNationId, onUserCamera, selectedLocation, onSelect, className = '', overlays = false }: GameViewportProps) {
  const {preferences:{graphics}}=useDisplayPreferences();
  const host = useRef<HTMLDivElement>(null);
  const callback = useRef(onSelect);
  const userCamera = useRef(onUserCamera);
  useEffect(() => { userCamera.current = onUserCamera; }, [onUserCamera]);
  const controls = useRef<CameraControls | null>(null);
  const [fallback, setFallback] = useState(false);
  const [cameraLabel, setCameraLabel] = useState('100%');
  const places = nationPlaces(nationOpenings, (nations ?? []).map(({ id }) => id), WORLD_GRID, { centre: mapFitRules.commonsCentre, minCommons: mapFitRules.minCommonsDistance }); // #82: markers stand on their capital square
  const nationSignature = JSON.stringify(nations?.map(({ id, name, color }, i) => ({ id, name, color, ...places[i] })) ?? []);
  useEffect(() => { callback.current = onSelect; }, [onSelect]);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let cancelled = false;
    const quality=graphicsOptions(graphics,window.devicePixelRatio);
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: quality.antialias, alpha: false }); }
    catch { queueMicrotask(() => { if (!cancelled) setFallback(true); }); return () => { cancelled = true; }; }
    queueMicrotask(() => { if (!cancelled) setFallback(false); });
    renderer.setPixelRatio(quality.pixelRatio);
    renderer.shadowMap.enabled = quality.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.style.width='100%'; renderer.domElement.style.height='100%'; renderer.domElement.style.display='block';
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(mode === 'world' ? '#101d29' : '#172c31');
    if (mode === 'city') scene.fog = new THREE.Fog('#172c31', 35, 85);
    const world = mode === 'city' ? createCityWorld(nationId, cityName, { marketOpen }) : createRegionWorld(JSON.parse(nationSignature));
    scene.add(world.group);
    scene.add(new THREE.HemisphereLight('#fff3d6', '#334b4d', 2.2));
    const sun = new THREE.DirectionalLight('#ffe2ac', 3.2);
    sun.position.set(-15, 24, 12); sun.castShadow = quality.shadows;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22; sun.shadow.bias = -.001;
    scene.add(sun);
    const camera = new THREE.OrthographicCamera(-16, 16, 12, -12, .1, 120);
    const target = new THREE.Vector3();
    const baseSpan = mode === 'world' ? 9.3 : 10;
    const bounds = world.bounds || 14;
    const cameraKey = `${mode}:${nationId}`;
    const savedCamera = readCameraSnapshot(cameraKey, bounds);
    target.set(savedCamera.x, 0, savedCamera.z);
    let zoom = savedCamera.zoom;
    queueMicrotask(() => { if (!cancelled) setCameraLabel(`${Math.round(zoom * 100)}%`); });
    const highlight = new THREE.BoxHelper(new THREE.Object3D(), '#f7d080');
    highlight.visible = false; scene.add(highlight);
    const labelLayer = document.createElement('div');
    labelLayer.className = 'viewport-label-layer';
    Object.assign(labelLayer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' });
    container.appendChild(labelLayer);
    const anchors = mode === 'city'
      ? world.buildings.map(building => ({ object: building.object, label: locationLabel(building.location, building.label, visitor), selection: locationSelection(building.location, nationId, visitor) }))
      : world.selectables.filter(object => object.userData.kind === 'nation').map(object => ({ object, label: String(object.userData.label), selection: { kind: 'nation' as const, label: String(object.userData.label), detail: String(object.userData.detail), nationId: String(object.userData.nationId) } }));
    const labels = anchors.map(anchor => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'viewport-world-label'; button.textContent = anchor.label;
      button.setAttribute('aria-label', `Select ${anchor.label}`);
      const nationId = 'nationId' in anchor.selection ? anchor.selection.nationId : undefined;
      const chip = mode === 'world' && nationId ? nationSymbolElement(nationId) : null;
      if (chip) button.insertBefore(chip, button.firstChild); // #79: symbol chip beside the nation name (flagged)
      Object.assign(button.style, { position: 'absolute', pointerEvents: 'auto', transform: 'translate(-50%, -100%)' });
      button.addEventListener('click', () => { highlight.setFromObject(anchor.object); highlight.visible = true; render(); callback.current(anchor.selection); });
      labelLayer.appendChild(button);
      return { ...anchor, button };
    });
    // Coalesce redraws into one animation frame. Synchronous back-to-back
    // renderer.render() calls outside rAF (resize + focus + highlight on a
    // scene change) force the compositor into a synchronous drawing-buffer
    // readback, which Chrome reports as "GPU stall due to ReadPixels" (#38).
    let frame = 0;
    const render = () => { if (!frame && !cancelled) frame = requestAnimationFrame(draw); };
    const draw = () => {
      frame = 0;
      if (cancelled) return;
      saveCameraSnapshot(cameraKey, { x: target.x, z: target.z, zoom }, bounds);
      const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
      const ratio = w / h;
      const span = mode === 'world' ? baseSpan / Math.min(1, ratio) : baseSpan;
      camera.left = -span * ratio / zoom; camera.right = span * ratio / zoom;
      camera.top = span / zoom; camera.bottom = -span / zoom;
      if (mode === 'world') {
        world.group.rotation.set(target.z, target.x, 0); camera.position.set(0, 0, 25); camera.lookAt(0, 0, 0);
      } else { camera.position.set(target.x + 23, 28, target.z + 23); camera.lookAt(target); }
      camera.updateProjectionMatrix(); camera.updateMatrixWorld(); scene.updateMatrixWorld();
      labels.forEach(({ object, button }) => {
        const box = new THREE.Box3().setFromObject(object);
        const point = box.getCenter(new THREE.Vector3()); point.y = box.max.y + .3; point.project(camera);
        const globeVisible = mode !== 'world' || globeAnchorVisible(object.getWorldPosition(new THREE.Vector3()));
        button.hidden = !globeVisible || point.z < -1 || point.z > 1 || Math.abs(point.x) > .98 || Math.abs(point.y) > .98;
        button.style.left = `${(point.x + 1) * w / 2}px`;
        button.style.top = `${(1 - point.y) * h / 2}px`;
      });
      if (mode === 'city' && window.matchMedia?.('(max-width: 760px)').matches) { // #377: on a phone (the shell's breakpoint) labels stay inside the canvas and out of each other's way; desktop is untouched
        const shown = labels.filter(({ button }) => !button.hidden && button.offsetWidth > 0);
        const here = container.getBoundingClientRect(); // the breadcrumb and shift chip float over the canvas: labels keep clear of them
        const blocked = [...(container.closest('.harimu-game')?.querySelectorAll('.game-stage-overlay > *') ?? [])].map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0)
          .map(r => ({ x: r.left - here.left + r.width / 2, y: r.bottom - here.top, w: r.width, h: r.height })).filter(b => b.y > 0 && b.y - b.h < h && b.x + b.w / 2 > 0 && b.x - b.w / 2 < w);
        shown.forEach(({ button }) => { button.dataset.anchor = `${button.style.left},${button.style.top}`; }); // where the building is, so a check can measure how far a label moved
        const spots = placeLabels(shown.map(({ button }) => ({ x: parseFloat(button.style.left), y: parseFloat(button.style.top), w: button.offsetWidth, h: button.offsetHeight })), { w, h }, 4, blocked);
        shown.forEach(({ button }, index) => { button.style.left = `${spots[index].x}px`; button.style.top = `${spots[index].y}px`; });
      }
      const owned = mode === 'world' ? container.closest('.game-viewport')?.querySelector<HTMLElement>('.map-ownership') : null; // #82: Ownership cells ride the globe squares
      if (owned) { const spans = [...owned.querySelectorAll<HTMLElement>('span[data-x]')];
        projectOwnershipCells({ width: Number(owned.dataset.width), height: Number(owned.dataset.height) }, spans.map(s => [Number(s.dataset.x), Number(s.dataset.y)]), world.group, camera, { w, h }, new THREE.Vector3())
          .forEach((spot, i) => { spans[i].hidden = spot.hidden; spans[i].style.left = `${spot.left}px`; spans[i].style.top = `${spot.top}px`; }); }
      if (highlight.visible) highlight.update();
      renderer.render(scene, camera);
    };
    const changeZoom = (delta: number) => { userCamera.current?.(); zoom = clampZoom(zoom + delta); setCameraLabel(`${Math.round(zoom * 100)}%`); render(); };
    const pan = (x: number, z: number) => {
      userCamera.current?.();
      if (mode === 'world') { target.x = ((target.x + x + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; target.z = clampCamera(target.z + z, 1.15); }
      else { target.x = clampCamera(target.x + x, bounds); target.z = clampCamera(target.z + z, bounds); }
      render();
    };
    const focus = (id: LocationId) => {
      const building = world.buildings.find(b => b.location === id);
      if (!building) return;
      highlight.setFromObject(building.object); highlight.visible = true; render();
    };
    const focusNation = (id: string, select = true) => {
      const anchor = anchors.find(anchor => anchor.selection.kind === 'nation' && anchor.selection.nationId === id);
      if (!anchor || mode !== 'world') return;
      const rotation = globeFocusRotation(anchor.object.position);
      target.set(rotation.y, 0, rotation.x);
      if (select) labels.forEach(({ selection, button }) => {
        const active = selection.kind === 'nation' && selection.nationId === id;
        button.setAttribute('aria-pressed', String(active));
        button.style.outline = active ? '2px solid #f7d080' : '';
      });
      if (select) { highlight.setFromObject(anchor.object); highlight.visible = true; }
      render();
    };
    controls.current = { zoom: changeZoom, pan, reset: () => { userCamera.current?.(); target.set(0, 0, 0); zoom = 1; setCameraLabel('100%'); highlight.visible = false; render(); }, focus, focusNation };
    const resize = () => { renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight), false); render(); };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const layerWatch = new MutationObserver(render); const viewportEl = container.closest('.game-viewport'); if (viewportEl) layerWatch.observe(viewportEl, { childList: true }); // #82: place the Ownership layer when it mounts
    container.closest('.harimu-game')?.querySelectorAll('.game-stage-overlay > *').forEach(el => observer.observe(el)); // #377: re-place labels when the breadcrumb or shift chip changes size
    const raycaster = new THREE.Raycaster();
    let dragging: { x: number; y: number; total: number } | null = null;
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragging = { x: event.clientX, y: event.clientY, total: 0 };
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - dragging.x, dy = event.clientY - dragging.y;
      dragging.total += Math.abs(dx) + Math.abs(dy); dragging.x = event.clientX; dragging.y = event.clientY;
      const scale = baseSpan * 2 / Math.max(1, container.clientHeight) / zoom;
      if (mode === 'world') pan(dx * .006, dy * .006);
      else pan((-dx - dy) * scale * .65, (dx - dy) * scale * .65);
    };
    const up = (event: PointerEvent) => {
      if (!dragging) return;
      const wasDrag = dragging.total > 6; dragging = null;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      if (wasDrag || mode === 'world') return; // Nation selection belongs to labels and the bottom strip.
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = raycaster.intersectObjects(world.selectables, true)[0];
      if (!hit) return;
      let object: THREE.Object3D | null = hit.object;
      while (object && !object.userData.kind) object = object.parent;
      if (!object) return;
      const data = object.userData;
      const selectedBuilding = data.location ? world.buildings.find(b => b.location === data.location) : null;
      highlight.setFromObject(selectedBuilding?.object || object); highlight.visible = true; render();
      if (mode === 'city' && data.location) { callback.current(locationSelection(data.location, nationId, visitor)); return; }
      callback.current({ kind: data.kind, label: data.label || `Square ${data.x ?? ''}, ${data.z ?? ''}`, detail: data.detail || 'Prototype terrain square. Citizen ownership and construction are not yet available.', location: data.location, nationId: data.nationId });
    };
    const cancel = () => { dragging = null; };
    const wheel = (event: WheelEvent) => { event.preventDefault(); changeZoom(event.deltaY < 0 ? .12 : -.12); };
    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      cancelled = true; controls.current = null; observer.disconnect(); layerWatch.disconnect(); if (frame) cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel); canvas.removeEventListener('wheel', wheel);
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      scene.traverse(object => { const mesh = object as THREE.Mesh; if (mesh.geometry) geometries.add(mesh.geometry); if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => materials.add(m)); });
      geometries.forEach(g => g.dispose());
      const textures = new Set<THREE.Texture>();
      materials.forEach(material => {
        const map = (material as THREE.MeshStandardMaterial).map;
        if (map) textures.add(map);
        material.dispose();
      });
      textures.forEach(texture => texture.dispose());
      sun.shadow.map?.dispose(); renderer.dispose(); renderer.forceContextLoss(); labelLayer.remove(); canvas.remove();
    };
  }, [mode, nationId, cityName, marketOpen, nationSignature, graphics, visitor]);
  // #618: the scene (and so every label button) is rebuilt when any dependency of the effect above changes, so re-apply the selected nation, its aria-pressed and outline, after any of them: this list must hold every dependency of that effect (tests/globe-label-pressed.test.mjs).
  useEffect(() => { if (selectedNationId && mode === 'world') controls.current?.focusNation(selectedNationId); }, [selectedNationId, nationFocusRevision, mode, nationId, cityName, marketOpen, nationSignature, graphics, visitor]);
  useEffect(() => { if (cameraTourNationId && mode === 'world') controls.current?.focusNation(cameraTourNationId, false); }, [cameraTourNationId, mode, nationId, nationSignature, graphics]);
  useEffect(() => { if (selectedLocation && mode === 'city') controls.current?.focus(selectedLocation); }, [selectedLocation, mode, nationId, cityName, graphics]);
  return <div className={`game-viewport ${className}`} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 360 }}>
    <div ref={host} className="viewport-canvas" role="region" aria-label={`${mode === 'city' ? 'City terrain. Drag to pan' : 'Fictional Harimu globe. Drag to rotate'}; scroll to zoom. Arrow keys move the view. Use the location buttons to select with a keyboard.`} tabIndex={0}
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 360, touchAction: 'none' }}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        const key = event.key;
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(key)) event.preventDefault();
        if (key === 'ArrowLeft') controls.current?.pan(mode === 'world' ? -.22 : -1, mode === 'world' ? 0 : 1);
        if (key === 'ArrowRight') controls.current?.pan(mode === 'world' ? .22 : 1, mode === 'world' ? 0 : -1);
        if (key === 'ArrowUp') controls.current?.pan(mode === 'world' ? 0 : -1, mode === 'world' ? -.15 : -1);
        if (key === 'ArrowDown') controls.current?.pan(mode === 'world' ? 0 : 1, mode === 'world' ? .15 : 1);
        if (key === '+' || key === '=') controls.current?.zoom(.15);
        if (key === '-') controls.current?.zoom(-.15);
        if (key === 'Home') controls.current?.reset();
        if (key === 'Enter' && mode === 'city') callback.current(locationSelection(selectedLocation || 'square', nationId, visitor));
      }} />
    {fallback && <p className="viewport-fallback">3D unavailable. Use the bottom strip to continue.</p>}
    <div className="viewport-controls" aria-label="Camera controls">
      <MapOverlaysControl enabled={overlays} lowGraphics={graphics === 'low'} mapLayer={mode === 'world'} />
      <button type="button" onClick={() => controls.current?.zoom(.15)} aria-label="Zoom in">+</button>
      <span aria-live="polite">{cameraLabel}</span>
      <button type="button" onClick={() => controls.current?.zoom(-.15)} aria-label="Zoom out">−</button>
      <button type="button" onClick={() => controls.current?.reset()}>Centre</button>
      <button type="button" onClick={() => controls.current?.pan(mode === 'world' ? -.22 : -1, mode === 'world' ? 0 : 1)} aria-label={mode === 'world' ? 'Rotate globe left' : 'Pan left'}>←</button>
      <button type="button" onClick={() => controls.current?.pan(mode === 'world' ? .22 : 1, mode === 'world' ? 0 : -1)} aria-label={mode === 'world' ? 'Rotate globe right' : 'Pan right'}>→</button>
      <button type="button" onClick={() => controls.current?.pan(mode === 'world' ? 0 : -1, mode === 'world' ? -.15 : -1)} aria-label={mode === 'world' ? 'Rotate globe up' : 'Pan up'}>↑</button>
      <button type="button" onClick={() => controls.current?.pan(mode === 'world' ? 0 : 1, mode === 'world' ? .15 : 1)} aria-label={mode === 'world' ? 'Rotate globe down' : 'Pan down'}>↓</button>
    </div>


  </div>;
}
export default GameViewport;
