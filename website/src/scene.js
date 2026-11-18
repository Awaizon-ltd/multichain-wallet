// Rizon 3D — one fixed WebGL canvas behind the page, with a "stage" per section:
//   hero      a branded coin, orbit rings with travelling nodes, floating real UI screens
//   networks  an orbit system: every supported chain circling a Rizon core
//   support   a faceted 3D Ethereum diamond and the 3D Solana bars, in their glass cards
//   features  16 interactive blocks: 7 formations, 4 transition styles, hover / push / burst
//   showcase  a voxel wave field (one InstancedMesh) that ripples under the cursor
//   download  a spiral galaxy
// Each stage is pinned to an anchor element every frame (so it scrolls with the
// page and fits any screen) and is skipped entirely while off screen.
import * as THREE from "three";

const BRAND = 0xd6fa1b;
const BG = 0x0a0a0a;
const CHAINS = [
  "/chains/ethereum.png",
  "/chains/base.png",
  "/chains/solana.png",
  "/chains/arc.webp",
  "/chains/robinhood.png",
  "/chains/polygon.png",
  "/chains/bnb.png",
  "/chains/arbitrum.png",
  "/chains/avalanche.png",
];

export function initScene(canvas, reducedMotion) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch {
    document.documentElement.classList.add("no-webgl");
    return;
  }
  const small = window.innerWidth < 960;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 1.75));
  renderer.setClearColor(BG, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 120);
  camera.position.set(0, 0, 16);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(4, 6, 8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.7);
  fill.position.set(-6, -4, 5);
  scene.add(fill);

  const glowTex = makeGlowTexture();
  const loader = new THREE.TextureLoader();
  const requestRender = () => !animating && render();
  const tex = (url) => {
    const t = loader.load(url, requestRender);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
  };
  const glowSprite = (size, opacity = 0.9, color = BRAND) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(size);
    return s;
  };

  /* --------------------------- pointer & input --------------------------- */

  // tx/ty: smoothed parallax (-1..1). ndc: raw pointer for raycasting.
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, ndc: new THREE.Vector2(9, 9), clientX: -1, clientY: -1, moved: false };
  window.addEventListener(
    "pointermove",
    (e) => {
      pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
      pointer.ndc.set(pointer.tx, -pointer.ty);
      pointer.clientX = e.clientX;
      pointer.clientY = e.clientY;
      pointer.moved = true;
    },
    { passive: true },
  );
  window.addEventListener("pointerleave", () => pointer.ndc.set(9, 9));
  const clickHandlers = [];
  window.addEventListener("pointerdown", (e) => {
    if (e.target.closest("a, button, summary, input")) return; // don't hijack real controls
    pointer.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    for (const h of clickHandlers) h(e);
  });
  const raycaster = new THREE.Raycaster();
  const inRect = (el, x, y) => {
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  /* ------------------------------ stage plumbing ------------------------------ */

  const stages = [];
  const worldPerPx = () => (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z) / window.innerHeight;
  const ndc = new THREE.Vector3();
  const dir = new THREE.Vector3();
  function anchorPoint(r, out) {
    ndc.set(((r.left + r.width / 2) / window.innerWidth) * 2 - 1, -((r.top + r.height / 2) / window.innerHeight) * 2 + 1, 0.5).unproject(camera);
    dir.copy(ndc).sub(camera.position).normalize();
    return out.copy(camera.position).addScaledVector(dir, -camera.position.z / dir.z);
  }
  /** size = the stage's natural [width, height] in world units; it's scaled to fit the anchor. */
  function addStage(selector, size, build, { cover = false, margin = 1 } = {}) {
    const el = document.querySelector(selector);
    if (!el) return;
    const root = new THREE.Group();
    const inner = new THREE.Group();
    root.add(inner);
    scene.add(root);
    const st = { el, root, inner, size, cover, margin, visible: false };
    st.update = build(inner, st);
    stages.push(st);
  }
  /** Hover flag for a DOM element (used by the ETH/SOL cards). */
  function hoverFlag(selector) {
    const flag = { on: false };
    const el = document.querySelector(selector);
    el?.addEventListener("pointerenter", () => (flag.on = true));
    el?.addEventListener("pointerleave", () => (flag.on = false));
    return flag;
  }

  /* ---------------------------------- hero ---------------------------------- */

  addStage(".hero-visual", [7.4, 6.6], (g) => {
    const faceMat = new THREE.MeshPhysicalMaterial({ map: tex("/icon.png"), roughness: 0.35, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.15 });
    const edgeMat = new THREE.MeshPhysicalMaterial({ color: 0x1b1f05, metalness: 1, roughness: 0.28, clearcoat: 1, emissive: BRAND, emissiveIntensity: 0.06 });
    const coin = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.2, 96, 1, true), edgeMat);
    rim.rotation.x = Math.PI / 2;
    const faceGeo = new THREE.CircleGeometry(1.25, 96);
    const front = new THREE.Mesh(faceGeo, faceMat);
    front.position.z = 0.1;
    const back = new THREE.Mesh(faceGeo, faceMat);
    back.position.z = -0.1;
    back.rotation.y = Math.PI;
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(1.27, 0.035, 16, 128), new THREE.MeshStandardMaterial({ color: BRAND, emissive: BRAND, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.3 }));
    coin.add(rim, front, back, bezel);
    g.add(coin);
    const rimLight = new THREE.PointLight(BRAND, 40, 18, 1.6);
    rimLight.position.set(-3, 2, -3);
    g.add(rimLight);
    const rings = [
      { r: 2.3, rx: 1.25, ry: 0.2, speed: 0.35, count: 3, color: 0x3c3c3c },
      { r: 3.0, rx: 1.05, ry: -0.45, speed: -0.22, count: 4, color: 0x2f2f2f },
      { r: 3.7, rx: 1.42, ry: 0.55, speed: 0.15, count: 2, color: 0x262626 },
    ].map((d) => {
      const ring = new THREE.Group();
      ring.rotation.set(d.rx, d.ry, 0);
      ring.add(new THREE.Mesh(new THREE.TorusGeometry(d.r, 0.008, 8, 256), new THREE.MeshBasicMaterial({ color: d.color })));
      const nodes = Array.from({ length: d.count }, (_, i) => {
        const n = new THREE.Group();
        n.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), new THREE.MeshBasicMaterial({ color: BRAND })), glowSprite(0.55));
        n.userData.phase = (i / d.count) * Math.PI * 2;
        ring.add(n);
        return n;
      });
      g.add(ring);
      return { ...d, nodes };
    });
    const panels = [
      { src: "/screens/swap.png", pos: [-2.55, 0.45, -2.4], rotY: 0.38, phase: 0 },
      { src: "/screens/scam-warning.png", pos: [2.75, -0.3, -1.6], rotY: -0.38, phase: 1.7 },
    ].map((d) => {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.98, 3.3), mat);
      mesh.position.set(...d.pos);
      mesh.rotation.y = d.rotY;
      roundedScreenTexture(d.src, maxAniso).then((t) => {
        mat.map = t;
        mat.opacity = 0.96;
        mat.needsUpdate = true;
        requestRender();
      });
      g.add(mesh);
      return { mesh, ...d };
    });
    return (t, p) => {
      g.rotation.y = pointer.x * 0.28 + p * 0.5;
      g.rotation.x = pointer.y * 0.16 + p * 0.15;
      coin.rotation.y = Math.sin(t * 0.55) * 0.5 + p * Math.PI;
      coin.position.y = Math.sin(t * 1.1) * 0.08;
      for (const ring of rings) {
        for (const n of ring.nodes) {
          const a = n.userData.phase + t * ring.speed;
          n.position.set(Math.cos(a) * ring.r, Math.sin(a) * ring.r, 0);
        }
      }
      for (const pnl of panels) {
        pnl.mesh.position.set(pnl.pos[0] * (1 + p * 0.35), pnl.pos[1] + Math.sin(t * 0.8 + pnl.phase) * 0.12, pnl.pos[2]);
        pnl.mesh.rotation.y = pnl.rotY + Math.sin(t * 0.5 + pnl.phase) * 0.03;
      }
      rimLight.intensity = 36 + Math.sin(t * 1.3) * 6;
    };
  });

  /* ------------------------- networks: orbit system ------------------------- */

  addStage(".orbit-visual", [10.4, 6.4], (g) => {
    const system = new THREE.Group();
    system.rotation.x = 1.12;
    g.add(system);
    const core = new THREE.Group();
    const coreSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: circularTexture("/icon.png", maxAniso, requestRender, true), transparent: true }));
    coreSprite.scale.setScalar(1.35);
    core.add(glowSprite(3.0, 0.22), glowSprite(1.7, 0.45), coreSprite);
    g.add(core);
    const orbits = [
      { r: 2.0, speed: 0.32, chains: [0, 1, 2] },
      { r: 3.25, speed: -0.2, chains: [3, 4, 5] },
      { r: 4.5, speed: 0.13, chains: [6, 7, 8] },
    ];
    const planets = [];
    for (const [oi, o] of orbits.entries()) {
      const pts = Array.from({ length: 257 }, (_, i) => {
        const a = (i / 256) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * o.r, Math.sin(a) * o.r, 0);
      });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.9, depthWrite: false }));
      line.renderOrder = -1;
      system.add(line);
      const comet = glowSprite(0.5, 0.7);
      system.add(comet);
      planets.push({ sprite: comet, r: o.r, speed: o.speed * 2.2, phase: oi * 2.1, size: 0 });
      o.chains.forEach((ci, k) => {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: circularTexture(CHAINS[ci], maxAniso, requestRender), transparent: true }));
        const size = 0.78 - oi * 0.04;
        sprite.scale.setScalar(size);
        system.add(sprite);
        planets.push({ sprite, r: o.r, speed: o.speed, phase: (k / o.chains.length) * Math.PI * 2 + oi * 0.7, size });
      });
    }
    return (t, p) => {
      g.rotation.y = pointer.x * 0.18;
      system.rotation.x = 1.12 + pointer.y * 0.08;
      system.rotation.z = t * 0.03 + p * 0.4;
      for (const pl of planets) {
        const a = pl.phase + t * pl.speed;
        pl.sprite.position.set(Math.cos(a) * pl.r, Math.sin(a) * pl.r, 0);
        if (pl.size) pl.sprite.scale.setScalar(pl.size * (1 + Math.sin(a + system.rotation.z) * 0.18));
      }
    };
  });

  /* ------------------ support: Ethereum ⟷ Solana binary orbit ------------------ */

  addStage(".binary-visual", [7.4, 5.4], (g) => {
    const hover = hoverFlag(".binary-visual");
    const plane = new THREE.Group(); // the shared orbital plane, tilted so they pass in front of each other
    plane.rotation.x = 0.42;
    g.add(plane);

    // Ethereum diamond
    const eth = new THREE.Group();
    const ethMesh = new THREE.Mesh(
      makeEthGeometry(),
      new THREE.MeshPhysicalMaterial({ vertexColors: true, flatShading: true, metalness: 0.3, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide }),
    );
    ethMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(ethMesh.geometry, 1), new THREE.LineBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.35 })));
    ethMesh.scale.setScalar(0.85);
    eth.add(glowSprite(3.2, 0.3, 0x4f7bff), ethMesh);

    // Solana bars
    const sol = new THREE.Group();
    const solMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1 });
    const bars = makeSolanaBars().map((b) => {
      const m = new THREE.Mesh(b.geo, solMat);
      m.position.y = b.y; // stack the three bars
      return m;
    });
    const solBody = new THREE.Group();
    solBody.add(...bars);
    solBody.scale.setScalar(0.74);
    sol.add(glowSprite(3.0, 0.24, 0x9945ff), glowSprite(1.9, 0.2, 0x14f195), solBody);

    plane.add(eth, sol);
    // Each body counter-rotates its own tilt so it stays upright while the plane is tilted.
    eth.rotation.x = -0.42;
    sol.rotation.x = -0.42;

    // Faint orbit ellipse + barycentre glow.
    const R = 1.85;
    const ringPts = Array.from({ length: 181 }, (_, i) => {
      const a = (i / 180) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R);
    });
    const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.renderOrder = -1;
    // The ring line is built but not shown (the orbit reads from the motion and trails).
    void ring;
    plane.add(glowSprite(1.6, 0.35));

    // Light trails: a short fading chain of glow sprites behind each body.
    const TRAIL = 14;
    const makeTrail = (color) =>
      Array.from({ length: TRAIL }, (_, i) => {
        const s = glowSprite(0.5 * (1 - i / TRAIL) + 0.08, 0.5 * (1 - i / TRAIL), color);
        plane.add(s);
        return s;
      });
    const ethTrail = makeTrail(0x4f9dff);
    const solTrail = makeTrail(0x5cf2b3);

    const lightA = new THREE.PointLight(0x29b6f6, 16, 10, 1.6);
    const lightB = new THREE.PointLight(0x14f195, 14, 10, 1.6);
    eth.add(lightA);
    sol.add(lightB);

    let phase = 0;
    let tight = 0;
    return (t, p, dt) => {
      tight += ((hover.on ? 1 : 0) - tight) * 0.06;
      phase += dt * (0.55 + tight * 0.9);
      const r = R * (1 - tight * 0.16);
      const a = phase;
      eth.position.set(Math.cos(a) * r, Math.sin(t * 1.3) * 0.08, Math.sin(a) * r);
      sol.position.set(Math.cos(a + Math.PI) * r, Math.cos(t * 1.2) * 0.08, Math.sin(a + Math.PI) * r);
      ethMesh.rotation.y += dt * (0.9 + tight * 1.5);
      // The bars are flat, so keep them facing the viewer (a gentle sway, never edge-on).
      solBody.rotation.y = Math.sin(t * 0.8) * 0.4;
      solBody.rotation.z = Math.sin(t * 0.6) * 0.06;
      bars.forEach((m, i) => (m.position.x = Math.sin(t * 1.4 + i * 1.3) * 0.08));
      for (let i = 0; i < TRAIL; i++) {
        const ta = a - (i + 1) * 0.07;
        ethTrail[i].position.set(Math.cos(ta) * r, 0, Math.sin(ta) * r);
        solTrail[i].position.set(Math.cos(ta + Math.PI) * r, 0, Math.sin(ta + Math.PI) * r);
      }
      plane.rotation.x = 0.42 + pointer.y * 0.18;
      plane.rotation.z = pointer.x * -0.12 + Math.sin(t * 0.3) * 0.05;
      g.rotation.y = p * 0.4;
    };
  });

  /* --------------------------- features: blocks --------------------------- */

  addStage(".blocks-visual", [7.2, 5.6], (g, st) => {
    const N = 16;
    const S = 0.9;
    const boxGeo = new THREE.BoxGeometry(S, S, S);
    const edgeGeo = new THREE.EdgesGeometry(boxGeo);
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0x2b2b2b, metalness: 0.05, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3, emissive: BRAND, emissiveIntensity: 0.025 });
    const hotMat = new THREE.MeshPhysicalMaterial({ color: 0x3a4700, metalness: 0.1, roughness: 0.3, clearcoat: 1, emissive: BRAND, emissiveIntensity: 0.9 });
    const accentMat = new THREE.MeshPhysicalMaterial({ color: 0x2a3300, emissive: BRAND, emissiveIntensity: 0.55, metalness: 0.3, roughness: 0.3, clearcoat: 1 });
    const edgeMat = new THREE.LineBasicMaterial({ color: BRAND, transparent: true, opacity: 0.9 });
    const blocks = Array.from({ length: N }, (_, i) => {
      const b = new THREE.Group();
      const body = new THREE.Mesh(boxGeo, i === N - 1 ? accentMat : bodyMat);
      body.userData.index = i;
      b.add(body, new THREE.LineSegments(edgeGeo, edgeMat));
      g.add(b);
      return {
        b,
        body,
        base: i === N - 1 ? accentMat : bodyMat,
        from: new THREE.Vector3(),
        to: new THREE.Vector3(),
        rFrom: new THREE.Euler(),
        rTo: new THREE.Euler(),
        off: new THREE.Vector3(), // spring offset (hover / push / burst)
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        spinVel: new THREE.Vector3(),
        heat: 0,
      };
    });
    const bodies = blocks.map((bk) => bk.body);
    const light = new THREE.PointLight(BRAND, 24, 12, 1.6);
    light.position.set(0, 1.5, 3.5);
    g.add(light);

    // Links between consecutive blocks.
    const linkPos = new Float32Array((N - 1) * 6);
    const linkGeo = new THREE.BufferGeometry();
    linkGeo.setAttribute("position", new THREE.BufferAttribute(linkPos, 3));
    const linkMat = new THREE.LineBasicMaterial({ color: BRAND, transparent: true, opacity: 0 });
    g.add(new THREE.LineSegments(linkGeo, linkMat));

    const Q = Math.PI / 2;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const E = (x, y, z) => new THREE.Euler(x, y, z);
    // Each formation: (i, t) => [position, rotation]. "live" ones keep moving while held.
    const formations = [
      { name: "chain", links: 1, f: (i) => [V((i - 7.5) * 0.82, Math.sin(i * 0.6) * 0.6, Math.cos(i * 0.6) * 0.8), E(0.25, i * 0.18, 0)] },
      { name: "grid", links: 0.3, f: (i) => [V(((i % 4) - 1.5) * 1.12, (Math.floor(i / 4) - 1.5) * 1.12, 0), E(0, 0, 0)] },
      { name: "block", links: 0, f: (i) => [V(((i % 4) - 1.5) * S, ((Math.floor(i / 4) % 2) - 0.5) * S, (Math.floor(i / 8) - 0.5) * S), E(Q, Q, 0)] },
      {
        name: "ring",
        links: 0.7,
        f: (i) => {
          const a = (i / N) * Math.PI * 2;
          return [V(Math.cos(a) * 2.7, Math.sin(a) * 1.5, Math.sin(a) * 0.7), E(0, -a, Q)];
        },
      },
      {
        name: "helix",
        links: 0.5,
        live: true,
        f: (i, t) => {
          const k = i % 8;
          const a = k * 0.8 + t * 0.8 + (i < 8 ? 0 : Math.PI);
          return [V((k - 3.5) * 0.95, Math.cos(a) * 1.15, Math.sin(a) * 1.15), E(a, 0, 0)];
        },
      },
      { name: "tower", links: 0, f: (i) => [V(((i % 2) - 0.5) * 0.98, ((i >> 2) - 1.5) * 0.98, (((i >> 1) % 2) - 0.5) * 0.98), E(0, Q / 2, 0)] },
      {
        name: "wave",
        links: 0,
        live: true,
        f: (i, t) => {
          const c = i % 4;
          const r = Math.floor(i / 4);
          return [V((c - 1.5) * 1.15, Math.sin(t * 2.2 + c * 0.9 + r * 0.7) * 0.45, (r - 1.5) * 1.15), E(0.55, 0.35, 0)];
        },
      },
    ];
    // Transition styles, cycled per formation change.
    const easeIO = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const easeBack = (x) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);
    const STYLES = [
      { name: "cascade", ease: easeIO, delay: (i) => i * 0.045, arc: 0, flip: 0 },
      { name: "spring", ease: easeBack, delay: (i) => (i % 4) * 0.06, arc: 0, flip: 0 },
      { name: "flip", ease: easeIO, delay: (i) => Math.abs(i - N / 2) * 0.03, arc: 0, flip: Math.PI * 2 },
      { name: "jump", ease: easeIO, delay: (i) => (i % 2) * 0.12 + i * 0.02, arc: 1.8, flip: 0 },
    ];
    let current = 0;
    let style = STYLES[0];
    let started = 0;
    const HOLD = 3.2;
    const MOVE = 1.4;
    let tNow = 0;
    function setFormation(fi) {
      current = fi;
      style = STYLES[(fi + STYLES.length - 1) % STYLES.length];
      started = tNow;
      for (const [i, bk] of blocks.entries()) {
        bk.from.copy(bk.b.position).sub(bk.off);
        bk.rFrom.set(bk.b.rotation.x - bk.spin.x, bk.b.rotation.y - bk.spin.y, bk.b.rotation.z - bk.spin.z);
        const [pos, rot] = formations[fi].f(i, tNow);
        bk.to.copy(pos);
        bk.rTo.copy(rot);
      }
    }
    for (const [i, bk] of blocks.entries()) {
      const [pos, rot] = formations[0].f(i, 0);
      bk.b.position.copy(pos);
      bk.b.rotation.copy(rot);
      bk.from.copy(pos);
      bk.to.copy(pos);
      bk.rFrom.copy(rot);
      bk.rTo.copy(rot);
    }

    // Burst: click inside the blocks area scatters them, then the next formation forms.
    const tmpV = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    function pointerLocal(out) {
      raycaster.setFromCamera(pointer.ndc, camera);
      plane.normal.set(0, 0, 1);
      plane.constant = -st.root.position.z;
      if (!raycaster.ray.intersectPlane(plane, hit)) return null;
      return g.worldToLocal(out.copy(hit));
    }
    clickHandlers.push((e) => {
      if (!st.visible || reducedMotion || !inRect(st.el, e.clientX, e.clientY)) return;
      const origin = pointerLocal(new THREE.Vector3()) ?? new THREE.Vector3();
      for (const bk of blocks) {
        tmpV.copy(bk.b.position).sub(origin);
        const d = Math.max(0.6, tmpV.length());
        tmpV.normalize().addScaledVector(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random()), 0.6);
        bk.vel.addScaledVector(tmpV, 1.1 / d);
        bk.spinVel.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6);
        bk.heat = 1;
      }
      setTimeout(() => setFormation((current + 1) % formations.length), 420);
    });

    let hovered = -1;
    const local = new THREE.Vector3();
    const target = new THREE.Vector3();
    return (t, p, dt) => {
      tNow = t;
      if (!reducedMotion && t - started > HOLD + MOVE) setFormation((current + 1) % formations.length);
      const fm = formations[current];

      // Hover (raycast only when the pointer moved and this stage is on screen).
      const overStage = pointer.clientX >= 0 && inRect(st.el, pointer.clientX, pointer.clientY);
      if (pointer.moved) {
        hovered = -1;
        if (overStage) {
          raycaster.setFromCamera(pointer.ndc, camera);
          const h = raycaster.intersectObjects(bodies, false)[0];
          if (h) hovered = h.object.userData.index;
        }
      }
      const pl = overStage ? pointerLocal(local) : null;

      const e = t - started;
      for (const [i, bk] of blocks.entries()) {
        const k = THREE.MathUtils.clamp((e - style.delay(i)) / MOVE, 0, 1);
        const kk = style.ease(k);
        // Live formations track their moving targets.
        if (fm.live) {
          const [pos, rot] = fm.f(i, t);
          bk.to.copy(pos);
          bk.rTo.copy(rot);
        }
        const base = tmpV.lerpVectors(bk.from, bk.to, kk);
        base.y += Math.sin(Math.PI * k) * style.arc;
        base.y += Math.sin(t * 1.2 + i) * 0.03;

        // Spring target: hover lifts toward the viewer; the pointer pushes blocks aside.
        target.set(0, 0, 0);
        if (i === hovered) target.z += 0.9;
        if (pl) {
          const dx = base.x - pl.x;
          const dy = base.y - pl.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 3.2) {
            const f = (1 - d2 / 3.2) * 0.55;
            const d = Math.sqrt(d2) || 1;
            target.x += (dx / d) * f;
            target.y += (dy / d) * f;
            target.z += f * 0.6;
          }
        }
        bk.vel.addScaledVector(target.sub(bk.off), 0.09);
        bk.vel.multiplyScalar(0.82);
        bk.off.add(bk.vel);
        bk.spin.add(bk.spinVel);
        bk.spinVel.multiplyScalar(0.94);
        bk.spin.multiplyScalar(0.97);

        bk.b.position.copy(base).add(bk.off);
        // "flip" adds one full turn across the move (ends visually where it started).
        bk.b.rotation.set(
          THREE.MathUtils.lerp(bk.rFrom.x, bk.rTo.x, kk) + bk.spin.x + style.flip * kk,
          THREE.MathUtils.lerp(bk.rFrom.y, bk.rTo.y, kk) + bk.spin.y,
          THREE.MathUtils.lerp(bk.rFrom.z, bk.rTo.z, kk) + bk.spin.z,
        );
        // Hover / burst glow.
        bk.heat = Math.max(bk.heat * 0.95, i === hovered ? 1 : 0);
        bk.body.material = bk.heat > 0.35 ? hotMat : bk.base;
        bk.b.scale.setScalar(1 + bk.heat * 0.16);
      }
      linkMat.opacity += (fm.links - linkMat.opacity) * 0.06;
      for (let i = 0; i < N - 1; i++) {
        const a = blocks[i].b.position;
        const b = blocks[i + 1].b.position;
        linkPos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
      }
      linkGeo.attributes.position.needsUpdate = true;
      accentMat.emissiveIntensity = 0.45 + Math.sin(t * 3) * 0.2;
      g.rotation.y = pointer.x * 0.3 + Math.sin(t * 0.25) * 0.22 + p * 0.3;
      g.rotation.x = 0.12 + pointer.y * 0.12;
    };
  });

  /* --------------------- showcase: voxel wave field --------------------- */

  addStage(
    ".showcase",
    [20, 11],
    (g, st) => {
      const COLS = small ? 16 : 28;
      const ROWS = small ? 10 : 16;
      const GAP = 0.8;
      const count = COLS * ROWS;
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.62, 0.62, 0.62),
        new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.15, roughness: 0.55 }),
        count,
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const field = new THREE.Group();
      field.rotation.x = 0.82; // a tilted floor seen from above
      field.position.y = -1.2;
      field.add(mesh);
      g.add(field);
      const cells = [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells.push([(c - (COLS - 1) / 2) * GAP, (r - (ROWS - 1) / 2) * GAP]);
      const dark = new THREE.Color(0x151515);
      const mid = new THREE.Color(0x3c4a08);
      const lime = new THREE.Color(BRAND);
      const col = new THREE.Color();
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const sc = new THREE.Vector3(1, 1, 1);
      const pos = new THREE.Vector3();
      for (let i = 0; i < count; i++) mesh.setColorAt(i, dark);

      // Pointer → field-local coordinates (ray vs the tilted plane).
      const plane = new THREE.Plane();
      const hit = new THREE.Vector3();
      const nrm = new THREE.Vector3();
      const wq = new THREE.Quaternion();
      const wp = new THREE.Vector3();
      function pointerOnField(ndcV, out) {
        field.getWorldQuaternion(wq);
        field.getWorldPosition(wp);
        nrm.set(0, 1, 0).applyQuaternion(wq);
        plane.setFromNormalAndCoplanarPoint(nrm, wp);
        raycaster.setFromCamera(ndcV, camera);
        if (!raycaster.ray.intersectPlane(plane, hit)) return null;
        return field.worldToLocal(out.copy(hit));
      }
      const ripples = [];
      let tNow = 0;
      clickHandlers.push((e) => {
        if (!st.visible || reducedMotion || !inRect(st.el, e.clientX, e.clientY)) return;
        const p = pointerOnField(pointer.ndc, new THREE.Vector3());
        if (p) ripples.push({ x: p.x, z: p.z, t0: tNow });
        if (ripples.length > 5) ripples.shift();
      });
      const pl = new THREE.Vector3();
      let bump = 0;
      return (t) => {
        tNow = t;
        const over = pointer.clientX >= 0 && inRect(st.el, pointer.clientX, pointer.clientY);
        const p = over ? pointerOnField(pointer.ndc, pl) : null;
        bump += ((p ? 1 : 0) - bump) * 0.08;
        for (let i = 0; i < count; i++) {
          const [x, z] = cells[i];
          let h = Math.sin(x * 0.45 + t * 1.1) * Math.cos(z * 0.5 + t * 0.8) * 0.32;
          if (p) {
            const d2 = (x - pl.x) ** 2 + (z - pl.z) ** 2;
            h += Math.exp(-d2 / 2.4) * 1.5 * bump;
          }
          for (const rp of ripples) {
            const age = t - rp.t0;
            const d = Math.hypot(x - rp.x, z - rp.z);
            h += Math.sin(d * 1.6 - age * 6) * Math.exp(-age * 0.9) * Math.exp(-Math.abs(d - age * 3.8) * 0.6) * 0.9;
          }
          pos.set(x, h, z);
          sc.set(1, 1 + Math.max(0, h) * 1.4, 1);
          m4.compose(pos, q, sc);
          mesh.setMatrixAt(i, m4);
          const k = THREE.MathUtils.clamp((h + 0.25) / 1.3, 0, 1);
          col.copy(dark).lerp(mid, Math.min(1, k * 1.6)).lerp(lime, Math.max(0, k * 1.4 - 0.5));
          mesh.setColorAt(i, col);
        }
        while (ripples.length && t - ripples[0].t0 > 5) ripples.shift();
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        g.rotation.y = pointer.x * 0.06;
      };
    },
    { cover: true, margin: 1.05 },
  );

  /* --------------------------- download: galaxy --------------------------- */

  addStage(
    ".cta",
    [15, 9],
    (g) => {
      const COUNT = small ? 7000 : 16000;
      const R = 7.2;
      const BRANCHES = 5;
      const SPIN = 1.05;
      const pos = new Float32Array(COUNT * 3);
      const col = new Float32Array(COUNT * 3);
      const inner = new THREE.Color(0xf2ff9a);
      const mid = new THREE.Color(BRAND);
      const outer = new THREE.Color(0x5b7a12);
      const c = new THREE.Color();
      for (let i = 0; i < COUNT; i++) {
        const r = Math.pow(Math.random(), 1.6) * R;
        const branch = ((i % BRANCHES) / BRANCHES) * Math.PI * 2;
        const spin = r * SPIN;
        const rnd = () => Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * 0.55 * (0.4 + r * 0.25);
        pos[i * 3] = Math.cos(branch + spin) * r + rnd();
        pos[i * 3 + 1] = rnd() * 0.45;
        pos[i * 3 + 2] = Math.sin(branch + spin) * r + rnd();
        const k = r / R;
        c.copy(inner).lerp(mid, Math.min(1, k * 2.2)).lerp(outer, Math.max(0, k * 1.3 - 0.3));
        col.set([c.r, c.g, c.b], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const galaxy = new THREE.Points(
        geo,
        new THREE.PointsMaterial({ size: 0.1, map: glowTex, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }),
      );
      const disc = new THREE.Group();
      disc.rotation.x = 1.05;
      disc.rotation.z = 0.3;
      disc.add(galaxy, glowSprite(3.2, 0.3, 0xf2ff9a));
      g.add(disc);
      return (t, p) => {
        galaxy.rotation.y = t * 0.045 + p * 0.6;
        disc.rotation.x = 1.05 + pointer.y * 0.06;
        g.rotation.y = pointer.x * 0.12;
      };
    },
    { cover: true, margin: 1.15 },
  );

  /* ------------------------- ambient star field ------------------------- */

  const starCount = small ? 450 : 1100;
  const sp = new Float32Array(starCount * 3);
  const scl = new Float32Array(starCount * 3);
  const limeC = new THREE.Color(BRAND);
  const grey = new THREE.Color(0x8a8a8a);
  for (let i = 0; i < starCount; i++) {
    sp.set([(Math.random() - 0.5) * 40, (Math.random() - 0.5) * 26, -12 + Math.random() * 16], i * 3);
    const cc = Math.random() < 0.14 ? limeC : grey;
    scl.set([cc.r, cc.g, cc.b], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(scl, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ size: 0.055, map: glowTex, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  scene.add(stars);

  /* -------------------------------- loop -------------------------------- */

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    requestRender();
  }
  window.addEventListener("resize", resize);

  const clock = new THREE.Clock();
  let animating = !reducedMotion;
  let raf = 0;
  let last = 0;
  const tmp = new THREE.Vector3();

  function render() {
    const t = animating ? clock.getElapsedTime() : 0;
    const dt = Math.min(0.05, t - last);
    last = t;
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    const wpp = worldPerPx();
    const vh = window.innerHeight;
    for (const st of stages) {
      const r = st.el.getBoundingClientRect();
      st.section ??= st.el.closest("section");
      // Skip stages that are off screen, or hidden under a section that slid over them.
      const on = r.bottom > -200 && r.top < vh + 200 && r.width > 0 && st.section?.dataset.covered !== "1";
      st.root.visible = st.visible = on;
      if (!on) continue;
      st.root.position.copy(anchorPoint(r, tmp));
      const sx = (r.width * wpp) / st.size[0];
      const sy = (r.height * wpp) / st.size[1];
      st.root.scale.setScalar((st.cover ? Math.max(sx, sy) : Math.min(sx, sy)) * st.margin);
      st.root.updateMatrixWorld(true);
      const progress = THREE.MathUtils.clamp((vh - r.top) / (vh + r.height), 0, 1);
      st.update(t, progress, dt);
    }
    pointer.moved = false;
    stars.rotation.y = t * 0.012;
    stars.position.y = (window.scrollY / vh) * 1.2;
    renderer.render(scene, camera);
  }
  function loop() {
    render();
    raf = requestAnimationFrame(loop);
  }
  document.addEventListener("visibilitychange", () => {
    if (!animating) return;
    if (document.hidden) cancelAnimationFrame(raf);
    else loop();
  });
  if (reducedMotion) window.addEventListener("scroll", () => requestAnimationFrame(render), { passive: true });

  resize();
  if (animating) loop();
  else render();
}

/* ------------------------------ geometry ------------------------------ */

/** The Ethereum diamond: an upper octahedron over a lower chevron, flat-shaded, per-face colours. */
function makeEthGeometry() {
  const R = 1.0;
  const ring = (y) => [0, 1, 2, 3].map((i) => new THREE.Vector3(Math.cos(i * Math.PI / 2) * R, y, Math.sin(i * Math.PI / 2) * R));
  const A = new THREE.Vector3(0, 1.8, 0); // top apex
  const M = ring(0.18); // upper equator
  const B = new THREE.Vector3(0, -0.42, 0); // upper piece's lower apex
  const L = ring(-0.2); // lower piece's rim
  const D = new THREE.Vector3(0, -0.72, 0); // lower piece's concave centre
  const C = new THREE.Vector3(0, -1.85, 0); // bottom apex
  // Palette from the provided Ethereum artwork (light cyan → deep indigo).
  const pal = {
    top: ["#2aa9e2", "#1272b8", "#26398e", "#4ea6c2"],
    under: ["#1a5fae", "#283a8f", "#1d2d6e", "#3b80b2"],
    outer: ["#27a6dd", "#1171b6", "#1f337f", "#56a7b8"],
    inner: ["#183f8a", "#122b68", "#183f8a", "#25509c"],
  };
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const tri = (a, b, d, hex) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
    c.set(hex);
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  };
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    tri(A, M[j], M[i], pal.top[i]);
    tri(B, M[i], M[j], pal.under[i]);
    tri(C, L[i], L[j], pal.outer[i]);
    tri(D, L[j], L[i], pal.inner[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** The Solana mark: three bevelled parallelogram bars with the purple → green gradient. */
function makeSolanaBars() {
  const W = 2.6;
  const H = 0.52;
  const SL = 0.5;
  const purple = new THREE.Color("#9945ff");
  const green = new THREE.Color("#19fb9b");
  const c = new THREE.Color();
  return [0.86, 0, -0.86].map((y, i) => {
    const s = new THREE.Shape();
    if (i === 1) {
      // middle bar leans the other way
      s.moveTo(SL, 0);
      s.lineTo(W + SL, 0);
      s.lineTo(W, H);
      s.lineTo(0, H);
    } else {
      s.moveTo(0, 0);
      s.lineTo(W, 0);
      s.lineTo(W + SL, H);
      s.lineTo(SL, H);
    }
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
    geo.center();
    const p = geo.attributes.position;
    const colors = new Float32Array(p.count * 3);
    for (let v = 0; v < p.count; v++) {
      // diagonal gradient across the whole logo (bottom-left purple → top-right green)
      const k = THREE.MathUtils.clamp((p.getX(v) / (W + SL) + 0.5) * 0.75 + ((p.getY(v) + y) / 2.4 + 0.5) * 0.35 - 0.05, 0, 1);
      c.copy(purple).lerp(green, k);
      colors.set([c.r, c.g, c.b], v * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return { geo, y };
  });
}

/* -------------------------------- helpers -------------------------------- */

function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A logo as a round "planet": dark disc, the logo inset, a hairline ring. */
function circularTexture(src, aniso, onReady, brandRing = false) {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  const img = new Image();
  img.onload = () => {
    const g = c.getContext("2d");
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    g.fillStyle = "#111";
    g.fill();
    g.save();
    g.clip();
    const inset = brandRing ? 0 : 22;
    g.drawImage(img, inset, inset, size - inset * 2, size - inset * 2);
    g.restore();
    g.lineWidth = brandRing ? 8 : 5;
    g.strokeStyle = brandRing ? "#d6fa1b" : "rgba(255,255,255,0.22)";
    g.stroke();
    t.needsUpdate = true;
    onReady?.();
  };
  img.src = src;
  return t;
}

/** Loads a screenshot and bakes rounded corners + a hairline border into a texture. */
function roundedScreenTexture(src, aniso) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d");
      g.beginPath();
      g.roundRect(1, 1, w - 2, h - 2, Math.round(w * 0.075));
      g.save();
      g.clip();
      g.drawImage(img, 0, 0, w, h);
      g.restore();
      g.lineWidth = 3;
      g.strokeStyle = "rgba(255,255,255,0.14)";
      g.stroke();
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      resolve(t);
    };
    img.src = src;
  });
}
