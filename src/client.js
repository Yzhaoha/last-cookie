// ===== CLIENT =====
const C = SIM.CFG, VIS = 1.38;
const $ = id => document.getElementById(id);
const DEBUG = /[?&]debug/.test(location.search);
const IS_TOUCH = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
const store = {
  get(k, d) { try { const v = localStorage.getItem('lc_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('lc_' + k, JSON.stringify(v)); } catch (e) { } },
};

// ---------- 平台包装（GitHub 版是空实现；CG / Poki 版替换这一段） ----------
/*PLATFORM_START*/
const PF = {
  async init() { }, loadingDone() { }, setPlaying(b) { }, happy() { },
  midgame(cb) { cb && cb(); }, muted: false, adBusy: false,
};
/*PLATFORM_END*/

// ---------- 小工具 ----------
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}

// ---------- three 基础 ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 200);

// 背景：暖色厨房渐变
function gradTex(stops, w = 16, h = 512) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, h); for (const [o, c] of stops) gr.addColorStop(o, c);
  g.fillStyle = gr; g.fillRect(0, 0, w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
scene.background = gradTex([[0, '#ffe9cf'], [0.55, '#f6cfa3'], [1, '#e9b07a']]);
scene.fog = new THREE.Fog(0xf6dcbc, 45, 90);

// 环境光照（给巧克力豆、牛奶、马卡龙高光）
{
  const env = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
  const col = [], pos = sky.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 50; const c = new THREE.Color().lerpColors(new THREE.Color(0x8a5a36), new THREE.Color(0xfff2df), clamp(y * 0.8 + 0.5, 0, 1)); col.push(c.r, c.g, c.b); }
  sky.geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  env.add(sky);
  const panel = (x, y, z, s, c) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
  panel(18, 30, 14, 22, 0xffffff); panel(-26, 18, -10, 14, 0xffe2c0); panel(0, 10, -30, 16, 0xfff6ea); panel(-10, 34, 18, 18, 0x9a7a62); panel(25, 22, -18, 16, 0x8c6c55);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.02).texture;
  pm.dispose();
}
scene.add(new THREE.HemisphereLight(0xfff3e2, 0xb57a45, 0.55));
const sun = new THREE.DirectionalLight(0xfff0db, 2.3);
sun.position.set(9, 20, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 1, far: 50 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025;
scene.add(sun, sun.target);

// ---------- 贴图：饼干面团 ----------
function makeCookieTex() {
  const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  const bump = document.createElement('canvas'); bump.width = bump.height = S; const b = bump.getContext('2d');
  // 底色：中间浅、边缘烤得焦
  const rg = g.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S / 2);
  rg.addColorStop(0, '#e9b670'); rg.addColorStop(0.62, '#dea15a'); rg.addColorStop(0.86, '#c98236'); rg.addColorStop(0.97, '#a8621f'); rg.addColorStop(1, '#8f5016');
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  b.fillStyle = '#808080'; b.fillRect(0, 0, S, S);
  const rnd = SIM.rng(77);
  // 大块明暗（烘烤不均）
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 70, dark = rnd() < 0.5;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, dark ? 'rgba(150,80,25,0.16)' : 'rgba(255,220,160,0.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 小坑和颗粒
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * S, y = rnd() * S, r = 0.6 + rnd() * rnd() * 4.5, t = rnd();
    if (t < 0.55) { g.fillStyle = `rgba(120,62,18,${0.12 + rnd() * 0.25})`; b.fillStyle = `rgba(0,0,0,${0.25 + rnd() * 0.35})`; }
    else if (t < 0.9) { g.fillStyle = `rgba(255,226,170,${0.1 + rnd() * 0.25})`; b.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.3})`; }
    else { g.fillStyle = `rgba(255,250,235,${0.5 + rnd() * 0.4})`; b.fillStyle = 'rgba(255,255,255,0.7)'; } // 糖粒
    g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); b.beginPath(); b.arc(x, y, r, 0, 6.283); b.fill();
  }
  // 表面细裂纹（烘焙时自然裂开的）
  g.lineCap = b.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    let x = rnd() * S, y = rnd() * S, a = rnd() * 6.283; const n = 4 + rnd() * 8;
    g.strokeStyle = 'rgba(140,72,20,0.35)'; b.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = b.lineWidth = 1 + rnd() * 1.6;
    g.beginPath(); b.beginPath(); g.moveTo(x, y); b.moveTo(x, y);
    for (let k = 0; k < n; k++) { a += (rnd() - 0.5) * 1.2; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); b.lineTo(x, y); }
    g.stroke(); b.stroke();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const bt = new THREE.CanvasTexture(bump); bt.anisotropy = 8;
  return { map: t, bump: bt };
}
function makeCrumbTex() { // 断面：多孔、偏深
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  g.fillStyle = '#c8873f'; g.fillRect(0, 0, S, S);
  const rnd = SIM.rng(9);
  for (let i = 0; i < 1600; i++) { const x = rnd() * S, y = rnd() * S, r = 0.8 + rnd() * 3.5; g.fillStyle = rnd() < 0.6 ? `rgba(110,55,15,${0.2 + rnd() * 0.4})` : `rgba(240,195,130,${0.2 + rnd() * 0.4})`; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const TEX = makeCookieTex();
const crumbTex = makeCrumbTex();
const sideMat = new THREE.MeshStandardMaterial({ map: crumbTex, bumpMap: crumbTex, bumpScale: 0.6, roughness: 0.92, color: 0xd9a066 });
const crackMat = new THREE.MeshBasicMaterial({ color: 0x4a2008, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const aoMat = (() => { const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64; const g = cv.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(120,70,30,0.42)'); gr.addColorStop(0.35, 'rgba(120,70,30,0.15)'); gr.addColorStop(1, 'rgba(120,70,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 64); const t = new THREE.CanvasTexture(cv); return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide }); })();
const foamMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 });
const chipMat = new THREE.MeshStandardMaterial({ color: 0x3a1c0c, roughness: 0.28, metalness: 0.05, envMapIntensity: 1.4 });

// ---------- 角色：各种小点心 ----------
const LOOKS = [
  { snack: 'macaron', col: 0xff9cbc, col2: 0xfff1e0 },
  { snack: 'donut', col: 0xff7fae, col2: 0xe3a35b },
  { snack: 'pudding', col: 0xffd36a, col2: 0x8a3f12 },
  { snack: 'cupcake', col: 0x8fd8ff, col2: 0xffb3d1 },
  { snack: 'macaron', col: 0x9fe3c4, col2: 0xfff1e0 },
  { snack: 'donut', col: 0x7a4126, col2: 0xe3a35b },
  { snack: 'pudding', col: 0xffe39a, col2: 0x6e2f0e },
  { snack: 'cupcake', col: 0xffe58a, col2: 0xc59bff },
  { snack: 'macaron', col: 0xc6b0ff, col2: 0xfff1e0 },
  // 以下靠盲盒开
  { snack: 'donut', col: 0x9bd37a, col2: 0xe3a35b, rar: 1 },      // 抹茶甜甜圈
  { snack: 'pudding', col: 0xffa8c0, col2: 0xd9455f, rar: 1 },    // 草莓布丁
  { snack: 'cupcake', col: 0xbfe8c8, col2: 0xfff6ea, rar: 1 },    // 薄荷杯子蛋糕
  { snack: 'macaron', col: 0xffb36b, col2: 0xfff1e0, rar: 1 },    // 橙子马卡龙
  { snack: 'donut', col: 0x6fb7ff, col2: 0xf2c58a, rar: 2 },      // 蓝莓甜甜圈
  { snack: 'cupcake', col: 0x7a4b2e, col2: 0xfff1e0, rar: 2 },    // 巧克力杯子蛋糕
  { snack: 'pudding', col: 0x8fd6c2, col2: 0x2f6e5e, rar: 2 },    // 抹茶布丁
  { snack: 'macaron', col: 0x3c2a6e, col2: 0xff8fd0, rar: 3 },    // 星空马卡龙
  { snack: 'donut', col: 0xffd24a, col2: 0xfff1c4, rar: 3 },      // 黄金甜甜圈
  { snack: 'cupcake', col: 0x2b2b3a, col2: 0x7dfcff, rar: 3 },    // 霓虹杯子蛋糕
];
for (let i = 0; i < 9; i++) LOOKS[i].rar = i < 3 ? 0 : 1;        // 前 3 个一开始就有
const dotCol = l => '#' + LOOKS[l % LOOKS.length].col.toString(16).padStart(6, '0');
const M = (c, r = 0.5, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r }, extra || {}));
const eyeWhite = M(0xffffff, 0.25), eyeBlack = M(0x1d0f08, 0.2, { envMapIntensity: 1.5 }), blushM = new THREE.MeshBasicMaterial({ color: 0xff8fa8, transparent: true, opacity: 0.55 });
const sprCols = [0xff5a7a, 0x5ad1ff, 0xffe14d, 0x8cff7a, 0xffffff, 0xb67bff];
function addFace(g, y, z, s = 1) {
  const face = new THREE.Group(); face.position.set(0, y, z);
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.085 * s, 16, 12), eyeWhite); w.scale.set(1, 1.15, 0.55); w.position.set(sx * 0.12 * s, 0, 0);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.058 * s, 14, 10), eyeBlack); b.scale.set(1, 1.1, 0.6); b.position.set(sx * 0.12 * s, -0.005, 0.03 * s);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.018 * s, 8, 6), eyeWhite); hl.position.set(sx * 0.12 * s + 0.02 * s, 0.025 * s, 0.065 * s);
    const bl = new THREE.Mesh(new THREE.CircleGeometry(0.045 * s, 14), blushM); bl.position.set(sx * 0.21 * s, -0.07 * s, 0.01); bl.scale.y = 0.6;
    face.add(w, b, hl, bl);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.035 * s, 0.012 * s, 6, 12, Math.PI), eyeBlack); mouth.rotation.z = Math.PI; mouth.position.set(0, -0.07 * s, 0.03);
  const mOpen = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 12, 8), M(0x5a1a12, 0.6)); mOpen.scale.set(1.1, 0.8, 0.4); mOpen.position.set(0, -0.08 * s, 0.02); mOpen.visible = false;
  face.add(mouth, mOpen);
  g.add(face);
  return { face, mouth, mOpen };
}
function sprinkles(g, n, rad, y, spread, rnd) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.283, r = rad * (0.5 + rnd() * 0.5);
    const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.045, 3, 6), M(sprCols[i % sprCols.length], 0.4));
    s.position.set(Math.cos(a) * r, y + (rnd() - 0.5) * spread, Math.sin(a) * r); s.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); g.add(s);
  }
}
function buildSnack(look) {
  const L = LOOKS[look % LOOKS.length], g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const rnd = SIM.rng(look * 31 + 7);
  let face;
  if (L.snack === 'macaron') {
    const shellM = M(L.col, 0.55);
    const shellG = new THREE.SphereGeometry(0.42, 32, 16, 0, 6.283, 0, Math.PI / 2);
    const top = new THREE.Mesh(shellG, shellM); top.scale.set(1, 0.62, 1); top.position.y = 0.43;
    const bot = new THREE.Mesh(shellG, shellM); bot.scale.set(1, -0.5, 1); bot.position.y = 0.27;
    const footM = M(new THREE.Color(L.col).multiplyScalar(0.92), 0.85);
    const f1 = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.045, 8, 40), footM); f1.rotation.x = Math.PI / 2; f1.position.y = 0.415;
    const f2 = f1.clone(); f2.position.y = 0.285;
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.13, 40), M(L.col2, 0.5)); fill.position.y = 0.35;
    body.add(top, bot, f1, f2, fill);
    face = addFace(body, 0.6, 0.33, 1.05); face.face.rotation.x = -0.45;
  } else if (L.snack === 'donut') {
    const dough = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.17, 20, 40), M(L.col2, 0.75)); dough.position.y = 0.48;
    const iceG = new THREE.TorusGeometry(0.3, 0.176, 20, 48); { const ip = iceG.attributes.position; for (let i = 0; i < ip.count; i++) { const x = ip.getX(i), y = ip.getY(i), z = ip.getZ(i), a = Math.atan2(y, x); if (z < 0.02 + 0.035 * Math.sin(a * 7)) ip.setZ(i, Math.max(z, 0.02 + 0.035 * Math.sin(a * 7)) * 0.3); } iceG.computeVertexNormals(); }
    const ice = new THREE.Mesh(iceG, M(L.col, 0.3, { envMapIntensity: 1.2 })); ice.position.y = 0.48; ice.position.z = 0.012; ice.scale.set(1.03, 1.03, 1.03);
    body.add(dough, ice);
    const sp = new THREE.Group(); sp.position.y = 0.48; body.add(sp);
    for (let i = 0; i < 26; i++) { const a = rnd() * Math.PI * 2, r = 0.3 + (rnd() - 0.5) * 0.12; const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.045, 3, 6), M(sprCols[i % 6], 0.4)); s.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.16); s.rotation.z = rnd() * 3; sp.add(s); }
    for (const sx of [-1, 1]) { const ft = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), M(0xc98a45, 0.7)); ft.scale.set(1, 0.55, 1.3); ft.position.set(sx * 0.14, 0.05, 0.03); body.add(ft); }
    face = addFace(body, 0.66, 0.17, 0.95);
    const tilt = new THREE.Group(); while (body.children.length) tilt.add(body.children[0]); tilt.rotation.x = -0.95; tilt.position.set(0, 0.12, -0.1); body.add(tilt);
  } else if (L.snack === 'pudding') {
    const cus = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.52, 36, 3), M(L.col, 0.35, { envMapIntensity: 1.2 })); cus.position.y = 0.27;
    const car = new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.31, 0.08, 36), M(L.col2, 0.2, { envMapIntensity: 1.5 })); car.position.y = 0.54;
    body.add(cus, car);
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + 0.3; const d = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.06 + rnd() * 0.1, 4, 8), M(L.col2, 0.2)); d.position.set(Math.cos(a) * 0.315, 0.47 - rnd() * 0.05, Math.sin(a) * 0.315); body.add(d); }
    const cream = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), M(0xfffaf2, 0.6)); cream.scale.y = 0.75; cream.position.y = 0.62;
    const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), M(0xe0203a, 0.15, { envMapIntensity: 1.6 })); cherry.position.y = 0.76;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.14, 6), M(0x5d8a2a)); stem.position.set(0.03, 0.86, 0); stem.rotation.z = -0.4;
    body.add(cream, cherry, stem);
    face = addFace(body, 0.36, 0.345, 1.0); face.face.rotation.x = -0.25;
  } else { // cupcake
    const wg = new THREE.CylinderGeometry(0.34, 0.26, 0.36, 24, 1, true);
    const p = wg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.045 * Math.cos(a * 12); p.setX(i, x * k); p.setZ(i, z * k); } wg.computeVertexNormals();
    const wrap = new THREE.Mesh(wg, M(L.col, 0.6, { side: THREE.DoubleSide })); wrap.position.y = 0.18;
    const cake = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.06, 24), M(0xc98a45, 0.8)); cake.position.y = 0.37;
    body.add(wrap, cake);
    const fm = M(L.col2, 0.45);
    [[0.34, 0.12, 0.43], [0.27, 0.11, 0.55], [0.18, 0.1, 0.66]].forEach(([r, t, y]) => { const tr = new THREE.Mesh(new THREE.TorusGeometry(r - t * 0.3, t, 14, 32), fm); tr.rotation.x = Math.PI / 2; tr.position.y = y; body.add(tr); });
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 16), fm); tip.position.y = 0.78; body.add(tip);
    sprinkles(body, 18, 0.3, 0.6, 0.18, rnd);
    face = addFace(body, 0.24, 0.315, 0.95); face.face.rotation.x = -0.2;
  }
  body.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  // 脚下接触阴影
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshBasicMaterial({ color: 0x3d1a06, transparent: true, opacity: 0.22, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.012; g.add(blob);
  return { g, body, face, blob, col: L.col };
}
// ---------- 桌面（两种：长方桌 / 圆桌，每局换） ----------
let S = null;            // 当前对局
const HW = C.HW, HH = C.HH, RR = C.ROUND_R;
function clothTex(col, rx, rz) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  g.fillStyle = '#fff7ea'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = col; g.fillRect(0, 0, 64, 128); g.fillRect(0, 0, 128, 64);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, rz); t.anisotropy = 8; return t;
}
const tableRoot = new THREE.Group(); scene.add(tableRoot);
let tableKind = null;
function buildTable(round) {
  if (tableKind === round) return; tableKind = round;
  tableRoot.traverse(m => { if (m.isMesh) { m.geometry.dispose(); [].concat(m.material).forEach(x => { x.map && x.map.dispose(); x.dispose(); }); } });
  tableRoot.clear();
  const add = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; tableRoot.add(m); return m; };
  const hemCol = round ? 0xfdeff0 : 0xe8f4f2, hemMat = new THREE.MeshStandardMaterial({ color: hemCol, roughness: 0.9 }), woodMat = new THREE.MeshStandardMaterial({ color: 0x9a6236, roughness: 0.7 }), edgeMat = new THREE.MeshBasicMaterial({ color: 0xff8a5c });
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  const sc = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14, Math.PI, Math.PI), new THREE.MeshStandardMaterial({ color: hemCol, roughness: 0.9, side: THREE.DoubleSide }), 200); let n = 0;
  if (round) {
    const top = add(new THREE.CircleGeometry(RR, 72), new THREE.MeshStandardMaterial({ map: clothTex('rgba(255,140,150,0.36)', RR * 2 / 4, RR * 2 / 4), roughness: 0.9 }), 0); top.rotation.x = -Math.PI / 2; top.receiveShadow = true;
    add(new THREE.CylinderGeometry(RR + 0.06, RR + 0.06, 0.5, 72), hemMat, -0.26);
    const ring = add(new THREE.RingGeometry(RR - 0.18, RR, 96), edgeMat, 0.012); ring.rotation.x = -Math.PI / 2;   // 桌边一圈橙线：过线就掉
    add(new THREE.CylinderGeometry(RR - 0.3, RR - 0.3, 1.2, 64), woodMat, -1.1);
    const k = Math.floor(2 * Math.PI * RR / 2); for (let i = 0; i < k; i++) { const a = i / k * 6.2832; m4.compose(new THREE.Vector3(Math.sin(a) * (RR + 0.1), -0.5, Math.cos(a) * (RR + 0.1)), q4.setFromEuler(e4.set(0, a, 0)), one); sc.setMatrixAt(n++, m4); }
  } else {
    const top = add(new THREE.PlaneGeometry(HW * 2, HH * 2), new THREE.MeshStandardMaterial({ map: clothTex('rgba(110,190,200,0.38)', HW * 2 / 4, HH * 2 / 4), roughness: 0.9 }), 0); top.rotation.x = -Math.PI / 2; top.receiveShadow = true;
    add(new THREE.BoxGeometry(HW * 2 + 0.12, 0.5, HH * 2 + 0.12), hemMat, -0.26);
    for (const [w, d, x, z] of [[HW * 2, 0.18, 0, HH - 0.09], [HW * 2, 0.18, 0, -HH + 0.09], [0.18, HH * 2, HW - 0.09, 0], [0.18, HH * 2, -HW + 0.09, 0]]) { const m = add(new THREE.PlaneGeometry(w, d), edgeMat, 0.012); m.rotation.x = -Math.PI / 2; m.position.x = x; m.position.z = z; }
    add(new THREE.BoxGeometry(HW * 2 - 0.6, 1.2, HH * 2 - 0.6), woodMat, -1.1);
    for (let x = -HW + 1; x < HW; x += 2) for (const s of [1, -1]) { m4.compose(new THREE.Vector3(x, -0.5, s * (HH + 0.07)), q4.setFromEuler(e4.set(0, 0, 0)), one); sc.setMatrixAt(n++, m4); }
    for (let z = -HH + 1; z < HH; z += 2) for (const s of [1, -1]) { m4.compose(new THREE.Vector3(s * (HW + 0.07), -0.5, z), q4.setFromEuler(e4.set(0, Math.PI / 2, 0)), one); sc.setMatrixAt(n++, m4); }
  }
  sc.count = n; tableRoot.add(sc);
  // 撒在桌上的彩色糖粒
  const rnd = SIM.rng(11), cols = [0xff8fa3, 0x7fc8f8, 0xffd166, 0x9be7c4, 0xc8b6ff, 0xffffff], N = 260;
  const sp = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.035, 0.14, 3, 6), new THREE.MeshStandardMaterial({ roughness: 0.45 }), N), c3 = new THREE.Color();
  for (let i = 0; i < N; i++) {
    let x, z; if (round) { const a = rnd() * 6.2832, d = Math.sqrt(rnd()) * (RR - 0.5); x = Math.cos(a) * d; z = Math.sin(a) * d; } else { x = (rnd() * 2 - 1) * (HW - 0.5); z = (rnd() * 2 - 1) * (HH - 0.5); }
    m4.compose(new THREE.Vector3(x, 0.035, z), q4.setFromEuler(e4.set(Math.PI / 2, 0, rnd() * 6.283)), one); sp.setMatrixAt(i, m4); sp.setColorAt(i, c3.set(cols[i % 6]));
  }
  sp.receiveShadow = true; tableRoot.add(sp);
}
{ // 地板砖 + 椅子（装饰）
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  g.fillStyle = '#e2b47c'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#d6a468'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -22; scene.add(floor);
  const wm = new THREE.MeshStandardMaterial({ color: 0xb87a45, roughness: 0.7 }), cm = new THREE.MeshStandardMaterial({ color: 0xff9d8a, roughness: 0.9 });
  for (const [x, z, ry] of [[-13, HH + 9, 0], [13, HH + 9, 0], [-13, -HH - 9, Math.PI], [13, -HH - 9, Math.PI], [HW + 7, 0, Math.PI / 2], [-HW - 7, 0, -Math.PI / 2]]) {
    const ch = new THREE.Group(); ch.position.set(x, -10, z); ch.rotation.y = ry;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(13, 1, 11), wm), cush = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.8, 28), cm), back = new THREE.Mesh(new THREE.BoxGeometry(13, 14, 1), wm);
    cush.position.y = 0.8; back.position.set(0, 7, 5.5); ch.add(seat, cush, back); scene.add(ch);
  }
}
// ---------- 桌上的东西（障碍） ----------
const obsRoot = new THREE.Group(); scene.add(obsRoot);
const OB_COL = [0xff8fa3, 0x7fc8f8, 0xffd166, 0x9be7c4, 0xc8b6ff, 0xffa66b];
function lathe(pts, seg = 36) { return new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg); }
const cerealTex = (() => {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 192; const g = cv.getContext('2d');
  g.fillStyle = '#ffb347'; g.fillRect(0, 0, 512, 192);
  g.fillStyle = '#ff7b54'; g.beginPath(); g.moveTo(0, 0); g.lineTo(512, 0); g.lineTo(512, 46); g.quadraticCurveTo(256, 90, 0, 46); g.fill();
  g.fillStyle = '#fff6dc'; g.beginPath(); g.ellipse(256, 150, 150, 70, 0, 0, 6.283); g.fill();
  const cols = ['#ff8fa3', '#7fc8f8', '#ffd166', '#9be7c4', '#c8b6ff']; const rnd = SIM.rng(3);
  for (let i = 0; i < 26; i++) { g.strokeStyle = cols[i % 5]; g.lineWidth = 7; g.beginPath(); g.arc(140 + rnd() * 232, 105 + rnd() * 70, 11, 0, 6.283); g.stroke(); }
  g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.fillText('O O O', 256, 40);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
function buildObstacle(o) {
  const g = new THREE.Group(); g.position.set(o.x, 0, o.z);
  const col = OB_COL[o.tint % OB_COL.length], white = 0xfffaf2;
  const add = (geo, mat, y, x = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  if (o.kind === 'mug') {
    const r = o.r;
    add(new THREE.CylinderGeometry(r * 1.32, r * 1.2, 0.12, 40), M(white, 0.25), 0.06);                     // 小碟子
    add(lathe([[0, 0], [r * 0.8, 0], [r * 0.93, 0.12], [r, 0.5], [r, 1.95], [r * 0.97, 2.03], [r * 0.9, 2.03], [r * 0.88, 1.8]]), M(col, 0.3, { side: THREE.DoubleSide }), 0.1);
    add(new THREE.CylinderGeometry(r * 1.005, r * 1.005, 0.3, 36, 1, true), M(white, 0.35), 1.35);          // 白色条纹
    const liq = add(new THREE.CircleGeometry(r * 0.89, 32), M(0x6b3d22, 0.15, { envMapIntensity: 1.5 }), 1.92); liq.rotation.x = -Math.PI / 2; liq.castShadow = false;
    const foam = add(new THREE.CircleGeometry(r * 0.45, 20), M(0xf6e2c8, 0.6), 1.925, r * 0.15, r * 0.1); foam.rotation.x = -Math.PI / 2; foam.castShadow = false;
    const h = add(new THREE.TorusGeometry(0.62, 0.17, 12, 28), M(col, 0.3), 1.15, Math.cos(o.rot) * (r + 0.32), Math.sin(o.rot) * (r + 0.32)); h.rotation.y = -o.rot;
  } else if (o.kind === 'bowl') {
    const r = o.r;
    add(lathe([[0, 0], [r * 0.5, 0], [r * 0.58, 0.1], [r * 0.9, 0.95], [r, 1.28], [r * 0.97, 1.34], [r * 0.92, 1.3], [r * 0.84, 1.0]], 48), M(col, 0.25, { side: THREE.DoubleSide }), 0);
    add(new THREE.TorusGeometry(r * 0.985, 0.07, 8, 48), M(white, 0.3), 1.3).rotation.x = Math.PI / 2;
    const milk = add(new THREE.CircleGeometry(r * 0.87, 40), M(0xfffdf6, 0.2), 1.08); milk.rotation.x = -Math.PI / 2; milk.castShadow = false;
    const rnd = SIM.rng(o.id * 17 + 3);
    for (let i = 0; i < 14; i++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * r * 0.72; const l = add(new THREE.TorusGeometry(0.2, 0.085, 8, 14), M(OB_COL[i % 6], 0.55), 1.13, Math.cos(a) * d, Math.sin(a) * d); l.rotation.set(Math.PI / 2 + (rnd() - 0.5) * 0.5, 0, rnd() * 3); }
    const sp = add(new THREE.CapsuleGeometry(0.09, 2.6, 4, 8), M(0xdfe6ee, 0.2, { metalness: 0.7 }), 1.75, r * 0.45, 0); sp.rotation.set(0, o.rot, 1.0);   // 勺子
  } else if (o.kind === 'jar') {
    const r = o.r, jam = [0xd9455f, 0xf2a03d, 0x8e5bd0][o.tint % 3];
    add(lathe([[0, 0], [r * 0.9, 0], [r, 0.15], [r, 1.35], [r * 0.82, 1.6], [r * 0.82, 1.72]], 28), M(jam, 0.1, { envMapIntensity: 1.6 }), 0);
    add(new THREE.CylinderGeometry(r * 1.01, r * 1.01, 0.62, 28, 1, true), M(0xfff6dc, 0.7), 0.75);                           // 标签
    add(new THREE.CylinderGeometry(r * 0.86, r * 1.12, 0.3, 28), M(0xe24a4a, 0.75), 1.78);                                   // 布盖
    add(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.1, 28), M(0xf06a6a, 0.75), 1.97);
    add(new THREE.TorusGeometry(r * 0.88, 0.035, 6, 24), M(0xfff6dc, 0.6), 1.72).rotation.x = Math.PI / 2;                    // 扎的绳子
  } else if (o.kind === 'carton') {
    const w = o.hw, d = o.hd;
    add(new THREE.BoxGeometry(w * 2, 2.6, d * 2), M(white, 0.45), 1.3);
    add(new THREE.BoxGeometry(w * 2 + 0.03, 0.85, d * 2 + 0.03), M(0x6bb6f2, 0.45), 1.05);
    for (const [x, y, s] of [[-0.45, 2.05, 0.26], [0.3, 1.9, 0.2], [0.55, 2.3, 0.14]]) { const sp = add(new THREE.CircleGeometry(s, 14), M(0x3a3a48, 0.6), y, x * w, d + 0.02); sp.castShadow = false; } // 奶牛斑点
    // 屋顶形盒盖
    const rg = new THREE.BufferGeometry(), v = [-w, 0, -d, w, 0, -d, w, 0, d, -w, 0, d, -w, 0.75, 0, w, 0.75, 0];
    rg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); rg.setIndex([3, 2, 5, 3, 5, 4, 1, 0, 4, 1, 4, 5, 0, 3, 4, 2, 1, 5]); rg.computeVertexNormals();
    add(rg, M(0xf2f2f2, 0.5, { flatShading: true }), 2.6);
    add(new THREE.BoxGeometry(w * 2, 0.32, 0.08), M(white, 0.5), 3.45);
    add(new THREE.CylinderGeometry(0.24, 0.24, 0.2, 14), M(0xe24a4a, 0.4), 3.05, 0, d * 0.5).rotation.x = 0.82;
  } else if (o.kind === 'books') {
    const cols = [0xe76f51, 0x2a9d8f, 0xe9c46a, 0x7b6cd9];
    for (let i = 0; i < 3; i++) {
      const k = 1 - i * 0.08, w = o.hw * 2 * k, d = o.hd * 2 * k, y = i * 0.5, cm = M(cols[(i + o.tint) % 4], 0.55);
      add(new THREE.BoxGeometry(w - 0.12, 0.36, d - 0.12), M(0xfff8e8, 0.9), y + 0.25);              // 书页
      add(new THREE.BoxGeometry(w, 0.07, d), cm, y + 0.035); add(new THREE.BoxGeometry(w, 0.07, d), cm, y + 0.465);
      add(new THREE.BoxGeometry(0.08, 0.5, d), cm, y + 0.25, -w / 2 + 0.04);                         // 书脊
    }
    add(new THREE.BoxGeometry(0.22, 0.02, 1.1), M(0xe24a4a, 0.6), 0.76, o.hw * 0.3, o.hd * 0.55);    // 书签
  } else { // 麦片盒（躺着）
    add(new THREE.BoxGeometry(o.hw * 2, 1.2, o.hd * 2), M(0xffb347, 0.5), 0.6);
    const wide = o.hw >= o.hd, lab = add(new THREE.PlaneGeometry((wide ? o.hw : o.hd) * 1.96, (wide ? o.hd : o.hw) * 1.96), new THREE.MeshStandardMaterial({ map: cerealTex, roughness: 0.5 }), 1.205);
    lab.rotation.set(-Math.PI / 2, 0, wide ? 0 : Math.PI / 2); lab.castShadow = false;
  }
  g.userData = { o, h: { mug: 2.2, bowl: 1.4, jar: 2.1, carton: 3.5, books: 1.6, cereal: 1.3 }[o.kind], a: 1 };
  g.traverse(m => { if (m.isMesh) m.material.transparent = true; });
  obsRoot.add(g);
}
// 挡在镜头和我之间的东西变半透明，任何时候都看得见自己
function updateOcclusion(dt) {
  const me = S.players[ME];
  for (const g of obsRoot.children) {
    const u = g.userData; if (!u.o) continue;
    const o = u.o, ex = o.r || o.hw, ez = o.r || o.hd, dz = o.z - me.z;
    // 开始界面镜头很低：把我和镜头之间那一片的东西直接藏掉
    const hide = inLobby ? dz > -ez - 1 && Math.hypot(o.x - me.x, dz) < o.br + 11 : me.on && Math.abs(o.x - me.x) < ex + 0.9 && dz > -ez * 0.2 && dz < ez + u.h * 0.8 + 0.6;
    const a = inLobby ? (hide ? 0 : 1) : lerp(u.a, hide ? 0.28 : 1, 1 - Math.exp(-12 * dt));
    g.visible = a > 0.03;
    if (Math.abs(a - u.a) < 0.004) continue;
    u.a = a; g.traverse(m => { if (m.isMesh) { m.material.opacity = a; m.material.depthWrite = a > 0.9; m.castShadow = a > 0.6; } });
  }
}
function buildMap() {
  buildTable(S.round);
  obsRoot.traverse(m => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
  obsRoot.clear(); S.obs.forEach(buildObstacle);
  for (const c of S.puddles) { // 果酱：踩上去变慢
    const rnd = SIM.rng(c.id * 7 + 1), sh = new THREE.Shape(), n = 14;
    for (let i = 0; i <= n; i++) { const a = i / n * 6.2832, r = c.r * (0.82 + 0.2 * Math.sin(a * 3 + c.id) + 0.08 * rnd()); i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshStandardMaterial({ color: 0xc2274b, roughness: 0.12, transparent: true, opacity: 0.82, envMapIntensity: 1.5 }));
    m.rotation.x = -Math.PI / 2; m.position.set(c.x, 0.015, c.z); m.receiveShadow = true; obsRoot.add(m);
  }
  for (const [, m] of itemObjs) scene.remove(m); itemObjs.clear();
}
// ---------- 道具：辣椒 / 冰块 / 泡泡 ----------
const itemObjs = new Map();
function buildItem(kind) {
  const g = new THREE.Group(), core = new THREE.Group(); g.add(core); g.userData.core = core;
  if (kind === 'chili') {
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.95, 14), M(0xe5261f, 0.25, { envMapIntensity: 1.5 })); b.rotation.z = Math.PI; b.position.y = 0;
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.22, 8), M(0x3f9b3a, 0.6)); st.position.y = 0.55;
    core.add(b, st); core.rotation.z = 0.5;
  } else if (kind === 'ice') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), M(0xa8e4ff, 0.08, { transparent: true, opacity: 0.85, envMapIntensity: 2 })); b.rotation.set(0.5, 0.6, 0); core.add(b);
  } else {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), M(0xd9f4ff, 0.05, { transparent: true, opacity: 0.55, envMapIntensity: 2.5 })); core.add(b);
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M(0xffffff, 0.2)); s.position.set(0.18, 0.2, 0.25); core.add(s);
  }
  core.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.78, 28), new THREE.MeshBasicMaterial({ color: { chili: 0xff5a3c, ice: 0x5ac8ff, bubble: 0xffffff }[kind], transparent: true, opacity: 0.85, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  scene.add(g); return g;
}
function updateItems(now) {
  const seen = new Set();
  for (const it of S.items) {
    seen.add(it.id); let m = itemObjs.get(it.id);
    if (!m) { m = buildItem(it.kind); m.position.set(it.x, 0, it.z); m.userData.born = now; itemObjs.set(it.id, m); }
    const k = Math.min(1, (now - m.userData.born) * 3); m.scale.setScalar(k * 1.25);
    m.userData.core.position.y = 0.95 + Math.sin(now * 3 + it.id) * 0.15; m.userData.core.rotation.y = now * 2;
  }
  for (const [id, m] of itemObjs) if (!seen.has(id)) { scene.remove(m); itemObjs.delete(id); }
}
// 震地的圈
const waveGeo = new THREE.RingGeometry(0.82, 1, 48); waveGeo.rotateX(-Math.PI / 2);
const waves = []; for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); m.visible = false; m.position.y = 0.05; scene.add(m); waves.push({ m, t: 0, r: 1 }); }
let waveN = 0;
function waveFx(x, z, r, col = 0xffffff) { const w = waves[waveN++ % waves.length]; w.m.position.set(x, 0.05, z); w.m.material.color.set(col); w.t = 0; w.r = r; w.m.visible = true; }
function updateWaves(dt) { for (const w of waves) { if (!w.m.visible) continue; w.t += dt; const k = w.t / 0.35; if (k >= 1) { w.m.visible = false; continue; } w.m.scale.setScalar(w.r * (0.2 + 0.8 * k)); w.m.material.opacity = (1 - k) * 0.9; } }
const iceMat = new THREE.MeshStandardMaterial({ color: 0xa8e4ff, roughness: 0.08, transparent: true, opacity: 0.6, envMapIntensity: 2 });
const bubMat = new THREE.MeshStandardMaterial({ color: 0xe6f8ff, roughness: 0.05, transparent: true, opacity: 0.33, envMapIntensity: 2.5, depthWrite: false });
const shieldMat = new THREE.MeshStandardMaterial({ color: 0xffd76a, roughness: 0.1, transparent: true, opacity: 0.3, envMapIntensity: 2, depthWrite: false });
const iceGeo = new THREE.BoxGeometry(1.05, 1.1, 1.05), bubGeo = new THREE.SphereGeometry(0.72, 20, 14);
// ---------- 巧克力豆 ----------
const chipGeo = (() => { // 水滴形巧克力豆
  const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; const y = t * 0.3; const r = 0.17 * Math.pow(Math.sin(Math.PI * (1 - t) * 0.5 + 0.0001), 0.9) * (1 - t * 0.15); pts.push(new THREE.Vector2(Math.max(0.001, r), y)); }
  const g = new THREE.LatheGeometry(pts, 16); g.translate(0, -0.06, 0); return g;
})();
const chipIM = new THREE.InstancedMesh(chipGeo, chipMat, C.CHIP_N + 4); chipIM.castShadow = true; chipIM.frustumCulled = false; chipIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(chipIM);
// ---------- 那块饼干 ----------
const cookieObj = (() => {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.58, 0.17, 28), [M(0xc98236, 0.9), new THREE.MeshStandardMaterial({ map: TEX.map, roughness: 0.85 }), M(0xc98236, 0.9)]);
  base.castShadow = true; g.add(base);
  const rnd = SIM.rng(5);
  for (let i = 0; i < 7; i++) { const a = rnd() * 6.283, r = 0.1 + rnd() * 0.4; const c = new THREE.Mesh(chipGeo, chipMat); c.position.set(Math.cos(a) * r, 0.07, Math.sin(a) * r); c.scale.setScalar(0.75); g.add(c); }
  scene.add(g); return g;
})();
// 饼干没人抱时的光柱 + 地上的圈，老远就看得见
const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.75, 9, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
beam.position.y = 4.5; scene.add(beam);
const ckRing = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.2, 40), new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.9, depthWrite: false }));
ckRing.geometry.rotateX(-Math.PI / 2); ckRing.position.y = 0.03; scene.add(ckRing);

let actors = [];
function nameTxt(p) { return p.human ? tl('you') : p.name; }
function buildActors() {
  for (const a of actors) scene.remove(a.root);
  actors = S.players.map(p => {
    const sn = buildSnack(p.look); scene.add(sn.g);
    const tag = document.createElement('div'); tag.textContent = nameTxt(p); if (p.human) tag.className = 'me'; $('tags').appendChild(tag);
    const ice = new THREE.Mesh(iceGeo, iceMat); ice.position.y = 0.5; ice.visible = false; const bub = new THREE.Mesh(bubGeo, bubMat); bub.position.y = 0.5; bub.visible = false; sn.g.add(ice, bub);
    return { root: sn.g, sn, tag, ice, bub, tagTxt: '', scale: 1, hop: 0, flash: 0, pop: 0, drop: 0, chew: 0 };
  });
}

// ---------- 指示：脚边箭头指向饼干、能撞到时对方脚下红圈 ----------
const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 3), new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.95, depthTest: false }));
arrow.geometry.rotateX(Math.PI / 2); arrow.renderOrder = 9; scene.add(arrow);
const tgtRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 32), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.85, depthTest: false }));
tgtRing.geometry.rotateX(-Math.PI / 2); tgtRing.renderOrder = 8; scene.add(tgtRing);
function updateGuides(now) {
  const me = S.players[ME], ck = S.cookie, holder = ck.holder >= 0 ? S.players[ck.holder] : null;
  arrow.visible = false; tgtRing.visible = false;
  const ptr = $('ptr');
  if (S.phase === 'end' || holder === me) { ptr.hidden = true; return; }
  const d = Math.hypot(ck.x - me.x, ck.z - me.z);
  if (me.on && d > 2.2) {
    const a = Math.atan2(ck.x - me.x, ck.z - me.z), r = 1.25 * C.SCALE[me.lvl] * VIS * 0.8;
    arrow.visible = true; arrow.position.set(me.x + Math.sin(a) * r, 0.3, me.z + Math.cos(a) * r); arrow.rotation.set(0, a, 0);
    arrow.material.opacity = 0.65 + 0.3 * Math.sin(now * 6);
  }
  if (holder && me.on && me.dashCd <= 0 && me.jumpT <= 0 && holder.guard <= C.ME_GUARD && holder.jumpT <= 0 && S.phase === 'play' && d < C.AIM_R * C.SCALE[me.lvl]) {
    tgtRing.visible = true; tgtRing.position.set(holder.x, 0.06, holder.z); tgtRing.scale.setScalar(C.SCALE[holder.lvl] * VIS * (1 + 0.08 * Math.sin(now * 10)));
  }
  // 饼干在屏幕外：屏幕边上放一个小饼干图标指方向
  const [sx, sy, front] = toScreen(ck.x, 1, ck.z), mg = 46, W = VW, H = VH;
  if (front && sx > mg && sx < W - mg && sy > mg + 30 && sy < H - mg) { ptr.hidden = true; return; }
  let dx = sx - W / 2, dy = sy - H / 2; if (!front) { dx = -dx; dy = -dy; }
  const k = Math.min((W / 2 - mg) / Math.max(1, Math.abs(dx)), (H / 2 - mg - 20) / Math.max(1, Math.abs(dy)));
  ptr.hidden = false; setTf(ptr, `translate3d(${Math.round(W / 2 + dx * k)}px,${Math.round(H / 2 + dy * k + 10)}px,0) translate(-50%,-50%)`);
  setTf($('ptrA'), `rotate(${Math.atan2(dy, dx).toFixed(2)}rad) translateX(30px)`);
}

// ---------- 粒子 ----------
function makePool(geo, mat, n) {
  const im = new THREE.InstancedMesh(geo, mat, n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = false; im.count = n;
  const arr = []; for (let i = 0; i < n; i++) arr.push({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, s: 1, rx: 0, ry: 0, spin: 0, g: 1 });
  scene.add(im); return { im, arr, next: 0 };
}
const crumbs = makePool(new THREE.IcosahedronGeometry(0.06, 0), new THREE.MeshStandardMaterial({ color: 0xd99a52, roughness: 0.9, flatShading: true }), 420);
const stars = makePool(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: 0xffe066 }), 80);
const chipsFly = makePool(chipGeo, chipMat, 30);
function emit(pool, x, y, z, vx, vy, vz, life, s, g = 1) {
  const p = pool.arr[pool.next]; pool.next = (pool.next + 1) % pool.arr.length;
  Object.assign(p, { x, y, z, vx, vy, vz, life, max: life, s, g, rx: Math.random() * 6, ry: Math.random() * 6, spin: (Math.random() - 0.5) * 12 });
  return p;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function stepPool(pool, dt, bounceTop) {
  let i = 0;
  for (const p of pool.arr) {
    if (p.life > 0) {
      p.life -= dt; p.vy -= 14 * p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rx += p.spin * dt; p.ry += p.spin * 0.7 * dt;
      if (bounceTop && p.vy < 0 && p.y < 0.03 && SIM.edgeGap(S, p.x, p.z) > 0) { p.y = 0.03; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      const k = p.life > 0 ? Math.min(1, p.life / Math.min(0.25, p.max)) : 0;
      _s.setScalar(p.s * k + 1e-4); _q.setFromEuler(_e.set(p.rx, p.ry, 0)); _m.compose(_v.set(p.x, p.y, p.z), _q, _s);
    } else _m.makeScale(0, 0, 0);
    pool.im.setMatrixAt(i++, _m);
  }
  pool.im.instanceMatrix.needsUpdate = true;
}
function crumbBurst(x, y, z, n, sp = 2) {
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = Math.random() * sp; emit(crumbs, x, y, z, Math.cos(a) * s, 1.5 + Math.random() * 3, Math.sin(a) * s, 1.4, 0.6 + Math.random() * 1.2); }
}

// ---------- 声音（全部现场合成） ----------
let AC = null, master = null, soundOn = store.get('sound', true);
function ensureAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = 0.55; master.connect(AC.destination); } catch (e) { }
}
let noiseBuf = null;
function noise(dur, f0, f1, q, vol, type = 'bandpass', when = 0) {
  if (!AC || !soundOn || PF.muted) return;
  if (!noiseBuf) { noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = AC.currentTime + when, s = AC.createBufferSource(); s.buffer = noiseBuf;
  const f = AC.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
function tone(f0, f1, dur, vol, type = 'sine', when = 0) {
  if (!AC || !soundOn || PF.muted) return;
  const t = AC.currentTime + when, o = AC.createOscillator(), g = AC.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
// ---------- 背景音乐（现场合成的循环小曲；自己抱着饼干时鼓点更密） ----------
let musicOn = store.get('music', true), musBus = null, musT = 0, musStep = 0, musHot = false;
const MUS_CH = [[48, 64, 67, 72], [45, 64, 69, 72], [41, 65, 69, 72], [43, 62, 67, 71]]; // C Am F G：低音 + 和弦
const MUS_MEL = [
  [76, 0, 79, 0, 76, 74, 72, 0, 69, 0, 72, 0, 76, 0, 74, 0, 69, 72, 77, 0, 76, 0, 72, 0, 74, 0, 79, 0, 71, 0, 74, 0],
  [72, 74, 76, 0, 79, 0, 76, 0, 81, 0, 79, 76, 72, 0, 0, 0, 77, 0, 76, 74, 72, 0, 69, 0, 67, 71, 74, 0, 79, 0, 0, 0],
];
const mf = m => 440 * Math.pow(2, (m - 69) / 12);
function musNote(f, t, dur, vol, type) {
  const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(musBus); o.start(t); o.stop(t + dur + 0.03);
}
function musHit(t, f0, f1, dur, vol, hp) {
  if (!noiseBuf) { noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  if (hp) { const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 7000; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f); f.connect(g); g.connect(musBus); s.start(t, Math.random()); s.stop(t + dur + 0.02); }
  else { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(musBus); o.start(t); o.stop(t + dur + 0.02); }
}
function musicTick(active) {
  if (!AC || AC.state !== 'running') return;
  if (!musBus) { musBus = AC.createGain(); musBus.gain.value = 0; musBus.connect(master); }
  const on = musicOn && soundOn && !PF.muted && active;
  musBus.gain.setTargetAtTime(on ? 0.5 : 0, AC.currentTime, 0.15);
  if (!on) { musT = 0; return; }
  const sd = 60 / 132 / 2; // 八分音符
  if (musT < AC.currentTime) musT = AC.currentTime + 0.06;
  while (musT < AC.currentTime + 0.2) {
    const s = musStep % 64, bar = (s >> 3) % 4, k = s % 8, ch = MUS_CH[bar], t = musT;
    musNote(mf(ch[0] + (k % 2 ? 12 : 0)), t, sd * 0.9, 0.2, 'triangle');                                   // 低音一跳一跳
    if (k === 2 || k === 6) for (let i = 1; i < 4; i++) musNote(mf(ch[i]), t, sd * 1.1, 0.045, 'square');    // 和弦
    const m = MUS_MEL[(musStep >> 6) % 2 ? 1 : (s >= 32 ? 1 : 0)][s % 32]; if (m) musNote(mf(m), t, sd * 1.5, 0.12, 'triangle');
    if (k % 4 === 0) musHit(t, 150, 45, 0.16, 0.5);                                                         // 底鼓
    if (k % 2 === 1 || musHot) musHit(t, 0, 0, 0.04, musHot ? 0.1 : 0.06, true);                            // 镲
    if (musHot && k % 4 === 2) musHit(t, 320, 160, 0.09, 0.25);
    musT += sd; musStep++;
  }
}
const SFX = {
  bite(near) { const v = near ? 1 : 0.35; noise(0.09, 3200, 1800, 1.2, 0.5 * v); noise(0.07, 2400, 1200, 1.5, 0.35 * v, 'bandpass', 0.05); tone(180, 90, 0.08, 0.25 * v, 'triangle'); },
  chip() { tone(880, 1320, 0.12, 0.22, 'triangle'); tone(1320, 1760, 0.14, 0.15, 'sine', 0.07); },
  grow() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, 0.16, 0.18, 'triangle', i * 0.07)); },
  dash(near) { noise(0.22, 600, 2400, 0.8, near ? 0.3 : 0.1, 'bandpass'); },
  bonk(f) { const v = clamp(f / 8, 0.4, 1); tone(320, 110, 0.22, 0.45 * v, 'sine'); noise(0.08, 900, 300, 1, 0.3 * v, 'lowpass'); },
  crack(near) { noise(0.25, 1800, 500, 0.9, near ? 0.45 : 0.15, 'bandpass'); noise(0.12, 4000, 2000, 2, near ? 0.2 : 0.07, 'bandpass', 0.06); },
  splash(v = 1) { noise(0.5, 1400, 250, 0.7, 0.35 * v, 'lowpass'); tone(500, 180, 0.15, 0.12 * v, 'sine', 0.02); },
  fall() { tone(700, 160, 0.5, 0.22, 'triangle'); },
  fish() { tone(300, 900, 0.12, 0.2, 'sine'); },
  beep(hi) { tone(hi ? 1046 : 660, hi ? 1046 : 660, hi ? 0.35 : 0.14, 0.2, 'square'); },
  jump(me) { tone(300, 700, 0.16, me ? 0.2 : 0.07, 'sine'); },
  wave(me) { tone(140, 50, 0.3, me ? 0.5 : 0.2, 'sine'); noise(0.25, 500, 120, 0.8, me ? 0.4 : 0.15, 'lowpass'); },
  block() { tone(1400, 900, 0.12, 0.25, 'triangle'); tone(2100, 1500, 0.1, 0.12, 'sine', 0.03); },
  freeze() { [1800, 1500, 1200].forEach((f, i) => tone(f, f * 0.9, 0.12, 0.14, 'sine', i * 0.05)); },
  win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, f, 0.2, 0.18, 'triangle', i * 0.11)); },
  lose() { [392, 330, 262].forEach((f, i) => tone(f, f * 0.98, 0.25, 0.16, 'triangle', i * 0.16)); },
};

// ---------- 输入 ----------
const keys = new Set();
let wantDash = false, wantJump = false;
const KB_DASH = ['Space', 'KeyK', 'KeyX'], KB_JUMP = ['KeyJ', 'KeyZ', 'ShiftLeft', 'ShiftRight'];
addEventListener('keydown', e => {
  if (e.repeat && (KB_DASH.includes(e.code) || KB_JUMP.includes(e.code))) { e.preventDefault(); return; }
  ensureAudio();
  if (PF.adBusy) { e.preventDefault(); return; }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (KB_DASH.includes(e.code)) wantDash = true;
  if (KB_JUMP.includes(e.code)) wantJump = true;
  if (e.code === 'KeyP' || e.code === 'Escape') toggleMenu();
  if (e.code === 'Enter' && !$('panel').hidden && $('locker').hidden) $('bAgain').click();
  if ((e.code === 'Enter' || e.code === 'Space') && inLobby && $('locker').hidden && $('menu').hidden) { startFromLobby(); return; }
  usedKeys = true;
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
let usedKeys = false;
function keyDir() {
  let x = 0, z = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1; if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
  return [x, z];
}
// 触屏：任意位置浮动摇杆 + 右下两个按钮
const stick = { id: null, x0: 0, y0: 0, dx: 0, dy: 0 };
let touchMode = IS_TOUCH;
function setTouchMode(b) { touchMode = b; $('touch').hidden = !b; $('keys').hidden = b; }
setTouchMode(IS_TOUCH);
function btnDown(el, fn) { el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); ensureAudio(); if (!PF.adBusy) fn(); el.style.transform = 'scale(.92)'; }); el.addEventListener('pointerup', () => el.style.transform = ''); el.addEventListener('pointerleave', () => el.style.transform = ''); }
btnDown($('tbDash'), () => wantDash = true);
btnDown($('tbJump'), () => wantJump = true);
canvas.addEventListener('pointerdown', e => {
  ensureAudio();
  if (e.pointerType === 'mouse') return;
  if (!touchMode) setTouchMode(true);
  if (stick.id !== null) return;
  stick.id = e.pointerId; stick.x0 = e.clientX; stick.y0 = e.clientY; stick.dx = stick.dy = 0;
  const st = $('stick'); st.hidden = false; st.style.left = e.clientX + 'px'; st.style.top = e.clientY + 'px'; st.firstChild.style.transform = '';
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId !== stick.id) return;
  let dx = e.clientX - stick.x0, dy = e.clientY - stick.y0; const l = Math.hypot(dx, dy), max = 46;
  if (l > max) { // 摇杆跟着手指走
    stick.x0 += dx * (1 - max / l); stick.y0 += dy * (1 - max / l); dx *= max / l; dy *= max / l;
    const st = $('stick'); st.style.left = stick.x0 + 'px'; st.style.top = stick.y0 + 'px';
  }
  stick.dx = dx / max; stick.dy = dy / max; $('stick').firstChild.style.transform = `translate(${dx}px,${dy}px)`;
  if (l > 20 && !stick.handSet) { stick.handSet = true; const lefty = stick.x0 > innerWidth / 2; document.body.classList.toggle('lefty', lefty); }
});
const endStick = e => { if (e.pointerId !== stick.id) return; stick.id = null; stick.dx = stick.dy = 0; stick.handSet = false; $('stick').hidden = true; };
canvas.addEventListener('pointerup', endStick); canvas.addEventListener('pointercancel', endStick);
addEventListener('mousemove', () => { if (touchMode && !IS_TOUCH) setTouchMode(false); });
addEventListener('wheel', e => { if (!e.target.closest('#card,#menu')) e.preventDefault(); }, { passive: false });
addEventListener('contextmenu', e => e.preventDefault());
// 手机：禁止双击放大、双指缩放（iPhone 不认网页里“不许缩放”的设置，只能自己拦）
let lastTouchEnd = 0;
document.addEventListener('touchend', e => { const now = Date.now(); if (now - lastTouchEnd < 350) e.preventDefault(); lastTouchEnd = now; }, { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1 || !e.target.closest('#card,.card2')) e.preventDefault(); }, { passive: false });
for (const k of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(k, e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());


// 屏幕方向 → 世界方向（镜头朝 -z 看，屏幕上 = 世界 -z）
function readInput(me) {
  let [x, z] = keyDir();
  if (stick.id !== null && Math.hypot(stick.dx, stick.dy) > 0.18) { x = stick.dx; z = stick.dy; }
  me.inp.mx = x; me.inp.mz = z;
  if (wantDash) me.inp.dash = true;
  wantDash = false;
  if (wantJump) me.inp.jump = true;
  wantJump = false;
}

// ---------- HUD ----------
let ME = 0;
const feed = $('feed');
function feedMsg(html) { const d = document.createElement('div'); d.innerHTML = html; feed.prepend(d); while (feed.children.length > 3) feed.lastChild.remove(); setTimeout(() => d.remove(), 3500); }
function nameOf(i) { const p = S.players[i]; return `<span style="color:${dotCol(p.look)};text-shadow:0 1px 0 #4a2612">${esc(nameTxt(p))}</span>`; }
let bannerT = 0;
function banner(txt, big = false, dur = 1.6) { const b = $('banner'); b.textContent = txt; b.className = 'out pop' + (big ? ' big' : ''); void b.offsetWidth; bannerT = dur; b.hidden = false; }
let tipTxt = '';
function tip(txt) { const t = $('tip'); if (!txt) { t.hidden = true; tipTxt = ''; return; } if (txt !== tipTxt) { t.textContent = txt; tipTxt = txt; } t.hidden = false; }
const _p = new THREE.Vector3();
let VW = innerWidth, VH = innerHeight;
function toScreen(x, y, z) { _p.set(x, y, z).project(camera); return [(_p.x * 0.5 + 0.5) * VW, (-_p.y * 0.5 + 0.5) * VH, _p.z < 1]; }
// 只在内容真的变了才动页面（每帧乱写会拖慢）
function setT(el, v) { if (el._t !== v) { el._t = v; el.textContent = v; } }
function setTf(el, v) { if (el._f !== v) { el._f = v; el.style.transform = v; } }
function float(x, y, z, txt, col = '#fff') {
  const [sx, sy] = toScreen(x, y, z); const d = document.createElement('div'); d.className = 'out'; d.textContent = txt; d.style.left = sx + 'px'; d.style.top = sy + 'px'; d.style.color = col; $('floats').appendChild(d); setTimeout(() => d.remove(), 950);
}
let boardKey = '';
function updateHUD() {
  const me = S.players[ME], holder = S.cookie.holder;
  const left = Math.max(0, Math.ceil(C.MAX_T - (S.playT || 0)));
  // 左边：现在谁领先（没有倒计时——先吃完的赢；只有拖到最后 20 秒才显示时间）
  const lead = S.players.reduce((a, b) => b.eaten > a.eaten ? b : a), late = left <= 20 && S.phase === 'play';
  setT($('timeP'), late ? '⏱ ' + left : '👑 ' + (lead.eaten > 0 ? nameTxt(lead) + ' ' + Math.floor(lead.eaten / C.WIN_T * 100) + '%' : '—'));
  $('timeP').classList.toggle('hot', late);
  // 我的进度条
  setTf($('progFill'), `scaleX(${(me.eaten / C.WIN_T).toFixed(3)})`);
  setT($('progTxt'), '🍪 ' + Math.floor(me.eaten / C.WIN_T * 100) + '%');
  $('prog').classList.toggle('mine', holder === ME);
  // 排行：吃得最多的 4 个
  const top = S.players.slice().sort((a, b) => b.eaten - a.eaten).slice(0, 4);
  const key = top.map(p => p.id + ':' + Math.floor(p.eaten / C.WIN_T * 100)).join() + '|' + holder + LANG;
  if (key !== boardKey) {
    boardKey = key;
    $('board').innerHTML = top.map(p => `<div class="${p.id === ME ? 'me' : ''}${p.id === holder ? ' has' : ''}"><i class="dot" style="background:${dotCol(p.look)}"></i><span>${esc(nameTxt(p))}</span><u><em style="width:${(p.eaten / C.WIN_T * 100).toFixed(0)}%"></em></u>${p.id === holder ? '🍪' : ''}</div>`).join('');
  }
  setT($('chipIco'), String(me.chips));
  const nx = C.LVL_AT[me.lvl + 1];
  setT($('chipTxt'), nx != null ? tl('next', { n: nx - me.chips, s: tl('skill' + (me.lvl + 1)) }) : tl('maxSize'));
  if (updateHUD.lvl !== me.lvl) { updateHUD.lvl = me.lvl; const pips = $('pips').children; for (let i = 0; i < 4; i++) pips[i].className = i <= me.lvl ? 'on' : ''; }
  const cd = clamp(me.dashCd / C.DASH_CD, 0, 1);
  const off = String(Math.round(295 * cd)); if (updateHUD.off !== off) { updateHUD.off = off; $('dashRing').setAttribute('stroke-dashoffset', off); }
  $('tbDash').classList.toggle('cd', cd > 0);
  $('tbJump').classList.toggle('cd', me.jumpCd > 0);
  if (S.phase === 'play' && S.playT > 1.5 && !$('intro').hidden) { $('intro').style.opacity = 0; if (S.playT > 2) $('intro').hidden = true; }
  // 前两局：根据情况提示该干什么
  if (tipsOn && S.phase === 'play') {
    const T = touchMode;
    if (!me.on) tip(tl('tipFell'));
    else if (holder === ME) tip(tl(T ? 'tipCarryT' : 'tipCarry'));
    else if (holder < 0) tip(tl('tipLoose'));
    else tip(tl(T ? 'tipChaseT' : 'tipChase'));
  } else if (tipTxt) tip('');
}
let tipsOn = false;

// ---------- 镜头：跟着我，稍微偏向饼干 ----------
const camT = new THREE.Vector3(0, 0, 2), camPos = new THREE.Vector3(0, 30, 20);
let camShake = 0;
function camDist() { const a = VW / VH; return a < 0.8 ? 30 : a < 1.25 ? 29 : 26; }
let inLobby = true;
function updateCamera(dt) {
  const me = S.players[ME], ck = S.cookie;
  if (inLobby) { // 开始界面：镜头凑近看自己的角色，慢慢左右晃
    const a = Math.sin(performance.now() / 2600) * 0.45, up = VW / VH < 0.8 ? 1.5 : 0;
    camera.position.set(me.x + Math.sin(a) * (9 + up * 2), 4.4 + up, me.z + Math.cos(a) * (9 + up * 2)); camera.lookAt(me.x, 1.0, me.z);
    camPos.copy(camera.position); camT.set(me.x, 0, me.z + 1);
    sun.position.set(me.x + 9, 20, me.z + 7); sun.target.position.set(me.x, 0, me.z);
    return;
  }
  let fx = me.on ? me.x : clamp(me.fx, -HW, HW), fz = me.on ? me.z : clamp(me.fz, -HH, HH);
  let ox = (ck.x - fx) * 0.22, oz = (ck.z - fz) * 0.22; const ol = Math.hypot(ox, oz); if (ol > 3.5) { ox *= 3.5 / ol; oz *= 3.5 / ol; }
  if (S.phase === 'end') { const wn = S.players[S.winner]; fx = wn.x; fz = wn.z; ox = oz = 0; }
  const tx = fx + ox, tz = fz + oz + 1;
  camT.x = lerp(camT.x, tx, 1 - Math.exp(-9 * dt)); camT.z = lerp(camT.z, tz, 1 - Math.exp(-9 * dt));
  const d = camDist() * (S.phase === 'end' ? 0.62 : 1);
  const pitch = 0.95;
  const want = _v.set(camT.x, Math.sin(pitch) * d, camT.z + Math.cos(pitch) * d);
  camPos.lerp(want, 1 - Math.exp(-12 * dt));
  camera.position.copy(camPos);
  if (camShake > 0) { camShake -= dt; camera.position.x += (Math.random() - 0.5) * camShake * 0.6; camera.position.y += (Math.random() - 0.5) * camShake * 0.6; }
  camera.lookAt(camPos.x, 0, camPos.z - Math.cos(pitch) * d);
  if (DEBUG && window.__camO) { const o = window.__camO; camera.position.set(...o.p); camera.lookAt(...o.l); }
  sun.position.set(camT.x + 9, 20, camT.z + 7); sun.target.position.set(camT.x, 0, camT.z);
}
function resize() { VW = innerWidth; VH = innerHeight; renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 52 : camera.aspect < 1.25 ? 44 : 38; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- 对局 ----------
let matchN = 0, warned = 0, last10 = false;
function newMatch() {
  matchN++;
  // 第一局固定长方桌，之后长方桌 / 圆桌轮着来
  const played = store.get('played', 0);
  S = SIM.create({ seed: (Math.random() * 1e9) | 0, round: /[?&]round/.test(location.search) || played % 2 === 1 });
  const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  ME = 0;
  const me = S.players[ME]; me.bot = false; me.human = true; me.look = store.get('look', 0) % LOOKS.length;
  const used = new Set([me.look]);
  S.players.forEach((p, i) => { p.name = names[i]; if (p !== me) { let l = (Math.random() * LOOKS.length) | 0; while (used.has(l)) l = (l + 1) % LOOKS.length; p.look = l; used.add(l); } });
  buildMap();
  $('tags').innerHTML = ''; buildActors();
  for (const pool of [crumbs, stars, chipsFly]) for (const p of pool.arr) p.life = 0;
  warned = 0; last10 = false; boardKey = '';
  tipsOn = store.get('played', 0) < 2;
  $('intro').hidden = store.get('played', 0) >= 2; $('intro').style.opacity = 1;
  $('panel').hidden = true; feed.innerHTML = ''; tip('');
  camT.set(me.x, 0, me.z + 1); camPos.set(me.x, 30, me.z + 20);
  lastBeep = 4;
  myChipsEaten = 0;
  if (inLobby) { me.face = 0; lobbyUI(); } else PF.setPlaying(true);
}
function startFromLobby() {
  if (!inLobby) return;
  ensureAudio(); inLobby = false; document.body.classList.remove('lobby'); $('lobby').hidden = true;
  const me = S.players[ME]; me.face = Math.atan2(-me.x, -me.z); PF.setPlaying(true);
}
$('bPlay').addEventListener('click', startFromLobby);
let lastBeep = 4;
function flash(col, a = 0.5) { const f = $('flash'); f.style.transition = 'none'; f.style.background = col; f.style.opacity = a; void f.offsetWidth; f.style.transition = 'opacity .45s ease-out'; f.style.opacity = 0; }
// 彩纸
const CONF_N = 220, confIM = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.12), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONF_N), conf = [];
{ const cs = [0xff5a7a, 0x5ad1ff, 0xffe14d, 0x8cff7a, 0xffffff, 0xb67bff, 0xff9d4d], k = new THREE.Color(); for (let i = 0; i < CONF_N; i++) { conf.push({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, r: 0, s: 0 }); confIM.setColorAt(i, k.set(cs[i % cs.length])); } confIM.frustumCulled = false; confIM.count = 0; scene.add(confIM); }
let confNext = 0, confRain = 0, confX = 0, confZ = 0;
function confetti(x, z, n, up) { for (let i = 0; i < n; i++) { const p = conf[confNext++ % CONF_N], a = Math.random() * 6.283, s = Math.random() * 4; Object.assign(p, { life: 2.6, x: x + (Math.random() - 0.5) * (up ? 1 : 9), y: up ? 1 : 7 + Math.random() * 4, z: z + (Math.random() - 0.5) * (up ? 1 : 9), vx: Math.cos(a) * s * (up ? 1 : 0.3), vy: up ? 6 + Math.random() * 5 : 0, vz: Math.sin(a) * s * (up ? 1 : 0.3), r: Math.random() * 6, s: 6 + Math.random() * 8 }); } }
function stepConfetti(dt) {
  if (confRain > 0) { confRain -= dt; if (Math.random() < dt * 60) confetti(confX, confZ, 2, false); }
  let any = false;
  for (let i = 0; i < CONF_N; i++) {
    const p = conf[i];
    if (p.life > 0) { any = true; p.life -= dt; p.vy = Math.max(-2.2, p.vy - 9 * dt); p.vx *= 1 - 1.5 * dt; p.vz *= 1 - 1.5 * dt; p.x += p.vx * dt + Math.sin(p.r) * dt * 0.6; p.y += p.vy * dt; p.z += p.vz * dt; p.r += p.s * dt; if (p.y < 0.03) { p.y = 0.03; p.s = 0; }
      _q.setFromEuler(_e.set(p.r, p.r * 0.7, p.r * 0.3)); _m.compose(_v.set(p.x, p.y, p.z), _q, _s.setScalar(Math.min(1, p.life * 3))); } else _m.makeScale(0, 0, 0);
    confIM.setMatrixAt(i, _m);
  }
  confIM.count = any ? CONF_N : 0; confIM.instanceMatrix.needsUpdate = true;
}
function starBurst(x, y, z, n, sp) { for (let i = 0; i < n; i++) { const a = i / n * 6.283; emit(stars, x, y, z, Math.cos(a) * sp, 2 + Math.random() * 2, Math.sin(a) * sp, 0.6, 1, 0.4); } }
function handleEvents() {
  const me = S.players[ME];
  const near = (x, z) => Math.hypot(x - me.x, z - me.z) < 12;
  for (const e of S.events) {
    switch (e.k) {
      case 'go': banner(tl('go'), true, 0.9); SFX.beep(true); break;
      case 'dash': if (e.p === ME || near(S.players[e.p].x, S.players[e.p].z)) SFX.dash(e.p === ME); break;
      case 'bonk': {
        const mine = e.a === ME || e.b === ME;
        if (mine || near(e.x, e.z)) SFX.bonk(mine ? e.f : e.f * 0.5);
        if (mine) { camShake = 0.4; hitstop = 0.045; float(e.x, 1.3, e.z, tl('pow'), '#ffd23f'); }
        for (let i = 0; i < 10; i++) { const a = Math.random() * 6.283; emit(stars, e.x, 0.9, e.z, Math.cos(a) * 4, 1 + Math.random() * 3, Math.sin(a) * 4, 0.45, 1, 0.5); }
        actors[e.a].flash = actors[e.b].flash = 0.15;
        break;
      }
      case 'steal': {
        const a = S.players[e.a]; actors[e.a].pop = 0.4; starBurst(a.x, 1.2, a.z, 14, 3.5);
        if (e.a === ME) { SFX.grow(); banner(tl('gotIt'), false, 1.1); hitstop = 0.11; flash('#fff7c2', 0.45); confetti(a.x, a.z, 26, true); }
        else if (e.b === ME) { SFX.lose(); banner(tl('lostIt', { b: a.name }), false, 1.4); camShake = 0.5; hitstop = 0.09; flash('#ff5a4a', 0.3); }
        else feedMsg(tl('stole', { a: nameOf(e.b), b: nameOf(e.a) }));
        break;
      }
      case 'pick': {
        const p = S.players[e.p]; actors[e.p].pop = 0.4; starBurst(p.x, 1.2, p.z, 10, 3);
        if (e.p === ME) { SFX.grow(); banner(tl('gotIt'), false, 1.1); flash('#fff7c2', 0.35); confetti(p.x, p.z, 18, true); } else feedMsg('🍪 ' + nameOf(e.p));
        break;
      }
      case 'munch': {
        const p = S.players[e.p]; actors[e.p].chew = 0.3;
        crumbBurst(p.x, 1.3 * C.SCALE[p.lvl] * VIS, p.z, e.p === ME ? 5 : 3, 1.2);
        if (e.p === ME) SFX.bite(true); else if (near(p.x, p.z)) SFX.bite(false);
        break;
      }
      case 'chip': {
        const p = S.players[e.p]; emit(chipsFly, e.x, 0.3, e.z, (p.x - e.x) * 2.5, 5, (p.z - e.z) * 2.5, 0.35, 1, 1.2);
        if (e.p === ME) { myChipsEaten++; SFX.chip(); float(p.x, 1.4, p.z, '+1 🍫', '#ffe08a'); }
        break;
      }
      case 'grow': { const p = S.players[e.p]; actors[e.p].pop = 0.4; starBurst(p.x, 0.9, p.z, 14, 3); if (e.p === ME) { SFX.grow(); banner(tl('newSkill', { s: tl('how' + p.lvl + (p.lvl === 2 && touchMode ? 'T' : '')) }), false, 3.6); } break; }
      case 'fall': {
        if (e.p === ME || near(e.x, e.z)) SFX.fall();
        if (e.by === ME && e.p !== ME) { hitstop = 0.08; flash('#ffffff', 0.25); }
        if (e.p === ME) { camShake = 0.35; flash('#ff5a4a', 0.3); banner(e.by >= 0 ? tl('shoved', { b: S.players[e.by].name }) : tl('fellSelf'), false, 1.5); }
        else { feedMsg(tl('fell', { a: nameOf(e.p) })); if (e.by === ME) float(e.x, 1.2, e.z, '💥', '#fff'); }
        break;
      }
      case 'jump': if (e.p === ME || near(S.players[e.p].x, S.players[e.p].z)) SFX.jump(e.p === ME); break;
      case 'land': if (e.p === ME || near(e.x, e.z)) crumbBurst(e.x, 0.1, e.z, 5, 2); break;
      case 'wave': { waveFx(e.x, e.z, e.r); if (e.p === ME || near(e.x, e.z)) { SFX.wave(e.p === ME); crumbBurst(e.x, 0.1, e.z, 12, 4); } if (e.p === ME) camShake = Math.max(camShake, 0.3); break; }
      case 'block': { const p = S.players[e.p]; waveFx(p.x, p.z, 1.6, e.why === 'bubble' ? 0xbfeaff : 0xffd76a); if (e.p === ME || near(p.x, p.z)) SFX.block(); if (e.p === ME) float(p.x, 1.6, p.z, tl('blocked'), '#bfeaff'); break; }
      case 'item': {
        const p = S.players[e.p]; starBurst(e.x, 0.8, e.z, 10, 3);
        if (e.kind === 'ice') waveFx(p.x, p.z, C.FREEZE_R, 0x8fd8ff);
        if (e.p === ME) { SFX.grow(); banner(tl('it_' + e.kind), false, 1.3); } else if (near(e.x, e.z)) SFX.chip();
        break;
      }
      case 'frozen': if (e.p === ME) { SFX.freeze(); banner(tl('frozen', { b: S.players[e.by].name }), false, 1.3); } break;
      case 'respawn': { actors[e.p].drop = 0.45; actors[e.p].scale = 1; break; }
      case 'end': showEnd(); break;
    }
  }
  if (S.phase === 'count') { const n = Math.ceil(S.phaseT); if (n < lastBeep && n > 0) { lastBeep = n; banner(String(n), true, 0.8); SFX.beep(false); } }
  if (S.phase === 'play') {
    // 有人快吃完了：提醒去抢
    const lead = S.players.reduce((a, b) => b.eaten > a.eaten ? b : a);
    if (warned < 1 && lead.eaten > C.WIN_T * 0.8) { warned = 1; SFX.beep(true); banner(lead.id === ME ? tl('almostMe') : tl('almost', { a: lead.name }), false, 2); }
    if (!last10 && S.playT > C.MAX_T - 20) { last10 = true; SFX.beep(true); banner(tl('last10'), false, 2); }
  }
}

function showEnd() {
  PF.setPlaying(false);
  const me = S.players[ME], won = S.winner === ME, wn = S.players[S.winner];
  starBurst(wn.x, 1.5, wn.z, 24, 5); slowT = 0.9; flash('#ffffff', 0.6); confetti(wn.x, wn.z, 50, true); confRain = won ? 3.5 : 1.2; confX = wn.x; confZ = wn.z;
  setTimeout(() => {
    if (won) { SFX.win(); PF.happy(); } else SFX.lose();
    banner(won ? tl('win') : tl('winner', { a: wn.name }), true, 2.2);
  }, 200);
  const questPay = questProgress(me, won);
  const crumbsN = 10 + (S.players.length - me.place) * 5 + Math.round(me.eaten) + me.steals * 3 + questPay;
  store.set('crumbs', store.get('crumbs', 0) + crumbsN);
  store.set('played', store.get('played', 0) + 1);
  if (won) store.set('wins', store.get('wins', 0) + 1);
  setTimeout(() => {
    $('resT').textContent = won ? tl('win') : tl('place', { n: me.place });
    $('reward').textContent = (questPay ? '✅ ' + tl('questDone', { n: questPay }) + '　' : '') + '🍪 ' + tl('crumbs', { n: crumbsN }) + '（' + store.get('crumbs', 0) + '）';
    $('bSkins').textContent = '🎁 ' + tl('skins') + (store.get('crumbs', 0) >= BOX_COST && owned().size < LOOKS.length ? ' ❗' : '');
    const rows = S.players.slice().sort((a, b) => a.place - b.place).map(p => `<div class="${p.id === ME ? 'me' : ''}"><b>${p.place === 1 ? '👑' : '#' + p.place}</b><i class="dot" style="background:${dotCol(p.look)}"></i>${esc(nameTxt(p))}<s>🍪${Math.floor(p.eaten / C.WIN_T * 100)}% · 💥${p.steals}</s></div>`);
    $('rank').innerHTML = rows.join('');
    $('panel').hidden = false; $('banner').hidden = true; bannerT = 0;
    tip('');
  }, 2300);
}
$('bAgain').addEventListener('click', () => {
  ensureAudio();
  $('panel').hidden = true;
  // 广告只在两局之间
  PF.midgame(() => newMatch());
});

// ---------- 皮肤柜 + 盲盒（饼干屑换） ----------
const BOX_COST = 100;
if (store.get('crumbs', null) == null) store.set('crumbs', BOX_COST);   // 新玩家送一次盲盒
const owned = () => { const o = new Set(store.get('owned', [])); LOOKS.forEach((L, i) => { if (!L.rar) o.add(i); }); return o; };
let pv = null, lockerFrom = '';
function pvInit() {
  if (pv) return;
  const r = new THREE.WebGLRenderer({ canvas: $('pvC'), antialias: true, alpha: true });
  r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); r.setSize(220, 220, false); r.outputColorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0xd0a070, 2.2)); const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(2, 4, 3); sc.add(d);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20); cam.position.set(0, 1.25, 3.3); cam.lookAt(0, 0.42, 0);
  pv = { r, sc, cam, obj: null, idx: 0, roll: 0, rollT: 0, win: -1, black: new THREE.MeshBasicMaterial({ color: 0x3b2416 }) };
}
function pvShow(i) {
  pv.idx = (i + LOOKS.length) % LOOKS.length;
  if (pv.obj) pv.sc.remove(pv.obj);
  const sn = buildSnack(pv.idx); sn.blob.visible = false; pv.obj = sn.g; pv.sc.add(sn.g);
  lockerUI();
}
function lockerUI() {
  const own = owned(), has = own.has(pv.idx), cur = store.get('look', 0) % LOOKS.length, crumbs = store.get('crumbs', 0), rolling = pv.roll > 0;
  pv.sc.overrideMaterial = has && !rolling ? null : pv.black;
  $('pvInfo').textContent = (rolling ? '？？？' : has ? '★'.repeat(Math.max(1, LOOKS[pv.idx].rar)) : '🔒 ' + tl('locked')) + '   ' + (pv.idx + 1) + ' / ' + LOOKS.length;
  $('pvCr').textContent = '🍪 ' + crumbs;
  const u = $('bUse'); u.hidden = !has || rolling; u.textContent = pv.idx === cur ? '✓ ' + tl('using') : tl('use'); u.disabled = pv.idx === cur;
  const b = $('bBox'), all = own.size >= LOOKS.length; b.disabled = rolling || all || crumbs < BOX_COST;
  b.textContent = all ? tl('allOwned') : crumbs < BOX_COST ? tl('needMore', { n: BOX_COST - crumbs }) : '🎁 ' + tl('openBox', { n: BOX_COST });
}
function openLocker(from) { lockerFrom = from; pvInit(); $('locker').hidden = false; $('menu').hidden = true; pvShow(store.get('look', 0)); }
function closeLocker() { $('locker').hidden = true; if (lockerFrom === 'menu') $('menu').hidden = false; if (inLobby) newMatch(); }
function openBox() {
  const own = owned(), pool = []; LOOKS.forEach((L, i) => { if (!own.has(i)) for (let k = 0; k < [0, 6, 3, 1][L.rar]; k++) pool.push(i); });
  if (!pool.length || store.get('crumbs', 0) < BOX_COST || pv.roll > 0) return;
  store.set('crumbs', store.get('crumbs', 0) - BOX_COST);
  pv.win = pool[(Math.random() * pool.length) | 0]; pv.roll = 1.4; pv.rollT = 0;
  own.add(pv.win); store.set('owned', [...own]); store.set('look', pv.win);
  lockerUI();
}
function pvFrame(dt, now) {
  if (!pv || $('locker').hidden) return;
  if (pv.roll > 0) { // 开盒：黑影乱跳一阵，然后亮出来
    pv.roll -= dt; pv.rollT -= dt;
    if (pv.roll <= 0) { pvShow(pv.win); $('pvC').classList.remove('pop'); void $('pvC').offsetWidth; $('pvC').classList.add('pop'); SFX.win(); PF.happy(); }
    else if (pv.rollT <= 0) { pv.rollT = 0.09; SFX.beep(false); pv.roll += 0; const k = pv.roll; pvShow((Math.random() * LOOKS.length) | 0); pv.roll = k; lockerUI(); }
  }
  if (pv.obj) { pv.obj.rotation.y = now * (pv.roll > 0 ? 9 : 1.2); pv.obj.position.y = pv.roll > 0 ? Math.abs(Math.sin(now * 20)) * 0.12 : 0; }
  pv.r.render(pv.sc, pv.cam);
}
$('pvL').addEventListener('click', () => { if (pv.roll <= 0) pvShow(pv.idx - 1); });
$('pvR').addEventListener('click', () => { if (pv.roll <= 0) pvShow(pv.idx + 1); });
$('bUse').addEventListener('click', () => { store.set('look', pv.idx); lockerUI(); });
$('bBox').addEventListener('click', () => { ensureAudio(); openBox(); });
$('bLockerX').addEventListener('click', closeLocker);
$('bSkins').addEventListener('click', () => openLocker('panel'));
$('bSkins2').addEventListener('click', () => openLocker('menu'));
$('bSkins3').addEventListener('click', () => { ensureAudio(); openLocker('lobby'); });

// ---------- 每日奖励 + 每日任务 ----------
const dayKey = (d = new Date()) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
const QUESTS = [{ k: 'qSteal', n: 5 }, { k: 'qChips', n: 30 }, { k: 'qWin', n: 1 }], QUEST_PAY = 40;
function dailyState() { const d = store.get('daily', { day: 0, streak: 0 }); return { ...d, can: d.day !== dayKey(), next: d.day === dayKey(new Date(Date.now() - 864e5)) ? Math.min(d.streak + 1, 7) : 1 }; }
const dailyPay = k => 30 + 20 * Math.min(k, 5);
function questState() { const q = store.get('quests', null); return q && q.day === dayKey() ? q : { day: dayKey(), p: [0, 0, 0] }; }
function lobbyUI() {
  setT($('lobbyCr'), '🍪 ' + store.get('crumbs', 0));
  const d = dailyState(), b = $('bDaily'); b.hidden = !d.can; if (d.can) b.textContent = '🎁 ' + tl('daily', { n: dailyPay(d.next), d: d.next });
  const q = questState();
  $('quests').innerHTML = QUESTS.map((Q, i) => { const v = Math.min(q.p[i], Q.n), ok = v >= Q.n; return `<div class="${ok ? 'ok' : ''}">${ok ? '✅' : '⬜'} ${esc(tl(Q.k, { n: Q.n }))} <b>${v}/${Q.n}</b> <i>+${QUEST_PAY}🍪</i></div>`; }).join('');
}
$('bDaily').addEventListener('click', () => {
  const d = dailyState(); if (!d.can) return; ensureAudio();
  store.set('daily', { day: dayKey(), streak: d.next }); store.set('crumbs', store.get('crumbs', 0) + dailyPay(d.next));
  SFX.win(); PF.happy(); flash('#fff7c2', 0.5); lobbyUI();
});
// 一局结束：记任务进度，刚完成的发奖。返回这局拿到的任务奖励
let myChipsEaten = 0;
function questProgress(me, won) {
  const q = questState(), add = [me.steals, myChipsEaten, won ? 1 : 0]; let pay = 0;
  QUESTS.forEach((Q, i) => { const was = q.p[i] >= Q.n; q.p[i] += add[i]; if (!was && q.p[i] >= Q.n) pay += QUEST_PAY; });
  store.set('quests', q); return pay;
}

// ---------- 菜单 ----------
const ls = $('langSel'); for (const c of CODES) { const o = document.createElement('option'); o.value = c; o.textContent = LANG_NAMES[c]; ls.appendChild(o); }
ls.addEventListener('change', () => { LANG = ls.value; store.set('lang_set', 1); try { localStorage.setItem('lc_lang', LANG); } catch (e) { } applyLang(); if (S) actors.forEach(a => a.tagTxt = ''); lobbyUI(); });
$('optMusic').checked = musicOn; $('optMusic').addEventListener('change', e => { musicOn = e.target.checked; store.set('music', musicOn); });
$('optSound').checked = soundOn; $('optSound').addEventListener('change', e => { soundOn = e.target.checked; store.set('sound', soundOn); });
let paused = false;
function toggleMenu(force) { const show = force ?? $('menu').hidden; $('menu').hidden = !show; paused = show; ls.value = LANG; PF.setPlaying(!show && !inLobby && S && S.phase !== 'end'); }
$('gear').addEventListener('click', () => toggleMenu());
$('bResume').addEventListener('click', () => toggleMenu(false));
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (S && S.phase === 'play' && !paused) toggleMenu(true); if (AC) AC.suspend(); } else if (AC && !PF.muted) AC.resume(); });

// ---------- 每帧画角色、饼干、豆 ----------
function updateActors(dt, now) {
  const holder = S.cookie.holder;
  for (let i = 0; i < S.players.length; i++) {
    const p = S.players[i], a = actors[i], sn = a.sn;
    a.pop = Math.max(0, a.pop - dt); a.drop = Math.max(0, a.drop - dt); a.chew = Math.max(0, a.chew - dt); a.flash = Math.max(0, a.flash - dt);
    a.scale = lerp(a.scale, C.SCALE[p.lvl], 1 - Math.exp(-8 * dt));
    const popS = a.pop > 0 ? 1 + Math.sin((0.4 - a.pop) / 0.4 * Math.PI) * 0.25 : 1;
    if (p.on) {
      const sp = Math.hypot(p.mvx, p.mvz);
      a.hop += dt * (sp > 0.6 ? 15 : 0);
      const hopY = sp > 0.6 ? Math.abs(Math.sin(a.hop)) * 0.12 : 0;
      const sq = sp > 0.6 ? Math.cos(a.hop * 2) * 0.06 : Math.sin(now * 3 + i) * 0.02;
      let y = a.drop > 0 ? (a.drop / 0.45) ** 2 * 7 : 0; // 回到桌上：从天上掉下来
      if (p.dashT > 0) y += Math.sin(clamp(1 - p.dashT / C.DASH_T, 0, 1) * Math.PI) * 0.35;
      if (p.jumpT > 0) y += Math.sin((1 - p.jumpT / C.JUMP_T) * Math.PI) * 2.1;
      a.root.position.set(p.x, y, p.z);
      a.root.rotation.set(0, p.face, 0);
      const s = a.scale * popS * VIS;
      a.root.scale.set(s * (1 - sq * 0.5), s * (1 + sq), s * (1 - sq * 0.5));
      sn.body.position.y = hopY;
      const chewing = a.chew > 0.12;
      sn.body.rotation.x = (p.dashT > 0 ? 0.3 : 0) + (p.hitT > 0 ? -0.35 : 0);
      sn.body.rotation.z = p.hitT > 0 && p.frozenT <= 0 ? Math.sin(now * 40) * 0.15 : 0;
      sn.face.mouth.visible = !chewing; sn.face.mOpen.visible = chewing;
      if (p.dashT > 0 && Math.random() < 0.7) emit(crumbs, p.x, 0.15, p.z, -Math.sin(p.face) * 1.5 + (Math.random() - 0.5), 1.5, -Math.cos(p.face) * 1.5 + (Math.random() - 0.5), 0.5, 0.8);
      sn.blob.material.opacity = a.drop > 0 ? 0 : 0.22; sn.blob.position.y = 0.012 - y / Math.max(0.01, a.root.scale.y);
      a.ice.visible = p.frozenT > 0;
      const sh = p.lvl >= 3 && p.shieldCd <= 0 && i === holder; a.bub.visible = p.bubbleT > 0 || sh; if (a.bub.visible) { a.bub.material = p.bubbleT > 0 ? bubMat : shieldMat; a.bub.scale.setScalar(1 + 0.04 * Math.sin(now * 6 + i)); }
      if (p.boostT > 0 && Math.random() < 0.6) emit(stars, p.x + (Math.random() - 0.5) * 0.5, 0.3, p.z + (Math.random() - 0.5) * 0.5, 0, 1.5, 0, 0.35, 0.8, 0.2);
      a.root.visible = !(p.inv > 0 && a.drop <= 0 && Math.sin(now * 30) > 0.3);
    } else { // 掉下桌：往外飞着掉下去
      const t = p.fallT;
      a.root.visible = t < 1.3;
      a.root.position.set(p.fx + p.fvx * 0.25 * Math.min(t, 0.8), -t * t * 9, p.fz + p.fvz * 0.25 * Math.min(t, 0.8));
      a.root.rotation.x = t * 4; sn.blob.material.opacity = 0;
    }
    // 名字（抱饼干的人多显示一个饼干）
    const tag = a.tag, txt = nameTxt(p) + (i === holder ? ' 🍪' : '');
    if (txt !== a.tagTxt) { a.tagTxt = txt; tag.textContent = txt; }
    const [sx, sy, vis] = toScreen(a.root.position.x, a.root.position.y + (i === holder ? 1.75 : 1.05) * a.scale * VIS, a.root.position.z);
    const show = vis && p.on && !(inLobby && i !== ME); if (a.tagShow !== show) { a.tagShow = show; tag.style.display = show ? '' : 'none'; }
    if (show) setTf(tag, `translate3d(${Math.round(sx)}px,${Math.round(sy)}px,0) translate(-50%,-100%)`);
  }
  // 饼干
  const ck = S.cookie;
  if (holder >= 0) {
    const p = S.players[holder], a = actors[holder];
    cookieObj.position.set(a.root.position.x, a.root.position.y + 1.22 * a.scale * VIS + Math.sin(now * 9) * 0.05, a.root.position.z);
    cookieObj.rotation.set(0.35, now * 2.5, 0); cookieObj.scale.setScalar(1.25 - 0.45 * p.eaten / C.WIN_T);
    beam.visible = false; ckRing.visible = true; ckRing.position.set(p.x, 0.03, p.z); ckRing.scale.setScalar(a.scale * (0.95 + 0.06 * Math.sin(now * 8)));
    ckRing.material.color.set(p.guard > C.ME_GUARD && holder !== ME ? 0x7fd4ff : holder === ME ? 0x6fe36f : 0xffc93c); // 蓝圈 = 刚抢到，保护中，抢不走
  } else {
    cookieObj.position.set(ck.x, 0.75 + Math.sin(now * 3) * 0.15, ck.z); cookieObj.rotation.set(0.5, now * 2, 0); cookieObj.scale.setScalar(1.5);
    beam.visible = true; beam.position.set(ck.x, 4.5, ck.z); beam.material.opacity = 0.22 + 0.1 * Math.sin(now * 5);
    ckRing.visible = true; ckRing.position.set(ck.x, 0.03, ck.z); ckRing.scale.setScalar(1 + 0.15 * Math.sin(now * 5)); ckRing.material.color.set(0xffc93c);
  }
  // 巧克力豆
  let n = 0;
  for (const c of S.chips) { if (n >= chipIM.instanceMatrix.count) break; _q.setFromEuler(_e.set(0, c.id * 1.3, 0)); _m.compose(_v.set(c.x, 0.08 + Math.max(0, Math.sin(now * 3 + c.id)) * 0.08, c.z), _q, _s.setScalar(2.1)); chipIM.setMatrixAt(n++, _m); }
  chipIM.count = n; chipIM.instanceMatrix.needsUpdate = true;
}

// ---------- 画面卡就自动降画质（先降清晰度，再关影子） ----------
const QL = IS_TOUCH ? [[1.5, 1], [1.15, 1], [1, 0], [0.75, 0]] : [[1.5, 1], [1.25, 1], [1, 1], [1, 0], [0.75, 0], [0.6, 0]];
let qLvl = 0, qT = 0, qN = 0, qBad = 0, fpsNow = 60;
function setQuality(l) {
  qLvl = clamp(l, 0, QL.length - 1); const [pr, sh] = QL[qLvl];
  renderer.setPixelRatio(Math.min(pr, devicePixelRatio || 1)); renderer.setSize(innerWidth, innerHeight, false);
  if (renderer.shadowMap.enabled !== !!sh) { renderer.shadowMap.enabled = !!sh; sun.castShadow = !!sh; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); }); }
}
function autoQuality(dt) {
  qT += dt; qN++;
  if (qT < 1) return;
  fpsNow = qN / qT; qT = 0; qN = 0;
  $('fpsTxt').textContent = Math.round(fpsNow) + ' FPS · Q' + (QL.length - qLvl);
  // 比屏幕该有的帧数低一截就降一档（很卡就一次降两档）；头 2 秒不算（刚打开在加载）
  if (performance.now() < 4000) return;
  if (fpsNow < 52) { if (++qBad >= 2 && qLvl < QL.length - 1) { qBad = 0; setQuality(qLvl + (fpsNow < 32 ? 2 : 1)); } } else qBad = 0;
}

// ---------- 主循环 ----------
let last = performance.now(), acc = 0, hitstop = 0, slowT = 0;
const STEP = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  const rawDt = dt;
  const tsec = now / 1000;
  if (hitstop > 0) { hitstop -= dt; dt *= 0.05; }
  else if (slowT > 0) { slowT -= dt; dt *= 0.3; }
  if (!paused && !PF.adBusy && !inLobby) {
    // 每一帧都按实际时间走，屏幕刷新多快人就动多顺（帧太长就拆成几小步）
    const n = Math.max(1, Math.ceil(dt / (1 / 50))), h = dt / n;
    for (let i = 0; i < n && h > 0; i++) {
      readInput(S.players[ME]);
      SIM.thinkBots(S, h);
      SIM.step(S, h);
      handleEvents();
    }
    autoQuality(rawDt);
  } else dt = 0;
  updateActors(dt, tsec);
  stepPool(crumbs, dt, true); stepPool(stars, dt, false); stepPool(chipsFly, dt, false);
  updateCamera(Math.max(dt, 0.001));
  updateGuides(tsec); updateItems(tsec); updateWaves(dt); updateOcclusion(Math.max(dt, 0.016)); stepConfetti(dt);
  musHot = S.cookie.holder === ME; musicTick(!paused && !PF.adBusy);
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').hidden = true; }
  updateHUD();
  renderer.render(scene, camera);
  pvFrame(rawDt, tsec);
}

// ---------- 启动 ----------
(async () => {
  LANG = pickLang(); applyLang();
  await Promise.race([PF.init(), new Promise(r => setTimeout(r, 2500))]);
  if (PF.locale && !store.get('lang_set', 0)) { const l = PF.locale(); if (l && CODES.includes(l)) { LANG = l; applyLang(); } }
  newMatch();
  PF.loadingDone();
  requestAnimationFrame(t => { last = t; frame(t); });
  if (DEBUG) Object.assign(window, { __S: () => S, __SIM: SIM, __setLang: l => { LANG = l; applyLang(); }, __newMatch: newMatch, __cam: camera, __ME: () => ME, __renderer: renderer, __fast: sec => { for (let i = 0; i < sec * 60; i++) { readInput(S.players[ME]); SIM.thinkBots(S, STEP); SIM.step(S, STEP); handleEvents(); } }, __auto: () => { S.players[ME].bot = true; } });
})();
// ===== CLIENT END =====
