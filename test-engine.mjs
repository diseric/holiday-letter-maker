import fs from 'fs';
import { createRequire } from 'module';
globalThis.self = globalThis;
import * as THREE from './vendor/three.module.js';
import { STLExporter } from './vendor/STLExporter.js';
import {
  buildHolidayLetteringProject,
  computeMeshStats,
} from './js/geometry-engine.js';

const require = createRequire(import.meta.url);
const ClipperLib = require('clipper-lib');
const opentype = require('opentype.js');

const fontBuf = fs.readFileSync('./fonts/Lobster-Regular.ttf');
const font = opentype.parse(
  fontBuf.buffer.slice(fontBuf.byteOffset, fontBuf.byteOffset + fontBuf.byteLength)
);

// Test 1: Connected script word with Santa hat, contour baseplate, and top-center hoop
const project1 = buildHolidayLetteringProject(ClipperLib, font, {
  text: 'Christmas',
  layoutMode: 'connected',
  letterHeightMm: 55,
  kerningMm: -1.5,
  letterThicknessMm: 3.5,
  bevelMm: 0.4,
  autoBridgeIslands: true,
  baselineBar: { enabled: false },
  plaque: {
    style: 'contour',
    letterMode: 'raised',
    marginMm: 4.5,
    baseThicknessMm: 2.2,
    fillInteriorHoles: true,
  },
  border: {
    enabled: true,
    widthMm: 2.0,
    heightMm: 1.5,
  },
  accent: {
    type: 'santa-hat',
    anchor: 'top-left',
    scalePercent: 100,
    rotationDeg: -12,
    offsetXMm: 0,
    offsetYMm: 0,
    reliefHeightMm: 1.0,
  },
  hoop: {
    mode: 'dual-balance',
    style: 'teardrop',
    innerDiameterMm: 4.5,
    wallThicknessMm: 2.2,
    spreadPercent: 65,
    offsetXMm: 0,
    offsetYMm: 0,
    autoStemBridge: true,
    matchThickness: true,
  },
});

console.log('Test 1 (Connected Word):', {
  bounds: project1.totalBounds,
  islands: project1.totalIslands,
  layers: project1.units[0].layers.map((l) => l.name),
  hoopAnchors: project1.units[0].hoopAnchors.length,
});

const stats1 = computeMeshStats(project1.units[0].mergedGeometry);
console.log('Test 1 Mesh Stats:', stats1);

const exporter = new STLExporter();
const mesh1 = new THREE.Mesh(project1.units[0].mergedGeometry);
const binaryStl = exporter.parse(mesh1, { binary: true });
console.log('Test 1 Binary STL byteLength:', binaryStl.byteLength);

// Verify binary STL header (80 bytes header + 4 bytes uint32 triangle count + 50 bytes * triCount)
const triCountInStl = binaryStl.getUint32(80, true);
const expectedBytes = 84 + triCountInStl * 50;
console.log('Test 1 STL Triangle Count:', triCountInStl, 'Expected bytes:', expectedBytes);
if (binaryStl.byteLength !== expectedBytes || triCountInStl < 100) {
  throw new Error('Binary STL validation failed!');
}

// Test 2: Individual monogram letters batch with bauble plaque & smart peak hoop
const project2 = buildHolidayLetteringProject(ClipperLib, font, {
  text: 'NOEL',
  layoutMode: 'individual',
  letterHeightMm: 50,
  kerningMm: 0,
  letterThicknessMm: 3.0,
  bevelMm: 0,
  autoBridgeIslands: true,
  plaque: {
    style: 'bauble',
    letterMode: 'recessed',
    marginMm: 6.0,
    baseThicknessMm: 2.0,
  },
  accent: {
    type: 'snowflake',
    anchor: 'top-right',
    scalePercent: 85,
  },
  hoop: {
    mode: 'smart-peak',
    style: 'ring',
    innerDiameterMm: 4.0,
    wallThicknessMm: 2.0,
    autoStemBridge: true,
    matchThickness: true,
  },
});

console.log('Test 2 (Individual Monograms NOEL):', {
  unitCount: project2.units.length,
  totalBounds: project2.totalBounds,
  totalIslands: project2.totalIslands,
});

if (project2.units.length !== 4) {
  throw new Error('Expected 4 individual monogram units for NOEL');
}

// Test 3: Verify all 8 built-in holiday fonts build 3D geometry cleanly
for (const fontFile of fs.readdirSync('./fonts')) {
  const buf = fs.readFileSync(`./fonts/${fontFile}`);
  const f = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const proj = buildHolidayLetteringProject(ClipperLib, f, {
    text: 'Believe',
    layoutMode: 'connected',
    letterHeightMm: 50,
    kerningMm: -0.8,
    letterThicknessMm: 3.0,
    autoBridgeIslands: true,
    plaque: { style: 'contour', marginMm: 4, baseThicknessMm: 2 },
    hoop: { mode: 'top-center', innerDiameterMm: 4, wallThicknessMm: 2 },
  });
  const st = computeMeshStats(proj.units[0].mergedGeometry);
  console.log(`Font ${fontFile}: ${st.triangles} triangles, ${st.volumeCm3} cm³`);
  if (st.triangles < 100) throw new Error(`Font ${fontFile} produced too few triangles`);
}

// Test 4: Verify all 5 plaque styles generate a Backing Plaque & Hoop layer
for (const style of ['contour', 'bauble', 'tag', 'tree', 'snowflake-plaque']) {
  const proj = buildHolidayLetteringProject(ClipperLib, font, {
    text: 'M',
    layoutMode: 'connected',
    letterHeightMm: 50,
    letterThicknessMm: 3.0,
    plaque: { style, letterMode: 'raised', marginMm: 5.0, baseThicknessMm: 2.2 },
    hoop: { mode: 'top-center', innerDiameterMm: 4.0, wallThicknessMm: 2.0 },
  });
  const layerNames = proj.units[0].layers.map((l) => l.name);
  console.log(`Plaque style ${style} -> layers:`, layerNames);
  if (!layerNames.includes('Backing Plaque & Hoop')) {
    throw new Error(`Plaque style ${style} missing Backing Plaque & Hoop layer`);
  }
}

// Test 5: Verify custom picked hoop coordinates in any direction
const projCustomHoop = buildHolidayLetteringProject(ClipperLib, font, {
  text: 'Noel',
  layoutMode: 'connected',
  letterHeightMm: 55,
  letterThicknessMm: 3.5,
  hoop: {
    mode: 'custom',
    style: 'teardrop',
    innerDiameterMm: 4.2,
    wallThicknessMm: 2.2,
    customPoints: [
      { x: -38.5, y: 31.0 },
      { x: 41.2, y: 27.5 },
    ],
    autoStemBridge: true,
    matchThickness: true,
  },
});
console.log('Custom picked hoops anchors:', projCustomHoop.units[0].hoopAnchors);
if (projCustomHoop.units[0].hoopAnchors.length !== 2) {
  throw new Error('Expected 2 custom picked hoop anchors');
}

// Test 6: Sweep hoop X across block lettering NOEL (every 10mm) and verify exact X preservation & dual-peak bridging
const bungeeBuf = fs.readFileSync('./fonts/Bungee-Regular.ttf');
const bungeeFont = opentype.parse(
  bungeeBuf.buffer.slice(bungeeBuf.byteOffset, bungeeBuf.byteOffset + bungeeBuf.byteLength)
);
for (let x = -80; x <= 80; x += 10) {
  const p = buildHolidayLetteringProject(ClipperLib, bungeeFont, {
    text: 'NOEL',
    layoutMode: 'connected',
    letterHeightMm: 60,
    kerningMm: -2.2,
    baselineBar: { enabled: true, heightMm: 4.2 },
    border: { enabled: true, widthMm: 2.4, heightMm: 2.2 },
    hoop: {
      mode: 'custom',
      customPoints: [{ x, y: 35 }],
      innerDiameterMm: 4.4,
      wallThicknessMm: 2.4,
    },
  });
  const a = p.units[0].hoopAnchors[0];
  console.log(
    'Sweep X:',
    x,
    '-> Hoop:',
    a.x,
    a.y,
    'StemTargets:',
    a.stemTargets.map((t) => `${t.x.toFixed(1)},${t.y.toFixed(1)}`)
  );
  if (Math.abs(a.x - x) > 0.01) {
    throw new Error(`Expected hoop X to equal ${x}, got ${a.x}`);
  }
}

console.log('ALL GEOMETRY & STL EXPORT TESTS PASSED!');
