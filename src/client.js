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
renderer.setPixelRatio(Math.min(IS_TOUCH ? 1.5 : 2, devicePixelRatio || 1));
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
sun.shadow.mapSize.set(IS_TOUCH ? 1024 : 2048, IS_TOUCH ? 1024 : 2048);
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
];
const DOT_COL = ['#ff9cbc', '#ff7fae', '#ffd36a', '#8fd8ff', '#9fe3c4', '#7a4126', '#ffe39a', '#ffe58a', '#c6b0ff'];
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
// ---------- 桌面 ----------
let S = null;            // 当前对局
const HW = C.HW, HH = C.HH;
{
  // 格子桌布
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  g.fillStyle = '#fff7ea'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(110,190,200,0.38)'; g.fillRect(0, 0, 64, 128); g.fillRect(0, 0, 128, 64);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(HW * 2 / 4, HH * 2 / 4); t.anisotropy = 8;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HH * 2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
  top.rotation.x = -Math.PI / 2; top.receiveShadow = true; scene.add(top);
  // 桌布边 + 桌子厚度
  const hem = new THREE.Mesh(new THREE.BoxGeometry(HW * 2 + 0.12, 0.5, HH * 2 + 0.12), new THREE.MeshStandardMaterial({ color: 0xe8f4f2, roughness: 0.9 }));
  hem.position.y = -0.26; scene.add(hem);
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xff8a5c });
  for (const [w, d, x, z] of [[HW * 2, 0.18, 0, HH - 0.09], [HW * 2, 0.18, 0, -HH + 0.09], [0.18, HH * 2, HW - 0.09, 0], [0.18, HH * 2, -HW + 0.09, 0]]) { // 桌边一圈橙线：过线就掉
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), edgeMat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.012, z); scene.add(m);
  }
  const wood = new THREE.Mesh(new THREE.BoxGeometry(HW * 2 - 0.6, 1.2, HH * 2 - 0.6), new THREE.MeshStandardMaterial({ color: 0x9a6236, roughness: 0.7 }));
  wood.position.y = -1.1; scene.add(wood);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0xd9a871, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -22; scene.add(floor);
}
// ---------- 桌上的东西（障碍） ----------
const obsRoot = new THREE.Group(); scene.add(obsRoot);
const OB_COL = [0xff8fa3, 0x7fc8f8, 0xffd166, 0x9be7c4, 0xc8b6ff, 0xffa66b];
function buildObstacle(o) {
  const g = new THREE.Group(); g.position.set(o.x, 0, o.z);
  const col = OB_COL[o.tint % OB_COL.length];
  const add = (geo, mat, y, x = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  if (o.kind === 'mug') {
    add(new THREE.CylinderGeometry(o.r, o.r * 0.9, 2.0, 36), M(col, 0.35), 1.0);
    const liq = add(new THREE.CircleGeometry(o.r * 0.88, 32), M(0x6b3d22, 0.2), 1.93); liq.rotation.x = -Math.PI / 2; liq.castShadow = false;
    const h = add(new THREE.TorusGeometry(0.62, 0.17, 10, 24), M(col, 0.35), 1.05, Math.cos(o.rot) * (o.r + 0.3), Math.sin(o.rot) * (o.r + 0.3)); h.rotation.y = -o.rot;
  } else if (o.kind === 'bowl') {
    add(new THREE.CylinderGeometry(o.r, o.r * 0.62, 1.25, 44), M(col, 0.3), 0.625);
    const milk = add(new THREE.CircleGeometry(o.r * 0.9, 40), M(0xfffdf6, 0.25), 1.2); milk.rotation.x = -Math.PI / 2; milk.castShadow = false;
    const rnd = SIM.rng(o.id * 17 + 3);
    for (let i = 0; i < 9; i++) { const a = rnd() * 6.283, r = rnd() * o.r * 0.7; const l = add(new THREE.TorusGeometry(0.2, 0.08, 6, 12), M(OB_COL[i % 6], 0.6), 1.24, Math.cos(a) * r, Math.sin(a) * r); l.rotation.x = Math.PI / 2; }
  } else if (o.kind === 'jar') {
    add(new THREE.CylinderGeometry(o.r, o.r, 1.7, 28), M([0xd9455f, 0xf2a03d, 0x8e5bd0][o.tint % 3], 0.15, { envMapIntensity: 1.4 }), 0.85);
    add(new THREE.CylinderGeometry(o.r * 1.04, o.r * 1.04, 0.32, 28), M(0xf3e2b3, 0.4), 1.86);
  } else if (o.kind === 'carton') {
    add(new THREE.BoxGeometry(o.hw * 2, 2.8, o.hd * 2), M(0xffffff, 0.5), 1.4);
    add(new THREE.BoxGeometry(o.hw * 2 + 0.03, 0.9, o.hd * 2 + 0.03), M(0x6bb6f2, 0.5), 1.2);
    const roof = add(new THREE.CylinderGeometry(0.05, o.hw * 1.41, 0.8, 4), M(0xf4f4f4, 0.5), 3.2); roof.rotation.y = Math.PI / 4;
  } else if (o.kind === 'books') {
    const cols = [0xe76f51, 0x2a9d8f, 0xe9c46a];
    for (let i = 0; i < 3; i++) { const k = 1 - i * 0.07; add(new THREE.BoxGeometry(o.hw * 2 * k, 0.46, o.hd * 2 * k), M(cols[(i + o.tint) % 3], 0.6), 0.23 + i * 0.47); }
  } else { // 麦片盒（躺着）
    add(new THREE.BoxGeometry(o.hw * 2, 1.2, o.hd * 2), M(0xffb347, 0.55), 0.6);
    const lab = add(new THREE.PlaneGeometry(o.hw * 1.5, o.hd * 1.5), M(0xfff3c4, 0.6), 1.21); lab.rotation.x = -Math.PI / 2; lab.castShadow = false;
  }
  obsRoot.add(g);
}
function buildMap() {
  obsRoot.traverse(m => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
  obsRoot.clear(); S.obs.forEach(buildObstacle);
}
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
    return { root: sn.g, sn, tag, tagTxt: '', scale: 1, hop: 0, flash: 0, pop: 0, drop: 0, chew: 0 };
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
  if (holder && me.on && me.dashCd <= 0 && S.phase === 'play' && d < C.AIM_R * C.SCALE[me.lvl]) {
    tgtRing.visible = true; tgtRing.position.set(holder.x, 0.06, holder.z); tgtRing.scale.setScalar(C.SCALE[holder.lvl] * VIS * (1 + 0.08 * Math.sin(now * 10)));
  }
  // 饼干在屏幕外：屏幕边上放一个小饼干图标指方向
  const [sx, sy, front] = toScreen(ck.x, 1, ck.z), mg = 46, W = innerWidth, H = innerHeight;
  if (front && sx > mg && sx < W - mg && sy > mg + 30 && sy < H - mg) { ptr.hidden = true; return; }
  let dx = sx - W / 2, dy = sy - H / 2; if (!front) { dx = -dx; dy = -dy; }
  const k = Math.min((W / 2 - mg) / Math.max(1, Math.abs(dx)), (H / 2 - mg - 20) / Math.max(1, Math.abs(dy)));
  ptr.hidden = false; ptr.style.left = (W / 2 + dx * k) + 'px'; ptr.style.top = (H / 2 + dy * k + 10) + 'px';
  $('ptrA').style.transform = `rotate(${Math.atan2(dy, dx)}rad) translateX(30px)`;
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
      if (bounceTop && p.vy < 0 && p.y < 0.03 && Math.abs(p.x) < HW && Math.abs(p.z) < HH) { p.y = 0.03; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
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
  win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, f, 0.2, 0.18, 'triangle', i * 0.11)); },
  lose() { [392, 330, 262].forEach((f, i) => tone(f, f * 0.98, 0.25, 0.16, 'triangle', i * 0.16)); },
};

// ---------- 输入 ----------
const keys = new Set();
let wantDash = false;
const KB_BITE = [], KB_DASH = ['Space', 'KeyK', 'KeyJ', 'KeyX', 'ShiftLeft'];
addEventListener('keydown', e => {
  if (e.repeat && KB_DASH.includes(e.code)) { e.preventDefault(); return; }
  ensureAudio();
  if (PF.adBusy) { e.preventDefault(); return; }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (KB_DASH.includes(e.code)) wantDash = true;
  if (e.code === 'KeyP' || e.code === 'Escape') toggleMenu();
  if (e.code === 'Enter' && !$('panel').hidden) $('bAgain').click();
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


// 屏幕方向 → 世界方向（镜头朝 -z 看，屏幕上 = 世界 -z）
function readInput(me) {
  let [x, z] = keyDir();
  if (stick.id !== null && Math.hypot(stick.dx, stick.dy) > 0.18) { x = stick.dx; z = stick.dy; }
  me.inp.mx = x; me.inp.mz = z;
  if (wantDash) me.inp.dash = true;
  wantDash = false;
}

// ---------- HUD ----------
let ME = 0;
const feed = $('feed');
function feedMsg(html) { const d = document.createElement('div'); d.innerHTML = html; feed.prepend(d); while (feed.children.length > 3) feed.lastChild.remove(); setTimeout(() => d.remove(), 3500); }
function nameOf(i) { const p = S.players[i]; return `<span style="color:${DOT_COL[p.look % 9]};text-shadow:0 1px 0 #4a2612">${esc(nameTxt(p))}</span>`; }
let bannerT = 0;
function banner(txt, big = false, dur = 1.6) { const b = $('banner'); b.textContent = txt; b.className = 'out pop' + (big ? ' big' : ''); void b.offsetWidth; bannerT = dur; b.hidden = false; }
let tipTxt = '';
function tip(txt) { const t = $('tip'); if (!txt) { t.hidden = true; tipTxt = ''; return; } if (txt !== tipTxt) { t.textContent = txt; tipTxt = txt; } t.hidden = false; }
const _p = new THREE.Vector3();
function toScreen(x, y, z) { _p.set(x, y, z).project(camera); return [(_p.x * 0.5 + 0.5) * innerWidth, (-_p.y * 0.5 + 0.5) * innerHeight, _p.z < 1]; }
function float(x, y, z, txt, col = '#fff') {
  const [sx, sy] = toScreen(x, y, z); const d = document.createElement('div'); d.className = 'out'; d.textContent = txt; d.style.left = sx + 'px'; d.style.top = sy + 'px'; d.style.color = col; $('floats').appendChild(d); setTimeout(() => d.remove(), 950);
}
let boardKey = '';
function updateHUD() {
  const me = S.players[ME], holder = S.cookie.holder;
  const left = Math.max(0, Math.ceil(C.MAX_T - (S.playT || 0)));
  $('timeP').textContent = '⏱ ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  $('timeP').classList.toggle('hot', left <= 10 && S.phase === 'play');
  // 我的进度条
  $('progFill').style.width = (me.eaten / C.WIN_T * 100).toFixed(1) + '%';
  $('progTxt').textContent = '🍪 ' + Math.floor(me.eaten / C.WIN_T * 100) + '%';
  $('prog').classList.toggle('mine', holder === ME);
  // 排行：吃得最多的 4 个
  const top = S.players.slice().sort((a, b) => b.eaten - a.eaten).slice(0, 4);
  const key = top.map(p => p.id + ':' + Math.floor(p.eaten / C.WIN_T * 100)).join() + '|' + holder + LANG;
  if (key !== boardKey) {
    boardKey = key;
    $('board').innerHTML = top.map(p => `<div class="${p.id === ME ? 'me' : ''}${p.id === holder ? ' has' : ''}"><i class="dot" style="background:${DOT_COL[p.look % 9]}"></i><span>${esc(nameTxt(p))}</span><u><em style="width:${(p.eaten / C.WIN_T * 100).toFixed(0)}%"></em></u>${p.id === holder ? '🍪' : ''}</div>`).join('');
  }
  $('chipIco').textContent = me.chips;
  const nx = C.LVL_AT[me.lvl + 1];
  $('chipTxt').textContent = nx != null ? tl('next', { n: nx - me.chips }) : tl('maxSize');
  const pips = $('pips').children; for (let i = 0; i < 4; i++) pips[i].className = i <= me.lvl ? 'on' : '';
  const cd = clamp(me.dashCd / C.DASH_CD, 0, 1);
  $('dashRing').setAttribute('stroke-dashoffset', String(295 * cd));
  $('tbDash').classList.toggle('cd', cd > 0);
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
function camDist() { const a = innerWidth / innerHeight; return a < 0.8 ? 30 : a < 1.25 ? 29 : 26; }
function updateCamera(dt) {
  const me = S.players[ME], ck = S.cookie;
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
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 52 : camera.aspect < 1.25 ? 44 : 38; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- 对局 ----------
let matchN = 0, warned = 0, last10 = false;
function newMatch() {
  matchN++;
  S = SIM.create({ seed: (Math.random() * 1e9) | 0 });
  const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  ME = 0;
  const me = S.players[ME]; me.bot = false; me.human = true; me.look = store.get('look', 0) % 9;
  const used = new Set([me.look]);
  S.players.forEach((p, i) => { p.name = names[i]; if (p !== me) { let l = (Math.random() * 9) | 0; while (used.has(l)) l = (l + 1) % 9; p.look = l; used.add(l); } });
  buildMap();
  $('tags').innerHTML = ''; buildActors();
  for (const pool of [crumbs, stars, chipsFly]) for (const p of pool.arr) p.life = 0;
  warned = 0; last10 = false; boardKey = '';
  tipsOn = store.get('played', 0) < 2;
  $('intro').hidden = store.get('played', 0) >= 2; $('intro').style.opacity = 1;
  $('panel').hidden = true; feed.innerHTML = ''; tip('');
  camT.set(me.x, 0, me.z + 1); camPos.set(me.x, 30, me.z + 20);
  lastBeep = 4;
  PF.setPlaying(true);
}
let lastBeep = 4;
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
        if (e.a === ME) { SFX.grow(); banner(tl('gotIt'), false, 1.1); }
        else if (e.b === ME) { SFX.lose(); banner(tl('lostIt', { b: a.name }), false, 1.4); camShake = 0.5; }
        else feedMsg(tl('stole', { a: nameOf(e.b), b: nameOf(e.a) }));
        break;
      }
      case 'pick': {
        const p = S.players[e.p]; actors[e.p].pop = 0.4; starBurst(p.x, 1.2, p.z, 10, 3);
        if (e.p === ME) { SFX.grow(); banner(tl('gotIt'), false, 1.1); } else feedMsg('🍪 ' + nameOf(e.p));
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
        if (e.p === ME) { SFX.chip(); float(p.x, 1.4, p.z, '+1 🍫', '#ffe08a'); }
        break;
      }
      case 'grow': { const p = S.players[e.p]; actors[e.p].pop = 0.4; starBurst(p.x, 0.9, p.z, 14, 3); if (e.p === ME) SFX.grow(); break; }
      case 'fall': {
        if (e.p === ME || near(e.x, e.z)) SFX.fall();
        if (e.p === ME) { camShake = 0.35; banner(e.by >= 0 ? tl('shoved', { b: S.players[e.by].name }) : tl('fellSelf'), false, 1.5); }
        else { feedMsg(tl('fell', { a: nameOf(e.p) })); if (e.by === ME) float(e.x, 1.2, e.z, '💥', '#fff'); }
        break;
      }
      case 'respawn': { actors[e.p].drop = 0.45; actors[e.p].scale = 1; break; }
      case 'end': showEnd(); break;
    }
  }
  if (S.phase === 'count') { const n = Math.ceil(S.phaseT); if (n < lastBeep && n > 0) { lastBeep = n; banner(String(n), true, 0.8); SFX.beep(false); } }
  if (S.phase === 'play') {
    // 有人快吃完了：提醒去抢
    const lead = S.players.reduce((a, b) => b.eaten > a.eaten ? b : a);
    if (warned < 1 && lead.eaten > C.WIN_T * 0.8) { warned = 1; SFX.beep(true); banner(lead.id === ME ? tl('almostMe') : tl('almost', { a: lead.name }), false, 2); }
    if (!last10 && S.playT > C.MAX_T - 10) { last10 = true; SFX.beep(true); banner(tl('last10'), false, 2); }
  }
}

function showEnd() {
  PF.setPlaying(false);
  const me = S.players[ME], won = S.winner === ME, wn = S.players[S.winner];
  starBurst(wn.x, 1.5, wn.z, 24, 5);
  setTimeout(() => {
    if (won) { SFX.win(); PF.happy(); } else SFX.lose();
    banner(won ? tl('win') : tl('winner', { a: wn.name }), true, 2.2);
  }, 200);
  const crumbsN = 10 + (S.players.length - me.place) * 5 + Math.round(me.eaten) + me.steals * 3;
  store.set('crumbs', store.get('crumbs', 0) + crumbsN);
  store.set('played', store.get('played', 0) + 1);
  if (won) store.set('wins', store.get('wins', 0) + 1);
  setTimeout(() => {
    $('resT').textContent = won ? tl('win') : tl('place', { n: me.place });
    $('reward').textContent = '🍪 ' + tl('crumbs', { n: crumbsN });
    const rows = S.players.slice().sort((a, b) => a.place - b.place).map(p => `<div class="${p.id === ME ? 'me' : ''}"><b>${p.place === 1 ? '👑' : '#' + p.place}</b><i class="dot" style="background:${DOT_COL[p.look % 9]}"></i>${esc(nameTxt(p))}<s>🍪${Math.floor(p.eaten / C.WIN_T * 100)}% · 💥${p.steals}</s></div>`);
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

// ---------- 菜单 ----------
const ls = $('langSel'); for (const c of CODES) { const o = document.createElement('option'); o.value = c; o.textContent = LANG_NAMES[c]; ls.appendChild(o); }
ls.addEventListener('change', () => { LANG = ls.value; store.set('lang_set', 1); try { localStorage.setItem('lc_lang', LANG); } catch (e) { } applyLang(); if (S) actors.forEach(a => a.tagTxt = ''); });
$('optSound').checked = soundOn; $('optSound').addEventListener('change', e => { soundOn = e.target.checked; store.set('sound', soundOn); });
let paused = false;
function toggleMenu(force) { const show = force ?? $('menu').hidden; $('menu').hidden = !show; paused = show; ls.value = LANG; PF.setPlaying(!show && S && S.phase !== 'end'); }
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
      if (p.dashT > 0) y += Math.sin((1 - p.dashT / C.DASH_T) * Math.PI) * 0.35;
      a.root.position.set(p.x, y, p.z);
      a.root.rotation.set(0, p.face, 0);
      const s = a.scale * popS * VIS;
      a.root.scale.set(s * (1 - sq * 0.5), s * (1 + sq), s * (1 - sq * 0.5));
      sn.body.position.y = hopY;
      const chewing = a.chew > 0.12;
      sn.body.rotation.x = (p.dashT > 0 ? 0.3 : 0) + (p.hitT > 0 ? -0.35 : 0);
      sn.body.rotation.z = p.hitT > 0 ? Math.sin(now * 40) * 0.15 : 0;
      sn.face.mouth.visible = !chewing; sn.face.mOpen.visible = chewing;
      if (p.dashT > 0 && Math.random() < 0.7) emit(crumbs, p.x, 0.15, p.z, -Math.sin(p.face) * 1.5 + (Math.random() - 0.5), 1.5, -Math.cos(p.face) * 1.5 + (Math.random() - 0.5), 0.5, 0.8);
      sn.blob.material.opacity = a.drop > 0 ? 0 : 0.22;
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
    tag.style.display = vis && p.on ? '' : 'none';
    tag.style.left = sx + 'px'; tag.style.top = sy + 'px';
  }
  // 饼干
  const ck = S.cookie;
  if (holder >= 0) {
    const p = S.players[holder], a = actors[holder];
    cookieObj.position.set(a.root.position.x, a.root.position.y + 1.22 * a.scale * VIS + Math.sin(now * 9) * 0.05, a.root.position.z);
    cookieObj.rotation.set(0.35, now * 2.5, 0); cookieObj.scale.setScalar(1.25 - 0.45 * p.eaten / C.WIN_T);
    beam.visible = false; ckRing.visible = true; ckRing.position.set(p.x, 0.03, p.z); ckRing.scale.setScalar(a.scale * (0.95 + 0.06 * Math.sin(now * 8)));
    ckRing.material.color.set(holder === ME ? 0x6fe36f : 0xffc93c);
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
const QL = IS_TOUCH ? [[1.5, 1], [1.15, 1], [1, 0], [0.75, 0]] : [[2, 1], [1.5, 1], [1.1, 1], [1, 0], [0.75, 0]];
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
  if (fpsNow < 45) { if (++qBad >= 2 && qLvl < QL.length - 1) { qBad = 0; setQuality(qLvl + 1); } } else qBad = 0;
}

// ---------- 主循环 ----------
let last = performance.now(), acc = 0, hitstop = 0;
const STEP = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  const rawDt = dt;
  const tsec = now / 1000;
  if (hitstop > 0) { hitstop -= dt; dt *= 0.05; }
  if (!paused && !PF.adBusy) {
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
  updateGuides(tsec);
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').hidden = true; }
  updateHUD();
  renderer.render(scene, camera);
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
