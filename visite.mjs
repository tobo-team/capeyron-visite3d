import * as pc from "./playcanvas.mjs";

const canvas = document.getElementById("c");
const app = new pc.Application(canvas, {});
const gd = app.graphicsDevice;
const params = new URLSearchParams(location.search);
// Un écran Retina en pleine définition quadruple le coût de chaque image pour un gain invisible
// en mouvement : on plafonne à 1,25, et le régulateur plus bas descend encore si l'appareil peine.
const RATIOS = [1.25, 1, 0.85].filter((r) => r <= Math.max(1, window.devicePixelRatio || 1));
let palier = 0;
gd.maxPixelRatio = RATIOS[0];
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
// La scène est immobile : on ne dessine que lorsque le point de vue change.
app.autoRender = false;
let reveil = 0;
const dessiner = (images = 20) => { reveil = Math.max(reveil, images); };
window.addEventListener("resize", () => { app.resizeCanvas(); dessiner(); });

const charger = (url, type) => new Promise((ok, ko) => app.assets.loadFromUrl(url, type, (e, a) => (e ? ko(e) : ok(a))));

// ---------------------------------------------------------------- caméra
const DEG = 180 / Math.PI;
const camera = new pc.Entity("camera");
camera.addComponent("camera", { fov: 70, nearClip: 0.05, farClip: 200 });
app.root.addChild(camera);
const cadre = new pc.CameraFrame(app, camera.camera);
cadre.rendering.toneMapping = pc.TONEMAP_NEUTRAL;
cadre.rendering.samples = 4;
// Occlusion ambiante : 16 échantillons en définition Retina coûtaient 28 ms par image. 8 échantillons
// sur une image plafonnée à 1,25 en coûtent 4. La demi-définition (2 ms) bave autour des objets : écartée.
cadre.ssao.type = pc.SSAOTYPE_LIGHTING;
cadre.ssao.intensity = 0.3;
cadre.ssao.radius = 0.12;
cadre.ssao.samples = 8;
cadre.ssao.blurEnabled = true;
cadre.bloom.intensity = 0.015;
cadre.bloom.blurLevel = 10;
// étalonnage chaud, comme les visites de référence (lumière dorée de fin de journée)
cadre.grading.enabled = true;
cadre.grading.tint = new pc.Color(1.0, 0.95, 0.87);
cadre.grading.contrast = 1.1;
cadre.grading.saturation = 1.12;
cadre.grading.brightness = 1.02;
cadre.vignette.intensity = 0.25;
cadre.vignette.inner = 0.6;
cadre.vignette.outer = 1.4;
cadre.update();

// ---------------------------------------------------------------- soleil
const tactile = matchMedia("(pointer: coarse)").matches;
const soleil = new pc.Entity("soleil");
soleil.addComponent("light", {
  type: "directional", color: new pc.Color(1, 0.82, 0.6), intensity: 5.2,
  // PCSS ne projette aucune ombre ici (testé le 09/11) : PCF5, adouci, fonctionne.
  castShadows: true, shadowResolution: tactile ? 2048 : 4096, shadowDistance: 20, shadowType: pc.SHADOW_PCF5_32F,
  shadowBias: 0.05, normalOffsetBias: 0.04, numCascades: 1,
});
app.root.addChild(soleil);
// même direction que dans Blender : de l'est-sud-est vers l'ouest et le nord, en descendant
soleil.setPosition(0, 0, 0);
soleil.lookAt(-0.82, -0.42, -0.36);
soleil.rotateLocal(90, 0, 0);

// Rien ne bouge dans l'appartement : les ombres se calculent une seule fois, depuis une caméra
// lointaine et très serrée qui englobe tout le logement, puis restent figées. Recalculées à
// chaque image elles coûtaient 9 ms, et leur précision dépendait de l'endroit où l'on regardait.
const figerLesOmbres = () => {
  const c = camera.camera, l = soleil.light;
  const avant = { fov: c.fov, near: c.nearClip, mode: c.aspectRatioMode, aspect: c.aspectRatio, pos: camera.getPosition().clone(), rot: camera.getRotation().clone() };
  camera.setPosition(-60, 1.35, 3); camera.setEulerAngles(0, -90, 0);       // regarde vers l'est
  c.aspectRatioMode = pc.ASPECT_MANUAL; c.aspectRatio = 2.4; c.fov = 3.2; c.nearClip = 59;
  l.shadowDistance = 70; l.shadowUpdateMode = pc.SHADOWUPDATE_THISFRAME;
  app.render();
  c.fov = avant.fov; c.nearClip = avant.near; c.aspectRatioMode = avant.mode; c.aspectRatio = avant.aspect;
  camera.setPosition(avant.pos); camera.setRotation(avant.rot);
  dessiner();
};
gd.on("devicerestored", () => requestAnimationFrame(figerLesOmbres));

// ---------------------------------------------------------------- joueur
const etat = { x: 0.9, z: 3.6, yaw: 0, pitch: -0.05 };
const cible = { ...etat };
const vitesse = { x: 0, z: 0 };
const vers = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
const PIECES = [
  { nom: "Entrée", x: 0.8, z: 3.6, cx: 6.0, cz: 5.0 },
  { nom: "Salon", x: 3.4, z: 3.45, cx: 6.6, cz: 5.6 },
  { nom: "Cuisine", x: 4.2, z: 3.9, cx: 0.4, cz: 5.3 },
  { nom: "Chambre", x: 3.95, z: 2.5, cx: 5.7, cz: 0.7 },
  { nom: "Salle de bains", x: 2.05, z: 1.95, cx: 0.9, cz: 0.2 },
  { nom: "Balcon", x: 7.6, z: 4.75, cx: 7.8, cz: 0.6 },
];
const aller = (p) => {
  etat.x = cible.x = p.x; etat.z = cible.z = p.z; etat.yaw = cible.yaw = vers(p.x, p.z, p.cx, p.cz); etat.pitch = cible.pitch = -0.05;
  vitesse.x = vitesse.z = 0; dessiner();
};
aller(PIECES[0]);
const barre = document.getElementById("pieces");
for (const p of PIECES) {
  const b = document.createElement("button"); b.textContent = p.nom; b.onclick = () => aller(p); barre.appendChild(b);
}
window.__aller = (i) => aller(PIECES[i]);

// collisions : rectangles au sol exportés par Blender (murs, vitrages, meubles), plus l'emprise du logement
let obstacles = [];
const R = 0.24;
const libre = (x, z) => {
  if (x < 0.1 || x > 8.6 || z < 0.1 || z > 5.9) return false;
  for (const b of obstacles) {
    const cx = Math.max(b[0], Math.min(x, b[2])), cz = Math.max(b[1], Math.min(z, b[3]));
    if ((x - cx) ** 2 + (z - cz) ** 2 < R * R) return false;
  }
  return true;
};

// ---------------------------------------------------------------- entrées
const touches = new Set();
addEventListener("keydown", (e) => { touches.add(e.key.toLowerCase()); if (e.key.startsWith("Arrow")) e.preventDefault(); });
addEventListener("keyup", (e) => touches.delete(e.key.toLowerCase()));
addEventListener("blur", () => touches.clear());
const joy = { actif: false, id: -1, x0: 0, y0: 0, dx: 0, dy: 0 };
const regard = { actif: false, id: -1, x: 0, y: 0 };
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (e.pointerType === "touch" && e.clientX < innerWidth * 0.45 && !joy.actif) Object.assign(joy, { actif: true, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 });
  else if (!regard.actif) Object.assign(regard, { actif: true, id: e.pointerId, x: e.clientX, y: e.clientY });
});
canvas.addEventListener("pointermove", (e) => {
  if (joy.actif && e.pointerId === joy.id) { joy.dx = Math.max(-1, Math.min(1, (e.clientX - joy.x0) / 60)); joy.dy = Math.max(-1, Math.min(1, (e.clientY - joy.y0) / 60)); }
  else if (regard.actif && e.pointerId === regard.id) {
    const k = e.pointerType === "touch" ? 0.006 : 0.004;
    cible.yaw -= (e.clientX - regard.x) * k;
    cible.pitch = Math.max(-1.1, Math.min(1.1, cible.pitch - (e.clientY - regard.y) * k));
    regard.x = e.clientX; regard.y = e.clientY;
  }
});
const fin = (e) => { if (e.pointerId === joy.id) Object.assign(joy, { actif: false, dx: 0, dy: 0 }); if (e.pointerId === regard.id) regard.actif = false; };
canvas.addEventListener("pointerup", fin); canvas.addEventListener("pointercancel", fin);

// ---------------------------------------------------------------- régulateur de fluidité
// Si l'appareil ne tient pas 45 images par seconde en mouvement, on baisse la définition d'un
// cran, puis on coupe l'occlusion ambiante. On ne remonte jamais : pas de pompage.
const regul = { somme: 0, n: 0, fige: params.get("qualite") === "haute" };
const reguler = (delta) => {
  if (regul.fige || delta > 0.25) return;
  regul.somme += delta; regul.n++;
  if (regul.n < 45) return;
  const moyenne = regul.somme / regul.n; regul.somme = regul.n = 0;
  if (moyenne < 1 / 45) return;
  if (palier < RATIOS.length - 1) { gd.maxPixelRatio = RATIOS[++palier]; app.resizeCanvas(); }
  else if (cadre.ssao.type !== pc.SSAOTYPE_NONE) { cadre.ssao.type = pc.SSAOTYPE_NONE; cadre.update(); }
  else regul.fige = true;
};

app.on("update", (delta) => {
  const dt = Math.min(0.05, delta);
  let av = 0, la = 0, tourne = 0;
  if (touches.has("z") || touches.has("w") || touches.has("arrowup")) av += 1;
  if (touches.has("s") || touches.has("arrowdown")) av -= 1;
  if (touches.has("d")) la += 1;
  if (touches.has("q") || touches.has("a")) la -= 1;
  if (touches.has("arrowleft")) tourne += 1;
  if (touches.has("arrowright")) tourne -= 1;
  if (joy.actif) { av -= joy.dy; la += joy.dx; }
  cible.yaw += tourne * 1.8 * dt;
  // la vitesse rejoint sa consigne en douceur : départs et arrêts sans à-coup
  const allure = touches.has("shift") ? 3.0 : 1.7, n = Math.max(1, Math.hypot(av, la));
  const vx = ((-Math.sin(cible.yaw) * av + Math.cos(cible.yaw) * la) / n) * allure;
  const vz = ((-Math.cos(cible.yaw) * av - Math.sin(cible.yaw) * la) / n) * allure;
  const k = Math.min(1, dt * 12);
  vitesse.x += (vx - vitesse.x) * k; vitesse.z += (vz - vitesse.z) * k;
  const mx = vitesse.x * dt, mz = vitesse.z * dt;
  if (Math.abs(mx) > 1e-5) { if (libre(etat.x + mx, etat.z)) etat.x += mx; else vitesse.x = 0; }
  if (Math.abs(mz) > 1e-5) { if (libre(etat.x, etat.z + mz)) etat.z += mz; else vitesse.z = 0; }
  etat.yaw += (cible.yaw - etat.yaw) * Math.min(1, dt * 16);
  etat.pitch += (cible.pitch - etat.pitch) * Math.min(1, dt * 16);
  camera.setPosition(etat.x, 1.6, etat.z);
  camera.setEulerAngles(etat.pitch * DEG, etat.yaw * DEG, 0);
  const bouge = Math.abs(vitesse.x) + Math.abs(vitesse.z) > 0.002 || Math.abs(cible.yaw - etat.yaw) + Math.abs(cible.pitch - etat.pitch) > 0.0005;
  if (bouge) { dessiner(3); reguler(delta); } else { regul.somme = regul.n = 0; }
  if (reveil > 0) { reveil--; app.renderNextFrame = true; }
});

// ---------------------------------------------------------------- chargement
const [ciel, scene, obs] = await Promise.all([charger("ciel.hdr", "texture"), charger("capeyron.glb", "container"), fetch("obstacles.json").then((r) => r.json())]);
obstacles = obs;

const tex = ciel.resource;
tex.projection = pc.TEXTUREPROJECTION_EQUIRECT;
tex.addressU = pc.ADDRESS_REPEAT; tex.addressV = pc.ADDRESS_CLAMP_TO_EDGE;
app.scene.skybox = pc.EnvLighting.generateSkyboxCubemap(tex);
// Éclairage d'ambiance propre à l'intérieur : le ciel extérieur ne sert qu'à la vue par les
// fenêtres. Sinon le plafond prend la couleur de la pelouse et les murs celle de la haie.
const envInterieur = () => {
  const w = 128, h = 64, d = new Float32Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    const v = j / (h - 1);                               // 0 = zénith, 1 = nadir
    const haut = [0.62, 0.6, 0.56], horizon = [0.74, 0.7, 0.64], bas = [0.52, 0.43, 0.32];
    const c = v < 0.5 ? haut.map((x, k) => x + (horizon[k] - x) * (v / 0.5)) : horizon.map((x, k) => x + (bas[k] - x) * ((v - 0.5) / 0.5));
    for (let i = 0; i < w; i++) { const o = (j * w + i) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 1; }
  }
  const t = new pc.Texture(gd, { width: w, height: h, format: pc.PIXELFORMAT_RGBA32F, mipmaps: false, projection: pc.TEXTUREPROJECTION_EQUIRECT, levels: [d] });
  return t;
};
app.scene.envAtlas = pc.EnvLighting.generateAtlas(pc.EnvLighting.generateLightingSource(envInterieur()));
app.scene.skyboxMip = 0;
app.scene.exposure = 1.0;
app.scene.skyboxIntensity = 1.0;
app.scene.sky.type = pc.SKYTYPE_INFINITE;

// Blender livre un maillage par matière : le verre se reconnaît à sa matière, plus à son nom d'objet.
const racine = scene.resource.instantiateRenderEntity();
app.root.addChild(racine);
for (const r of racine.findComponents("render")) {
  r.receiveShadows = true;
  for (const mi of r.meshInstances) {
    const verre = mi.material.name === "Verre";
    mi.castShadow = !verre;
    if (verre) { mi.material.depthWrite = false; mi.material.opacity = 0.05; mi.material.update(); }
  }
}
window.__visite = { etat, cible, obstacles: () => obstacles.length, soleil, app, cadre, pc, camera, regul, ratio: () => gd.maxPixelRatio, libre };

app.start();
figerLesOmbres();
dessiner(30);
document.getElementById("charge").remove();
