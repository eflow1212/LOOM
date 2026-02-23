// p5.js — Shadow Weave roulette
// EDGE-FIELD connectivity with TWO STYLES:
//
// STYLE A (simple): intriguing negative space, cleaner lines, minimal texture
// STYLE B (dense): always-covered, textured fills, fat columns, dashed threads
//
// 2-color only (light/dark)
// ✅ Shared-edge connectivity (perfect linking where material exists)
// ✅ SPACE = new composition (new mode + new style + new structure)
// ✅ R     = new structure (keep mode + style)
// ✅ C     = toggle mode only
// ✅ V     = toggle style (simple/dense) manually

let scene;

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(2);

  textFont("monospace");
  textAlign(LEFT, TOP);
  noStroke();

  scene = makeScene();
  buildScene(true);
}

function draw() {
  const { bg } = getColors();
  background(bg);
  renderScene();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  buildScene(false);
}

function keyPressed() {
  if (key === " ") {
    scene.seed = floor(random(1e9));
    scene.mode = random() < 0.5 ? "light" : "dark";
    scene.style = random() < 0.5 ? "simple" : "dense"; // <- roulette
    buildScene(true);
  }
  if (key === "r" || key === "R") {
    const keepMode = scene.mode;
    const keepStyle = scene.style;
    scene.seed = floor(random(1e9));
    buildScene(true);
    scene.mode = keepMode;
    scene.style = keepStyle;
  }
  if (key === "c" || key === "C") {
    scene.mode = scene.mode === "light" ? "dark" : "light";
  }
  if (key === "v" || key === "V") {
    scene.style = scene.style === "simple" ? "dense" : "simple";
    buildScene(true);
  }
}

/* ----------------------------
   Scene
---------------------------- */

function makeScene() {
  return {
    seed: floor(random(1e9)),
    mode: random() < 0.5 ? "light" : "dark",
    style: random() < 0.5 ? "simple" : "dense",

    s: 12,
    cols: 0,
    rows: 0,
    ox: 0,
    oy: 0,

    bands: [],
    blend: null,
    glitch: null,
    vGate: null,
    hGate: null,
    rung: null,

    voidMask: null,

    edges: null,
    glyphs: null,
  };
}

function buildScene(fullRegen = true) {
  randomSeed(scene.seed);
  noiseSeed(scene.seed);

  const m = min(width, height);

  scene.s = clamp(floor(m / 75), 9, 18);

  scene.cols = max(18, floor(width / scene.s));
  scene.rows = max(18, floor(height / scene.s));

  const gridW = scene.cols * scene.s;
  const gridH = scene.rows * scene.s;
  scene.ox = floor((width - gridW) / 2);
  scene.oy = floor((height - gridH) / 2);

  scene.bands = makeBands(scene.rows);

  scene.blend = makeBlendField(scene.cols, scene.rows);
  scene.glitch = makeGlitchField(scene.cols, scene.rows);

  scene.vGate = makeGateField(scene.cols, scene.rows, true);
  scene.hGate = makeGateField(scene.cols, scene.rows, false);
  scene.rung = makeRungField(scene.cols, scene.rows);

  // Style-controlled negative space (simple gets more voids)
  scene.voidMask = makeVoidMask(scene.cols, scene.rows, scene.style);

  // Connectivity + glyphs
  scene.edges = resolveEdges(scene.cols, scene.rows, scene.voidMask, scene.style);
  scene.glyphs = glyphize(scene.cols, scene.rows, scene.edges, scene.voidMask, scene.style);
}

/* ----------------------------
   Colors
---------------------------- */

function getColors() {
  return scene.mode === "light"
    ? { bg: color(255), fg: color(0) }
    : { bg: color(0), fg: color(255) };
}

/* ----------------------------
   Bands
---------------------------- */

function makeBands(rows) {
  const bandCount = floor(random(3, 6));
  let cuts = [0];
  for (let i = 1; i < bandCount; i++) {
    cuts.push(floor((rows * i) / bandCount + random(-rows * 0.06, rows * 0.06)));
  }
  cuts.push(rows);

  cuts = cuts.map(v => clamp(v, 0, rows)).sort((a, b) => a - b);
  cuts[0] = 0;
  cuts[cuts.length - 1] = rows;

  const bands = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const y0 = cuts[i];
    const y1 = max(y0 + 6, cuts[i + 1]);
    bands.push({
      y0,
      y1,
      secWeight: random(0.2, 0.85),
      drift: random(-1.5, 1.5),
      glitchBias: random() < 0.65 ? random(0.35, 0.8) : random(0.05, 0.25),
    });
  }
  return bands;
}

function bandAtRow(r) {
  for (const b of scene.bands) if (r >= b.y0 && r < b.y1) return b;
  return scene.bands[scene.bands.length - 1];
}

/* ----------------------------
   Smooth fields
---------------------------- */

function makeBlendField(cols, rows) {
  const field = Array.from({ length: rows }, () => Array(cols).fill(0));
  const sx = random(0.012, 0.02);
  const sy = random(0.012, 0.02);

  for (let r = 0; r < rows; r++) {
    const b = bandAtRow(r);
    for (let c = 0; c < cols; c++) {
      const n = noise(c * sx, r * sy);
      let v = b.secWeight * 0.75 + n * 0.35;
      v += (c / cols - 0.5) * 0.18 + b.drift * 0.04;
      field[r][c] = smoothstep(0.08, 0.92, clamp(v, 0, 1));
    }
  }
  return field;
}

function makeGlitchField(cols, rows) {
  const field = Array.from({ length: rows }, () => Array(cols).fill(0));
  const sx = random(0.02, 0.035);
  const sy = random(0.02, 0.035);
  const threshold = random(0.52, 0.66);

  for (let r = 0; r < rows; r++) {
    const b = bandAtRow(r);
    for (let c = 0; c < cols; c++) {
      const n = noise(100 + c * sx, 200 + r * sy);
      let v = n * 0.9 + b.glitchBias * 0.25 - 0.1;
      v = smoothstep(threshold, 0.95, v);

      const edge = min(c, cols - 1 - c, r, rows - 1 - r) / min(cols, rows);
      v *= smoothstep(0.02, 0.12, edge);

      field[r][c] = clamp(v, 0, 1);
    }
  }
  return field;
}

function makeGateField(cols, rows, vertical) {
  const field = Array.from({ length: rows }, () => Array(cols).fill(0));

  const sx1 = random(0.01, 0.02);
  const sy1 = random(0.01, 0.02);
  const sx2 = random(0.03, 0.05);
  const sy2 = random(0.03, 0.05);

  for (let r = 0; r < rows; r++) {
    const b = bandAtRow(r);
    for (let c = 0; c < cols; c++) {
      const n1 = noise(10 + c * sx1, 20 + r * sy1);
      const n2 = noise(60 + c * sx2, 70 + r * sy2);
      const base = 0.65 * n1 + 0.35 * n2;

      let v = base;
      v += b.drift * (vertical ? 0.06 : -0.06);
      v += (vertical ? (c / cols - 0.5) : (r / rows - 0.5)) * 0.08;

      v = clamp(v + (scene.blend[r][c] - 0.5) * (vertical ? 0.12 : -0.12), 0, 1);
      v = clamp(v - scene.glitch[r][c] * 0.25, 0, 1);

      field[r][c] = smoothstep(0.15, 0.85, v);
    }
  }
  return field;
}

function makeRungField(cols, rows) {
  const field = Array.from({ length: rows }, () => Array(cols).fill(0));
  const sx = random(0.02, 0.04);
  const sy = random(0.02, 0.04);

  for (let r = 0; r < rows; r++) {
    const b = bandAtRow(r);
    for (let c = 0; c < cols; c++) {
      const n = noise(300 + c * sx, 400 + r * sy);
      let v = n * 0.85 + b.secWeight * 0.25;
      v *= 0.65 + 0.7 * scene.vGate[r][c];
      v += scene.glitch[r][c] * 0.15;
      field[r][c] = smoothstep(0.2, 0.9, clamp(v, 0, 1));
    }
  }
  return field;
}

/* ----------------------------
   Negative space mask (style-controlled)
---------------------------- */

function makeVoidMask(cols, rows, style) {
  const mask = Array.from({ length: rows }, () => Array(cols).fill(false));

  // SIMPLE: bigger + more void islands
  // DENSE : fewer/smaller voids (sometimes none)
  const islandCount = style === "simple" ? floor(random(2, 6)) : floor(random(0, 3));
  const baseR = style === "simple" ? random(0.10, 0.22) : random(0.06, 0.14);

  const centers = [];
  for (let i = 0; i < islandCount; i++) {
    centers.push({
      x: random(0.15, 0.85) * cols,
      y: random(0.15, 0.85) * rows,
      r: baseR * min(cols, rows) * random(0.8, 1.25),
    });
  }

  // Smooth noise warp so holes feel organic
  const nx = random(0.02, 0.05);
  const ny = random(0.02, 0.05);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // optional: in dense style, sometimes choose zero voids entirely
      if (islandCount === 0) continue;

      const w = (noise(700 + c * nx, 800 + r * ny) - 0.5) * (style === "simple" ? 0.45 : 0.25);

      let v = false;
      for (const k of centers) {
        const dx = (c - k.x) / k.r;
        const dy = (r - k.y) / k.r;
        const d = sqrt(dx * dx + dy * dy);
        if (d < 1.0 + w) {
          v = true;
          break;
        }
      }

      // soften edges a touch so holes are not perfectly circular
      if (v) {
        const edgeNoise = noise(900 + c * 0.06, 950 + r * 0.06);
        if (edgeNoise < (style === "simple" ? 0.92 : 0.96)) mask[r][c] = true;
      }
    }
  }

  return mask;
}

/* ----------------------------
   Shared-edge resolution + void cutting
---------------------------- */

function resolveEdges(cols, rows, voidMask, style) {
  const vEdge = Array.from({ length: rows - 1 }, () => Array(cols).fill(0));
  const hEdge = Array.from({ length: rows }, () => Array(cols - 1).fill(0));

  // Style shifts density:
  const vThresh = style === "dense" ? random(0.34, 0.48) : random(0.44, 0.58);
  const hThresh = style === "dense" ? random(0.34, 0.50) : random(0.44, 0.60);

  // Vertical adjacencies
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      // If either endpoint is void, kill edge
      if (voidMask[r][c] || voidMask[r + 1][c]) {
        vEdge[r][c] = 0;
        continue;
      }

      const vg = 0.6 * scene.vGate[r][c] + 0.4 * scene.vGate[r + 1][c];
      const b = 0.5 * (scene.blend[r][c] + scene.blend[r + 1][c]);
      const g = 0.5 * (scene.glitch[r][c] + scene.glitch[r + 1][c]);

      let p = vg + (b - 0.5) * 0.12 - g * (style === "dense" ? 0.08 : 0.14);
      p = smoothstep(0.15, 0.85, clamp(p, 0, 1));
      vEdge[r][c] = p > vThresh ? 1 : 0;
    }
  }

  // Horizontal adjacencies
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (voidMask[r][c] || voidMask[r][c + 1]) {
        hEdge[r][c] = 0;
        continue;
      }

      const hg = 0.6 * scene.hGate[r][c] + 0.4 * scene.hGate[r][c + 1];
      const b = 0.5 * (scene.blend[r][c] + scene.blend[r][c + 1]);
      const g = 0.5 * (scene.glitch[r][c] + scene.glitch[r][c + 1]);

      let p = hg - (b - 0.5) * 0.10 - g * (style === "dense" ? 0.07 : 0.12);
      p = smoothstep(0.15, 0.85, clamp(p, 0, 1));
      hEdge[r][c] = p > hThresh ? 1 : 0;
    }
  }

  // Rungs: only in dense style, or lightly in simple
  const rungPeriod = style === "dense" ? floor(random(3, 6)) : floor(random(5, 9));
  const rungCutoff = style === "dense" ? 0.50 : 0.65;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (voidMask[r][c] || voidMask[r][c + 1]) continue;
      if (scene.rung[r][c] <= rungCutoff) continue;

      const t = (r + floor(scene.blend[r][c] * 10)) % rungPeriod;
      if (t !== 0) continue;

      const vA = scene.vGate[r][c] > 0.55;
      const vB = scene.vGate[r][c + 1] > 0.55;
      if (vA && vB) hEdge[r][c] = 1;
    }
  }

  // Shared -> per-cell
  const edges = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ n: 0, e: 0, s: 0, w: 0 }))
  );

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (voidMask[r][c]) {
        edges[r][c] = { n: 0, e: 0, s: 0, w: 0 };
        continue;
      }
      edges[r][c].n = r > 0 ? vEdge[r - 1][c] : 0;
      edges[r][c].s = r < rows - 1 ? vEdge[r][c] : 0;
      edges[r][c].w = c > 0 ? hEdge[r][c - 1] : 0;
      edges[r][c].e = c < cols - 1 ? hEdge[r][c] : 0;
    }
  }

  return edges;
}

/* ----------------------------
   Mask -> glyph
---------------------------- */

function glyphFromMask(mask) {
  // Heavy box drawing
  const map = {
    0: " ",

    1: "╵",
    2: "╶",
    4: "╷",
    8: "╴",

    5: "║",
    10: "═",

    6: "╔",
    12: "╗",
    3: "╚",
    9: "╝",

    7: "╠",
    13: "╣",
    14: "╦",
    11: "╩",

    15: "╬",
  };
  return map[mask] ?? " ";
}

/* ----------------------------
   Glyphize: style switch
---------------------------- */

function glyphize(cols, rows, edges, voidMask, style) {
  const glyphs = Array.from({ length: rows }, () => Array(cols).fill(" "));

  // Dense textures (2-color optical shading)
  const texRamp = [" ", "·", ":", "░", "▒", "▓", "⣿"];
  const texFine = [" ", "·", "∙", "∘", "▪", "▫", "░", "▒", "▓"];
  const useFine = random() < 0.45;
  const shadeGain = style === "dense" ? random(1.0, 1.35) : random(0.75, 1.05);

  const vFatChance = style === "dense" ? random(0.30, 0.60) : random(0.10, 0.25);
  const hDashChance = style === "dense" ? random(0.35, 0.65) : random(0.10, 0.25);

  // Simple: very sparse dust, lots of blank void
  const dustChance = style === "simple" ? random(0.001, 0.01) : random(0.01, 0.03);
  const dust = ["·", "∙", "▪"];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (voidMask[r][c]) {
        // true negative space (with occasional dust in SIMPLE only)
        glyphs[r][c] = (style === "simple" && random() < dustChance) ? random(dust) : " ";
        continue;
      }

      const e = edges[r][c];
      const mask = (e.n ? 1 : 0) | (e.e ? 2 : 0) | (e.s ? 4 : 0) | (e.w ? 8 : 0);

      // SIMPLE style: keep it mostly box drawing and empties
      if (style === "simple") {
        // remove dangly singles for cleanliness
        if (mask === 1 || mask === 2 || mask === 4 || mask === 8) {
          glyphs[r][c] = " ";
          continue;
        }
        // occasional dust in empty
        if (mask === 0 && random() < dustChance) {
          glyphs[r][c] = random(dust);
          continue;
        }
        glyphs[r][c] = glyphFromMask(mask);
        continue;
      }

      // DENSE style: texture fills + fat columns + dashed threads
      let ch = glyphFromMask(mask);

      let tone = scene.blend[r][c] * 0.75 + (1 - scene.glitch[r][c]) * 0.25;
      tone = clamp(tone * shadeGain, 0, 1);

      // empty -> textured
      if (mask === 0) {
        const ramp = useFine ? texFine : texRamp;
        const n = noise(900 + c * 0.08, 800 + r * 0.08);
        const jitter = (n - 0.5) * 0.18;
        const idx = clamp(floor((tone + jitter) * (ramp.length - 1)), 0, ramp.length - 1);
        glyphs[r][c] = ramp[idx];
        continue;
      }

      // vertical run -> fat column texture
      if (mask === 5) {
        const keepLine = random() < 0.25;
        if (!keepLine) {
          if (tone > 0.72 && random() < vFatChance) ch = "⣿";
          else if (tone > 0.58) ch = "▓";
          else if (tone > 0.42) ch = "▒";
          else if (tone > 0.26) ch = "░";
          else ch = "║";
        }
        glyphs[r][c] = ch;
        continue;
      }

      // horizontal run -> dashed thread
      if (mask === 10) {
        if (random() < hDashChance) {
          if (tone > 0.7) ch = "═";
          else if (tone > 0.45) ch = "╌";
          else ch = "┄";
        } else {
          ch = "═";
        }
        glyphs[r][c] = ch;
        continue;
      }

      // junctions stay box drawing
      glyphs[r][c] = ch;
    }
  }

  return glyphs;
}

/* ----------------------------
   Render
---------------------------- */

function renderScene() {
  const { fg } = getColors();
  const s = scene.s;

  textSize(floor(s * 1.05));
  fill(fg);

  for (let r = 0; r < scene.rows; r++) {
    for (let c = 0; c < scene.cols; c++) {
      const ch = scene.glyphs[r][c];
      const x = floor(scene.ox + c * s);
      const y = floor(scene.oy + r * s);
      text(ch, x, y);
    }
  }
}

/* ----------------------------
   Helpers
---------------------------- */

function clamp(v, a, b) {
  return max(a, min(b, v));
}

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
