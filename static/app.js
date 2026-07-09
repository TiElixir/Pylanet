const canvas = document.getElementById("planetCanvas");
const gl = canvas.getContext("webgl", { antialias: true });
const statsEl = document.getElementById("stats");
const biomesEl = document.getElementById("biomes");
const generateBtn = document.getElementById("generate");
const saveBtn = document.getElementById("savePlanet");
const autoRotateInput = document.getElementById("autoRotate");
const saveBodyBtn = document.getElementById("saveBody");
const saveStarBtn = document.getElementById("saveStar");
const addToSystemBtn = document.getElementById("addToSystem");
const bodyLibraryEl = document.getElementById("bodyLibrary");
const systemBodiesEl = document.getElementById("systemBodies");
const orbitEditor = document.getElementById("orbitEditor");
const planetModeBtn = document.getElementById("planetMode");
const systemModeBtn = document.getElementById("systemMode");
const planetPanel = document.getElementById("planetPanel");
const systemPanel = document.getElementById("systemPanel");
const gravityStrengthInput = document.getElementById("gravityStrength");
const timeScaleInput = document.getElementById("timeScale");
const simulationPausedInput = document.getElementById("simulationPaused");
const collisionsEnabledInput = document.getElementById("collisionsEnabled");

let program;
let buffers = {};
let presets = {};
let lastPlanet = null;
let savedBodies = [];
let systemBodies = [];
let mode = "planet";
let orbitDragId = null;
let systemLastTime = 0;
let orbitEditorLastRender = 0;
let systemDirty = false;
let indexCount = 0;
let rotationX = -0.35;
let rotationY = 0.65;
let targetRotationX = rotationX;
let targetRotationY = rotationY;
let velocityX = 0;
let velocityY = 0;
let zoom = 3.0;
let dragging = false;
let lastPointer = [0, 0];
let lastFrameTime = 0;

const fields = [
  "preset", "seed", "resolution", "amplitude", "seaLevel", "patternScale", "colorDetail",
  "continentScale", "mountainStrength", "detailStrength", "moisture",
  "temperature", "iceCaps", "plainsBias", "oceanBias", "desertBias", "savannaBias",
  "grasslandBias", "forestBias", "rainforestBias", "tundraBias", "snowBias", "rockBias",
  "octaves", "gain"
];

const resolutionInput = document.getElementById("resolution");
const resolutionValue = document.getElementById("resolutionValue");
const LIBRARY_KEY = "pylanet.savedBodies";
const SYSTEM_KEY = "pylanet.systemBodies";
const SYSTEM_G = 0.18;
const MAX_PHYSICS_DT = 0.03;
const COLLISION_SCALE = 0.36;

function shader(type, source) {
  const handle = gl.createShader(type);
  gl.shaderSource(handle, source);
  gl.compileShader(handle);
  if (!gl.getShaderParameter(handle, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(handle));
  }
  return handle;
}

function initProgram() {
  const vertex = shader(gl.VERTEX_SHADER, `
    attribute vec3 aPosition;
    attribute vec3 aColor;
    uniform mat4 uModel;
    uniform mat4 uView;
    uniform mat4 uProjection;
    varying vec3 vColor;
    varying vec3 vNormal;

    void main() {
      vec4 world = uModel * vec4(aPosition, 1.0);
      vNormal = normalize((uModel * vec4(normalize(aPosition), 0.0)).xyz);
      vColor = aColor;
      gl_Position = uProjection * uView * world;
    }
  `);
  const fragment = shader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    varying vec3 vColor;
    varying vec3 vNormal;

    void main() {
      vec3 light = normalize(vec3(-0.45, 0.55, 0.72));
      float diffuse = max(dot(normalize(vNormal), light), 0.0);
      float rim = pow(1.0 - max(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0), 2.0);
      vec3 color = vColor * (0.28 + diffuse * 0.86) + vec3(0.18, 0.28, 0.42) * rim * 0.32;
      gl_FragColor = vec4(color, 1.0);
    }
  `);
  program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  gl.useProgram(program);
}

function mat4Identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function mat4Multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function mat4RotateX(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

function mat4RotateY(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

function mat4Translate(z) {
  const m = mat4Identity();
  m[14] = z;
  return m;
}

function mat4Translate3(x, y, z) {
  const m = mat4Identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

function mat4Scale(value) {
  return [value, 0, 0, 0, 0, value, 0, 0, 0, 0, value, 0, 0, 0, 0, 1];
}

function mat4Perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ];
}

function resize() {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function createMeshBuffers(data) {
  const positions = new Float32Array(data.vertices.flat());
  const colors = new Float32Array(data.colors.flat().map((value) => value / 255));
  const flatIndices = data.faces.flat();
  const vertexCount = positions.length / 3;

  const uintExt = gl.getExtension("OES_element_index_uint");
  if (!uintExt && vertexCount > 65535) {
    throw new Error("This browser cannot render high resolution meshes.");
  }
  const indexType = vertexCount > 65535 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  const indices = vertexCount > 65535 ? new Uint32Array(flatIndices) : new Uint16Array(flatIndices);

  const mesh = {};
  mesh.position = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.position);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  mesh.color = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.color);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);

  mesh.index = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  mesh.indexCount = indices.length;
  mesh.indexType = indexType;
  return mesh;
}

function uploadMesh(data) {
  buffers = createMeshBuffers(data);
  indexCount = buffers.indexCount;
}

function buildSphereData(radius, color, lat = 24, lon = 36) {
  const vertices = [];
  const colors = [];
  const faces = [];
  for (let i = 0; i <= lat; i += 1) {
    const theta = (i / lat) * Math.PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    for (let j = 0; j < lon; j += 1) {
      const phi = (j / lon) * Math.PI * 2;
      vertices.push([
        radius * sinTheta * Math.cos(phi),
        radius * cosTheta,
        radius * sinTheta * Math.sin(phi)
      ]);
      colors.push(color);
    }
  }
  for (let i = 0; i < lat; i += 1) {
    for (let j = 0; j < lon; j += 1) {
      const current = i * lon + j;
      const next = i * lon + ((j + 1) % lon);
      const below = (i + 1) * lon + j;
      const belowNext = (i + 1) * lon + ((j + 1) % lon);
      faces.push([current, below, next], [next, below, belowNext]);
    }
  }
  return { vertices, faces, colors };
}

function buildPly(data) {
  const lines = [
    "ply",
    "format ascii 1.0",
    `element vertex ${data.vertices.length}`,
    "property float x",
    "property float y",
    "property float z",
    "property uchar red",
    "property uchar green",
    "property uchar blue",
    `element face ${data.faces.length}`,
    "property list uchar int vertex_indices",
    "end_header"
  ];
  data.vertices.forEach((vertex, index) => {
    const color = data.colors[index];
    lines.push(`${vertex[0]} ${vertex[1]} ${vertex[2]} ${color[0]} ${color[1]} ${color[2]}`);
  });
  data.faces.forEach((face) => {
    lines.push(`3 ${face[0]} ${face[1]} ${face[2]}`);
  });
  return `${lines.join("\n")}\n`;
}

function savePlanet() {
  if (!lastPlanet) return;
  const blob = new Blob([buildPly(lastPlanet)], { type: "model/ply" });
  const link = document.createElement("a");
  const seed = document.getElementById("seed").value || "planet";
  const preset = document.getElementById("preset").value || "custom";
  link.href = URL.createObjectURL(blob);
  link.download = `pylanet-${preset}-${seed}.ply`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function updateMotion(time) {
  const dt = Math.min(0.05, (time - lastFrameTime) / 1000 || 0.016);
  lastFrameTime = time;

  if (dragging) {
    const blend = 1 - Math.pow(0.001, dt);
    rotationX += (targetRotationX - rotationX) * blend;
    rotationY += (targetRotationY - rotationY) * blend;
    return;
  }

  if (autoRotateInput.checked) {
    rotationY += 0.45 * dt;
  }

  rotationX += velocityX * dt;
  rotationY += velocityY * dt;
  targetRotationX = rotationX;
  targetRotationY = rotationY;

  const damping = Math.pow(0.035, dt);
  velocityX *= damping;
  velocityY *= damping;
}

function drawMesh(mesh, model, view, projection) {
  const positionLoc = gl.getAttribLocation(program, "aPosition");
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.position);
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);

  const colorLoc = gl.getAttribLocation(program, "aColor");
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.color);
  gl.enableVertexAttribArray(colorLoc);
  gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);

  gl.uniformMatrix4fv(gl.getUniformLocation(program, "uModel"), false, new Float32Array(model));
  gl.uniformMatrix4fv(gl.getUniformLocation(program, "uView"), false, new Float32Array(view));
  gl.uniformMatrix4fv(gl.getUniformLocation(program, "uProjection"), false, new Float32Array(projection));

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
  gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType, 0);
}

function drawPlanetView() {
  if (indexCount <= 0) return;
  const model = mat4Multiply(mat4RotateY(rotationY), mat4RotateX(rotationX));
  const view = mat4Translate(-zoom);
  const projection = mat4Perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
  drawMesh(buffers, model, view, projection);
}

function bodyRadius(item) {
  const radius = Number(item.radius) || (item.kind === "star" ? 3 : 1);
  return item.kind === "star"
    ? Math.max(0.8, Math.min(3.5, radius))
    : Math.max(0.25, Math.min(1.25, radius));
}

function renderRadius(item) {
  return bodyRadius(item);
}

function physicsRadius(item) {
  return renderRadius(item) * COLLISION_SCALE;
}

function ensureBodyState(item) {
  if (!item.position || !item.velocity) {
    const orbit = item.spawnOrbit || item.orbit;
    const state = item.kind === "star"
      ? { position: [0, 0, 0], velocity: [0, 0, 0] }
      : initialOrbitState(orbit || { major: 8, minor: 6, phase: 0, velocity: 0.25 });
    item.position = item.position || state.position;
    item.velocity = item.velocity || state.velocity;
    item.spawnOrbit = item.spawnOrbit || orbit || null;
    delete item.orbit;
  }
  if (!item.color) item.color = item.kind === "star" ? [255, 214, 107] : [210, 230, 255];
}

function initialOrbitState(orbit) {
  const major = Number(orbit.major) || 8;
  const minor = Number(orbit.minor) || 6;
  const phase = ((Number(orbit.phase) || 0) * Math.PI) / 180;
  const speed = Number(orbit.velocity) || 0;
  const position = [
    Math.cos(phase) * major,
    0,
    Math.sin(phase) * minor
  ];
  const tangent = [
    -Math.sin(phase) * major,
    0,
    Math.cos(phase) * minor
  ];
  const tangentLength = Math.hypot(tangent[0], tangent[2]) || 1;
  const velocity = [
    (tangent[0] / tangentLength) * speed,
    0,
    (tangent[2] / tangentLength) * speed
  ];
  return { position, velocity };
}

function getBodyMesh(item) {
  if (item.renderMesh) return item.renderMesh;
  const meshData = item.previewMesh;
  if (meshData && meshData.vertices && meshData.faces && meshData.colors) {
    item.renderMesh = createMeshBuffers(meshData);
  } else {
    item.renderMesh = createMeshBuffers(buildSphereData(1, item.color || [210, 230, 255], 22, 32));
  }
  return item.renderMesh;
}

function mergeBodies(a, b) {
  const massA = Math.max(0.001, Number(a.mass) || 1);
  const massB = Math.max(0.001, Number(b.mass) || 1);
  const totalMass = massA + massB;
  const winner = a.kind === "star" ? a : (b.kind === "star" ? b : (massA >= massB ? a : b));
  const merged = {
    ...winner,
    id: `merged-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    name: `${a.name}+${b.name}`,
    kind: a.kind === "star" || b.kind === "star" ? "star" : "planet",
    mass: totalMass,
    radius: Math.cbrt(Math.pow(Number(a.radius) || 1, 3) + Math.pow(Number(b.radius) || 1, 3)),
    atmosphere: Math.max(Number(a.atmosphere) || 0, Number(b.atmosphere) || 0),
    position: [
      ((a.position[0] * massA) + (b.position[0] * massB)) / totalMass,
      0,
      ((a.position[2] * massA) + (b.position[2] * massB)) / totalMass
    ],
    velocity: [
      ((a.velocity[0] * massA) + (b.velocity[0] * massB)) / totalMass,
      0,
      ((a.velocity[2] * massA) + (b.velocity[2] * massB)) / totalMass
    ],
    previewMesh: winner.previewMesh,
    renderMesh: null,
    collided: true
  };
  if (merged.kind === "star") {
    merged.color = starColor(merged.temperature || 5778);
  }
  return merged;
}

function resolveCollisions() {
  if (!collisionsEnabledInput.checked || systemBodies.length < 2) return;
  const removed = new Set();
  const additions = [];
  for (let i = 0; i < systemBodies.length; i += 1) {
    if (removed.has(i)) continue;
    for (let j = i + 1; j < systemBodies.length; j += 1) {
      if (removed.has(j)) continue;
      const a = systemBodies[i];
      const b = systemBodies[j];
      ensureBodyState(a);
      ensureBodyState(b);
      const dx = b.position[0] - a.position[0];
      const dz = b.position[2] - a.position[2];
      const distance = Math.hypot(dx, dz);
      if (distance <= physicsRadius(a) + physicsRadius(b)) {
        removed.add(i);
        removed.add(j);
        additions.push(mergeBodies(a, b));
        break;
      }
    }
  }
  if (removed.size > 0) {
    systemBodies = systemBodies.filter((_, index) => !removed.has(index)).concat(additions);
    systemDirty = true;
  }
}

function stepGravity(dt) {
  if (simulationPausedInput.checked || systemBodies.length < 2) return;
  const gravity = SYSTEM_G * Math.max(0, Number(gravityStrengthInput.value) || 0);
  const accelerations = systemBodies.map(() => [0, 0, 0]);
  systemBodies.forEach(ensureBodyState);

  for (let i = 0; i < systemBodies.length; i += 1) {
    for (let j = i + 1; j < systemBodies.length; j += 1) {
      const a = systemBodies[i];
      const b = systemBodies[j];
      const dx = b.position[0] - a.position[0];
      const dz = b.position[2] - a.position[2];
      const distanceSq = Math.max(0.05, dx * dx + dz * dz);
      const distance = Math.sqrt(distanceSq);
      const nx = dx / distance;
      const nz = dz / distance;
      const massA = Math.max(0.001, Number(a.mass) || 1);
      const massB = Math.max(0.001, Number(b.mass) || 1);
      const accelA = gravity * massB / distanceSq;
      const accelB = gravity * massA / distanceSq;
      accelerations[i][0] += nx * accelA;
      accelerations[i][2] += nz * accelA;
      accelerations[j][0] -= nx * accelB;
      accelerations[j][2] -= nz * accelB;
    }
  }

  systemBodies.forEach((item, index) => {
    item.velocity[0] += accelerations[index][0] * dt;
    item.velocity[2] += accelerations[index][2] * dt;
    item.position[0] += item.velocity[0] * dt;
    item.position[2] += item.velocity[2] * dt;
  });
  resolveCollisions();
}

function updateSystemPhysics(time) {
  if (mode !== "system") {
    systemLastTime = time;
    return;
  }
  const rawDt = Math.min(0.08, (time - systemLastTime) / 1000 || 0.016);
  systemLastTime = time;
  const scaledDt = rawDt * Math.max(0, Number(timeScaleInput.value) || 0);
  let remaining = scaledDt;
  while (remaining > 0) {
    const dt = Math.min(MAX_PHYSICS_DT, remaining);
    stepGravity(dt);
    remaining -= dt;
  }
  if (systemDirty) {
    refreshSystem();
    systemDirty = false;
  } else if (time - orbitEditorLastRender > 120) {
    renderOrbitEditor();
    renderSystemList();
    orbitEditorLastRender = time;
  }
}

function drawSystemView(time) {
  const projection = mat4Perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 220);
  const view = mat4Translate(-Math.max(18, zoom * 8));
  const sceneRotation = mat4Multiply(mat4RotateY(rotationY), mat4RotateX(rotationX - 0.55));

  systemBodies.forEach((item) => {
    ensureBodyState(item);
    const [x, y, z] = item.position;
    const scale = renderRadius(item);
    const model = mat4Multiply(
      sceneRotation,
      mat4Multiply(mat4Translate3(x, y, z), mat4Scale(scale))
    );
    drawMesh(getBodyMesh(item), model, view, projection);
  });
}

function draw(time = 0) {
  updateMotion(time);
  updateSystemPhysics(time);
  resize();
  gl.clearColor(0.005, 0.01, 0.025, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  if (mode === "system") drawSystemView(time);
  else drawPlanetView();

  requestAnimationFrame(draw);
}

function payload() {
  const body = {};
  fields.forEach((id) => {
    const el = document.getElementById(id);
    body[id] = el.type === "number" || el.type === "range" ? Number(el.value) : el.value;
  });
  body.baseRadius = 1.0;
  return body;
}

function updateResolutionReadout() {
  const lat = Number(resolutionInput.value);
  const lon = Math.round(lat * 4 / 3);
  resolutionValue.textContent = `${lat} x ${lon}`;
}

function renderStats(data) {
  statsEl.textContent = `${data.stats.vertices.toLocaleString()} vertices / ${data.stats.faces.toLocaleString()} faces`;
  biomesEl.innerHTML = "";
  Object.entries(data.stats.biomes).forEach(([name, count]) => {
    const line = document.createElement("div");
    line.className = "biome-line";
    line.innerHTML = `<span>${name.replace("_", " ")}</span><strong>${count.toLocaleString()}</strong>`;
    biomesEl.appendChild(line);
  });
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value, (name, data) => (
    name === "renderMesh" || name === "previewMesh" ? undefined : data
  )));
}

function currentPlanetColor() {
  const preset = document.getElementById("preset").value;
  const colors = {
    earthlike: [74, 154, 99],
    arid: [184, 139, 75],
    frozen: [188, 219, 232],
    oceanic: [35, 109, 180],
    volcanic: [122, 75, 61]
  };
  return colors[preset] || [104, 166, 146];
}

function starColor(temperature) {
  const t = Number(temperature) || 5778;
  if (t < 3500) return [255, 126, 72];
  if (t < 5200) return [255, 199, 108];
  if (t < 7500) return [255, 236, 174];
  if (t < 11000) return [205, 224, 255];
  return [154, 186, 255];
}

function selectedLibraryBody() {
  return savedBodies.find((body) => body.id === bodyLibraryEl.value);
}

function renderLibrary() {
  bodyLibraryEl.innerHTML = "";
  savedBodies.forEach((body) => {
    const option = document.createElement("option");
    option.value = body.id;
    option.textContent = `${body.name} (${body.kind})`;
    bodyLibraryEl.appendChild(option);
  });
  addToSystemBtn.disabled = savedBodies.length === 0;
}

function renderSystemList() {
  systemBodiesEl.innerHTML = "";
  if (systemBodies.length === 0) {
    systemBodiesEl.textContent = "No bodies in system.";
    return;
  }
  systemBodies.forEach((body) => {
    const line = document.createElement("div");
    line.className = "biome-line";
    ensureBodyState(body);
    const detailsText = body.kind === "star"
      ? `m ${body.mass}, center`
      : `m ${body.mass}, v ${Math.hypot(body.velocity[0], body.velocity[2]).toFixed(2)}`;
    const name = document.createElement("span");
    const details = document.createElement("strong");
    name.textContent = body.name;
    details.textContent = detailsText;
    line.append(name, details);
    systemBodiesEl.appendChild(line);
  });
}

function renderOrbitEditor() {
  const cx = 140;
  const cy = 110;
  const scale = 10;
  const major = Math.max(1, Number(document.getElementById("orbitMajor").value) || 8);
  const minor = Math.max(1, Number(document.getElementById("orbitMinor").value) || 6);
  const phase = ((Number(document.getElementById("orbitPhase").value) || 0) * Math.PI) / 180;
  orbitEditor.innerHTML = "";
  const spawnEllipse = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
  spawnEllipse.setAttribute("cx", cx);
  spawnEllipse.setAttribute("cy", cy);
  spawnEllipse.setAttribute("rx", major * scale);
  spawnEllipse.setAttribute("ry", minor * scale);
  spawnEllipse.setAttribute("class", "orbit-path spawn-path");
  orbitEditor.appendChild(spawnEllipse);

  const star = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  star.setAttribute("cx", cx);
  star.setAttribute("cy", cy);
  star.setAttribute("r", 7);
  star.setAttribute("class", "system-star");
  orbitEditor.appendChild(star);

  const spawn = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  spawn.setAttribute("cx", cx + Math.cos(phase) * major * scale);
  spawn.setAttribute("cy", cy + Math.sin(phase) * minor * scale);
  spawn.setAttribute("r", 6);
  spawn.setAttribute("class", "spawn-handle");
  orbitEditor.appendChild(spawn);

  systemBodies.filter((body) => body.kind !== "star").forEach((body) => {
    ensureBodyState(body);
    const planet = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    planet.setAttribute("cx", cx + body.position[0] * scale);
    planet.setAttribute("cy", cy + body.position[2] * scale);
    planet.setAttribute("r", 5);
    planet.setAttribute("class", "system-planet");
    planet.setAttribute("fill", `rgb(${body.color.join(",")})`);
    orbitEditor.appendChild(planet);
  });
}

function refreshSystem() {
  renderLibrary();
  renderSystemList();
  renderOrbitEditor();
  saveJson(SYSTEM_KEY, systemBodies);
  if (mode === "system") {
    statsEl.textContent = `${systemBodies.length} bodies in system`;
  }
}

function saveNamedPlanet() {
  if (!lastPlanet) return;
  const body = {
    id: `planet-${Date.now()}`,
    kind: "planet",
    name: document.getElementById("planetName").value.trim() || "Unnamed planet",
    mass: Number(document.getElementById("planetMass").value) || 1,
    radius: Number(document.getElementById("planetRadius").value) || 1,
    atmosphere: Number(document.getElementById("planetAtmosphere").value) || 0,
    color: currentPlanetColor(),
    generation: payload(),
    previewMesh: lastPlanet,
    stats: lastPlanet.stats
  };
  savedBodies.push(body);
  saveJson(LIBRARY_KEY, savedBodies);
  renderLibrary();
}

function saveStar() {
  const temperature = Number(document.getElementById("starTemperature").value) || 5778;
  const body = {
    id: `star-${Date.now()}`,
    kind: "star",
    name: document.getElementById("starName").value.trim() || "Unnamed star",
    mass: Number(document.getElementById("starMass").value) || 1,
    radius: Number(document.getElementById("starRadius").value) || 3,
    temperature,
    atmosphere: 0,
    color: starColor(temperature)
  };
  savedBodies.push(body);
  saveJson(LIBRARY_KEY, savedBodies);
  renderLibrary();
}

function addSelectedBodyToSystem() {
  const selected = selectedLibraryBody();
  if (!selected) return;
  const orbit = {
    major: Number(document.getElementById("orbitMajor").value) || 8,
    minor: Number(document.getElementById("orbitMinor").value) || 6,
    phase: Number(document.getElementById("orbitPhase").value) || 0,
    velocity: Number(document.getElementById("orbitVelocity").value) || 0
  };
  const state = selected.kind === "star"
    ? { position: [0, 0, 0], velocity: [0, 0, 0] }
    : initialOrbitState(orbit);
  const item = {
    ...selected,
    id: `system-${Date.now()}`,
    sourceId: selected.id,
    spawnOrbit: selected.kind === "star" ? null : orbit,
    position: state.position,
    velocity: state.velocity,
    renderMesh: null
  };
  if (item.kind === "star") {
    systemBodies = systemBodies.filter((body) => body.kind !== "star");
    systemBodies.unshift(item);
  } else {
    systemBodies.push(item);
  }
  refreshSystem();
}

function setMode(nextMode) {
  mode = nextMode;
  systemLastTime = performance.now();
  planetModeBtn.classList.toggle("active", mode === "planet");
  systemModeBtn.classList.toggle("active", mode === "system");
  planetPanel.classList.toggle("active", mode === "planet");
  systemPanel.classList.toggle("active", mode === "system");
  statsEl.textContent = mode === "system"
    ? `${systemBodies.length} bodies in system`
    : (lastPlanet ? `${lastPlanet.stats.vertices.toLocaleString()} vertices / ${lastPlanet.stats.faces.toLocaleString()} faces` : "Ready");
}

async function generate() {
  generateBtn.disabled = true;
  saveBtn.disabled = true;
  statsEl.textContent = "Generating...";
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload())
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Generation failed");
    }
    lastPlanet = data;
    uploadMesh(data);
    renderStats(data);
    saveBtn.disabled = false;
    saveBodyBtn.disabled = false;
  } catch (error) {
    statsEl.textContent = error.message;
  } finally {
    generateBtn.disabled = false;
  }
}

function setControl(id, value) {
  const el = document.getElementById(id);
  if (!el || value === undefined || value === null) return;
  el.value = value;
}

function applyPresetToControls(name) {
  const preset = presets[name];
  if (!preset) return;
  setControl("amplitude", preset.amplitude);
  setControl("seaLevel", preset.sea_level);
  setControl("patternScale", preset.pattern_scale);
  setControl("colorDetail", preset.color_detail);
  setControl("continentScale", preset.continent_scale);
  setControl("mountainStrength", preset.mountain_strength);
  setControl("detailStrength", preset.detail_strength);
  setControl("moisture", preset.moisture);
  setControl("temperature", preset.temperature);
  setControl("iceCaps", preset.ice_caps);
  setControl("plainsBias", 0);
  ["ocean", "desert", "savanna", "grassland", "forest", "rainforest", "tundra", "snow", "rock"].forEach((name) => {
    setControl(`${name}Bias`, 1);
  });
}

async function loadDefaults() {
  const response = await fetch("/api/defaults");
  if (!response.ok) return;
  const defaults = await response.json();
  presets = defaults.presetSettings || {};
}

canvas.addEventListener("pointerdown", (event) => {
  dragging = true;
  lastPointer = [event.clientX, event.clientY];
  targetRotationX = rotationX;
  targetRotationY = rotationY;
  velocityX = 0;
  velocityY = 0;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const dx = event.clientX - lastPointer[0];
  const dy = event.clientY - lastPointer[1];
  const sensitivity = 0.007;
  targetRotationY += dx * sensitivity;
  targetRotationX += dy * sensitivity;
  velocityY = dx * sensitivity * 12;
  velocityX = dy * sensitivity * 12;
  lastPointer = [event.clientX, event.clientY];
});

canvas.addEventListener("pointerup", () => {
  dragging = false;
});

canvas.addEventListener("pointercancel", () => {
  dragging = false;
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  zoom = Math.max(1.7, Math.min(6.0, zoom + event.deltaY * 0.002));
}, { passive: false });

document.getElementById("randomSeed").addEventListener("click", () => {
  document.getElementById("seed").value = Math.floor(Math.random() * 999999);
});

document.getElementById("preset").addEventListener("change", (event) => {
  applyPresetToControls(event.target.value);
});

planetModeBtn.addEventListener("click", () => setMode("planet"));
systemModeBtn.addEventListener("click", () => setMode("system"));
saveBodyBtn.addEventListener("click", saveNamedPlanet);
saveStarBtn.addEventListener("click", saveStar);
addToSystemBtn.addEventListener("click", addSelectedBodyToSystem);
["orbitMajor", "orbitMinor", "orbitPhase", "orbitVelocity"].forEach((id) => {
  document.getElementById(id).addEventListener("input", renderOrbitEditor);
});

orbitEditor.addEventListener("pointerdown", (event) => {
  const target = event.target.closest(".spawn-handle");
  if (!target) return;
  orbitDragId = "spawn";
  orbitEditor.setPointerCapture(event.pointerId);
});

orbitEditor.addEventListener("pointermove", (event) => {
  if (!orbitDragId) return;
  const rect = orbitEditor.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 280;
  const y = ((event.clientY - rect.top) / rect.height) * 220;
  const dx = x - 140;
  const dy = y - 110;
  document.getElementById("orbitMajor").value = Math.max(1, Number((Math.abs(dx) / 10).toFixed(2)));
  document.getElementById("orbitMinor").value = Math.max(1, Number((Math.abs(dy) / 10).toFixed(2)));
  document.getElementById("orbitPhase").value = Number(((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360).toFixed(1));
  renderOrbitEditor();
});

orbitEditor.addEventListener("pointerup", () => {
  orbitDragId = null;
});

orbitEditor.addEventListener("pointercancel", () => {
  orbitDragId = null;
});

resolutionInput.addEventListener("input", updateResolutionReadout);
generateBtn.addEventListener("click", generate);
saveBtn.addEventListener("click", savePlanet);

if (!gl) {
  statsEl.textContent = "WebGL is unavailable in this browser.";
} else {
  savedBodies = loadJson(LIBRARY_KEY, []);
  systemBodies = loadJson(SYSTEM_KEY, []);
  refreshSystem();
  updateResolutionReadout();
  initProgram();
  loadDefaults().finally(generate);
  draw();
}
