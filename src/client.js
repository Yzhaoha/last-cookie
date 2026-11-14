// ===== CLIENT =====
const C = SIM.CFG, R = C.R, VIS = 1.38;
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
// 饼干表面高度（世界坐标，碎块之间无缝）
function topH(x, z) {
  const r = Math.hypot(x, z), e = R - r;
  let h = C.TOP + 0.045 * vnoise(x * 1.3, z * 1.3) + 0.02 * vnoise(x * 3.7 + 9, z * 3.7);
  h += 0.07 * Math.sin(clamp(e / 1.1, 0, 1) * Math.PI) * (e < 1.1 ? 1 : 0); // 边缘一圈鼓起
  if (e < 0.35) h -= (0.35 - e) * (0.35 - e) * 3.2;                          // 圆角
  return h;
}

// ---------- three 基础 ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
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
sun.shadow.mapSize.set(2048, 2048);
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

// ---------- 牛奶 ----------
const milkU = { uTime: { value: 0 } };
const milkNorm = (() => {
  const S2 = 256, cv = document.createElement('canvas'); cv.width = cv.height = S2; const g = cv.getContext('2d'); const img = g.createImageData(S2, S2);
  const h = (x, y) => { let v = 0; for (const [f, a] of [[3, 1], [7, 0.5], [13, 0.25]]) v += a * Math.sin((x * f + Math.sin(y * f * 0.7 / S2 * 6.283) * 8) / S2 * 6.283) * Math.cos((y * f * 1.1 + Math.cos(x * f * 0.6 / S2 * 6.283) * 6) / S2 * 6.283); return v; };
  for (let y = 0; y < S2; y++) for (let x = 0; x < S2; x++) { const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1); const i = (y * S2 + x) * 4; img.data[i] = 128 + dx * 40; img.data[i + 1] = 128 + dy * 40; img.data[i + 2] = 255; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(14, 14); return t;
})();
const milkMat = new THREE.MeshStandardMaterial({ normalMap: milkNorm, normalScale: new THREE.Vector2(0.35, 0.35), color: 0xf3eee6, roughness: 0.14, metalness: 0, envMapIntensity: 0.45 });
milkMat.onBeforeCompile = sh => {
  sh.uniforms.uTime = milkU.uTime;
  sh.vertexShader = 'uniform float uTime;\nfloat wv(vec2 p){return sin(p.x*0.55+uTime*1.1)*0.05+sin(p.y*0.7-uTime*0.9)*0.045+sin((p.x+p.y)*1.3+uTime*1.7)*0.02;}\n' + sh.vertexShader
    .replace('#include <beginnormal_vertex>', `vec2 wp=(modelMatrix*vec4(position,1.0)).xz; float e=0.05; float hx=wv(wp+vec2(e,0.))-wv(wp-vec2(e,0.)); float hz=wv(wp+vec2(0.,e))-wv(wp-vec2(0.,e));\nvec3 objectNormal = vec3(-hx/(2.*e), hz/(2.*e), 1.0);`)
    .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.xy, wv(wp));');
};
const milk = new THREE.Mesh(new THREE.PlaneGeometry(140, 140, 180, 180), milkMat);
milk.rotation.x = -Math.PI / 2; milk.receiveShadow = true; scene.add(milk);
// 大碗沿
{
  const bowlMat = new THREE.MeshStandardMaterial({ color: 0x9cc7e6, roughness: 0.18, envMapIntensity: 1.1 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(24, 1.4, 24, 128), bowlMat);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.3; scene.add(rim);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(25.3, 25.3, 8, 96, 1, true), new THREE.MeshStandardMaterial({ color: 0xa9d0ec, roughness: 0.3, side: THREE.BackSide }));
  wall.position.y = 4; scene.add(wall);
  // 碗沿一圈白点花纹
  const dot = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), 60);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 60; i++) { const a = i / 60 * 6.283; m4.makeScale(1, 0.5, 1).setPosition(Math.cos(a) * 24, 1.6, Math.sin(a) * 24); dot.setMatrixAt(i, m4); }
  scene.add(dot);
}

// ---------- 饼干碎块 ----------
let S = null;            // 当前对局
let cellObjs = [];
const cookieRoot = new THREE.Group(); scene.add(cookieRoot);
const chipGeo = (() => { // 水滴形巧克力豆
  const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; const y = t * 0.3; const r = 0.17 * Math.pow(Math.sin(Math.PI * (1 - t) * 0.5 + 0.0001), 0.9) * (1 - t * 0.15); pts.push(new THREE.Vector2(Math.max(0.001, r), y)); }
  const g = new THREE.LatheGeometry(pts, 16); g.translate(0, -0.06, 0); return g;
})();

function buildCell(c) {
  const out = [];
  for (let k = 0; k < c.poly.length; k++) {
    const a = c.poly[k], b = c.poly[(k + 1) % c.poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.28));
    for (let i = 0; i < n; i++) out.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
  }
  // 往里收一点点，碎块之间有极细的缝
  const ins = out.map(p => { const dx = p[0] - c.cx, dz = p[1] - c.cz, l = Math.hypot(dx, dz); const k = Math.max(0, l - 0.006) / l; return [c.cx + dx * k, c.cz + dz * k]; });
  const pos = [], uv = [], idx = [], n = ins.length;
  const P = (x, y, z, u, v) => { pos.push(x - c.cx, y, z - c.cz); uv.push(u, v); return pos.length / 3 - 1; };
  const tuv = (x, z) => [x / (2 * R) + 0.5, 1 - (z / (2 * R) + 0.5)];
  // 顶面：中心 + 两圈
  const c0 = P(c.cx, topH(c.cx, c.cz), c.cz, ...tuv(c.cx, c.cz));
  const ring1 = [], ring2 = [];
  for (const p of ins) { const x = lerp(c.cx, p[0], 0.5), z = lerp(c.cz, p[1], 0.5); ring1.push(P(x, topH(x, z), z, ...tuv(x, z))); }
  for (const p of ins) ring2.push(P(p[0], topH(p[0], p[1]) - 0.012, p[1], ...tuv(p[0], p[1])));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(c0, ring1[j], ring1[i]);
    idx.push(ring1[i], ring1[j], ring2[j], ring1[i], ring2[j], ring2[i]);
  }
  const topCount = idx.length;
  // 侧面：外缘（顶）+ 小倒角 + 底
  let acc = 0;
  for (let i = 0; i <= n; i++) {
    const p = ins[i % n], q = ins[(i + 1) % n];
    const y = topH(p[0], p[1]) - 0.012;
    const dx = p[0] - c.cx, dz = p[1] - c.cz, l = Math.hypot(dx, dz);
    P(p[0] - dx / l * 0.03, y - 0.04, p[1] - dz / l * 0.03, acc * 0.6, 0); // 微微往里的倒角
    P(p[0], -0.55, p[1], acc * 0.6, 0.55);
    acc += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  const s0 = pos.length / 3 - (n + 1) * 2;
  for (let i = 0; i < n; i++) { const a = s0 + i * 2, b = a + 2; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  // 侧面顶边接到顶面外圈
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.addGroup(0, topCount, 0); g.addGroup(topCount, idx.length - topCount, 1);
  g.computeVertexNormals();
  const topMat = new THREE.MeshStandardMaterial({ map: TEX.map, bumpMap: TEX.bump, bumpScale: 1.4, roughness: 0.82, color: 0xffffff });
  const mesh = new THREE.Mesh(g, [topMat, sideMat]);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const grp = new THREE.Group(); grp.position.set(c.cx, 0, c.cz); grp.add(mesh);
  // 裂纹：从块内一点往外散开几条
  const rnd = SIM.rng(c.id * 13 + 5);
  const ox = (rnd() - 0.5) * 0.4, oz = (rnd() - 0.5) * 0.4;
  const cpos = [], cidx = [];
  const nCr = 3 + (rnd() * 3 | 0);
  for (let k = 0; k < nCr; k++) {
    let a = rnd() * 6.283, x = ox, z = oz, w = 0.045;
    const segs = 4 + (rnd() * 3 | 0);
    let prevL = -1, prevR = -1;
    for (let s = 0; s <= segs; s++) {
      const nx = -Math.sin(a), nz = Math.cos(a);
      const y1 = topH(c.cx + x + nx * w, c.cz + z + nz * w) + 0.01, y2 = topH(c.cx + x - nx * w, c.cz + z - nz * w) + 0.01;
      cpos.push(x + nx * w, y1, z + nz * w, x - nx * w, y2, z - nz * w);
      const L = cpos.length / 3 - 2;
      if (prevL >= 0) cidx.push(prevL, L, prevL + 1, L, L + 1, prevL + 1);
      prevL = L;
      a += (rnd() - 0.5) * 1.1; x += Math.cos(a) * 0.17; z += Math.sin(a) * 0.17; w *= 0.8;
      // 超出块就停
      if (!pointIn(c.poly, c.cx + x, c.cz + z)) break;
    }
  }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3)); cg.setIndex(cidx);
  cg.translate(-ox, 0, -oz);
  const crack = new THREE.Mesh(cg, crackMat); crack.position.set(ox, 0, oz); crack.visible = false; crack.renderOrder = 2;
  grp.add(crack);
  // 外圈碎块：贴着牛奶的一圈奶沫
  const rimPts = ins.filter(p => Math.hypot(p[0], p[1]) > R - 0.05);
  if (rimPts.length >= 2) {
    rimPts.sort((u, v) => Math.atan2(u[1], u[0]) - Math.atan2(v[1], v[0]));
    // 处理跨越 ±π 的情况
    for (let i = 1; i < rimPts.length; i++) if (Math.atan2(rimPts[i][1], rimPts[i][0]) - Math.atan2(rimPts[i - 1][1], rimPts[i - 1][0]) > 1) { rimPts.push(...rimPts.splice(0, i)); break; }
    const curve = new THREE.CatmullRomCurve3(rimPts.map(p => new THREE.Vector3(p[0] * 1.012 - c.cx, 0.03, p[1] * 1.012 - c.cz)));
    const foam = new THREE.Mesh(new THREE.TubeGeometry(curve, rimPts.length * 2, 0.11, 6, false), foamMat);
    foam.scale.y = 0.6; grp.add(foam);
  }
  let chip = null;
  if (c.chip) {
    chip = new THREE.Mesh(chipGeo, chipMat); chip.castShadow = true; chip.scale.setScalar(1.7);
    chip.position.set(c.chipPos[0] - c.cx, topH(c.chipPos[0], c.chipPos[1]) - 0.01, c.chipPos[1] - c.cz);
    chip.rotation.set((rnd() - 0.5) * 0.4, rnd() * 6, (rnd() - 0.5) * 0.4);
    grp.add(chip);
  }
  cookieRoot.add(grp);
  return { grp, mesh, topMat, crack, chip, tiltX: rnd() - 0.5, tiltZ: rnd() - 0.5, lastK: -1, gone: false };
}
function pointIn(poly, x, z) {
  let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins; } return ins;
}
function clearCookie() {
  for (const o of cellObjs) { o.grp.traverse(m => { if (m.isMesh && m.geometry !== chipGeo) m.geometry.dispose(); }); o.topMat.dispose(); }
  cookieRoot.clear(); cellObjs = [];
}
const tmpCol = new THREE.Color(), crackTint = new THREE.Color(0xc79a74), white = new THREE.Color(1, 1, 1);
function updateCookie(now) {
  for (const c of S.ck.cells) {
    const o = cellObjs[c.id]; if (o.gone) continue;
    if (c.state === 2) { o.grp.visible = false; o.gone = true; continue; }
    const k = clamp(c.crack / c.hp, 0, 1);
    if (o.chip && !c.chip) { o.grp.remove(o.chip); o.chip = null; }
    if (c.state === 1) {
      const t = c.fallT;
      o.grp.position.y = -t * t * 2.6 - t * 0.4;
      o.grp.rotation.x = o.tiltX * t * 0.9; o.grp.rotation.z = o.tiltZ * t * 0.9;
      o.crack.visible = true; o.crack.scale.setScalar(1.3);
      continue;
    }
    if (Math.abs(k - o.lastK) > 0.004) {
      o.lastK = k;
      const s = 1 - 0.035 * sstep(0.55, 1, k);
      o.grp.scale.set(s, 1, s);
      o.crack.visible = k > 0.5;
      const cs = sstep(0.5, 0.95, k); o.crack.scale.set(0.25 + cs * 1.05, 1, 0.25 + cs * 1.05);
      o.topMat.color.copy(white).lerp(crackTint, sstep(0.45, 1, k) * 0.45);
      o.grp.position.y = -sstep(0.6, 1, k) * 0.06;
    }
    if (k > 0.62) { const g = sstep(0.62, 0.95, k); o.topMat.emissive.setRGB(0.55 * g, 0.08 * g, 0.02 * g); o.topMat.emissiveIntensity = 0.55 + 0.45 * Math.sin(now * (8 + g * 10) + c.id); } else if (o.topMat.emissiveIntensity) { o.topMat.emissive.setRGB(0, 0, 0); o.topMat.emissiveIntensity = 0; }
    if (k > 0.72) { const w = (k - 0.72) / 0.28 * 0.035; o.grp.rotation.x = Math.sin(now * 31 + c.id) * w; o.grp.rotation.z = Math.cos(now * 27 + c.id * 2) * w; }
    else if (o.grp.rotation.x) { o.grp.rotation.x = 0; o.grp.rotation.z = 0; }
    if (o.chip) { o.chip.position.y = topH(c.chipPos[0], c.chipPos[1]) - 0.01 + Math.max(0, Math.sin(now * 3 + c.id)) * 0.03; }
  }
}

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
function buildFish(col) {
  const g = new THREE.Group();
  const m = M(col, 0.35, { envMapIntensity: 1.2 });
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), m); b.scale.set(0.8, 0.75, 1.15);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.28, 4), m); tail.rotation.x = -Math.PI / 2; tail.scale.set(0.25, 1, 1); tail.position.z = -0.38;
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 4), m); fin.position.set(0, 0.23, -0.02); fin.scale.set(0.3, 1, 1);
  g.add(b, tail, fin);
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), eyeWhite); e.position.set(sx * 0.17, 0.07, 0.17); const p = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), eyeBlack); p.position.set(sx * 0.2, 0.07, 0.2); g.add(e, p); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { g, tail };
}
let actors = [];
function buildActors() {
  for (const a of actors) { scene.remove(a.root); scene.remove(a.fish.g); }
  actors = S.players.map(p => {
    const sn = buildSnack(p.look); const fish = buildFish(sn.col);
    fish.g.visible = false; scene.add(sn.g, fish.g);
    const tag = document.createElement('div'); tag.textContent = p.bot ? p.name : tl('you'); if (!p.bot) tag.className = 'me'; $('tags').appendChild(tag);
    return { root: sn.g, sn, fish, tag, scale: 1, squash: 0, hop: 0, lastLvl: 0, fallY: 0, fallRot: 0, flash: 0 };
  });
}

// ---------- 漂着的饼干碎、指示 ----------
const floatGeo = new THREE.DodecahedronGeometry(0.32, 0); floatGeo.scale(1, 0.45, 1);
const floatMat = new THREE.MeshStandardMaterial({ map: crumbTex, color: 0xe7ad62, roughness: 0.8, flatShading: true });
const floatMeshes = new Map();
function updateFloats(now) {
  const seen = new Set();
  for (const fl of S.floats) {
    seen.add(fl.id);
    let m = floatMeshes.get(fl.id);
    if (!m) { m = new THREE.Mesh(floatGeo, floatMat); m.castShadow = true; m.rotation.y = fl.id * 1.7; scene.add(m); floatMeshes.set(fl.id, m); m.userData.born = now; }
    const k = Math.min(1, (now - m.userData.born) * 2);
    m.position.set(fl.x, 0.06 + Math.sin(now * 2.2 + fl.id) * 0.05, fl.z); m.rotation.z = Math.sin(now * 1.5 + fl.id) * 0.15;
    m.scale.setScalar(k * (1 + 0.08 * Math.sin(now * 5 + fl.id)));
  }
  for (const [id, m] of floatMeshes) if (!seen.has(id)) { scene.remove(m); floatMeshes.delete(id); }
}
// 指向最近巧克力豆的小箭头
const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 3), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.95, depthTest: false }));
arrow.geometry.rotateX(Math.PI / 2); arrow.renderOrder = 9; scene.add(arrow);
// 冲撞目标红圈
const tgtRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 32), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.85, depthTest: false }));
tgtRing.geometry.rotateX(-Math.PI / 2); tgtRing.renderOrder = 8; scene.add(tgtRing);
// 小鱼找饼干碎的箭头
const fishArrow = arrow.clone(); fishArrow.material = arrow.material.clone(); fishArrow.material.color.set(0xffffff); scene.add(fishArrow);
function updateGuides(now) {
  const me = S.players[ME];
  arrow.visible = false; tgtRing.visible = false; fishArrow.visible = false;
  if (S.phase === 'end') return;
  if (me.alive) {
    let best = null, bd = 1e9;
    for (const c of S.ck.cells) { if (!c.chip || c.state) continue; const d = Math.hypot(c.chipPos[0] - me.x, c.chipPos[1] - me.z); if (d < bd) { bd = d; best = c; } }
    if (best && bd > 1.4 && me.lvl < 3) {
      const a = Math.atan2(best.chipPos[0] - me.x, best.chipPos[1] - me.z), r = 1.15 * C.SCALE[me.lvl] * VIS * 0.8;
      arrow.visible = true; arrow.position.set(me.x + Math.sin(a) * r, topH(me.x, me.z) + 0.25, me.z + Math.cos(a) * r); arrow.rotation.set(0, a, 0);
      arrow.material.opacity = 0.6 + 0.35 * Math.sin(now * 6);
    }
    if (me.dashCd <= 0 && S.phase === 'play') {
      let t = null, td = 3.4 * C.SCALE[me.lvl];
      for (const q of S.players) { if (q === me || !q.alive) continue; const d = Math.hypot(q.x - me.x, q.z - me.z); if (d < td) { td = d; t = q; } }
      if (t) { tgtRing.visible = true; tgtRing.position.set(t.x, topH(t.x, t.z) + 0.06, t.z); tgtRing.scale.setScalar(C.SCALE[t.lvl] * VIS * (1 + 0.08 * Math.sin(now * 10))); }
    }
  } else if (me.fish && me.fallT > 0.8 && SIM.canRevive(S) && S.floats.length) {
    const f = me.fish; let best = null, bd = 1e9;
    for (const fl of S.floats) { const d = Math.hypot(fl.x - f.x, fl.z - f.z); if (d < bd) { bd = d; best = fl; } }
    if (best && bd > 1.2) { const a = Math.atan2(best.x - f.x, best.z - f.z); fishArrow.visible = true; fishArrow.position.set(f.x + Math.sin(a) * 1.1, 0.4, f.z + Math.cos(a) * 1.1); fishArrow.rotation.set(0, a, 0); }
  }
}

// ---------- 粒子 ----------
function makePool(geo, mat, n) {
  const im = new THREE.InstancedMesh(geo, mat, n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = false; im.count = n;
  const arr = []; for (let i = 0; i < n; i++) arr.push({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, s: 1, rx: 0, ry: 0, spin: 0, g: 1 });
  scene.add(im); return { im, arr, next: 0 };
}
const crumbs = makePool(new THREE.IcosahedronGeometry(0.06, 0), new THREE.MeshStandardMaterial({ color: 0xd99a52, roughness: 0.9, flatShading: true }), 420);
const drops = makePool(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15 }), 360);
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
      if (bounceTop && p.vy < 0) { const c = SIM.cellAt(S.ck, p.x, p.z); if (SIM.solid(c)) { const h = topH(p.x, p.z) + 0.03; if (p.y < h) { p.y = h; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; } } }
      if (p.y < -0.05 && pool !== stars) { if (pool === crumbs && p.vy < -1 && Math.random() < 0.25) emit(drops, p.x, 0.02, p.z, (Math.random() - 0.5), 1.5 + Math.random(), (Math.random() - 0.5), 0.5, 0.5); p.life = 0; }
      const k = p.life > 0 ? Math.min(1, p.life / Math.min(0.25, p.max)) : 0;
      _s.setScalar(p.s * k + 1e-4); _q.setFromEuler(_e.set(p.rx, p.ry, 0)); _m.compose(_v.set(p.x, p.y, p.z), _q, _s);
    } else _m.makeScale(0, 0, 0);
    pool.im.setMatrixAt(i++, _m);
  }
  pool.im.instanceMatrix.needsUpdate = true;
}
// 牛奶圈
const ringGeo = new THREE.RingGeometry(0.8, 1, 48); ringGeo.rotateX(-Math.PI / 2);
const rings = [];
for (let i = 0; i < 24; i++) { const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); r.visible = false; scene.add(r); rings.push({ m: r, t: 0, max: 1, s: 1 }); }
let ringN = 0;
function ripple(x, z, size = 1, life = 0.9) { const r = rings[ringN++ % rings.length]; r.m.position.set(x, 0.06, z); r.t = 0; r.max = life; r.s = size; r.m.visible = true; }
function splash(x, z, big = 1) {
  for (let i = 0; i < 26 * big; i++) { const a = Math.random() * 6.283, sp = (1 + Math.random() * 2.5) * Math.sqrt(big); emit(drops, x + Math.cos(a) * 0.3, 0.05, z + Math.sin(a) * 0.3, Math.cos(a) * sp, 3 + Math.random() * 4 * big, Math.sin(a) * sp, 1.2, 0.6 + Math.random() * 0.9); }
  ripple(x, z, 1.2 * big, 1); ripple(x, z, 0.7 * big, 0.7);
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
let wantBite = false, wantDash = false;
const KB_BITE = ['KeyJ', 'KeyZ', 'KeyE'], KB_DASH = ['Space', 'KeyK', 'KeyX', 'ShiftLeft'];
addEventListener('keydown', e => {
  if (e.repeat && (KB_BITE.includes(e.code) || KB_DASH.includes(e.code))) { e.preventDefault(); return; }
  ensureAudio();
  if (PF.adBusy) { e.preventDefault(); return; }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (KB_BITE.includes(e.code)) wantBite = true;
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
btnDown($('tbBite'), () => wantBite = true);
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
  if (wantBite) me.inp.bite = true;
  if (wantDash) me.inp.dash = true;
  if (wantBite || wantDash) tut.act(wantBite ? 'bite' : 'dash');
  if (Math.hypot(x, z) > 0.2) tut.act('move');
  wantBite = wantDash = false;
}

// ---------- HUD ----------
let ME = 0;
const feed = $('feed');
function feedMsg(html) { const d = document.createElement('div'); d.innerHTML = html; feed.prepend(d); while (feed.children.length > 4) feed.lastChild.remove(); setTimeout(() => d.remove(), 4200); }
function nameOf(i) { const p = S.players[i]; return `<span style="color:${DOT_COL[p.look % 9]};text-shadow:0 1px 0 #4a2612">${esc(p.bot ? p.name : tl('you'))}</span>`; }
let bannerT = 0;
function banner(txt, big = false, dur = 1.6) { const b = $('banner'); b.textContent = txt; b.className = 'out pop' + (big ? ' big' : ''); void b.offsetWidth; bannerT = dur; b.hidden = false; }
let tipTxt = '';
function tip(txt) { const t = $('tip'); if (!txt) { t.hidden = true; tipTxt = ''; return; } if (txt !== tipTxt) { t.textContent = txt; tipTxt = txt; } t.hidden = false; }
const _p = new THREE.Vector3();
function toScreen(x, y, z) { _p.set(x, y, z).project(camera); return [(_p.x * 0.5 + 0.5) * innerWidth, (-_p.y * 0.5 + 0.5) * innerHeight, _p.z < 1]; }
function float(x, y, z, txt, col = '#fff') {
  const [sx, sy] = toScreen(x, y, z); const d = document.createElement('div'); d.className = 'out'; d.textContent = txt; d.style.left = sx + 'px'; d.style.top = sy + 'px'; d.style.color = col; $('floats').appendChild(d); setTimeout(() => d.remove(), 950);
}
function updateHUD() {
  const me = S.players[ME];
  $('aliveP').textContent = '🍪 ' + tl('alive', { n: S.alive });
  const t = Math.floor(S.playT || 0); $('timeP').textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  $('chipIco').textContent = me.chips;
  const nx = C.LVL_AT[me.lvl + 1];
  $('chipTxt').textContent = nx != null ? tl('next', { n: nx - me.chips }) : tl('maxSize');
  const pips = $('pips').children; for (let i = 0; i < 4; i++) pips[i].className = i <= me.lvl ? 'on' : '';
  // 冲撞冷却圈
  const cd = me.alive ? clamp(me.dashCd / C.DASH_CD, 0, 1) : (me.fish ? clamp(me.fish.cd / C.FISH_CD, 0, 1) : 0);
  $('dashRing').setAttribute('stroke-dashoffset', String(295 * cd));
  $('tbDash').classList.toggle('cd', cd > 0);
  $('tbBite').hidden = !me.alive;
  const lbl = me.alive ? 'dash' : 'jump'; const dl = $('dashLbl'); if (dl.dataset.t !== lbl) { dl.dataset.t = lbl; dl.textContent = tl(lbl); }
  $('chipBox').style.opacity = me.alive ? 1 : 0.4;
  const rv = $('revP'), left = Math.ceil(C.REVIVE_UNTIL - (S.playT || 0));
  if (S.phase === 'play' && left > 0) { rv.className = 'pill'; rv.textContent = '♻ ' + tl('reviveT', { t: left + 's' }); rv.hidden = false; }
  else if (S.phase === 'play') { rv.className = 'pill out final'; rv.textContent = '⚔ ' + tl('finalPill'); rv.hidden = false; }
  else rv.hidden = true;
  const fp = $('foodP');
  if (!me.alive && me.fish && me.fallT > 0.8 && S.phase === 'play') {
    if (SIM.canRevive(S)) { fp.hidden = false; fp.textContent = '🍪 ' + tl('food', { n: me.fish.food || 0, m: C.FOOD_NEED }); tip(tl('fishTip2')); }
    else { fp.hidden = true; tip(tl('fishTipLate')); }
  } else { fp.hidden = true; if (!me.alive || (tipTxt === tl('fishTip2') || tipTxt === tl('fishTipLate'))) { if (!tut.on) tip(''); } }
  if (S.phase === 'play' && S.playT > 1.2 && !$('intro').hidden) { $('intro').style.opacity = 0; if (S.playT > 1.7) $('intro').hidden = true; }
}

// ---------- 新手引导（第一局就是教程） ----------
const tut = {
  on: false, step: 0, t: 0, done: store.get('tut', false),
  start() { this.on = !this.done; this.step = 0; this.t = 0; },
  act(k) { if (!this.on) return; if ((this.step === 0 && k === 'move' && this.t > 0.6) || (this.step === 1 && k === 'bite') || (this.step === 2 && k === 'dash')) { this.step++; this.t = 0; } },
  update(dt) {
    if (!this.on || S.phase !== 'play') return;
    this.t += dt;
    const T = touchMode;
    const msgs = [T ? 'tuMoveT' : 'tuMove', T ? 'tuBiteT' : 'tuBite', T ? 'tuDashT' : 'tuDash', 'tuCrack', 'tuHeavy'];
    if (this.step >= 3 && this.t > 4) { this.step++; this.t = 0; }
    if (this.step >= msgs.length) { this.on = false; this.done = true; store.set('tut', true); tip(''); return; }
    if (S.players[ME].alive) tip(tl(msgs[this.step]));
  },
};

// ---------- 镜头 ----------
const camT = new THREE.Vector3(0, 0, 2), camPos = new THREE.Vector3(0, 30, 20);
let camShake = 0;
function camDist() { const a = innerWidth / innerHeight; return a < 0.8 ? 32 + (0.8 - a) * 20 : a < 1.25 ? 33 : 29.5; }
function updateCamera(dt) {
  const me = S.players[ME];
  const portrait = innerWidth / innerHeight < 0.8;
  let fx = 0, fz = 0, w = portrait ? 0.8 : 0.6;
  if (me.alive) { fx = me.x; fz = me.z; } else if (me.fish && me.fallT > 0.8) { fx = me.fish.x; fz = me.fish.z; w = 0.45; }
  if (S.phase === 'end') { const wn = S.players[S.winner]; fx = wn.alive ? wn.x : 0; fz = wn.alive ? wn.z : 0; w = 0.6; }
  const tx = fx * w, tz = fz * w + 1.2;
  camT.x = lerp(camT.x, tx, 1 - Math.exp(-3 * dt)); camT.z = lerp(camT.z, tz, 1 - Math.exp(-3 * dt));
  const d = camDist() * (S.phase === 'end' ? 0.72 : 1);
  const pitch = 0.9; // 约 52°
  const want = _v.set(camT.x, Math.sin(pitch) * d, camT.z + Math.cos(pitch) * d);
  camPos.lerp(want, 1 - Math.exp(-2.5 * dt));
  camera.position.copy(camPos);
  if (camShake > 0) { camShake -= dt; camera.position.x += (Math.random() - 0.5) * camShake * 0.6; camera.position.y += (Math.random() - 0.5) * camShake * 0.6; }
  camera.lookAt(camT.x, 0, camT.z);
  if (DEBUG && window.__camO) { const o = window.__camO; camera.position.set(...o.p); camera.lookAt(...o.l); }
  sun.position.set(camT.x + 9, 20, camT.z + 7); sun.target.position.set(camT.x, 0, camT.z);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 52 : camera.aspect < 1.25 ? 44 : 38; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- 对局 ----------
let matchN = 0, endShown = false, edgeWarned = false, finalWarned = false;
function newMatch() {
  matchN++;
  const tutorial = !tut.done;
  S = SIM.create({ tutorial, seed: (Math.random() * 1e9) | 0 });
  // 玩家：位置 0 号，外观随机；机器人名字随机
  const looks = [...Array(9).keys()].sort(() => Math.random() - 0.5);
  const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  ME = 0;
  S.players.forEach((p, i) => { p.look = looks[i]; p.name = names[i]; });
  const me = S.players[ME]; me.bot = false; me.look = store.get('look', 0) % 9;
  // 让我在镜头下方（靠近观众一侧）出生
  const others = S.players.filter(p => p !== me).map(p => p.look); const used = new Set([me.look]);
  S.players.forEach(p => { if (p !== me) { let l = p.look; while (used.has(l)) l = (l + 1) % 9; p.look = l; used.add(l); } });
  const a0 = Math.PI / 2; S.players.forEach((p, i) => { const a = a0 + i / 9 * Math.PI * 2, d = R * 0.6; p.x = Math.cos(a) * d; p.z = Math.sin(a) * d; p.face = Math.atan2(-p.x, -p.z); });
  clearCookie(); cellObjs = S.ck.cells.map(buildCell);
  $('tags').innerHTML = ''; buildActors();
  for (const pool of [crumbs, drops, stars, chipsFly]) for (const p of pool.arr) p.life = 0;
  endShown = false; edgeWarned = false; finalWarned = false; for (const [, m] of floatMeshes) scene.remove(m); floatMeshes.clear();
  $('intro').hidden = matchN > 2; $('intro').style.opacity = 1;
  $('introK1').textContent = ''; $('introK2').textContent = touchMode ? '' : tl('keysDash').split('  ')[0]; $('panel').hidden = true; feed.innerHTML = '';
  tut.start(); tip('');
  camT.set(me.x * 0.38, 0, me.z * 0.38 + 1.2);
  lastBeep = 4;
  PF.setPlaying(true);
}
let lastBeep = 4;
function handleEvents() {
  const me = S.players[ME];
  for (const e of S.events) {
    const near = (x, z) => Math.hypot(x - (me.alive ? me.x : me.fish ? me.fish.x : 0), z - (me.alive ? me.z : me.fish ? me.fish.z : 0)) < 7;
    switch (e.k) {
      case 'go': banner(tl('go'), true, 0.9); SFX.beep(true); break;
      case 'bite': {
        const p = S.players[e.p], a = actors[e.p];
        if (!e.pick) { a.biteAnim = 0.25; crumbBurst(e.x, topH(e.x, e.z) + 0.05, e.z, e.p === ME ? 10 : 5, 1.6); SFX.bite(e.p === ME || near(e.x, e.z)); }
        else { a.biteAnim = 0.18; if (e.p !== ME && near(e.x, e.z)) SFX.bite(false); }
        if (e.chip) {
          const fc = emit(chipsFly, e.x, topH(e.x, e.z) + 0.1, e.z, (p.x - e.x) * 2.5, 5, (p.z - e.z) * 2.5, 0.42, 1, 1.2);
          if (e.p === ME) { SFX.chip(); float(p.x, 1.4, p.z, '+1 🍫', '#ffe08a'); tut.act('bite'); }
        }
        break;
      }
      case 'grow': { const p = S.players[e.p]; actors[e.p].pop = 0.4; for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283; emit(stars, p.x, 0.9, p.z, Math.cos(a) * 3, 2, Math.sin(a) * 3, 0.6, 1, 0.3); } if (e.p === ME) { SFX.grow(); if (tut.on && tut.step < 4) { } } break; }
      case 'dash': { SFX.dash(e.p === ME); actors[e.p].dashFx = 0.25; break; }
      case 'bonk': {
        SFX.bonk(e.f); if (e.a === ME || e.b === ME) { camShake = 0.4; hitstop = 0.09; float(e.x, 1.3, e.z, tl('pow'), '#ffd23f'); }
        for (let i = 0; i < 10; i++) { const a = Math.random() * 6.283; emit(stars, e.x, 0.9, e.z, Math.cos(a) * 4, 1 + Math.random() * 3, Math.sin(a) * 4, 0.45, 1, 0.5); }
        actors[e.a].flash = actors[e.b].flash = 0.15;
        break;
      }
      case 'break': { const n = near(e.x, e.z); SFX.crack(n); crumbBurst(e.x, C.TOP, e.z, n ? 18 : 8, 1.4); break; }
      case 'sink': { splash(e.x, e.z, 0.8); if (near(e.x, e.z)) SFX.splash(0.6); break; }
      case 'fall': {
        const p = S.players[e.p]; actors[e.p].fallFrom = { x: p.x, z: p.z, y: topH(p.x, p.z) };
        SFX.fall(); setTimeout(() => { splash(p.x, p.z, 1.5); SFX.splash(1); }, 380);
        if (e.by >= 0) feedMsg(tl('pushed', { a: nameOf(e.p), b: nameOf(e.by) })); else feedMsg(tl('fell', { a: nameOf(e.p) }));
        if (e.p === ME) { camShake = 0.35; tut.on = false; banner(e.by >= 0 ? tl('dunked', { b: S.players[e.by].bot ? S.players[e.by].name : tl('you') }) : '🐟 ' + tl('splash'), false, 1.6); }
        else if (e.by === ME) { float(p.x, 1.2, p.z, '💥', '#fff'); }
        break;
      }
      case 'eat': { SFX.chip(); splash(e.x, e.z, 0.3); if (e.p === ME) float(e.x, 0.8, e.z, `🍪 ${e.n}/${C.FOOD_NEED}`, '#fff'); break; }
      case 'revive': {
        const p = S.players[e.p], a = actors[e.p]; a.pop = 0.4; a.scale = 0.2;
        splash(e.fx, e.fz, 1.2); for (let i = 0; i < 16; i++) { const an = i / 16 * 6.283; emit(stars, e.x, 1, e.z, Math.cos(an) * 3, 3, Math.sin(an) * 3, 0.7, 1.2, 0.4); }
        SFX.grow();
        if (e.p === ME) { banner(tl(e.why === 'swap' ? 'swapBack' : 'back'), false, 1.8); tip(''); camShake = 0.2; }
        feedMsg('⬆ ' + nameOf(e.p));
        break;
      }
      case 'fishjump': SFX.fish(); splash(e.x, e.z, 0.5); break;
      case 'fishhit': { SFX.bonk(6); feedMsg(tl('fishHit', { a: nameOf(e.q), b: nameOf(e.p) })); for (let i = 0; i < 8; i++) { const a = Math.random() * 6.283; emit(drops, e.x, 0.8, e.z, Math.cos(a) * 3, 2, Math.sin(a) * 3, 0.8, 0.8); } if (e.q === ME) camShake = 0.25; break; }
      case 'end': showEnd(); break;
    }
  }
  if (S.phase === 'count') { const n = Math.ceil(S.phaseT); if (n < lastBeep && n > 0) { lastBeep = n; banner(String(n), true, 0.8); SFX.beep(false); } }
  if (!edgeWarned && S.phase === 'play' && S.playT > C.ERODE_START) { edgeWarned = true; banner(tl('edge'), false, 2.2); }
  if (!finalWarned && S.phase === 'play' && S.playT > C.REVIVE_UNTIL) { finalWarned = true; banner(tl('final'), false, 2.4); SFX.beep(true); }
}

function showEnd() {
  PF.setPlaying(false);
  const me = S.players[ME], won = S.winner === ME;
  setTimeout(() => {
    if (won) { SFX.win(); PF.happy(); } else SFX.lose();
    banner(won ? tl('win') : tl('winner', { a: S.players[S.winner].bot ? S.players[S.winner].name : tl('you') }), true, 2.2);
  }, 200);
  const crumbsN = 10 + (10 - me.place) * 5 + me.chips * 2 + me.kills * 5;
  store.set('crumbs', store.get('crumbs', 0) + crumbsN);
  store.set('played', store.get('played', 0) + 1);
  if (won) store.set('wins', store.get('wins', 0) + 1);
  setTimeout(() => {
    endShown = true;
    $('resT').textContent = won ? tl('win') : tl('place', { n: me.place });
    $('reward').textContent = '🍪 ' + tl('crumbs', { n: crumbsN });
    const rows = S.players.slice().sort((a, b) => a.place - b.place).map(p => `<div class="${p.id === ME ? 'me' : ''}"><b>${p.place === 1 ? '👑' : '#' + p.place}</b><i class="dot" style="background:${DOT_COL[p.look % 9]}"></i>${esc(p.bot ? p.name : tl('you'))}<s>🍫${p.chips} · 💥${p.kills}</s></div>`);
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
ls.addEventListener('change', () => { LANG = ls.value; store.set('lang_set', 1); try { localStorage.setItem('lc_lang', LANG); } catch (e) { } applyLang(); if (S) buildTags(); });
function buildTags() { S.players.forEach((p, i) => actors[i].tag.textContent = p.bot ? p.name : tl('you')); }
$('optSound').checked = soundOn; $('optSound').addEventListener('change', e => { soundOn = e.target.checked; store.set('sound', soundOn); });
let paused = false;
function toggleMenu(force) { const show = force ?? $('menu').hidden; $('menu').hidden = !show; paused = show; ls.value = LANG; PF.setPlaying(!show && S && S.phase !== 'end'); }
$('gear').addEventListener('click', () => toggleMenu());
$('bResume').addEventListener('click', () => toggleMenu(false));
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (S && S.phase === 'play' && !paused) toggleMenu(true); if (AC) AC.suspend(); } else if (AC && !PF.muted) AC.resume(); });

// ---------- 每帧画角色 ----------
function updateActors(dt, now) {
  for (let i = 0; i < S.players.length; i++) {
    const p = S.players[i], a = actors[i], sn = a.sn;
    const target = C.SCALE[p.lvl];
    a.pop = Math.max(0, (a.pop || 0) - dt);
    a.scale = lerp(a.scale, target, 1 - Math.exp(-8 * dt));
    const popS = a.pop > 0 ? 1 + Math.sin((0.4 - a.pop) / 0.4 * Math.PI) * 0.25 : 1;
    if (p.alive) {
      a.root.visible = true; a.fish.g.visible = false;
      const sp = Math.hypot(p.mvx, p.mvz);
      a.hop += dt * (sp > 0.6 ? 15 : 0);
      const hopY = sp > 0.6 ? Math.abs(Math.sin(a.hop)) * 0.12 : 0;
      const sq = sp > 0.6 ? Math.cos(a.hop * 2) * 0.06 : Math.sin(now * 3 + i) * 0.02;
      let y = topH(clamp(p.x, -R, R), clamp(p.z, -R, R));
      const c = SIM.cellAt(S.ck, p.x, p.z); if (c && cellObjs[c.id]) y += cellObjs[c.id].grp.position.y;
      if (p.dashT > 0) y += Math.sin((1 - p.dashT / C.DASH_T) * Math.PI) * 0.35;
      a.root.position.set(p.x, y, p.z);
      a.root.rotation.y = p.face;
      const s = a.scale * popS * VIS;
      a.root.scale.set(s * (1 - sq * 0.5), s * (1 + sq), s * (1 - sq * 0.5));
      sn.body.position.y = hopY;
      a.biteAnim = Math.max(0, (a.biteAnim || 0) - dt);
      const bt = a.biteAnim > 0 ? Math.sin(a.biteAnim / 0.25 * Math.PI) : 0;
      sn.body.rotation.x = bt * 0.5 + (p.dashT > 0 ? 0.25 : 0) + (p.hitT > 0 ? -0.3 : 0);
      sn.face.mouth.visible = bt < 0.2; sn.face.mOpen.visible = bt >= 0.2;
      a.flash = Math.max(0, a.flash - dt);
      // 冲撞拖尾
      if (p.dashT > 0 && Math.random() < 0.7) emit(crumbs, p.x, y + 0.1, p.z, -Math.sin(p.face) * 1.5 + (Math.random() - 0.5), 1.5, -Math.cos(p.face) * 1.5 + (Math.random() - 0.5), 0.5, 0.8);
      // 走路掉渣
      if (sp > 2 && Math.random() < dt * 6 * C.WEIGHT[p.lvl]) emit(crumbs, p.x, y + 0.05, p.z, (Math.random() - 0.5), 1 + Math.random(), (Math.random() - 0.5), 0.6, 0.5);
      sn.blob.material.opacity = 0.22;
      a.root.visible = !(p.inv > 0 && Math.sin(now * 30) > 0.3);
    } else {
      // 掉下去：先往下翻滚，再变成小鱼
      const ft = p.fallT, ff = a.fallFrom || { x: p.x, z: p.z, y: C.TOP };
      if (ft < 0.8) {
        a.root.visible = true; a.fish.g.visible = false;
        a.root.position.set(ff.x + Math.sin(p.face) * ft * 0.8, ff.y - ft * ft * 4.5, ff.z + Math.cos(p.face) * ft * 0.8);
        a.root.rotation.x = ft * 3; sn.blob.material.opacity = 0;
      } else {
        a.root.visible = false;
        const f = p.fish; a.fish.g.visible = !!f;
        if (f) {
          let y = -0.05 + Math.sin(now * 4 + i) * 0.05, rx = 0;
          if (f.jumpT >= 0) { const t = Math.min(1, f.jumpT / C.FISH_JUMP_T); y = Math.sin(Math.min(1, f.jumpT / (C.FISH_JUMP_T + 0.35)) * Math.PI) * 1.8; rx = -0.8 + t * 1.6; }
          a.fish.g.position.set(f.x, y, f.z); a.fish.g.rotation.set(rx, f.face, 0);
          a.fish.tail.rotation.y = Math.sin(now * 12 + i) * 0.5;
          const fs = (0.9 + 0.1 * a.scale) * VIS; a.fish.g.scale.setScalar(fs);
          if (Math.random() < dt * 3) ripple(f.x, f.z, 0.35, 0.6);
        }
      }
    }
    // 名字
    const tag = a.tag;
    let tx, ty, tz;
    if (p.alive || p.fallT < 0.8) { tx = a.root.position.x; ty = a.root.position.y + 1.05 * a.scale * VIS; tz = a.root.position.z; }
    else if (p.fish) { tx = p.fish.x; ty = 0.7; tz = p.fish.z; }
    const [sx, sy, vis] = toScreen(tx, ty, tz);
    tag.style.display = vis && (i === ME || p.alive) ? '' : 'none';
    tag.style.left = sx + 'px'; tag.style.top = sy + 'px';
    tag.style.opacity = p.alive ? 1 : 0.6;
  }
}
function updateRings(dt) {
  for (const r of rings) { if (!r.m.visible) continue; r.t += dt; const k = r.t / r.max; if (k >= 1) { r.m.visible = false; continue; } r.m.scale.setScalar(r.s * (0.3 + k * 1.6)); r.m.material.opacity = (1 - k) * 0.7; }
}

// ---------- 主循环 ----------
let last = performance.now(), acc = 0, hitstop = 0;
const STEP = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  const tsec = now / 1000;
  if (hitstop > 0) { hitstop -= dt; dt *= 0.05; }
  if (!paused && !PF.adBusy) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 6) {
      acc -= STEP; n++;
      readInput(S.players[ME]);
      SIM.thinkBots(S, STEP);
      SIM.step(S, STEP);
      handleEvents();
    }
    tut.update(dt);
  } else dt = 0;
  milkU.uTime.value = tsec; milkNorm.offset.set(tsec * 0.004, tsec * 0.003);
  updateCookie(tsec);
  updateActors(dt, tsec);
  stepPool(crumbs, dt, true); stepPool(drops, dt, false); stepPool(stars, dt, false); stepPool(chipsFly, dt, false);
  updateRings(dt);
  if (S) { updateFloats(tsec); updateGuides(tsec); }
  updateCamera(Math.max(dt, 0.001));
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
  if (DEBUG) Object.assign(window, { __S: () => S, __SIM: SIM, __setLang: l => { LANG = l; applyLang(); }, __newMatch: newMatch, __cam: camera, __ME: () => ME, __tut: tut, __renderer: renderer, __fast: sec => { for (let i = 0; i < sec * 60; i++) { readInput(S.players[ME]); SIM.thinkBots(S, STEP); SIM.step(S, STEP); handleEvents(); } }, __auto: () => { S.players[ME].bot = true; } });
})();
// ===== CLIENT END =====
