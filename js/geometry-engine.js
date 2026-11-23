/**
 * NoelForge 3D - Parametric Holiday Lettering & Ornament Geometry Engine
 * Produces watertight/slicer-ready 3D meshes in exact millimeter (mm) units
 * using opentype.js, ClipperLib 2D boolean operations, and Three.js extrusion.
 */

import * as THREE from '../vendor/three.module.js';
import * as BufferGeometryUtils from '../vendor/BufferGeometryUtils.js';

const CLIPPER_SCALE = 1000; // 1 mm = 1000 Clipper integer units (0.001 mm precision)

/**
 * Sample quadratic bezier curve into line segments
 */
function sampleQuadratic(p0, p1, p2, steps = 14) {
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    pts.push({
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    });
  }
  return pts;
}

/**
 * Sample cubic bezier curve into line segments
 */
function sampleCubic(p0, p1, p2, p3, steps = 18) {
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    pts.push({
      x:
        mt * mt * mt * p0.x +
        3 * mt * mt * t * p1.x +
        3 * mt * t * t * p2.x +
        t * t * t * p3.x,
      y:
        mt * mt * mt * p0.y +
        3 * mt * mt * t * p1.y +
        3 * mt * t * t * p2.y +
        t * t * t * p3.y,
    });
  }
  return pts;
}

/**
 * Convert an opentype.Path into an array of Clipper paths (scaled by CLIPPER_SCALE)
 * Flips Y so +Y is up in 3D millimeter space.
 */
export function opentypePathToClipperPaths(otPath, scale = 1, offsetX = 0, offsetY = 0) {
  const paths = [];
  let current = [];
  let pen = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };

  const pushPt = (pt) => {
    const X = Math.round((pt.x * scale + offsetX) * CLIPPER_SCALE);
    const Y = Math.round((-pt.y * scale + offsetY) * CLIPPER_SCALE);
    if (current.length === 0) {
      current.push({ X, Y });
    } else {
      const prev = current[current.length - 1];
      if (prev.X !== X || prev.Y !== Y) {
        current.push({ X, Y });
      }
    }
  };

  for (const cmd of otPath.commands) {
    if (cmd.type === 'M') {
      if (current.length >= 3) {
        paths.push(current);
      }
      current = [];
      pen = { x: cmd.x, y: cmd.y };
      start = { x: cmd.x, y: cmd.y };
      pushPt(pen);
    } else if (cmd.type === 'L') {
      pen = { x: cmd.x, y: cmd.y };
      pushPt(pen);
    } else if (cmd.type === 'Q') {
      const p1 = { x: cmd.x1, y: cmd.y1 };
      const p2 = { x: cmd.x, y: cmd.y };
      const pts = sampleQuadratic(pen, p1, p2, 14);
      for (const pt of pts) pushPt(pt);
      pen = p2;
    } else if (cmd.type === 'C') {
      const p1 = { x: cmd.x1, y: cmd.y1 };
      const p2 = { x: cmd.x2, y: cmd.y2 };
      const p3 = { x: cmd.x, y: cmd.y };
      const pts = sampleCubic(pen, p1, p2, p3, 18);
      for (const pt of pts) pushPt(pt);
      pen = p3;
    } else if (cmd.type === 'Z') {
      if (current.length >= 3) {
        paths.push(current);
      }
      current = [];
      pen = { ...start };
    }
  }
  if (current.length >= 3) {
    paths.push(current);
  }
  return paths;
}

/**
 * Compute millimeter scale factor so a reference capital letter ('H' or 'M') equals targetHeightMm.
 */
export function computeFontMmScale(font, targetHeightMm) {
  const unitsPerEm = font.unitsPerEm || 1000;
  const refGlyph = font.charToGlyph('H') || font.charToGlyph('M');
  let capUnits = unitsPerEm * 0.72;
  if (refGlyph) {
    const bb = refGlyph.getBoundingBox();
    if (bb && bb.y2 - bb.y1 > 10) {
      capUnits = bb.y2 - bb.y1;
    }
  }
  // When using fontSize = 100 in opentype:
  const pathAt100 = (capUnits / unitsPerEm) * 100;
  return targetHeightMm / pathAt100;
}

/**
 * Build unified Clipper polygons for a text string with custom kerning/overlap (in mm).
 */
export function textToClipperPolygons(ClipperLib, font, text, targetHeightMm, kerningMm = 0) {
  const baseFontSize = 100;
  const mmScale = computeFontMmScale(font, targetHeightMm);
  const unitsPerEm = font.unitsPerEm || 1000;
  const unitToMm = (baseFontSize / unitsPerEm) * mmScale;

  let glyphs;
  try {
    glyphs = font.stringToGlyphs(text);
  } catch (_err) {
    // Fallback for fonts with OpenType GSUB lookup formats not supported by opentype.js
    glyphs = Array.from(text).map((ch) => font.charToGlyph(ch));
  }
  let cursorX = 0; // in mm
  const allNormalizedGlyphPaths = [];

  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i];
    const ch = text[i];

    if (ch === ' ') {
      const adv = (glyph.advanceWidth || unitsPerEm * 0.35) * unitToMm;
      cursorX += Math.max(adv + kerningMm, targetHeightMm * 0.15);
      continue;
    }

    const otPath = glyph.getPath(0, 0, baseFontSize);
    const rawPaths = opentypePathToClipperPaths(otPath, mmScale, cursorX, 0);

    if (rawPaths.length > 0) {
      // Normalize single glyph contours with EvenOdd so inner loops (O, B, e, A) are always holes
      const simplified = ClipperLib.Clipper.SimplifyPolygons(
        rawPaths,
        ClipperLib.PolyFillType.pftEvenOdd
      );
      const cleaned = ClipperLib.Clipper.CleanPolygons(simplified, 1.5);
      for (const p of cleaned) {
        if (p.length >= 3) allNormalizedGlyphPaths.push(p);
      }
    }

    let advanceMm = (glyph.advanceWidth || unitsPerEm * 0.5) * unitToMm;
    if (i < glyphs.length - 1) {
      try {
        const kernUnits = font.getKerningValue(glyph, glyphs[i + 1]);
        advanceMm += kernUnits * unitToMm;
      } catch (_e) {
        // Ignore kerning lookup errors on complex fonts
      }
    }
    cursorX += advanceMm + kerningMm;
  }

  if (allNormalizedGlyphPaths.length === 0) return [];

  // Union all normalized glyph polygons so overlapping script letters fuse into one clean boundary
  const cpr = new ClipperLib.Clipper();
  cpr.AddPaths(allNormalizedGlyphPaths, ClipperLib.PolyType.ptSubject, true);
  const unioned = new ClipperLib.Paths();
  cpr.Execute(
    ClipperLib.ClipType.ctUnion,
    unioned,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero
  );

  return ClipperLib.Clipper.CleanPolygons(unioned, 1.5);
}

/**
 * Compute 2D bounding box in millimeters from Clipper paths
 */
export function getClipperBoundsMm(paths) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const path of paths) {
    for (const pt of path) {
      const x = pt.X / CLIPPER_SCALE;
      const y = pt.Y / CLIPPER_SCALE;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/**
 * Translate Clipper paths by (dxMm, dyMm)
 */
export function translateClipperPaths(paths, dxMm, dyMm) {
  const dX = Math.round(dxMm * CLIPPER_SCALE);
  const dY = Math.round(dyMm * CLIPPER_SCALE);
  return paths.map((path) => path.map((pt) => ({ X: pt.X + dX, Y: pt.Y + dY })));
}

/**
 * Boolean Union of multiple Clipper path arrays
 */
export function unionClipperPaths(ClipperLib, ...pathArrays) {
  const cpr = new ClipperLib.Clipper();
  let added = false;
  for (const arr of pathArrays) {
    if (arr && arr.length > 0) {
      cpr.AddPaths(arr, ClipperLib.PolyType.ptSubject, true);
      added = true;
    }
  }
  if (!added) return [];
  const res = new ClipperLib.Paths();
  cpr.Execute(
    ClipperLib.ClipType.ctUnion,
    res,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero
  );
  return ClipperLib.Clipper.CleanPolygons(res, 1.5);
}

/**
 * Boolean Difference (subject - clip)
 */
export function differenceClipperPaths(ClipperLib, subjectPaths, clipPaths) {
  if (!subjectPaths || subjectPaths.length === 0) return [];
  if (!clipPaths || clipPaths.length === 0) return subjectPaths;
  const cpr = new ClipperLib.Clipper();
  cpr.AddPaths(subjectPaths, ClipperLib.PolyType.ptSubject, true);
  cpr.AddPaths(clipPaths, ClipperLib.PolyType.ptClip, true);
  const res = new ClipperLib.Paths();
  cpr.Execute(
    ClipperLib.ClipType.ctDifference,
    res,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero
  );
  return ClipperLib.Clipper.CleanPolygons(res, 1.5);
}

/**
 * Offset Clipper paths outward (+deltaMm) or inward (-deltaMm)
 */
export function offsetClipperPaths(ClipperLib, paths, deltaMm, fillHoles = false) {
  if (!paths || paths.length === 0) return [];
  let inputPaths = paths;
  if (fillHoles) {
    // Keep only outer boundaries (positive orientation in Clipper)
    inputPaths = paths.filter((p) => ClipperLib.Clipper.Orientation(p));
  }
  if (Math.abs(deltaMm) < 0.01) return inputPaths;

  const co = new ClipperLib.ClipperOffset(2.0, 0.25 * CLIPPER_SCALE);
  co.AddPaths(inputPaths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const offsetted = new ClipperLib.Paths();
  co.Execute(offsetted, deltaMm * CLIPPER_SCALE);

  if (fillHoles) {
    return offsetted.filter((p) => ClipperLib.Clipper.Orientation(p));
  }
  return ClipperLib.Clipper.CleanPolygons(offsetted, 1.5);
}

/**
 * Create basic 2D primitives in Clipper coordinates
 */
export function makeCirclePath(cxMm, cyMm, radiusMm, segments = 48) {
  const path = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    path.push({
      X: Math.round((cxMm + Math.cos(a) * radiusMm) * CLIPPER_SCALE),
      Y: Math.round((cyMm + Math.sin(a) * radiusMm) * CLIPPER_SCALE),
    });
  }
  return path;
}

export function makeRoundedRectPath(cxMm, cyMm, widthMm, heightMm, cornerRadiusMm = 3) {
  const hw = widthMm / 2;
  const hh = heightMm / 2;
  const r = Math.min(cornerRadiusMm, hw * 0.9, hh * 0.9);
  const path = [];
  const corners = [
    { x: cxMm + hw - r, y: cyMm + hh - r, startAngle: 0 },
    { x: cxMm - hw + r, y: cyMm + hh - r, startAngle: Math.PI / 2 },
    { x: cxMm - hw + r, y: cyMm - hh + r, startAngle: Math.PI },
    { x: cxMm + hw - r, y: cyMm - hh + r, startAngle: (3 * Math.PI) / 2 },
  ];
  const segs = 10;
  for (const c of corners) {
    for (let i = 0; i <= segs; i++) {
      const a = c.startAngle + (i / segs) * (Math.PI / 2);
      path.push({
        X: Math.round((c.x + Math.cos(a) * r) * CLIPPER_SCALE),
        Y: Math.round((c.y + Math.sin(a) * r) * CLIPPER_SCALE),
      });
    }
  }
  return path;
}

/**
 * Auto-bridge disconnected floating islands (e.g., dot on 'i' or 'j' or separate letters)
 * by building subtle connecting struts between each disconnected outer island and its nearest neighbor.
 */
export function buildAutoBridgePaths(ClipperLib, paths, strutWidthMm = 2.2) {
  const outerPolys = paths.filter((p) => ClipperLib.Clipper.Orientation(p));
  if (outerPolys.length <= 1) return [];

  // Sort islands largest area first
  const islands = outerPolys
    .map((poly) => ({
      poly,
      area: Math.abs(ClipperLib.Clipper.Area(poly)),
    }))
    .sort((a, b) => b.area - a.area);

  const connected = [islands[0].poly];
  const remaining = islands.slice(1).map((x) => x.poly);
  const bridges = [];

  while (remaining.length > 0) {
    let bestDistSq = Infinity;
    let bestRemIdx = 0;
    let bestPtA = null;
    let bestPtB = null;

    for (let rIdx = 0; rIdx < remaining.length; rIdx++) {
      const rPoly = remaining[rIdx];
      // Sample vertices to find closest pair
      for (let i = 0; i < rPoly.length; i += Math.max(1, Math.floor(rPoly.length / 40))) {
        const pA = rPoly[i];
        for (const cPoly of connected) {
          for (let j = 0; j < cPoly.length; j += Math.max(1, Math.floor(cPoly.length / 40))) {
            const pB = cPoly[j];
            const dx = pA.X - pB.X;
            const dy = pA.Y - pB.Y;
            const dSq = dx * dx + dy * dy;
            if (dSq < bestDistSq) {
              bestDistSq = dSq;
              bestRemIdx = rIdx;
              bestPtA = pA;
              bestPtB = pB;
            }
          }
        }
      }
    }

    if (bestPtA && bestPtB) {
      const ax = bestPtA.X / CLIPPER_SCALE;
      const ay = bestPtA.Y / CLIPPER_SCALE;
      const bx = bestPtB.X / CLIPPER_SCALE;
      const by = bestPtB.Y / CLIPPER_SCALE;
      const angle = Math.atan2(by - ay, bx - ax);
      const dist = Math.hypot(bx - ax, by - ay);
      // Extend 1.2mm into both islands so the boolean union is rock solid
      const ext = 1.4;
      const hw = strutWidthMm / 2;
      const nx = -Math.sin(angle) * hw;
      const ny = Math.cos(angle) * hw;
      const sx = ax - Math.cos(angle) * ext;
      const sy = ay - Math.sin(angle) * ext;
      const ex = bx + Math.cos(angle) * ext;
      const ey = by + Math.sin(angle) * ext;

      if (dist < 45) {
        bridges.push([
          { X: Math.round((sx + nx) * CLIPPER_SCALE), Y: Math.round((sy + ny) * CLIPPER_SCALE) },
          { X: Math.round((sx - nx) * CLIPPER_SCALE), Y: Math.round((sy - ny) * CLIPPER_SCALE) },
          { X: Math.round((ex - nx) * CLIPPER_SCALE), Y: Math.round((ey - ny) * CLIPPER_SCALE) },
          { X: Math.round((ex + nx) * CLIPPER_SCALE), Y: Math.round((ey + ny) * CLIPPER_SCALE) },
        ]);
      }
      connected.push(remaining[bestRemIdx]);
      remaining.splice(bestRemIdx, 1);
    } else {
      break;
    }
  }

  return unionClipperPaths(ClipperLib, bridges);
}

/**
 * Find the highest Y coordinate on any polygon segment at the exact vertical line X = targetX.
 * Interpolates between segment endpoints so flat/angled surfaces between two X vertices are hit in the middle.
 */
export function findTopSurfaceYAtX(paths, targetX) {
  let maxY = -Infinity;
  for (const path of paths) {
    const len = path.length;
    for (let i = 0; i < len; i++) {
      const p1 = path[i];
      const p2 = path[(i + 1) % len];
      const x1 = p1.X / CLIPPER_SCALE;
      const y1 = p1.Y / CLIPPER_SCALE;
      const x2 = p2.X / CLIPPER_SCALE;
      const y2 = p2.Y / CLIPPER_SCALE;
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      if (targetX >= minX - 1e-4 && targetX <= maxX + 1e-4) {
        const dx = x2 - x1;
        const y =
          Math.abs(dx) < 1e-5
            ? Math.max(y1, y2)
            : y1 + ((targetX - x1) / dx) * (y2 - y1);
        if (y > maxY) {
          maxY = y;
        }
      }
    }
  }
  return isFinite(maxY) ? { x: targetX, y: maxY } : null;
}

/**
 * Evaluate all polygon segments continuously (not just corner vertices!) within [minSearchX, maxSearchX]
 * to find the highest anchor point near targetX.
 */
export function findTopAnchorInInterval(paths, targetX, minSearchX, maxSearchX, distancePenalty = 0.35) {
  let bestPt = null;
  let bestScore = -Infinity;

  for (const path of paths) {
    const len = path.length;
    for (let i = 0; i < len; i++) {
      const p1 = path[i];
      const p2 = path[(i + 1) % len];
      const x1 = p1.X / CLIPPER_SCALE;
      const y1 = p1.Y / CLIPPER_SCALE;
      const x2 = p2.X / CLIPPER_SCALE;
      const y2 = p2.Y / CLIPPER_SCALE;

      const segMinX = Math.min(x1, x2);
      const segMaxX = Math.max(x1, x2);
      if (segMaxX < minSearchX || segMinX > maxSearchX) continue;

      // Candidate X positions along this segment within [minSearchX, maxSearchX]:
      // 1) The point on this segment closest in X to targetX (hits the exact middle of horizontal/angled edges!)
      // 2) The clipped endpoints of the segment
      const clampLow = Math.max(segMinX, minSearchX);
      const clampHigh = Math.min(segMaxX, maxSearchX);
      const closestX = Math.max(clampLow, Math.min(clampHigh, targetX));
      const candidateXs = [closestX, clampLow, clampHigh];

      const dxSeg = x2 - x1;
      for (const cx of candidateXs) {
        const cy =
          Math.abs(dxSeg) < 1e-5
            ? Math.max(y1, y2)
            : y1 + ((cx - x1) / dxSeg) * (y2 - y1);
        const dx = Math.abs(cx - targetX);
        const score = cy - dx * distancePenalty;
        if (score > bestScore) {
          bestScore = score;
          bestPt = { x: cx, y: cy };
        }
      }
    }
  }
  return bestPt;
}

/**
 * Find the highest Y coordinate on any polygon segment within [targetX - searchRadius, targetX + searchRadius].
 * Continuously interpolates along segments so flat block-letter surfaces anchor in the middle at targetX.
 */
export function findTopAnchorPoint(paths, targetX, searchRadiusMm = 12) {
  const bounds = getClipperBoundsMm(paths);
  const pt = findTopAnchorInInterval(
    paths,
    targetX,
    targetX - searchRadiusMm,
    targetX + searchRadiusMm,
    0.35
  );
  if (pt) return pt;

  return findNearestContourPoint(paths, targetX, bounds.maxY);
}

/**
 * Resolve anchor point(s) for a hoop placed at X = targetX.
 * - If targetX is over a continuous top surface, anchors directly to the middle of that surface at X = targetX.
 * - If targetX is in the middle between two separate points/peaks on the X axis (a valley like M/U/V/H or gap between letters),
 *   keeps the hoop centered at X = targetX and returns BOTH the left peak and right peak as stem targets!
 */
export function resolveHoopAnchorAtX(paths, targetX, outerRadiusMm = 4.3, customYMm = null) {
  const bounds = getClipperBoundsMm(paths);
  const directTop = findTopSurfaceYAtX(paths, targetX);
  const searchSpan = Math.max(18, Math.min(36, bounds.width * 0.35));

  // Find highest peak to the left [targetX - searchSpan, targetX - 1.0] and right [targetX + 1.0, targetX + searchSpan]
  const leftPeak = findTopAnchorInInterval(
    paths,
    targetX,
    targetX - searchSpan,
    targetX - 0.8,
    0.18
  );
  const rightPeak = findTopAnchorInInterval(
    paths,
    targetX,
    targetX + 0.8,
    targetX + searchSpan,
    0.18
  );

  // Check if targetX sits in a valley or gap between leftPeak and rightPeak on the X axis
  if (leftPeak && rightPeak && rightPeak.x - leftPeak.x >= 1.5) {
    const t = (targetX - leftPeak.x) / (rightPeak.x - leftPeak.x);
    const bridgeLineY = leftPeak.y + t * (rightPeak.y - leftPeak.y);

    // If there is a gap at targetX OR the surface at targetX dips more than 2.0mm below the peak bridge line:
    if (!directTop || bridgeLineY - directTop.y > 2.0) {
      const defaultHoopY = Math.max(leftPeak.y, rightPeak.y, bridgeLineY) + outerRadiusMm * 0.55;
      const hoopY =
        customYMm !== null && isFinite(customYMm)
          ? Math.max(bridgeLineY - outerRadiusMm * 0.2, customYMm)
          : defaultHoopY;
      const targets = [leftPeak, rightPeak];
      return {
        x: Number(targetX.toFixed(1)),
        y: Number(hoopY.toFixed(1)),
        stemTarget: leftPeak,
        stemTargets: targets,
      };
    }
  }

  // Otherwise targetX sits directly over a top surface (e.g., middle of a block letter bar)
  const anchor = directTop || findTopAnchorPoint(paths, targetX, searchSpan);
  const defaultHoopY = anchor.y + outerRadiusMm * 0.6;
  const hoopY =
    customYMm !== null && isFinite(customYMm)
      ? Math.max(anchor.y + outerRadiusMm * 0.25, customYMm)
      : defaultHoopY;

  return {
    x: Number(targetX.toFixed(1)),
    y: Number(hoopY.toFixed(1)),
    stemTarget: anchor,
    stemTargets: [anchor],
  };
}

/**
 * Find the closest point on any polygon contour to an arbitrary (targetX, targetY) in any direction (360°).
 */
export function findNearestContourPoint(paths, targetX, targetY) {
  let minDistSq = Infinity;
  let nearest = { x: targetX, y: targetY };

  for (const path of paths) {
    const len = path.length;
    for (let i = 0; i < len; i++) {
      const p1 = path[i];
      const p2 = path[(i + 1) % len];
      const x1 = p1.X / CLIPPER_SCALE;
      const y1 = p1.Y / CLIPPER_SCALE;
      const x2 = p2.X / CLIPPER_SCALE;
      const y2 = p2.Y / CLIPPER_SCALE;

      const dx = x2 - x1;
      const dy = y2 - y1;
      const segLenSq = dx * dx + dy * dy;
      let t = 0;
      if (segLenSq > 1e-6) {
        t = ((targetX - x1) * dx + (targetY - y1) * dy) / segLenSq;
        t = Math.max(0, Math.min(1, t));
      }
      const projX = x1 + t * dx;
      const projY = y1 + t * dy;
      const dSq = (targetX - projX) * (targetX - projX) + (targetY - projY) * (targetY - projY);
      if (dSq < minDistSq) {
        minDistSq = dSq;
        nearest = { x: projX, y: projY };
      }
    }
  }
  return nearest;
}

/**
 * Check if a point (xMm, yMm) is inside the filled region of Clipper paths
 */
export function isPointInsideClipperPaths(ClipperLib, paths, xMm, yMm) {
  const pt = new ClipperLib.IntPoint(
    Math.round(xMm * CLIPPER_SCALE),
    Math.round(yMm * CLIPPER_SCALE)
  );
  let insideCount = 0;
  for (const poly of paths) {
    const res = ClipperLib.Clipper.PointInPolygon(pt, poly);
    if (res !== 0) {
      // Orientation true = outer polygon, false = inner hole
      if (ClipperLib.Clipper.Orientation(poly)) {
        insideCount++;
      } else {
        insideCount--;
      }
    }
  }
  return insideCount > 0;
}

/**
 * Snap a user-clicked point (rawX, rawY) on or near the 3D letter so that the hoop
 * protrudes cleanly from the nearest outer boundary edge instead of being buried inside a thick letter.
 */
export function snapHoopPointToOuterEdge(
  ClipperLib,
  targetPaths,
  rawX,
  rawY,
  outerRadiusMm = 4.3
) {
  if (!targetPaths || targetPaths.length === 0) {
    return { x: rawX, y: rawY };
  }
  const protrusionMm = Math.max(2.2, outerRadiusMm * 0.65);
  const haloPaths = offsetClipperPaths(ClipperLib, targetPaths, protrusionMm, true);
  if (haloPaths.length === 0) {
    return { x: rawX, y: rawY };
  }

  // If the click point is inside the halo boundary (meaning the user clicked directly on the letter body),
  // project it outward onto the halo contour so the hoop ring always sticks out from the letter edge!
  const insideHalo = isPointInsideClipperPaths(ClipperLib, haloPaths, rawX, rawY);
  if (insideHalo) {
    const bounds = getClipperBoundsMm(targetPaths);
    // Slightly bias upward when clicking on the upper half of a letter so it snaps naturally to top edges
    const biasY = rawY >= bounds.centerY ? rawY + outerRadiusMm * 0.45 : rawY;
    const snapped = findNearestContourPoint(haloPaths, rawX, biasY);
    return {
      x: Number(snapped.x.toFixed(1)),
      y: Number(snapped.y.toFixed(1)),
    };
  }

  // If the user clicked outside the letter, clamp maximum distance so hoops don't float far away
  const nearestOnHalo = findNearestContourPoint(haloPaths, rawX, rawY);
  const distFromHalo = Math.hypot(rawX - nearestOnHalo.x, rawY - nearestOnHalo.y);
  const maxExtraReach = Math.max(12, outerRadiusMm * 2.5);
  if (distFromHalo > maxExtraReach) {
    const angle = Math.atan2(rawY - nearestOnHalo.y, rawX - nearestOnHalo.x);
    return {
      x: Number((nearestOnHalo.x + Math.cos(angle) * maxExtraReach).toFixed(1)),
      y: Number((nearestOnHalo.y + Math.sin(angle) * maxExtraReach).toFixed(1)),
    };
  }

  return {
    x: Number(rawX.toFixed(1)),
    y: Number(rawY.toFixed(1)),
  };
}

/**
 * Build a smooth tapered capsule (convex hull of two circles) from (x1, y1, r1) to (x2, y2, r2)
 */
export function makeTaperedCapsulePaths(ClipperLib, x1, y1, r1, x2, y2, r2) {
  const c1 = makeCirclePath(x1, y1, Math.max(0.4, r1), 40);
  const c2 = makeCirclePath(x2, y2, Math.max(0.4, r2), 32);
  const dist = Math.hypot(x2 - x1, y2 - y1);
  if (dist < 0.2) return [c1];

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  const quad = [
    { X: Math.round((x1 + nx * r1) * CLIPPER_SCALE), Y: Math.round((y1 + ny * r1) * CLIPPER_SCALE) },
    { X: Math.round((x1 - nx * r1) * CLIPPER_SCALE), Y: Math.round((y1 - ny * r1) * CLIPPER_SCALE) },
    { X: Math.round((x2 - nx * r2) * CLIPPER_SCALE), Y: Math.round((y2 - ny * r2) * CLIPPER_SCALE) },
    { X: Math.round((x2 + nx * r2) * CLIPPER_SCALE), Y: Math.round((y2 + ny * r2) * CLIPPER_SCALE) },
  ];
  return unionClipperPaths(ClipperLib, [c1, c2, quad]);
}

/**
 * Build Hanging Hoop 2D Clipper Polygon naturally incorporated into targetPaths (main letter/plaque body)
 * with smooth concave 2D fillets and curved flush mating along the target contour.
 */
export function buildHangingHoops(ClipperLib, targetPaths, hoopConfig) {
  if (!hoopConfig || hoopConfig.mode === 'none') {
    return { hoopPaths: [], holePaths: [], filletedBodyPaths: targetPaths, anchors: [] };
  }

  const bounds = getClipperBoundsMm(targetPaths);
  if (bounds.width <= 0) {
    return { hoopPaths: [], holePaths: [], filletedBodyPaths: targetPaths, anchors: [] };
  }

  const innerRadius = Math.max(0.6, (hoopConfig.innerDiameterMm || 4.0) / 2);
  const wallWidth = Math.max(1.0, hoopConfig.wallThicknessMm || 2.2);
  const outerRadius = innerRadius + wallWidth;
  const manualX = hoopConfig.offsetXMm || 0;
  const manualY = hoopConfig.offsetYMm || 0;
  const style = hoopConfig.style || 'ring'; // 'ring' | 'teardrop' | 'slot'

  // Determine anchor points based on mode
  const rawTargets = [];
  if (hoopConfig.mode === 'custom') {
    const customPts =
      Array.isArray(hoopConfig.customPoints) && hoopConfig.customPoints.length > 0
        ? hoopConfig.customPoints
        : [{ x: bounds.centerX, y: bounds.maxY + outerRadius * 0.5 }];
    for (let i = 0; i < customPts.length; i++) {
      const cp = customPts[i];
      const rawCx = Math.max(
        bounds.minX - outerRadius * 2,
        Math.min(bounds.maxX + outerRadius * 2, cp.x + (i === 0 ? manualX : 0))
      );
      const rawCy = cp.y + (i === 0 ? manualY : 0);

      const resolved = resolveHoopAnchorAtX(
        targetPaths,
        rawCx,
        outerRadius,
        cp.lockY ? rawCy : null
      );
      rawTargets.push({
        x: resolved.x,
        y: resolved.y,
        stemTarget: resolved.stemTarget,
        stemTargets: resolved.stemTargets,
        index: i,
      });
    }
  } else if (hoopConfig.mode === 'top-center') {
    const resolved = resolveHoopAnchorAtX(
      targetPaths,
      bounds.centerX + manualX,
      outerRadius,
      null
    );
    rawTargets.push({
      x: resolved.x,
      y: resolved.y + manualY,
      stemTarget: resolved.stemTarget,
      stemTargets: resolved.stemTargets,
      index: 0,
    });
  } else if (hoopConfig.mode === 'smart-peak') {
    const peakAnchor = findTopAnchorPoint(
      targetPaths,
      bounds.centerX + manualX,
      Math.max(18, bounds.width * 0.42)
    );
    const resolved = resolveHoopAnchorAtX(
      targetPaths,
      peakAnchor.x,
      outerRadius,
      null
    );
    rawTargets.push({
      x: resolved.x,
      y: resolved.y + manualY,
      stemTarget: resolved.stemTarget,
      stemTargets: resolved.stemTargets,
      index: 0,
    });
  } else if (hoopConfig.mode === 'dual-balance') {
    const spread = Math.max(0.15, Math.min(0.48, (hoopConfig.spreadPercent || 65) / 200));
    const leftX = bounds.centerX - bounds.width * spread + manualX;
    const rightX = bounds.centerX + bounds.width * spread + manualX;
    const leftResolved = resolveHoopAnchorAtX(targetPaths, leftX, outerRadius, null);
    const rightResolved = resolveHoopAnchorAtX(targetPaths, rightX, outerRadius, null);
    rawTargets.push({
      x: leftResolved.x,
      y: leftResolved.y + manualY,
      stemTarget: leftResolved.stemTarget,
      stemTargets: leftResolved.stemTargets,
      index: 0,
    });
    rawTargets.push({
      x: rightResolved.x,
      y: rightResolved.y + manualY,
      stemTarget: rightResolved.stemTarget,
      stemTargets: rightResolved.stemTargets,
      index: 1,
    });
  } else if (hoopConfig.mode === 'top-left') {
    const targetX = bounds.minX + bounds.width * 0.18 + manualX;
    const resolved = resolveHoopAnchorAtX(targetPaths, targetX, outerRadius, null);
    rawTargets.push({
      x: resolved.x,
      y: resolved.y + manualY,
      stemTarget: resolved.stemTarget,
      stemTargets: resolved.stemTargets,
      index: 0,
    });
  } else if (hoopConfig.mode === 'top-right') {
    const targetX = bounds.maxX - bounds.width * 0.18 + manualX;
    const resolved = resolveHoopAnchorAtX(targetPaths, targetX, outerRadius, null);
    rawTargets.push({
      x: resolved.x,
      y: resolved.y + manualY,
      stemTarget: resolved.stemTarget,
      stemTargets: resolved.stemTargets,
      index: 0,
    });
  }

  // Erode targetPaths inward to find the interior skeleton/core of the letter strokes.
  // Anchoring the bottom circle of the tapered stem onto this inward-offset core guarantees
  // the stem NEVER pokes out past the curved outer edges of a letter!
  const coreRadius = Math.min(1.35, wallWidth * 0.62);
  let innerCorePaths = offsetClipperPaths(ClipperLib, targetPaths, -coreRadius, false);
  if (innerCorePaths.length === 0) {
    innerCorePaths = offsetClipperPaths(ClipperLib, targetPaths, -0.6, false);
  }
  if (innerCorePaths.length === 0) {
    innerCorePaths = targetPaths;
  }

  const allOuterPaths = [];
  const allInnerHoles = [];

  for (const t of rawTargets) {
    const ax = t.x;
    const ay = t.y;
    const targets =
      t.stemTargets && t.stemTargets.length > 0
        ? t.stemTargets
        : t.stemTarget
        ? [t.stemTarget]
        : [];

    if (style === 'slot') {
      // Wide ribbon slot (stadium oval)
      const slotWidth = innerRadius * 3.2;
      const slotHeight = innerRadius * 1.35;
      const outerW = slotWidth + wallWidth * 2;
      const outerH = slotHeight + wallWidth * 2;
      allOuterPaths.push(makeRoundedRectPath(t.x, t.y, outerW, outerH, outerH / 2));
      allInnerHoles.push(makeRoundedRectPath(t.x, t.y, slotWidth, slotHeight, slotHeight / 2));
    } else {
      // Round ring or teardrop ring
      allOuterPaths.push(makeCirclePath(t.x, t.y, outerRadius, 52));
      allInnerHoles.push(makeCirclePath(t.x, t.y, innerRadius, 44));
    }

    // Smooth tapered capsule stem(s) anchored deep inside the inward-offset letter core
    if (hoopConfig.autoStemBridge !== false && targets.length > 0) {
      const topNeckR =
        style === 'teardrop'
          ? outerRadius * (targets.length === 1 ? 0.86 : 0.62)
          : Math.max(wallWidth * 0.9, outerRadius * 0.56);

      for (const st of targets) {
        // Find nearest interior core point slightly below the surface contact point (st.x, st.y)
        const corePt = findNearestContourPoint(innerCorePaths, st.x, st.y - 1.5);
        const capsule = makeTaperedCapsulePaths(
          ClipperLib,
          ax,
          ay,
          topNeckR,
          corePt.x,
          corePt.y,
          coreRadius
        );
        for (const p of capsule) allOuterPaths.push(p);
      }
    }
  }

  const unionedHoopOuter = unionClipperPaths(ClipperLib, allOuterPaths);

  // Naturally incorporate hoop into targetPaths with a 2D Concave Round Fillet (Morphological Closing)
  // at the neck junction so the hoop blends organically into the letter contour!
  const filletR = Math.min(1.6, wallWidth * 0.72);
  const rawCombined = unionClipperPaths(ClipperLib, targetPaths, unionedHoopOuter);
  const expanded = offsetClipperPaths(ClipperLib, rawCombined, filletR, false);
  const closedFilleted = offsetClipperPaths(ClipperLib, expanded, -filletR, false);

  // Intersect the fillet web with a local window around the hoop(s) so distant letter corners stay untouched
  const hoopNeckWindows = rawTargets.map((t) =>
    makeRoundedRectPath(t.x, t.y - outerRadius * 0.45, outerRadius * 3.8, outerRadius * 3.4, 2)
  );
  const unionedWindows = unionClipperPaths(ClipperLib, hoopNeckWindows);

  // Extract only the added concave fillet webbing inside the neck windows
  const cpr = new ClipperLib.Clipper();
  cpr.AddPaths(closedFilleted, ClipperLib.PolyType.ptSubject, true);
  cpr.AddPaths(unionedWindows, ClipperLib.PolyType.ptClip, true);
  const localFilleted = new ClipperLib.Paths();
  cpr.Execute(
    ClipperLib.ClipType.ctIntersection,
    localFilleted,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero
  );

  // Union the smooth local fillet webbing with the hoop outer shape
  const hoopWithFillet = unionClipperPaths(ClipperLib, unionedHoopOuter, localFilleted);

  // Trim the bottom of the hoop where it meets targetPaths so its visible seam follows the
  // EXACT curved contour of the letter (overlapping by 0.25mm inside for a watertight 3D print)
  // rather than cutting across the letter with a flat horizontal line!
  const slightlyInsetTarget = offsetClipperPaths(ClipperLib, targetPaths, -0.25, false);
  const flushTrimmedHoopOuter =
    slightlyInsetTarget.length > 0
      ? differenceClipperPaths(ClipperLib, hoopWithFillet, slightlyInsetTarget)
      : hoopWithFillet;

  const finalHoopPaths = differenceClipperPaths(
    ClipperLib,
    flushTrimmedHoopOuter,
    allInnerHoles
  );

  const filletedBodyPaths = differenceClipperPaths(
    ClipperLib,
    unionClipperPaths(ClipperLib, targetPaths, finalHoopPaths),
    allInnerHoles
  );

  return {
    hoopPaths: finalHoopPaths,
    holePaths: allInnerHoles,
    filletedBodyPaths,
    anchors: rawTargets,
  };
}

/**
 * Build Backing Plaque 2D Clipper Paths around the lettering
 */
export function buildPlaquePaths(ClipperLib, letterPaths, plaqueConfig) {
  if (!plaqueConfig || plaqueConfig.style === 'none') return [];

  const bounds = getClipperBoundsMm(letterPaths);
  if (bounds.width <= 0) return [];
  const margin = plaqueConfig.marginMm ?? 5.0;

  if (plaqueConfig.style === 'contour') {
    return offsetClipperPaths(
      ClipperLib,
      letterPaths,
      margin,
      plaqueConfig.fillInteriorHoles !== false
    );
  } else if (plaqueConfig.style === 'bauble') {
    const r = Math.max(bounds.width, bounds.height) / 2 + margin + 2;
    return [makeCirclePath(bounds.centerX, bounds.centerY, r, 64)];
  } else if (plaqueConfig.style === 'tag') {
    const w = bounds.width + margin * 2 + 6;
    const h = bounds.height + margin * 2 + 4;
    const chamfer = Math.min(w, h) * 0.22;
    const cx = bounds.centerX;
    const cy = bounds.centerY;
    const hw = w / 2;
    const hh = h / 2;
    const tagPoly = [
      { X: Math.round((cx - hw + chamfer) * CLIPPER_SCALE), Y: Math.round((cy + hh) * CLIPPER_SCALE) },
      { X: Math.round((cx + hw - chamfer) * CLIPPER_SCALE), Y: Math.round((cy + hh) * CLIPPER_SCALE) },
      { X: Math.round((cx + hw) * CLIPPER_SCALE), Y: Math.round((cy + hh - chamfer) * CLIPPER_SCALE) },
      { X: Math.round((cx + hw) * CLIPPER_SCALE), Y: Math.round((cy - hh + chamfer * 0.5) * CLIPPER_SCALE) },
      { X: Math.round((cx + hw - chamfer * 0.5) * CLIPPER_SCALE), Y: Math.round((cy - hh) * CLIPPER_SCALE) },
      { X: Math.round((cx - hw + chamfer * 0.5) * CLIPPER_SCALE), Y: Math.round((cy - hh) * CLIPPER_SCALE) },
      { X: Math.round((cx - hw) * CLIPPER_SCALE), Y: Math.round((cy - hh + chamfer * 0.5) * CLIPPER_SCALE) },
      { X: Math.round((cx - hw) * CLIPPER_SCALE), Y: Math.round((cy + hh - chamfer) * CLIPPER_SCALE) },
    ];
    return offsetClipperPaths(
      ClipperLib,
      unionClipperPaths(ClipperLib, [tagPoly]),
      1.5,
      true
    );
  } else if (plaqueConfig.style === 'tree') {
    // Festive 3-tier pine tree silhouette behind the letters
    const w = Math.max(bounds.width + margin * 2 + 10, bounds.height * 0.95);
    const h = bounds.height + margin * 2 + 16;
    const cx = bounds.centerX;
    const bottomY = bounds.minY - margin - 4;
    const topY = bottomY + h;
    const hw = w / 2;
    const treePoly = [
      { x: cx, y: topY },
      { x: cx + hw * 0.48, y: bottomY + h * 0.66 },
      { x: cx + hw * 0.28, y: bottomY + h * 0.66 },
      { x: cx + hw * 0.76, y: bottomY + h * 0.36 },
      { x: cx + hw * 0.52, y: bottomY + h * 0.36 },
      { x: cx + hw, y: bottomY + h * 0.08 },
      { x: cx + hw * 0.18, y: bottomY + h * 0.08 },
      { x: cx + hw * 0.18, y: bottomY },
      { x: cx - hw * 0.18, y: bottomY },
      { x: cx - hw * 0.18, y: bottomY + h * 0.08 },
      { x: cx - hw, y: bottomY + h * 0.08 },
      { x: cx - hw * 0.52, y: bottomY + h * 0.36 },
      { x: cx - hw * 0.76, y: bottomY + h * 0.36 },
      { x: cx - hw * 0.28, y: bottomY + h * 0.66 },
      { x: cx - hw * 0.48, y: bottomY + h * 0.66 },
    ].map((p) => ({
      X: Math.round(p.x * CLIPPER_SCALE),
      Y: Math.round(p.y * CLIPPER_SCALE),
    }));
    return offsetClipperPaths(
      ClipperLib,
      unionClipperPaths(ClipperLib, [treePoly]),
      1.8,
      true
    );
  } else if (plaqueConfig.style === 'snowflake-plaque') {
    // 6-pointed star / snowflake medallion plaque
    const rOuter = Math.max(bounds.width, bounds.height) / 2 + margin + 6;
    const rInner = rOuter * 0.76;
    const pts = [];
    const spikes = 12;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? rOuter : rInner;
      pts.push({
        X: Math.round((bounds.centerX + Math.cos(a) * r) * CLIPPER_SCALE),
        Y: Math.round((bounds.centerY + Math.sin(a) * r) * CLIPPER_SCALE),
      });
    }
    return offsetClipperPaths(
      ClipperLib,
      unionClipperPaths(ClipperLib, [pts]),
      2.0,
      true
    );
  }

  return [];
}

/**
 * Helper to transform local 2D points [{x, y}] by scale, rotationDeg, and translation (tx, ty)
 */
function transformPtsToClipper(pts, scale, rotationDeg, tx, ty) {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return pts.map((p) => {
    const sx = p.x * scale;
    const sy = p.y * scale;
    const rx = sx * cos - sy * sin + tx;
    const ry = sx * sin + sy * cos + ty;
    return {
      X: Math.round(rx * CLIPPER_SCALE),
      Y: Math.round(ry * CLIPPER_SCALE),
    };
  });
}

/**
 * Build Holiday Accent 2D Polygon Layers:
 * Returns { basePaths, trimPaths } so multi-level accents (like Santa Hat with raised fluffy brim & pom-pom,
 * or Holly Leaves with raised Berries) print with genuine 3D layered relief!
 */
export function buildHolidayAccentPaths(ClipperLib, letterPaths, accentConfig) {
  if (!accentConfig || accentConfig.type === 'none') {
    return { basePaths: [], trimPaths: [] };
  }

  const bounds = getClipperBoundsMm(letterPaths);
  if (bounds.width <= 0) return { basePaths: [], trimPaths: [] };

  const refSize = Math.max(24, bounds.height * 0.48) * ((accentConfig.scalePercent || 100) / 100);
  const rot = accentConfig.rotationDeg || 0;
  const offX = accentConfig.offsetXMm || 0;
  const offY = accentConfig.offsetYMm || 0;

  // Determine anchor position on the lettering
  let anchor = { x: bounds.minX + bounds.width * 0.15, y: bounds.maxY };
  if (accentConfig.anchor === 'top-left') {
    anchor = findTopAnchorPoint(letterPaths, bounds.minX + bounds.width * 0.16, bounds.width * 0.28);
  } else if (accentConfig.anchor === 'top-right') {
    anchor = findTopAnchorPoint(letterPaths, bounds.maxX - bounds.width * 0.16, bounds.width * 0.28);
  } else if (accentConfig.anchor === 'top-center') {
    anchor = findTopAnchorPoint(letterPaths, bounds.centerX, bounds.width * 0.35);
  } else if (accentConfig.anchor === 'bottom-right') {
    anchor = { x: bounds.maxX - bounds.width * 0.12, y: bounds.minY + bounds.height * 0.12 };
  }

  const tx = anchor.x + offX;
  const ty = anchor.y + offY;

  if (accentConfig.type === 'santa-hat') {
    // Classic Santa Hat: Main cap body + raised fluffy cloud brim & pom-pom ball
    const s = refSize / 30;
    const capPts = [
      { x: -13, y: 0 },
      { x: -10, y: 12 },
      { x: -2, y: 21 },
      { x: 9, y: 23 },
      { x: 18, y: 16 },
      { x: 22, y: 7 },
      { x: 15, y: 9 },
      { x: 8, y: 11 },
      { x: 11, y: 0 },
    ];
    const capPoly = transformPtsToClipper(capPts, s, rot, tx, ty);

    // Fluffy cloud brim (series of overlapping circles along bottom of hat)
    const brimCircles = [];
    for (let bx = -13; bx <= 11; bx += 4.8) {
      const c = transformPtsToClipper([{ x: bx, y: 0.5 }], s, rot, tx, ty)[0];
      brimCircles.push(makeCirclePath(c.X / CLIPPER_SCALE, c.Y / CLIPPER_SCALE, 3.8 * s, 28));
    }
    // Pom-pom at the tip
    const pomCenter = transformPtsToClipper([{ x: 21.5, y: 6.5 }], s, rot, tx, ty)[0];
    const pomPoly = makeCirclePath(
      pomCenter.X / CLIPPER_SCALE,
      pomCenter.Y / CLIPPER_SCALE,
      4.6 * s,
      32
    );

    const trimPaths = unionClipperPaths(ClipperLib, brimCircles, [pomPoly]);
    const basePaths = unionClipperPaths(ClipperLib, [capPoly], trimPaths);
    return { basePaths, trimPaths };
  } else if (accentConfig.type === 'snowflake') {
    // 3D-printable 6-branch dendrite snowflake with thick printable arms
    const s = refSize / 30;
    const arms = [];
    const armHalfW = Math.max(0.95, 1.35 * s);
    const armLen = 14 * s;

    for (let i = 0; i < 6; i++) {
      const a = ((i * 60 + rot) * Math.PI) / 180;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const nx = -sin * armHalfW;
      const ny = cos * armHalfW;
      const ex = cos * armLen;
      const ey = sin * armLen;
      arms.push([
        { X: Math.round((tx + nx) * CLIPPER_SCALE), Y: Math.round((ty + ny) * CLIPPER_SCALE) },
        { X: Math.round((tx - nx) * CLIPPER_SCALE), Y: Math.round((ty - ny) * CLIPPER_SCALE) },
        { X: Math.round((tx + ex - nx) * CLIPPER_SCALE), Y: Math.round((ty + ey - ny) * CLIPPER_SCALE) },
        { X: Math.round((tx + ex + nx) * CLIPPER_SCALE), Y: Math.round((ty + ey + ny) * CLIPPER_SCALE) },
      ]);

      // Side crystals at 55% and 80% along each arm
      for (const frac of [0.52, 0.78]) {
        const bx = tx + cos * armLen * frac;
        const by = ty + sin * armLen * frac;
        const branchLen = armLen * (frac === 0.52 ? 0.38 : 0.25);
        for (const side of [-1, 1]) {
          const ba = a + (side * Math.PI) / 3;
          const bCos = Math.cos(ba);
          const bSin = Math.sin(ba);
          const bnx = -bSin * armHalfW * 0.85;
          const bny = bCos * armHalfW * 0.85;
          const bex = bCos * branchLen;
          const bey = bSin * branchLen;
          arms.push([
            { X: Math.round((bx + bnx) * CLIPPER_SCALE), Y: Math.round((by + bny) * CLIPPER_SCALE) },
            { X: Math.round((bx - bnx) * CLIPPER_SCALE), Y: Math.round((by - bny) * CLIPPER_SCALE) },
            { X: Math.round((bx + bex - bnx) * CLIPPER_SCALE), Y: Math.round((by + bey - bny) * CLIPPER_SCALE) },
            { X: Math.round((bx + bex + bnx) * CLIPPER_SCALE), Y: Math.round((by + bey + bny) * CLIPPER_SCALE) },
          ]);
        }
      }
    }
    const centerHex = makeCirclePath(tx, ty, 4.5 * s, 6);
    const innerGem = makeCirclePath(tx, ty, 2.5 * s, 6);
    const basePaths = unionClipperPaths(ClipperLib, arms, [centerHex]);
    return { basePaths, trimPaths: [innerGem] };
  } else if (accentConfig.type === 'holly') {
    // Pair of holly leaves + 3 raised holly berries
    const s = refSize / 30;
    const leafTemplate = [
      { x: 0, y: 0 },
      { x: 4, y: 5 },
      { x: 3.5, y: 8 },
      { x: 9, y: 9 },
      { x: 8.5, y: 13 },
      { x: 15, y: 15 },
      { x: 13, y: 9 },
      { x: 10, y: 8 },
      { x: 9, y: 3.5 },
      { x: 5, y: 3 },
    ];
    const leaf1 = transformPtsToClipper(leafTemplate, s, rot + 10, tx, ty);
    const leaf2 = transformPtsToClipper(
      leafTemplate.map((p) => ({ x: -p.x, y: p.y })),
      s,
      rot - 15,
      tx,
      ty
    );
    const berries = [
      { x: 0, y: 2.2 },
      { x: -3.2, y: -0.5 },
      { x: 3.2, y: -0.5 },
    ].map((b) => {
      const c = transformPtsToClipper([b], s, rot, tx, ty)[0];
      return makeCirclePath(c.X / CLIPPER_SCALE, c.Y / CLIPPER_SCALE, 3.0 * s, 28);
    });
    const trimPaths = unionClipperPaths(ClipperLib, berries);
    const basePaths = unionClipperPaths(ClipperLib, [leaf1, leaf2], trimPaths);
    return { basePaths, trimPaths };
  } else if (accentConfig.type === 'star') {
    // 8-point North Star / Star of Bethlehem
    const s = refSize / 30;
    const outerPts = [];
    const innerPts = [];
    for (let i = 0; i < 16; i++) {
      const a = ((i * 22.5 + rot) * Math.PI) / 180;
      const r = i % 2 === 0 ? (i % 4 === 0 ? 15 * s : 10 * s) : 4.2 * s;
      outerPts.push({
        X: Math.round((tx + Math.cos(a) * r) * CLIPPER_SCALE),
        Y: Math.round((ty + Math.sin(a) * r) * CLIPPER_SCALE),
      });
      const rIn = r * 0.52;
      innerPts.push({
        X: Math.round((tx + Math.cos(a) * rIn) * CLIPPER_SCALE),
        Y: Math.round((ty + Math.sin(a) * rIn) * CLIPPER_SCALE),
      });
    }
    return {
      basePaths: unionClipperPaths(ClipperLib, [outerPts]),
      trimPaths: unionClipperPaths(ClipperLib, [innerPts]),
    };
  } else if (accentConfig.type === 'antlers') {
    // Symmetrical left & right reindeer antlers sprouting from top of letter/word
    const s = refSize / 30;
    const antlerSide = [
      { x: 0, y: -2 },
      { x: 3, y: 6 },
      { x: 1, y: 12 },
      { x: 3, y: 13 },
      { x: 5.5, y: 8 },
      { x: 8, y: 12 },
      { x: 6.5, y: 18 },
      { x: 8.8, y: 19 },
      { x: 10.5, y: 13.5 },
      { x: 15, y: 18 },
      { x: 17, y: 16.5 },
      { x: 11.5, y: 10 },
      { x: 6.5, y: 4 },
      { x: 3, y: -2 },
    ];
    const leftAnchor = findTopAnchorPoint(
      letterPaths,
      bounds.centerX - Math.min(bounds.width * 0.25, 14),
      bounds.width * 0.3
    );
    const rightAnchor = findTopAnchorPoint(
      letterPaths,
      bounds.centerX + Math.min(bounds.width * 0.25, 14),
      bounds.width * 0.3
    );
    const rightAntler = transformPtsToClipper(
      antlerSide,
      s,
      rot,
      rightAnchor.x + offX,
      rightAnchor.y + offY
    );
    const leftAntler = transformPtsToClipper(
      antlerSide.map((p) => ({ x: -p.x, y: p.y })),
      s,
      -rot,
      leftAnchor.x - offX,
      leftAnchor.y + offY
    );
    const basePaths = offsetClipperPaths(
      ClipperLib,
      unionClipperPaths(ClipperLib, [leftAntler, rightAntler]),
      0.8 * s,
      false
    );
    return { basePaths, trimPaths: [] };
  }

  return { basePaths: [], trimPaths: [] };
}

/**
 * Convert Clipper Paths into a hierarchy of THREE.Shape objects (preserving outer contours and interior holes)
 * using ClipperLib.PolyTree.
 */
export function clipperPathsToThreeShapes(ClipperLib, paths) {
  if (!paths || paths.length === 0) return [];

  const cpr = new ClipperLib.Clipper();
  cpr.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
  const polyTree = new ClipperLib.PolyTree();
  cpr.Execute(
    ClipperLib.ClipType.ctUnion,
    polyTree,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero
  );

  const shapes = [];

  function processNode(node) {
    if (!node.IsHole() && node.Contour().length >= 3) {
      const contour = node.Contour();
      const shape = new THREE.Shape();
      shape.moveTo(contour[0].X / CLIPPER_SCALE, contour[0].Y / CLIPPER_SCALE);
      for (let i = 1; i < contour.length; i++) {
        shape.lineTo(contour[i].X / CLIPPER_SCALE, contour[i].Y / CLIPPER_SCALE);
      }
      shape.closePath();

      // Direct children of an outer polygon in a PolyTree are its holes
      const children = node.Childs();
      for (let c = 0; c < children.length; c++) {
        const holeNode = children[c];
        const hContour = holeNode.Contour();
        if (hContour.length >= 3) {
          const holePath = new THREE.Path();
          holePath.moveTo(hContour[0].X / CLIPPER_SCALE, hContour[0].Y / CLIPPER_SCALE);
          for (let j = 1; j < hContour.length; j++) {
            holePath.lineTo(hContour[j].X / CLIPPER_SCALE, hContour[j].Y / CLIPPER_SCALE);
          }
          holePath.closePath();
          shape.holes.push(holePath);
        }
        // Grandchildren are nested outer islands inside holes (e.g. target rings)
        const grandChildren = holeNode.Childs();
        for (let g = 0; g < grandChildren.length; g++) {
          processNode(grandChildren[g]);
        }
      }

      shapes.push(shape);
    } else {
      const children = node.Childs();
      for (let c = 0; c < children.length; c++) {
        processNode(children[c]);
      }
    }
  }

  const rootChilds = polyTree.Childs();
  for (let i = 0; i < rootChilds.length; i++) {
    processNode(rootChilds[i]);
  }

  return shapes;
}

/**
 * Extrude Clipper Paths into a THREE.BufferGeometry positioned from zStartMm to zStartMm + depthMm.
 */
export function extrudeClipperPaths(
  ClipperLib,
  paths,
  depthMm,
  zStartMm = 0,
  bevelMm = 0
) {
  const shapes = clipperPathsToThreeShapes(ClipperLib, paths);
  if (shapes.length === 0 || depthMm <= 0.05) return null;

  const useBevel = bevelMm > 0.02;
  const geom = new THREE.ExtrudeGeometry(shapes, {
    depth: Math.max(0.1, depthMm - (useBevel ? bevelMm : 0)),
    bevelEnabled: useBevel,
    bevelThickness: useBevel ? bevelMm : 0,
    bevelSize: useBevel ? bevelMm * 0.85 : 0,
    bevelOffset: useBevel ? -bevelMm * 0.4 : 0,
    bevelSegments: useBevel ? 3 : 1,
    curveSegments: 12,
  });

  if (zStartMm !== 0) {
    geom.translate(0, 0, zStartMm);
  }
  geom.computeVertexNormals();
  return geom;
}

/**
 * Generate a single complete ornament unit (either a connected word or an individual monogram letter)
 * Returns { layers: [{ name, role, geometry, zMin, zMax }], bounds, islandCount, hoopAnchors, mergedGeometry }
 */
export function buildSingleOrnamentUnit(ClipperLib, font, text, config) {
  const letterHeightMm = config.letterHeightMm || 60;
  const kerningMm = config.kerningMm || 0;
  const letterThicknessMm = config.letterThicknessMm || 4.0;
  const bevelMm = config.bevelMm || 0;

  // 1. Base text polygons
  let letterPaths = textToClipperPolygons(
    ClipperLib,
    font,
    text,
    letterHeightMm,
    kerningMm
  );
  if (letterPaths.length === 0) {
    return { layers: [], bounds: getClipperBoundsMm([]), islandCount: 0, hoopAnchors: [], mergedGeometry: null };
  }

  // Center text at origin (0, 0)
  const rawBounds = getClipperBoundsMm(letterPaths);
  letterPaths = translateClipperPaths(letterPaths, -rawBounds.centerX, -rawBounds.centerY);
  const centeredBounds = getClipperBoundsMm(letterPaths);

  // 2. Optional Baseline Connector / Runner Bar (fuses multi-letter words along the bottom)
  if (config.baselineBar && config.baselineBar.enabled) {
    const barH = config.baselineBar.heightMm || Math.max(2.6, letterHeightMm * 0.075);
    const barY = centeredBounds.minY + (config.baselineBar.offsetYMm || 0) + barH * 0.35;
    const barW = centeredBounds.width + (config.baselineBar.padWidthMm || 2);
    const barPath = makeRoundedRectPath(
      centeredBounds.centerX,
      barY,
      Math.max(4, barW),
      barH,
      barH * 0.45
    );
    letterPaths = unionClipperPaths(ClipperLib, letterPaths, [barPath]);
  }

  // 3. Optional Auto-Bridge for floating islands (dots on 'i'/'j', disconnected script letters)
  if (config.autoBridgeIslands) {
    const bridgePaths = buildAutoBridgePaths(
      ClipperLib,
      letterPaths,
      config.bridgeWidthMm || Math.max(2.0, letterHeightMm * 0.042)
    );
    if (bridgePaths.length > 0) {
      letterPaths = unionClipperPaths(ClipperLib, letterPaths, bridgePaths);
    }
  }

  // 4. Holiday Accents
  const accentResult = buildHolidayAccentPaths(ClipperLib, letterPaths, config.accent);

  // 5. Backing Plaque
  const plaqueConfig = config.plaque || { style: 'none' };
  const hasPlaque = plaqueConfig.style && plaqueConfig.style !== 'none';
  let plaquePaths = hasPlaque ? buildPlaquePaths(ClipperLib, letterPaths, plaqueConfig) : [];

  // 6. Build Hanging Hoops directly against the main body (letters/plaque/accents) BEFORE the outline border
  // so hoops anchor directly into the main letter body and the outline border wraps around both seamlessly!
  const mainBodyForHoops = unionClipperPaths(
    ClipperLib,
    letterPaths,
    plaquePaths,
    accentResult.basePaths
  );
  const hoopResult = buildHangingHoops(ClipperLib, mainBodyForHoops, config.hoop);

  // 7. Raised Border / Outlined Halo Layer (wraps around the unified letters + hoop silhouette)
  const borderConfig = config.border || { enabled: false };
  let borderPaths = [];
  if (borderConfig.enabled) {
    const borderW = borderConfig.widthMm || 2.4;
    if (hasPlaque && plaquePaths.length > 0) {
      // Raised rim around the outer edge of the plaque
      const innerRim = offsetClipperPaths(ClipperLib, plaquePaths, -borderW, false);
      borderPaths = differenceClipperPaths(ClipperLib, plaquePaths, innerRim);
    } else {
      // Outlined halo base/frame wrapping smoothly around the letters AND the incorporated hoop(s)
      const unifiedLetterAndHoop = unionClipperPaths(
        ClipperLib,
        letterPaths,
        hoopResult.hoopPaths
      );
      const outerHalo = offsetClipperPaths(ClipperLib, unifiedLetterAndHoop, borderW, false);
      borderPaths = outerHalo;
    }
  }

  // If hoop has a hole, ensure the hole cuts through any overlapping plaque or border
  if (hoopResult.holePaths && hoopResult.holePaths.length > 0) {
    if (plaquePaths.length > 0) {
      plaquePaths = differenceClipperPaths(ClipperLib, plaquePaths, hoopResult.holePaths);
    }
    if (borderPaths.length > 0) {
      borderPaths = differenceClipperPaths(ClipperLib, borderPaths, hoopResult.holePaths);
    }
    if (letterPaths.length > 0) {
      letterPaths = differenceClipperPaths(ClipperLib, letterPaths, hoopResult.holePaths);
    }
  }

  // Count disconnected outer islands of the complete footprint (at Z=0) for printability diagnostics
  const completeFootprint = unionClipperPaths(
    ClipperLib,
    letterPaths,
    plaquePaths,
    borderPaths,
    accentResult.basePaths,
    hoopResult.hoopPaths
  );
  const outerIslands = completeFootprint.filter((p) => ClipperLib.Clipper.Orientation(p));
  const islandCount = outerIslands.length;

  // 8. Build 3D Extruded Layers (all anchored cleanly at Z=0 on the print bed!)
  const layers = [];
  const plaqueBaseThickness = hasPlaque ? (plaqueConfig.baseThicknessMm || 2.5) : 0;
  const plaqueMode = hasPlaque ? (plaqueConfig.letterMode || 'raised') : 'freestanding';

  if (hasPlaque && plaquePaths.length > 0) {
    if (plaqueMode === 'raised') {
      // Baseplate from Z=0 to plaqueBaseThickness
      const baseAndHoop = unionClipperPaths(ClipperLib, plaquePaths, hoopResult.hoopPaths);
      const baseGeom = extrudeClipperPaths(ClipperLib, baseAndHoop, plaqueBaseThickness, 0, 0);
      if (baseGeom) {
        layers.push({
          name: 'Backing Plaque & Hoop',
          role: 'base',
          geometry: baseGeom,
          zMin: 0,
          zMax: plaqueBaseThickness,
        });
      }
      // Letters from Z=0 to plaqueBaseThickness + letterThicknessMm (full Z union for watertight mesh)
      const totalLetterZ = plaqueBaseThickness + letterThicknessMm;
      const letterGeom = extrudeClipperPaths(ClipperLib, letterPaths, totalLetterZ, 0, bevelMm);
      if (letterGeom) {
        layers.push({
          name: 'Raised Holiday Letters',
          role: 'letter',
          geometry: letterGeom,
          zMin: 0,
          zMax: totalLetterZ,
        });
      }
    } else if (plaqueMode === 'recessed') {
      // Recessed (engraved pocket): Solid floor from Z=0 to plaqueBaseThickness,
      // then top wall (plaque minus letters) from Z=0 to plaqueBaseThickness + letterThicknessMm
      const floorAndHoop = unionClipperPaths(ClipperLib, plaquePaths, hoopResult.hoopPaths);
      const floorGeom = extrudeClipperPaths(ClipperLib, floorAndHoop, plaqueBaseThickness, 0, 0);
      if (floorGeom) {
        layers.push({
          name: 'Plaque Floor & Hoop',
          role: 'base',
          geometry: floorGeom,
          zMin: 0,
          zMax: plaqueBaseThickness,
        });
      }
      const recessedTop = differenceClipperPaths(ClipperLib, plaquePaths, letterPaths);
      const totalZ = plaqueBaseThickness + letterThicknessMm;
      const topWallGeom = extrudeClipperPaths(ClipperLib, recessedTop, totalZ, 0, bevelMm);
      if (topWallGeom) {
        layers.push({
          name: 'Engraved Plaque Face',
          role: 'letter',
          geometry: topWallGeom,
          zMin: 0,
          zMax: totalZ,
        });
      }
    } else if (plaqueMode === 'cutout') {
      // Through-cutout stencil plaque
      const stencilPaths = unionClipperPaths(
        ClipperLib,
        differenceClipperPaths(ClipperLib, plaquePaths, letterPaths),
        hoopResult.hoopPaths
      );
      const totalZ = Math.max(plaqueBaseThickness, letterThicknessMm);
      const stencilGeom = extrudeClipperPaths(ClipperLib, stencilPaths, totalZ, 0, bevelMm);
      if (stencilGeom) {
        layers.push({
          name: 'Cutout Stencil Plaque',
          role: 'base',
          geometry: stencilGeom,
          zMin: 0,
          zMax: totalZ,
        });
      }
    }
  } else {
    // Free-standing 3D Letters (no plaque)
    const letterGeom = extrudeClipperPaths(
      ClipperLib,
      letterPaths,
      letterThicknessMm,
      0,
      bevelMm
    );
    if (letterGeom) {
      layers.push({
        name: '3D Holiday Letters',
        role: 'letter',
        geometry: letterGeom,
        zMin: 0,
        zMax: letterThicknessMm,
      });
    }

    // Hanging Hoop (sits flat at Z=0 on print bed, with matching top bevel when matching letter thickness)
    if (hoopResult.hoopPaths.length > 0) {
      const hoopZ = config.hoop.matchThickness
        ? letterThicknessMm
        : Math.min(letterThicknessMm, config.hoop.thicknessMm || letterThicknessMm);
      const hoopBevel = config.hoop.matchThickness ? bevelMm : 0;
      const hoopGeom = extrudeClipperPaths(
        ClipperLib,
        hoopResult.hoopPaths,
        hoopZ,
        0,
        hoopBevel
      );
      if (hoopGeom) {
        layers.push({
          name: 'Hanging Hoop',
          role: 'hoop',
          geometry: hoopGeom,
          zMin: 0,
          zMax: hoopZ,
        });
      }
    }
  }

  // Border / Halo Layer
  if (borderConfig.enabled && borderPaths.length > 0) {
    const borderZ = hasPlaque
      ? plaqueBaseThickness + (borderConfig.heightMm || letterThicknessMm * 0.75)
      : Math.max(1.2, borderConfig.heightMm || letterThicknessMm * 0.55);
    const borderGeom = extrudeClipperPaths(ClipperLib, borderPaths, borderZ, 0, 0);
    if (borderGeom) {
      layers.push({
        name: 'Decorative Border Rim',
        role: 'border',
        geometry: borderGeom,
        zMin: 0,
        zMax: borderZ,
      });
    }
  }

  // Holiday Accent Layers (Base + Raised Trim for multi-depth festive details)
  if (accentResult.basePaths.length > 0) {
    const baseZ =
      (hasPlaque ? plaqueBaseThickness : 0) +
      letterThicknessMm +
      (config.accent.reliefHeightMm || 0.8);
    const accBaseGeom = extrudeClipperPaths(
      ClipperLib,
      accentResult.basePaths,
      baseZ,
      0,
      bevelMm * 0.5
    );
    if (accBaseGeom) {
      layers.push({
        name: 'Holiday Accent Base',
        role: 'accent',
        geometry: accBaseGeom,
        zMin: 0,
        zMax: baseZ,
      });
    }
    if (accentResult.trimPaths.length > 0) {
      const trimZ = baseZ + 1.0;
      const accTrimGeom = extrudeClipperPaths(
        ClipperLib,
        accentResult.trimPaths,
        trimZ,
        0,
        bevelMm * 0.5
      );
      if (accTrimGeom) {
        layers.push({
          name: 'Holiday Accent Trim',
          role: 'accent-trim',
          geometry: accTrimGeom,
          zMin: 0,
          zMax: trimZ,
        });
      }
    }
  }

  // Merge all geometries for single-mesh STL export & bounding box measurement
  const geomsToMerge = layers.map((l) => l.geometry.clone());
  let mergedGeometry = null;
  if (geomsToMerge.length > 0) {
    mergedGeometry = BufferGeometryUtils.mergeGeometries(geomsToMerge, false);
    mergedGeometry.computeBoundingBox();
  }

  const finalBounds = getClipperBoundsMm(completeFootprint);
  const maxZ = layers.reduce((m, l) => Math.max(m, l.zMax), 0);

  return {
    text,
    layers,
    bounds: {
      ...finalBounds,
      depthZ: maxZ,
    },
    islandCount,
    hoopAnchors: hoopResult.anchors || [],
    mergedGeometry,
  };
}

/**
 * Top-level scene builder supporting both:
 * - 'connected' (Whole Word / Multi-word Ornament)
 * - 'individual' (Individual Monogram Letters laid out on the print plate, each with its own hoop/plaque/accent)
 */
export function buildHolidayLetteringProject(ClipperLib, font, config) {
  const rawText = (config.text || 'Noel').trim() || 'A';
  const mode = config.layoutMode || 'connected'; // 'connected' | 'individual'

  if (mode === 'connected') {
    const unit = buildSingleOrnamentUnit(ClipperLib, font, rawText, config);
    return {
      mode: 'connected',
      units: [unit],
      totalBounds: unit.bounds,
      totalIslands: unit.islandCount,
    };
  }

  // Individual Monogram Mode: split input characters (ignoring spaces/commas)
  const chars = Array.from(rawText).filter((c) => c.trim().length > 0 && c !== ',');
  const safeChars = chars.length > 0 ? chars : ['N'];

  const units = [];
  for (const ch of safeChars) {
    const unit = buildSingleOrnamentUnit(ClipperLib, font, ch, config);
    units.push(unit);
  }

  // Arrange units neatly in rows on the 3D print bed with 8mm gap
  const gapMm = 8;
  const maxPerRow = Math.min(4, Math.ceil(Math.sqrt(units.length)));
  let rowX = 0;
  let rowY = 0;
  let currentRowMaxH = 0;
  const placements = [];

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (i > 0 && i % maxPerRow === 0) {
      rowX = 0;
      rowY -= currentRowMaxH + gapMm;
      currentRowMaxH = 0;
    }
    const w = u.bounds.width || 40;
    const h = u.bounds.height || 50;
    placements.push({ x: rowX + w / 2, y: rowY - h / 2 });
    rowX += w + gapMm;
    currentRowMaxH = Math.max(currentRowMaxH, h);
  }

  // Center entire grid on the build plate (0, 0)
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity,
    maxZ = 0;

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const p = placements[i];
    const dx = p.x - u.bounds.centerX;
    const dy = p.y - u.bounds.centerY;
    u.plateOffset = { dx, dy };
    minX = Math.min(minX, u.bounds.minX + dx);
    maxX = Math.max(maxX, u.bounds.maxX + dx);
    minY = Math.min(minY, u.bounds.minY + dy);
    maxY = Math.max(maxY, u.bounds.maxY + dy);
    maxZ = Math.max(maxZ, u.bounds.depthZ || 0);
  }

  const gridCenterX = (minX + maxX) / 2;
  const gridCenterY = (minY + maxY) / 2;

  for (const u of units) {
    u.plateOffset.dx -= gridCenterX;
    u.plateOffset.dy -= gridCenterY;
  }

  return {
    mode: 'individual',
    units,
    totalBounds: {
      minX: minX - gridCenterX,
      maxX: maxX - gridCenterX,
      minY: minY - gridCenterY,
      maxY: maxY - gridCenterY,
      width: maxX - minX,
      height: maxY - minY,
      depthZ: maxZ,
    },
    totalIslands: units.reduce((acc, u) => acc + u.islandCount, 0),
  };
}

/**
 * Calculate signed volume (in cm³) and triangle count of a THREE.BufferGeometry
 */
export function computeMeshStats(geometry) {
  if (!geometry) return { triangles: 0, volumeCm3: 0, estWeightGrams: 0 };
  const pos = geometry.attributes.position;
  if (!pos) return { triangles: 0, volumeCm3: 0, estWeightGrams: 0 };

  const index = geometry.index;
  let volumeMm3 = 0;
  const triCount = index ? index.count / 3 : pos.count / 3;

  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const p3 = new THREE.Vector3();

  for (let i = 0; i < triCount; i++) {
    const i0 = index ? index.getX(i * 3) : i * 3;
    const i1 = index ? index.getX(i * 3 + 1) : i * 3 + 1;
    const i2 = index ? index.getX(i * 3 + 2) : i * 3 + 2;

    p1.fromBufferAttribute(pos, i0);
    p2.fromBufferAttribute(pos, i1);
    p3.fromBufferAttribute(pos, i2);

    volumeMm3 += p1.dot(p2.cross(p3)) / 6.0;
  }

  const volumeCm3 = Math.abs(volumeMm3) / 1000.0;
  // Typical 3D print with 3 perimeters + 20% infill averages ~0.62 effective density of solid PLA (1.24 g/cm³)
  const estWeightGrams = volumeCm3 * 1.24 * 0.65;

  return {
    triangles: Math.round(triCount),
    volumeCm3: Number(volumeCm3.toFixed(2)),
    estWeightGrams: Number(estWeightGrams.toFixed(1)),
  };
}
