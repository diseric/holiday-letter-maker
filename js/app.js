import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { STLExporter } from '../vendor/STLExporter.js';
import * as BufferGeometryUtils from '../vendor/BufferGeometryUtils.js';
import {
  buildHolidayLetteringProject,
  computeMeshStats,
} from './geometry-engine.js';

const ClipperLib = window.ClipperLib;
const opentype = window.opentype;
const JSZip = window.JSZip;

// Filament color palettes for multi-layer 3D print preview
const PALETTES = {
  classic: {
    base: 0xb82530,       // Festive Crimson Red
    hoop: 0xd4323e,       // Crimson Hoop
    letter: 0xe8bc5a,     // Metallic Holiday Gold
    border: 0xf4f7fa,     // Crisp Snow White
    accent: 0xc92a35,     // Santa Red
    'accent-trim': 0xffffff, // Fluffy White Brim/Pom
  },
  evergreen: {
    base: 0x165b3a,       // Pine Forest Green
    hoop: 0x1e7048,
    letter: 0xf0c565,     // Warm Gold
    border: 0xc9303b,     // Holly Berry Red
    accent: 0x1c6e47,
    'accent-trim': 0xd93843,
  },
  frost: {
    base: 0x266bb5,       // Winter Ice Blue
    hoop: 0x337ecc,
    letter: 0xf4f8fc,     // Pearl Snow White
    border: 0xa6c8ed,     // Frosted Silver-Blue
    accent: 0x4796e6,
    'accent-trim': 0xffffff,
  },
  gold: {
    base: 0xc89938,
    hoop: 0xd4a442,
    letter: 0xf2c96d,
    border: 0xe0b24c,
    accent: 0xe6b855,
    'accent-trim': 0xffe094,
  },
  slicer: {
    base: 0x6f7f91,
    hoop: 0x7b8c9e,
    letter: 0x9aa9ba,
    border: 0x8595a6,
    accent: 0x8c9cad,
    'accent-trim': 0xb0bfd1,
  },
};

// Curated One-Click Holiday Presets
const PRESETS = {
  'block-letters': {
    text: 'NOEL',
    layoutMode: 'connected',
    fontFile: 'Bungee-Regular.ttf',
    letterHeightMm: 60,
    kerningMm: -2.2,
    letterThicknessMm: 5.0,
    bevelMm: 0.4,
    autoBridgeIslands: true,
    bridgeWidthMm: 2.6,
    baselineBar: { enabled: true, heightMm: 4.2, offsetYMm: 0 },
    hoop: {
      mode: 'dual-balance',
      style: 'teardrop',
      innerDiameterMm: 4.4,
      wallThicknessMm: 2.4,
      matchThickness: true,
      thicknessMm: 4.0,
      offsetXMm: 0,
      offsetYMm: 0,
      spreadPercent: 68,
      autoStemBridge: true,
    },
    plaque: {
      style: 'none',
      letterMode: 'raised',
      marginMm: 5.0,
      baseThicknessMm: 2.4,
      fillInteriorHoles: true,
    },
    border: {
      enabled: true,
      widthMm: 2.4,
      heightMm: 2.2,
    },
    accent: {
      type: 'santa-hat',
      anchor: 'top-left',
      scalePercent: 95,
      rotationDeg: -10,
      offsetXMm: -1.5,
      offsetYMm: -2.0,
      reliefHeightMm: 0.9,
    },
  },
  'script-name': {
    text: 'Christmas',
    layoutMode: 'connected',
    fontFile: 'Lobster-Regular.ttf',
    letterHeightMm: 56,
    kerningMm: -1.4,
    letterThicknessMm: 4.0,
    bevelMm: 0.3,
    autoBridgeIslands: true,
    bridgeWidthMm: 2.4,
    baselineBar: { enabled: false, heightMm: 3.8, offsetYMm: 0 },
    hoop: {
      mode: 'dual-balance',
      style: 'teardrop',
      innerDiameterMm: 4.2,
      wallThicknessMm: 2.2,
      matchThickness: true,
      thicknessMm: 3.5,
      offsetXMm: 0,
      offsetYMm: 0,
      spreadPercent: 64,
      autoStemBridge: true,
    },
    plaque: {
      style: 'none',
      letterMode: 'raised',
      marginMm: 5.0,
      baseThicknessMm: 2.4,
      fillInteriorHoles: true,
    },
    border: {
      enabled: true,
      widthMm: 2.2,
      heightMm: 1.8,
    },
    accent: {
      type: 'santa-hat',
      anchor: 'top-left',
      scalePercent: 95,
      rotationDeg: -14,
      offsetXMm: 0,
      offsetYMm: -2.0,
      reliefHeightMm: 0.8,
    },
  },
  'santa-monogram': {
    text: 'M',
    layoutMode: 'connected',
    fontFile: 'CinzelDecorative-Bold.ttf',
    letterHeightMm: 78,
    kerningMm: 0,
    letterThicknessMm: 4.6,
    bevelMm: 0.4,
    autoBridgeIslands: true,
    bridgeWidthMm: 2.4,
    baselineBar: { enabled: false, heightMm: 3.8, offsetYMm: 0 },
    hoop: {
      mode: 'top-center',
      style: 'teardrop',
      innerDiameterMm: 4.6,
      wallThicknessMm: 2.4,
      matchThickness: true,
      thicknessMm: 4.0,
      offsetXMm: 0,
      offsetYMm: 0,
      spreadPercent: 65,
      autoStemBridge: true,
    },
    plaque: {
      style: 'none',
      letterMode: 'raised',
      marginMm: 5.0,
      baseThicknessMm: 2.4,
      fillInteriorHoles: true,
    },
    border: {
      enabled: true,
      widthMm: 2.4,
      heightMm: 2.2,
    },
    accent: {
      type: 'santa-hat',
      anchor: 'top-left',
      scalePercent: 105,
      rotationDeg: 14,
      offsetXMm: 1.5,
      offsetYMm: -2.5,
      reliefHeightMm: 0.9,
    },
  },
  'contour-sign': {
    text: 'Believe',
    layoutMode: 'connected',
    fontFile: 'GreatVibes-Regular.ttf',
    letterHeightMm: 62,
    kerningMm: -1.0,
    letterThicknessMm: 2.8,
    bevelMm: 0.2,
    autoBridgeIslands: true,
    bridgeWidthMm: 2.2,
    baselineBar: { enabled: false, heightMm: 3.8, offsetYMm: 0 },
    hoop: {
      mode: 'dual-balance',
      style: 'ring',
      innerDiameterMm: 4.2,
      wallThicknessMm: 2.2,
      matchThickness: true,
      thicknessMm: 2.4,
      offsetXMm: 0,
      offsetYMm: 0,
      spreadPercent: 62,
      autoStemBridge: true,
    },
    plaque: {
      style: 'contour',
      letterMode: 'raised',
      marginMm: 5.5,
      baseThicknessMm: 2.4,
      fillInteriorHoles: true,
    },
    border: {
      enabled: true,
      widthMm: 1.8,
      heightMm: 1.4,
    },
    accent: {
      type: 'holly',
      anchor: 'bottom-right',
      scalePercent: 95,
      rotationDeg: -8,
      offsetXMm: -2.0,
      offsetYMm: 2.0,
      reliefHeightMm: 0.8,
    },
  },
  'recessed-bauble': {
    text: 'J',
    layoutMode: 'connected',
    fontFile: 'AbrilFatface-Regular.ttf',
    letterHeightMm: 58,
    kerningMm: 0,
    letterThicknessMm: 2.4,
    bevelMm: 0.2,
    autoBridgeIslands: true,
    bridgeWidthMm: 2.2,
    baselineBar: { enabled: false, heightMm: 3.8, offsetYMm: 0 },
    hoop: {
      mode: 'top-center',
      style: 'slot',
      innerDiameterMm: 5.5,
      wallThicknessMm: 2.4,
      matchThickness: true,
      thicknessMm: 3.0,
      offsetXMm: 0,
      offsetYMm: 0,
      spreadPercent: 65,
      autoStemBridge: true,
    },
    plaque: {
      style: 'bauble',
      letterMode: 'recessed',
      marginMm: 10.0,
      baseThicknessMm: 2.2,
      fillInteriorHoles: true,
    },
    border: {
      enabled: true,
      widthMm: 2.6,
      heightMm: 3.0,
    },
    accent: {
      type: 'snowflake',
      anchor: 'top-right',
      scalePercent: 85,
      rotationDeg: 15,
      offsetXMm: 4.0,
      offsetYMm: -2.0,
      reliefHeightMm: 0.8,
    },
  },
  'batch-stocking': {
    text: 'E M J S',
    layoutMode: 'individual',
    fontFile: 'MountainsOfChristmas-Bold.ttf',
    letterHeightMm: 52,
    kerningMm: 0,
    letterThicknessMm: 3.2,
    bevelMm: 0.2,
    autoBridgeIslands: true,
    bridgeWidthMm: 2.2,
    baselineBar: { enabled: false, heightMm: 3.8, offsetYMm: 0 },
    hoop: {
      mode: 'smart-peak',
      style: 'teardrop',
      innerDiameterMm: 4.4,
      wallThicknessMm: 2.2,
      matchThickness: true,
      thicknessMm: 3.0,
      offsetXMm: 0,
      offsetYMm: 0,
      spreadPercent: 65,
      autoStemBridge: true,
    },
    plaque: {
      style: 'tag',
      letterMode: 'raised',
      marginMm: 6.5,
      baseThicknessMm: 2.2,
      fillInteriorHoles: true,
    },
    border: {
      enabled: true,
      widthMm: 2.0,
      heightMm: 1.4,
    },
    accent: {
      type: 'star',
      anchor: 'top-right',
      scalePercent: 75,
      rotationDeg: 0,
      offsetXMm: 3.0,
      offsetYMm: 1.0,
      reliefHeightMm: 0.8,
    },
  },
  'reindeer-word': {
    text: 'NOEL',
    layoutMode: 'connected',
    fontFile: 'BerkshireSwash-Regular.ttf',
    letterHeightMm: 54,
    kerningMm: -1.8,
    letterThicknessMm: 4.2,
    bevelMm: 0.3,
    autoBridgeIslands: true,
    bridgeWidthMm: 2.4,
    baselineBar: { enabled: true, heightMm: 3.8, offsetYMm: 0 },
    hoop: {
      mode: 'top-center',
      style: 'teardrop',
      innerDiameterMm: 4.5,
      wallThicknessMm: 2.4,
      matchThickness: true,
      thicknessMm: 4.0,
      offsetXMm: 0,
      offsetYMm: 0,
      spreadPercent: 65,
      autoStemBridge: true,
    },
    plaque: {
      style: 'none',
      letterMode: 'raised',
      marginMm: 5.0,
      baseThicknessMm: 2.4,
      fillInteriorHoles: true,
    },
    border: {
      enabled: false,
      widthMm: 2.2,
      heightMm: 2.0,
    },
    accent: {
      type: 'antlers',
      anchor: 'top-center',
      scalePercent: 110,
      rotationDeg: 0,
      offsetXMm: 0,
      offsetYMm: -1.5,
      reliefHeightMm: 0.6,
    },
  },
};

// Application State
const state = {
  config: structuredClone(PRESETS['script-name']),
  fontCache: new Map(),
  activeFont: null,
  currentPalette: 'classic',
  wireframe: false,
  showGrid: true,
  selectedUnitIndex: -1, // -1 = All Plate, 0..N = specific individual monogram letter
  lastProject: null,
  pickHoopActive: false,
  activeCustomHoopIndex: 0,
  draggingHoopIndex: -1,
  draggingUnitOffset: { dx: 0, dy: 0 },
};

// Three.js Scene Objects
let scene, camera, renderer, controls;
let ornamentGroup, buildPlateGroup, dimensionHelperGroup, hoopGizmoGroup, hoopPreviewGhost;
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const buildPlatePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

/**
 * Initialize Three.js 3D Viewport
 */
function initViewport() {
  const container = document.getElementById('viewportContainer');
  const canvas = document.getElementById('viewportCanvas');

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    40,
    container.clientWidth / container.clientHeight,
    1,
    2500
  );
  // Looking at the XY build plate from a natural 3D slicer angle (Z is up!)
  camera.up.set(0, 0, 1);
  camera.position.set(0, -175, 195);

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 2);
  controls.maxDistance = 900;
  controls.minDistance = 20;

  // Studio Lighting Setup
  const ambientLight = new THREE.AmbientLight(0xdbe8ff, 0.85);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xfff6e5, 1.65);
  keyLight.position.set(90, -120, 180);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 20;
  keyLight.shadow.camera.far = 550;
  const d = 160;
  keyLight.shadow.camera.left = -d;
  keyLight.shadow.camera.right = d;
  keyLight.shadow.camera.top = d;
  keyLight.shadow.camera.bottom = -d;
  keyLight.shadow.bias = -0.0005;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x8ab8ff, 0.75);
  fillLight.position.set(-120, 90, 110);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffe0a3, 0.55);
  rimLight.position.set(0, 150, 70);
  scene.add(rimLight);

  buildPlateGroup = new THREE.Group();
  scene.add(buildPlateGroup);
  createBuildPlate220mm();

  ornamentGroup = new THREE.Group();
  scene.add(ornamentGroup);

  dimensionHelperGroup = new THREE.Group();
  scene.add(dimensionHelperGroup);

  hoopGizmoGroup = new THREE.Group();
  scene.add(hoopGizmoGroup);

  hoopPreviewGhost = new THREE.Group();
  hoopPreviewGhost.visible = false;
  scene.add(hoopPreviewGhost);

  setupHoopPointerInteractions(canvas);
  window.addEventListener('resize', onWindowResize);
  animate();
}

/**
 * Create a 220x220mm 3D Printer Build Plate in the XY plane (Z=0)
 */
function createBuildPlate220mm() {
  buildPlateGroup.clear();
  const bedSize = 220; // Standard 220x220mm Ender/Prusa/Bambu bed

  // Textured PEI Build Plate Base
  const plateGeom = new THREE.PlaneGeometry(bedSize, bedSize);
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x121a24,
    roughness: 0.75,
    metalness: 0.15,
    transparent: true,
    opacity: 0.88,
  });
  const plateMesh = new THREE.Mesh(plateGeom, plateMat);
  plateMesh.position.z = -0.08;
  plateMesh.receiveShadow = true;
  buildPlateGroup.add(plateMesh);

  // 10mm Minor Grid & 55mm Major Grid in XY plane
  const grid10 = new THREE.GridHelper(bedSize, 22, 0x3b526b, 0x202e3d);
  grid10.rotation.x = Math.PI / 2;
  grid10.position.z = -0.02;
  buildPlateGroup.add(grid10);

  // Build Plate Border Frame
  const half = bedSize / 2;
  const borderPts = [
    new THREE.Vector3(-half, -half, 0.05),
    new THREE.Vector3(half, -half, 0.05),
    new THREE.Vector3(half, half, 0.05),
    new THREE.Vector3(-half, half, 0.05),
    new THREE.Vector3(-half, -half, 0.05),
  ];
  const borderGeom = new THREE.BufferGeometry().setFromPoints(borderPts);
  const borderLine = new THREE.Line(
    borderGeom,
    new THREE.LineBasicMaterial({ color: 0xd4a853 })
  );
  buildPlateGroup.add(borderLine);
}

function onWindowResize() {
  const container = document.getElementById('viewportContainer');
  if (!container) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

/**
 * Load a built-in TTF font from ./fonts/ (cached)
 */
async function loadFontByName(fontFile) {
  if (state.fontCache.has(fontFile)) {
    return state.fontCache.get(fontFile);
  }
  const resp = await fetch(`./fonts/${fontFile}`);
  if (!resp.ok) throw new Error(`Failed to load font ${fontFile}`);
  const arrayBuffer = await resp.arrayBuffer();
  const font = opentype.parse(arrayBuffer);
  state.fontCache.set(fontFile, font);
  return font;
}

/**
 * Rebuild 3D Ornament Geometry & Update Live Stats
 */
function rebuildSceneGeometry() {
  if (!state.activeFont) return;

  const project = buildHolidayLetteringProject(
    ClipperLib,
    state.activeFont,
    state.config
  );
  state.lastProject = project;

  // Clear previous meshes
  while (ornamentGroup.children.length > 0) {
    const child = ornamentGroup.children[0];
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
    ornamentGroup.remove(child);
  }
  dimensionHelperGroup.clear();

  const palette = PALETTES[state.currentPalette] || PALETTES.classic;

  // Update Individual Monogram Selector Bar visibility
  const unitBar = document.getElementById('unitSelectorBar');
  const zipBtn = document.getElementById('exportBatchZipBtn');
  if (project.mode === 'individual' && project.units.length > 1) {
    unitBar.classList.add('visible');
    zipBtn.style.display = 'inline-flex';
    renderUnitSelectorChips(project.units);
  } else {
    unitBar.classList.remove('visible');
    zipBtn.style.display = 'none';
    state.selectedUnitIndex = -1;
  }

  // Decide which units to display in the viewport
  const unitsToRender =
    state.selectedUnitIndex >= 0 && state.selectedUnitIndex < project.units.length
      ? [project.units[state.selectedUnitIndex]]
      : project.units;

  const mergedGeomsForStats = [];

  for (const unit of unitsToRender) {
    const dx =
      state.selectedUnitIndex >= 0 ? 0 : unit.plateOffset ? unit.plateOffset.dx : 0;
    const dy =
      state.selectedUnitIndex >= 0 ? 0 : unit.plateOffset ? unit.plateOffset.dy : 0;

    for (const layer of unit.layers) {
      const colorHex = palette[layer.role] ?? palette.letter;
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: layer.role === 'letter' || layer.role === 'accent-trim' ? 0.32 : 0.48,
        metalness: state.currentPalette === 'gold' ? 0.45 : 0.12,
        wireframe: state.wireframe,
      });

      const mesh = new THREE.Mesh(layer.geometry.clone(), mat);
      mesh.position.set(dx, dy, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      ornamentGroup.add(mesh);
    }

    if (unit.mergedGeometry) {
      const g = unit.mergedGeometry.clone();
      g.translate(dx, dy, 0);
      mergedGeomsForStats.push(g);
    }
  }

  // Compute combined dimensions & stats for currently inspected item(s)
  let totalCombinedGeom = null;
  if (mergedGeomsForStats.length > 0) {
    totalCombinedGeom = BufferGeometryUtils.mergeGeometries(mergedGeomsForStats, false);
    totalCombinedGeom.computeBoundingBox();
  }

  const stats = computeMeshStats(totalCombinedGeom);
  let widthMm = 0,
    heightMm = 0,
    depthMm = 0;

  if (totalCombinedGeom && totalCombinedGeom.boundingBox) {
    const bb = totalCombinedGeom.boundingBox;
    widthMm = bb.max.x - bb.min.x;
    heightMm = bb.max.y - bb.min.y;
    depthMm = bb.max.z - bb.min.z;
    drawBoundingDimensionBox(bb);
  }

  // Update Top Stats HUD
  document.getElementById('statDimensions').textContent = `${widthMm.toFixed(1)} × ${heightMm.toFixed(1)} × ${depthMm.toFixed(1)} mm`;

  const hoopCfg = state.config.hoop;
  if (hoopCfg.mode === 'none') {
    document.getElementById('statHoopHole').textContent = 'None';
  } else {
    const od = hoopCfg.innerDiameterMm + hoopCfg.wallThicknessMm * 2;
    document.getElementById('statHoopHole').textContent = `Ø ${hoopCfg.innerDiameterMm.toFixed(1)} mm (OD ${od.toFixed(1)})`;
  }

  document.getElementById('statFilament').textContent = `${stats.estWeightGrams} g (${stats.volumeCm3} cm³)`;
  document.getElementById('statTriangles').textContent = stats.triangles.toLocaleString();

  // Printability Diagnostics Banner
  updatePrintabilityDiagnostics(project, unitsToRender);

  // Render interactive 3D Hoop Drag Handles & sync custom hoop list
  renderHoopGizmos(unitsToRender, depthMm);
  renderCustomHoopsList();
}

/**
 * Ensure state.config.hoop.customPoints is populated from current hoop anchors
 */
function ensureCustomHoopPointsInitialized() {
  const hoopCfg = state.config.hoop;
  if (
    hoopCfg.mode === 'custom' &&
    Array.isArray(hoopCfg.customPoints) &&
    hoopCfg.customPoints.length > 0
  ) {
    return;
  }
  const unit =
    state.lastProject &&
    state.lastProject.units[
      state.selectedUnitIndex >= 0 ? state.selectedUnitIndex : 0
    ];
  if (unit && unit.hoopAnchors && unit.hoopAnchors.length > 0) {
    hoopCfg.customPoints = unit.hoopAnchors.map((a) => ({
      x: Number(a.x.toFixed(1)),
      y: Number(a.y.toFixed(1)),
    }));
  } else {
    const h = (state.config.letterHeightMm || 60) * 0.55;
    hoopCfg.customPoints = [{ x: 0, y: Number(h.toFixed(1)) }];
  }
  hoopCfg.mode = 'custom';
  hoopCfg.offsetXMm = 0;
  hoopCfg.offsetYMm = 0;
  state.activeCustomHoopIndex = 0;
}

/**
 * Draw interactive draggable 3D handles over each hoop in the viewport
 */
function renderHoopGizmos(unitsToRender, maxZ) {
  while (hoopGizmoGroup.children.length > 0) {
    const c = hoopGizmoGroup.children[0];
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
    hoopGizmoGroup.remove(c);
  }

  if (state.config.hoop.mode === 'none') return;

  const innerR = Math.max(0.8, (state.config.hoop.innerDiameterMm || 4.0) / 2);
  const outerR = innerR + (state.config.hoop.wallThicknessMm || 2.2);
  const handleZ = Math.max(2.0, maxZ + 0.35);

  unitsToRender.forEach((unit) => {
    const dx =
      state.selectedUnitIndex >= 0 ? 0 : unit.plateOffset ? unit.plateOffset.dx : 0;
    const dy =
      state.selectedUnitIndex >= 0 ? 0 : unit.plateOffset ? unit.plateOffset.dy : 0;

    (unit.hoopAnchors || []).forEach((anchor, idx) => {
      const isSelected =
        state.config.hoop.mode === 'custom' && idx === state.activeCustomHoopIndex;

      // Glowing interactive ring gizmo
      const ringGeom = new THREE.RingGeometry(innerR * 0.75, outerR * 1.08, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: isSelected || state.pickHoopActive ? 0xffd25a : 0xe5b85c,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isSelected || state.pickHoopActive ? 0.55 : 0.22,
        depthTest: false,
      });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.position.set(anchor.x + dx, anchor.y + dy, handleZ);
      ringMesh.userData = {
        isHoopHandle: true,
        hoopIndex: idx,
        unitOffset: { dx, dy },
      };
      hoopGizmoGroup.add(ringMesh);
    });
  });
}

/**
 * Update Ghost Preview Hoop while hovering in "Pick Hoop Spot" mode
 */
function updateGhostPreviewHoop(worldX, worldY) {
  while (hoopPreviewGhost.children.length > 0) {
    const c = hoopPreviewGhost.children[0];
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
    hoopPreviewGhost.remove(c);
  }

  const innerR = Math.max(0.8, (state.config.hoop.innerDiameterMm || 4.0) / 2);
  const outerR = innerR + (state.config.hoop.wallThicknessMm || 2.2);
  const ringGeom = new THREE.RingGeometry(innerR, outerR, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffd25a,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.75,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(ringGeom, ringMat);
  mesh.position.set(worldX, worldY, (state.config.letterThicknessMm || 4) + 0.5);
  hoopPreviewGhost.add(mesh);
  hoopPreviewGhost.visible = true;
}

/**
 * Raycast pointer event to the Z=0 build plate plane (returns { x, y } in mm)
 */
function getPointerBuildPlateMm(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);
  const hitPt = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(buildPlatePlane, hitPt);
  return hit ? { x: hitPt.x, y: hitPt.y } : null;
}

/**
 * Setup interactive click-to-place & direct drag-and-drop for hanging hoops on the 3D canvas
 */
function setupHoopPointerInteractions(canvas) {
  let downPos = null;

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    downPos = { x: e.clientX, y: e.clientY };

    const rect = canvas.getBoundingClientRect();
    pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);

    // Check if user grabbed an existing hoop gizmo handle
    const hits = raycaster.intersectObjects(hoopGizmoGroup.children, false);
    if (hits.length > 0) {
      const handle = hits[0].object;
      ensureCustomHoopPointsInitialized();
      state.draggingHoopIndex = handle.userData.hoopIndex ?? 0;
      state.activeCustomHoopIndex = state.draggingHoopIndex;
      state.draggingUnitOffset = handle.userData.unitOffset || { dx: 0, dy: 0 };
      controls.enabled = false;
      canvas.style.cursor = 'grabbing';
      syncUIFromConfig();
      e.stopPropagation();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const pt = getPointerBuildPlateMm(e, canvas);

    // 1. Live dragging a hoop handle across the 3D model
    if (state.draggingHoopIndex >= 0 && pt) {
      const localX = Number((pt.x - state.draggingUnitOffset.dx).toFixed(1));
      const localY = Number((pt.y - state.draggingUnitOffset.dy).toFixed(1));
      if (state.config.hoop.customPoints[state.draggingHoopIndex]) {
        state.config.hoop.customPoints[state.draggingHoopIndex] = {
          x: localX,
          y: localY,
        };
        rebuildSceneGeometry();
      }
      return;
    }

    // 2. Live ghost preview ring when "Pick Hoop Spot" mode is active
    if (state.pickHoopActive && pt) {
      updateGhostPreviewHoop(pt.x, pt.y);
      canvas.style.cursor = 'crosshair';
      return;
    }

    // 3. Hover cursor feedback over hoop handles
    const rect = canvas.getBoundingClientRect();
    pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(hoopGizmoGroup.children, false);
    canvas.style.cursor = hits.length > 0 ? 'grab' : 'default';
  });

  window.addEventListener('pointerup', (e) => {
    if (state.draggingHoopIndex >= 0) {
      state.draggingHoopIndex = -1;
      controls.enabled = true;
      canvas.style.cursor = state.pickHoopActive ? 'crosshair' : 'default';
      syncUIFromConfig();
      rebuildSceneGeometry();
      return;
    }

    // If in "Pick Hoop Spot" mode and user clicked (not dragged camera) on the 3D viewport
    if (
      state.pickHoopActive &&
      downPos &&
      e.target === canvas &&
      Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) < 6
    ) {
      const pt = getPointerBuildPlateMm(e, canvas);
      if (pt) {
        ensureCustomHoopPointsInitialized();
        // Convert world plate coordinate to active unit's local coordinate
        let dx = 0,
          dy = 0;
        if (
          state.lastProject &&
          state.lastProject.mode === 'individual' &&
          state.selectedUnitIndex === -1 &&
          state.lastProject.units.length > 0
        ) {
          // Find closest monogram unit to the click point
          let bestDist = Infinity;
          for (const u of state.lastProject.units) {
            const udx = u.plateOffset?.dx || 0;
            const udy = u.plateOffset?.dy || 0;
            const d = Math.hypot(pt.x - udx, pt.y - udy);
            if (d < bestDist) {
              bestDist = d;
              dx = udx;
              dy = udy;
            }
          }
        }

        const localX = Number((pt.x - dx).toFixed(1));
        const localY = Number((pt.y - dy).toFixed(1));

        if (e.shiftKey) {
          // Shift + Click adds a new hoop
          state.config.hoop.customPoints.push({ x: localX, y: localY });
          state.activeCustomHoopIndex = state.config.hoop.customPoints.length - 1;
          showToast(`Added Hoop #${state.activeCustomHoopIndex + 1} at (${localX}, ${localY} mm)`);
        } else {
          // Normal Click moves the currently active hoop
          const idx = Math.min(
            state.activeCustomHoopIndex,
            state.config.hoop.customPoints.length - 1
          );
          state.config.hoop.customPoints[idx] = { x: localX, y: localY };
          showToast(`Placed Hoop #${idx + 1} at (${localX}, ${localY} mm)`);
        }

        syncUIFromConfig();
        rebuildSceneGeometry();
      }
    }
    downPos = null;
  });
}

/**
 * Toggle interactive "Pick Hoop Spot" mode on/off
 */
function setPickHoopMode(active) {
  state.pickHoopActive = active;
  if (active) {
    ensureCustomHoopPointsInitialized();
    syncUIFromConfig();
    rebuildSceneGeometry();
  } else {
    hoopPreviewGhost.visible = false;
  }

  const vpBtn = document.getElementById('viewportPickHoopBtn');
  const sbBtn = document.getElementById('sidebarPickHoopBtn');
  const banner = document.getElementById('hoopPlacementBanner');
  if (vpBtn) vpBtn.classList.toggle('active', active);
  if (sbBtn) {
    sbBtn.textContent = active
      ? '✓ Picking Active (Click on 3D Letter)'
      : '🎯 Click on 3D Model to Place Hoop';
  }
  if (banner) banner.classList.toggle('visible', active);
}

/**
 * Render the list of custom hoops in the Hoops sidebar tab
 */
function renderCustomHoopsList() {
  const listEl = document.getElementById('customHoopsList');
  if (!listEl) return;
  listEl.innerHTML = '';

  const hoopCfg = state.config.hoop;
  const pts =
    hoopCfg.mode === 'custom' && Array.isArray(hoopCfg.customPoints)
      ? hoopCfg.customPoints
      : state.lastProject?.units?.[0]?.hoopAnchors || [];

  pts.forEach((pt, idx) => {
    const row = document.createElement('div');
    const isSelected =
      hoopCfg.mode === 'custom' && idx === state.activeCustomHoopIndex;
    row.className = `custom-hoop-row ${isSelected ? 'active-target' : ''}`;

    const label = document.createElement('span');
    label.className = 'custom-hoop-coords';
    label.textContent = `Hoop #${idx + 1}: X ${Number(pt.x).toFixed(1)} mm, Y ${Number(pt.y).toFixed(1)} mm`;
    label.title = 'Click to select this hoop for placement';
    label.addEventListener('click', () => {
      ensureCustomHoopPointsInitialized();
      state.activeCustomHoopIndex = idx;
      setPickHoopMode(true);
      rebuildSceneGeometry();
    });
    row.appendChild(label);

    if (pts.length > 1) {
      const delBtn = document.createElement('button');
      delBtn.className = 'custom-hoop-del';
      delBtn.textContent = '✕';
      delBtn.title = 'Remove this hoop';
      delBtn.addEventListener('click', () => {
        ensureCustomHoopPointsInitialized();
        state.config.hoop.customPoints.splice(idx, 1);
        state.activeCustomHoopIndex = Math.max(
          0,
          state.config.hoop.customPoints.length - 1
        );
        syncUIFromConfig();
        rebuildSceneGeometry();
      });
      row.appendChild(delBtn);
    }

    listEl.appendChild(row);
  });
}

/**
 * Draw subtle millimeter bounding frame around the active model on the build plate
 */
function drawBoundingDimensionBox(bb) {
  const z = 0.08;
  const pts = [
    new THREE.Vector3(bb.min.x, bb.min.y, z),
    new THREE.Vector3(bb.max.x, bb.min.y, z),
    new THREE.Vector3(bb.max.x, bb.max.y, z),
    new THREE.Vector3(bb.min.x, bb.max.y, z),
    new THREE.Vector3(bb.min.x, bb.min.y, z),
  ];
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(
    geom,
    new THREE.LineBasicMaterial({
      color: 0xe5b85c,
      transparent: true,
      opacity: 0.45,
    })
  );
  dimensionHelperGroup.add(line);
}

/**
 * Render clickable letter selector chips when in Individual Monogram Mode
 */
function renderUnitSelectorChips(units) {
  const container = document.getElementById('unitChipsContainer');
  container.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = `chip-btn ${state.selectedUnitIndex === -1 ? 'active' : ''}`;
  allBtn.textContent = `All Plate (${units.length})`;
  allBtn.addEventListener('click', () => {
    state.selectedUnitIndex = -1;
    rebuildSceneGeometry();
  });
  container.appendChild(allBtn);

  units.forEach((u, idx) => {
    const btn = document.createElement('button');
    btn.className = `chip-btn ${state.selectedUnitIndex === idx ? 'active' : ''}`;
    btn.textContent = `Letter "${u.text}"`;
    btn.addEventListener('click', () => {
      state.selectedUnitIndex = idx;
      rebuildSceneGeometry();
    });
    container.appendChild(btn);
  });
}

/**
 * Check for disconnected islands or ultra-thin hoop walls and guide the user
 */
function updatePrintabilityDiagnostics(project, unitsToRender) {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  const fixBtn = document.getElementById('quickFixIslandsBtn');

  const expectedIslands = unitsToRender.length;
  const actualIslands = unitsToRender.reduce((acc, u) => acc + u.islandCount, 0);

  if (actualIslands > expectedIslands) {
    const looseCount = actualIslands - expectedIslands;
    dot.className = 'status-dot warn';
    txt.textContent = `⚠ ${looseCount} unconnected letter part(s) detected — tighten kerning, add a baseline bar, or enable Auto-Bridge`;
    fixBtn.style.display = 'inline-block';
  } else if (state.config.hoop.mode !== 'none' && state.config.hoop.innerDiameterMm < 2.2) {
    dot.className = 'status-dot warn';
    txt.textContent = `⚠ Hoop inner hole (${state.config.hoop.innerDiameterMm}mm) is very small for twine — 3.5mm+ recommended`;
    fixBtn.style.display = 'none';
  } else {
    dot.className = 'status-dot';
    const pieceLabel =
      expectedIslands === 1
        ? '1 Solid Connected Piece'
        : `${expectedIslands} Individual Monogram Ornaments`;
    txt.textContent = `✓ ${pieceLabel} • Flat Z=0 Build Plate Base • Ready for Slicer (No Supports Needed)`;
    fixBtn.style.display = 'none';
  }
}

/**
 * Build a merged THREE.Mesh for the current export target (entire plate or single selected monogram)
 */
function getExportMeshForCurrentView() {
  if (!state.lastProject) return null;
  const project = state.lastProject;
  const units =
    state.selectedUnitIndex >= 0 && state.selectedUnitIndex < project.units.length
      ? [project.units[state.selectedUnitIndex]]
      : project.units;

  const geoms = [];
  for (const u of units) {
    if (!u.mergedGeometry) continue;
    const g = u.mergedGeometry.clone();
    const dx =
      state.selectedUnitIndex >= 0 ? 0 : u.plateOffset ? u.plateOffset.dx : 0;
    const dy =
      state.selectedUnitIndex >= 0 ? 0 : u.plateOffset ? u.plateOffset.dy : 0;
    g.translate(dx, dy, 0);
    geoms.push(g);
  }
  if (geoms.length === 0) return null;
  const merged = BufferGeometryUtils.mergeGeometries(geoms, false);
  return new THREE.Mesh(merged);
}

/**
 * Export Binary or ASCII STL file
 */
function exportSTL(binary = true) {
  const mesh = getExportMeshForCurrentView();
  if (!mesh) {
    showToast('No geometry to export!');
    return;
  }

  const exporter = new STLExporter();
  const result = exporter.parse(mesh, { binary });

  const blob = binary
    ? new Blob([result], { type: 'application/octet-stream' })
    : new Blob([result], { type: 'text/plain' });

  const cleanText = (state.config.text || 'holiday')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 24);

  const unitSuffix =
    state.selectedUnitIndex >= 0 && state.lastProject
      ? `_Letter_${state.lastProject.units[state.selectedUnitIndex].text}`
      : '';

  const filename = `NoelForge_${cleanText}${unitSuffix}_${Math.round(
    state.config.letterHeightMm
  )}mm.stl`;

  triggerDownload(blob, filename);
  showToast(`Exported ${binary ? 'Binary' : 'ASCII'} STL: ${filename}`);
}

/**
 * Export all individual monogram letters as separate STL files packaged inside a .ZIP archive
 */
async function exportBatchIndividualZip() {
  if (!state.lastProject || state.lastProject.units.length === 0) return;

  const exporter = new STLExporter();
  const zip = new JSZip();

  state.lastProject.units.forEach((unit, idx) => {
    if (!unit.mergedGeometry) return;
    const mesh = new THREE.Mesh(unit.mergedGeometry.clone());
    const binaryStl = exporter.parse(mesh, { binary: true });
    const safeChar = unit.text.replace(/[^a-zA-Z0-9]/g, 'Char');
    const fname = `Monogram_${idx + 1}_${safeChar}_${Math.round(
      state.config.letterHeightMm
    )}mm.stl`;
    zip.file(fname, binaryStl.buffer);
  });

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const filename = `NoelForge_Monogram_Set_${state.lastProject.units.length}_Letters.zip`;
  triggerDownload(zipBlob, filename);
  showToast(`Exported ${state.lastProject.units.length} Individual STLs in ${filename}`);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showToast(msg) {
  const t = document.getElementById('toastMsg');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

/**
 * Sync DOM input controls with current state.config
 */
function syncUIFromConfig() {
  const cfg = state.config;

  document.getElementById('textInput').value = cfg.text;
  document.getElementById('charCountBadge').textContent = `${cfg.text.length} chars`;
  document.getElementById('fontSelect').value = cfg.fontFile || 'Lobster-Regular.ttf';

  document.querySelectorAll('#blockFontQuickChips .chip-btn').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.font === cfg.fontFile);
  });

  // Layout mode buttons
  document.querySelectorAll('#layoutModeGroup .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === cfg.layoutMode);
  });
  document.getElementById('kerningGroup').style.display =
    cfg.layoutMode === 'connected' ? 'flex' : 'none';
  document.getElementById('layoutModeHint').textContent =
    cfg.layoutMode === 'connected'
      ? 'Fuses overlapping script or kerned letters into a single solid 3D ornament.'
      : 'Generates a separate monogram ornament (with its own hoop, plaque & accent) for each character.';

  // Lettering sliders
  setSlider('letterHeightSlider', 'letterHeightVal', cfg.letterHeightMm, ' mm');
  setSlider('kerningSlider', 'kerningVal', cfg.kerningMm, ' mm');
  setSlider('letterThicknessSlider', 'letterThicknessVal', cfg.letterThicknessMm, ' mm');
  setSlider('bevelSlider', 'bevelVal', cfg.bevelMm, ' mm');

  // Bridges
  document.getElementById('autoBridgeCheck').checked = !!cfg.autoBridgeIslands;
  setSlider('bridgeWidthSlider', 'bridgeWidthVal', cfg.bridgeWidthMm || 2.4, ' mm');
  document.getElementById('bridgeWidthGroup').style.display = cfg.autoBridgeIslands
    ? 'flex'
    : 'none';

  document.getElementById('baselineBarCheck').checked = !!(
    cfg.baselineBar && cfg.baselineBar.enabled
  );
  document.getElementById('baselineBarSubcontrols').style.display =
    cfg.baselineBar && cfg.baselineBar.enabled ? 'grid' : 'none';
  setSlider(
    'baselineBarHeightSlider',
    'baselineBarHeightVal',
    cfg.baselineBar?.heightMm ?? 3.8,
    ' mm'
  );
  setSlider(
    'baselineBarOffsetSlider',
    'baselineBarOffsetVal',
    cfg.baselineBar?.offsetYMm ?? 0,
    ' mm'
  );

  // Hoops
  document.getElementById('hoopModeSelect').value = cfg.hoop.mode;
  document.querySelectorAll('#hoopStyleGroup .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === cfg.hoop.style);
  });
  setSlider('hoopInnerSlider', 'hoopInnerVal', cfg.hoop.innerDiameterMm, ' mm');
  setSlider('hoopWallSlider', 'hoopWallVal', cfg.hoop.wallThicknessMm, ' mm');
  const od = cfg.hoop.innerDiameterMm + cfg.hoop.wallThicknessMm * 2;
  document.getElementById('outerDiameterReadout').textContent = `Outer Ø ${od.toFixed(1)} mm`;

  document.getElementById('hoopMatchThicknessCheck').checked = !!cfg.hoop.matchThickness;
  document.getElementById('hoopCustomThicknessGroup').style.display = cfg.hoop.matchThickness
    ? 'none'
    : 'flex';
  setSlider('hoopThicknessSlider', 'hoopThicknessVal', cfg.hoop.thicknessMm || 3.0, ' mm');
  setSlider('hoopOffsetXSlider', 'hoopOffsetXVal', cfg.hoop.offsetXMm, ' mm');
  setSlider('hoopOffsetYSlider', 'hoopOffsetYVal', cfg.hoop.offsetYMm, ' mm');
  setSlider('hoopSpreadSlider', 'hoopSpreadVal', cfg.hoop.spreadPercent || 65, '%');
  document.getElementById('hoopSpreadGroup').style.display =
    cfg.hoop.mode === 'dual-balance' ? 'flex' : 'none';
  document.getElementById('hoopAutoStemCheck').checked = cfg.hoop.autoStemBridge !== false;

  // Plaque
  document.querySelectorAll('#plaqueStyleGrid .icon-choice').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.style === cfg.plaque.style);
  });
  document.getElementById('plaqueSubcontrols').style.display =
    cfg.plaque.style !== 'none' ? 'flex' : 'none';
  document.querySelectorAll('#plaqueLetterModeGroup .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === cfg.plaque.letterMode);
  });
  setSlider('plaqueMarginSlider', 'plaqueMarginVal', cfg.plaque.marginMm, ' mm');
  setSlider('plaqueThicknessSlider', 'plaqueThicknessVal', cfg.plaque.baseThicknessMm, ' mm');
  document.getElementById('plaqueFillHolesCheck').checked =
    cfg.plaque.fillInteriorHoles !== false;

  // Border
  document.getElementById('borderEnabledCheck').checked = !!cfg.border.enabled;
  document.getElementById('borderSubcontrols').style.display = cfg.border.enabled
    ? 'grid'
    : 'none';
  setSlider('borderWidthSlider', 'borderWidthVal', cfg.border.widthMm, ' mm');
  setSlider('borderHeightSlider', 'borderHeightVal', cfg.border.heightMm, ' mm');

  // Accents
  document.querySelectorAll('#accentTypeGrid .icon-choice').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.type === cfg.accent.type);
  });
  document.getElementById('accentSubcontrols').style.display =
    cfg.accent.type !== 'none' ? 'flex' : 'none';
  document.getElementById('accentAnchorSelect').value = cfg.accent.anchor || 'top-left';
  setSlider('accentScaleSlider', 'accentScaleVal', cfg.accent.scalePercent || 100, '%');
  setSlider('accentRotSlider', 'accentRotVal', cfg.accent.rotationDeg || 0, '°');
  setSlider('accentOffsetXSlider', 'accentOffsetXVal', cfg.accent.offsetXMm || 0, ' mm');
  setSlider('accentOffsetYSlider', 'accentOffsetYVal', cfg.accent.offsetYMm || 0, ' mm');
}

function setSlider(sliderId, labelId, value, unit) {
  const slider = document.getElementById(sliderId);
  const label = document.getElementById(labelId);
  if (slider) slider.value = value;
  if (label) label.textContent = `${Number(value).toFixed(unit === '%' || unit === '°' || Number.isInteger(Number(value)) && unit === ' mm' && sliderId === 'letterHeightSlider' ? 0 : 1)}${unit}`;
}

/**
 * Bind all UI Event Listeners
 */
function bindUIEvents() {
  // Sidebar Tab Switching
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // Top Preset Buttons
  document.querySelectorAll('#presetsBar .preset-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const presetKey = btn.dataset.preset;
      const preset = PRESETS[presetKey];
      if (!preset) return;
      document
        .querySelectorAll('#presetsBar .preset-btn')
        .forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      state.config = structuredClone(preset);
      state.selectedUnitIndex = -1;
      syncUIFromConfig();
      state.activeFont = await loadFontByName(state.config.fontFile);
      rebuildSceneGeometry();
    });
  });

  // Text Input
  const textInput = document.getElementById('textInput');
  textInput.addEventListener('input', () => {
    state.config.text = textInput.value || 'A';
    document.getElementById('charCountBadge').textContent = `${textInput.value.length} chars`;
    state.selectedUnitIndex = -1;
    rebuildSceneGeometry();
  });

  // Layout Mode
  document.querySelectorAll('#layoutModeGroup .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.config.layoutMode = btn.dataset.value;
      state.selectedUnitIndex = -1;
      syncUIFromConfig();
      rebuildSceneGeometry();
    });
  });

  // Font Selection
  document.getElementById('fontSelect').addEventListener('change', async (e) => {
    state.config.fontFile = e.target.value;
    syncUIFromConfig();
    state.activeFont = await loadFontByName(state.config.fontFile);
    rebuildSceneGeometry();
  });

  // Quick Block Font Chips
  document.querySelectorAll('#blockFontQuickChips .chip-btn').forEach((chip) => {
    chip.addEventListener('click', async () => {
      state.config.fontFile = chip.dataset.font;
      syncUIFromConfig();
      state.activeFont = await loadFontByName(state.config.fontFile);
      rebuildSceneGeometry();
    });
  });

  // Custom Font Upload (.TTF / .OTF)
  document.getElementById('customFontInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const font = opentype.parse(buf);
      state.fontCache.set(file.name, font);
      state.activeFont = font;

      const sel = document.getElementById('fontSelect');
      const opt = document.createElement('option');
      opt.value = file.name;
      opt.textContent = `${file.name} (Custom Uploaded)`;
      sel.appendChild(opt);
      sel.value = file.name;
      state.config.fontFile = file.name;

      rebuildSceneGeometry();
      showToast(`Loaded custom font: ${file.name}`);
    } catch (err) {
      showToast(`Error parsing font file: ${err.message}`);
    }
  });

  // Numeric Range Sliders helper
  const bindRange = (sliderId, labelId, unit, setter, decimals = 1) => {
    const el = document.getElementById(sliderId);
    el.addEventListener('input', () => {
      const val = parseFloat(el.value);
      document.getElementById(labelId).textContent = `${val.toFixed(decimals)}${unit}`;
      setter(val);
      rebuildSceneGeometry();
    });
  };

  bindRange('letterHeightSlider', 'letterHeightVal', ' mm', (v) => (state.config.letterHeightMm = v), 0);
  bindRange('kerningSlider', 'kerningVal', ' mm', (v) => (state.config.kerningMm = v), 1);
  bindRange('letterThicknessSlider', 'letterThicknessVal', ' mm', (v) => (state.config.letterThicknessMm = v), 1);
  bindRange('bevelSlider', 'bevelVal', ' mm', (v) => (state.config.bevelMm = v), 1);
  bindRange('bridgeWidthSlider', 'bridgeWidthVal', ' mm', (v) => (state.config.bridgeWidthMm = v), 1);

  document.getElementById('autoBridgeCheck').addEventListener('change', (e) => {
    state.config.autoBridgeIslands = e.target.checked;
    syncUIFromConfig();
    rebuildSceneGeometry();
  });

  document.getElementById('baselineBarCheck').addEventListener('change', (e) => {
    state.config.baselineBar.enabled = e.target.checked;
    syncUIFromConfig();
    rebuildSceneGeometry();
  });

  bindRange('baselineBarHeightSlider', 'baselineBarHeightVal', ' mm', (v) => (state.config.baselineBar.heightMm = v), 1);
  bindRange('baselineBarOffsetSlider', 'baselineBarOffsetVal', ' mm', (v) => (state.config.baselineBar.offsetYMm = v), 1);

  // Hoop Controls
  document.getElementById('hoopModeSelect').addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      ensureCustomHoopPointsInitialized();
    } else {
      state.config.hoop.mode = e.target.value;
      setPickHoopMode(false);
    }
    syncUIFromConfig();
    rebuildSceneGeometry();
  });

  // Interactive Hoop Picker Buttons (Viewport + Sidebar + Add Hoop + Done)
  document.getElementById('viewportPickHoopBtn').addEventListener('click', () => {
    setPickHoopMode(!state.pickHoopActive);
  });

  document.getElementById('sidebarPickHoopBtn').addEventListener('click', () => {
    setPickHoopMode(!state.pickHoopActive);
  });

  document.getElementById('exitPickHoopBtn').addEventListener('click', () => {
    setPickHoopMode(false);
  });

  document.getElementById('addExtraHoopBtn').addEventListener('click', () => {
    ensureCustomHoopPointsInitialized();
    const last =
      state.config.hoop.customPoints[state.config.hoop.customPoints.length - 1] || {
        x: 0,
        y: 30,
      };
    state.config.hoop.customPoints.push({
      x: Number((last.x + 18).toFixed(1)),
      y: Number(last.y.toFixed(1)),
    });
    state.activeCustomHoopIndex = state.config.hoop.customPoints.length - 1;
    setPickHoopMode(true);
    syncUIFromConfig();
    rebuildSceneGeometry();
    showToast(`Added Hoop #${state.activeCustomHoopIndex + 1} — click anywhere on the 3D letter to place it!`);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.pickHoopActive) {
      setPickHoopMode(false);
    }
  });

  document.querySelectorAll('#hoopStyleGroup .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.config.hoop.style = btn.dataset.value;
      syncUIFromConfig();
      rebuildSceneGeometry();
    });
  });

  document.querySelectorAll('#hoopSizeChips .chip-btn').forEach((chip) => {
    chip.addEventListener('click', () => {
      document
        .querySelectorAll('#hoopSizeChips .chip-btn')
        .forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.config.hoop.innerDiameterMm = parseFloat(chip.dataset.inner);
      state.config.hoop.wallThicknessMm = parseFloat(chip.dataset.wall);
      state.config.hoop.style = chip.dataset.style;
      if (state.config.hoop.mode === 'none') state.config.hoop.mode = 'smart-peak';
      syncUIFromConfig();
      rebuildSceneGeometry();
    });
  });

  bindRange('hoopInnerSlider', 'hoopInnerVal', ' mm', (v) => {
    state.config.hoop.innerDiameterMm = v;
    const od = v + state.config.hoop.wallThicknessMm * 2;
    document.getElementById('outerDiameterReadout').textContent = `Outer Ø ${od.toFixed(1)} mm`;
  }, 1);

  bindRange('hoopWallSlider', 'hoopWallVal', ' mm', (v) => {
    state.config.hoop.wallThicknessMm = v;
    const od = state.config.hoop.innerDiameterMm + v * 2;
    document.getElementById('outerDiameterReadout').textContent = `Outer Ø ${od.toFixed(1)} mm`;
  }, 1);

  document.getElementById('hoopMatchThicknessCheck').addEventListener('change', (e) => {
    state.config.hoop.matchThickness = e.target.checked;
    syncUIFromConfig();
    rebuildSceneGeometry();
  });

  bindRange('hoopThicknessSlider', 'hoopThicknessVal', ' mm', (v) => (state.config.hoop.thicknessMm = v), 1);
  bindRange('hoopOffsetXSlider', 'hoopOffsetXVal', ' mm', (v) => (state.config.hoop.offsetXMm = v), 1);
  bindRange('hoopOffsetYSlider', 'hoopOffsetYVal', ' mm', (v) => (state.config.hoop.offsetYMm = v), 1);
  bindRange('hoopSpreadSlider', 'hoopSpreadVal', '%', (v) => (state.config.hoop.spreadPercent = v), 0);

  document.getElementById('hoopAutoStemCheck').addEventListener('change', (e) => {
    state.config.hoop.autoStemBridge = e.target.checked;
    rebuildSceneGeometry();
  });

  // Plaque Controls
  document.querySelectorAll('#plaqueStyleGrid .icon-choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.config.plaque.style = btn.dataset.style;
      syncUIFromConfig();
      rebuildSceneGeometry();
    });
  });

  document.querySelectorAll('#plaqueLetterModeGroup .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.config.plaque.letterMode = btn.dataset.value;
      syncUIFromConfig();
      rebuildSceneGeometry();
    });
  });

  bindRange('plaqueMarginSlider', 'plaqueMarginVal', ' mm', (v) => (state.config.plaque.marginMm = v), 1);
  bindRange('plaqueThicknessSlider', 'plaqueThicknessVal', ' mm', (v) => (state.config.plaque.baseThicknessMm = v), 1);

  document.getElementById('plaqueFillHolesCheck').addEventListener('change', (e) => {
    state.config.plaque.fillInteriorHoles = e.target.checked;
    rebuildSceneGeometry();
  });

  // Border Controls
  document.getElementById('borderEnabledCheck').addEventListener('change', (e) => {
    state.config.border.enabled = e.target.checked;
    syncUIFromConfig();
    rebuildSceneGeometry();
  });

  bindRange('borderWidthSlider', 'borderWidthVal', ' mm', (v) => (state.config.border.widthMm = v), 1);
  bindRange('borderHeightSlider', 'borderHeightVal', ' mm', (v) => (state.config.border.heightMm = v), 1);

  // Holiday Accent Controls
  document.querySelectorAll('#accentTypeGrid .icon-choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.config.accent.type = btn.dataset.type;
      syncUIFromConfig();
      rebuildSceneGeometry();
    });
  });

  document.getElementById('accentAnchorSelect').addEventListener('change', (e) => {
    state.config.accent.anchor = e.target.value;
    rebuildSceneGeometry();
  });

  bindRange('accentScaleSlider', 'accentScaleVal', '%', (v) => (state.config.accent.scalePercent = v), 0);
  bindRange('accentRotSlider', 'accentRotVal', '°', (v) => (state.config.accent.rotationDeg = v), 0);
  bindRange('accentOffsetXSlider', 'accentOffsetXVal', ' mm', (v) => (state.config.accent.offsetXMm = v), 1);
  bindRange('accentOffsetYSlider', 'accentOffsetYVal', ' mm', (v) => (state.config.accent.offsetYMm = v), 1);

  // Quick Fix Unconnected Islands Button
  document.getElementById('quickFixIslandsBtn').addEventListener('click', () => {
    state.config.autoBridgeIslands = true;
    state.config.baselineBar.enabled = true;
    syncUIFromConfig();
    rebuildSceneGeometry();
    showToast('Enabled Auto-Bridge & Baseline Connector Bar!');
  });

  // Viewport Camera & Display Controls
  document.getElementById('camTopBtn').addEventListener('click', () => {
    camera.position.set(0, -0.1, 230);
    controls.target.set(0, 0, 0);
    controls.update();
  });

  document.getElementById('camIsoBtn').addEventListener('click', () => {
    camera.position.set(0, -175, 195);
    controls.target.set(0, 0, 2);
    controls.update();
  });

  document.getElementById('toggleWireframeBtn').addEventListener('click', (e) => {
    state.wireframe = !state.wireframe;
    e.currentTarget.classList.toggle('active', state.wireframe);
    rebuildSceneGeometry();
  });

  document.getElementById('toggleGridBtn').addEventListener('click', (e) => {
    state.showGrid = !state.showGrid;
    e.currentTarget.classList.toggle('active', state.showGrid);
    buildPlateGroup.visible = state.showGrid;
    dimensionHelperGroup.visible = state.showGrid;
  });

  // Filament Palette Swatches
  document.querySelectorAll('.palette-swatch').forEach((sw) => {
    sw.addEventListener('click', () => {
      document
        .querySelectorAll('.palette-swatch')
        .forEach((s) => s.classList.remove('active'));
      sw.classList.add('active');
      state.currentPalette = sw.dataset.palette;
      rebuildSceneGeometry();
    });
  });

  // STL Export Buttons
  document
    .getElementById('exportBinaryStlBtn')
    .addEventListener('click', () => exportSTL(true));
  document
    .getElementById('exportAsciiStlBtn')
    .addEventListener('click', () => exportSTL(false));
  document
    .getElementById('exportBatchZipBtn')
    .addEventListener('click', () => exportBatchIndividualZip());
}

/**
 * Boot Application
 */
async function boot() {
  initViewport();
  syncUIFromConfig();
  bindUIEvents();

  try {
    state.activeFont = await loadFontByName(state.config.fontFile);
    rebuildSceneGeometry();
  } catch (err) {
    console.error('Failed to load initial font:', err);
    showToast('Error loading initial font.');
  }
}

boot();
