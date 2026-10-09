const canvas = document.getElementById("planetCanvas");
const gl = canvas.getContext("webgl", { antialias: true });
const statsEl = document.getElementById("stats");
const biomesEl = document.getElementById("biomes");
const generateBtn = document.getElementById("generate");
const saveBtn = document.getElementById("savePlanet");
const autoRotateInput = document.getElementById("autoRotate");

let program;
let buffers = {};
let presets = {};
let lastPlanet = null;
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

function uploadMesh(data) {
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

  buffers.position = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  buffers.color = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);

  buffers.index = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.index);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  indexCount = indices.length;
  buffers.indexType = indexType;
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

function draw(time = 0) {
  updateMotion(time);
  resize();
  gl.clearColor(0.005, 0.01, 0.025, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  if (indexCount > 0) {
    const positionLoc = gl.getAttribLocation(program, "aPosition");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);

    const colorLoc = gl.getAttribLocation(program, "aColor");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);

    const model = mat4Multiply(mat4RotateY(rotationY), mat4RotateX(rotationX));
    const view = mat4Translate(-zoom);
    const projection = mat4Perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);

    gl.uniformMatrix4fv(gl.getUniformLocation(program, "uModel"), false, new Float32Array(model));
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "uView"), false, new Float32Array(view));
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "uProjection"), false, new Float32Array(projection));

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.index);
    gl.drawElements(gl.TRIANGLES, indexCount, buffers.indexType, 0);
  }

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
  const workers = data.stats.workers ? ` / ${data.stats.workers} worker${data.stats.workers === 1 ? "" : "s"}` : "";
  statsEl.textContent = `${data.stats.vertices.toLocaleString()} vertices / ${data.stats.faces.toLocaleString()} faces${workers}`;
  biomesEl.innerHTML = "";
  Object.entries(data.stats.biomes).forEach(([name, count]) => {
    const line = document.createElement("div");
    line.className = "biome-line";
    line.innerHTML = `<span>${name.replace("_", " ")}</span><strong>${count.toLocaleString()}</strong>`;
    biomesEl.appendChild(line);
  });
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

resolutionInput.addEventListener("input", updateResolutionReadout);
generateBtn.addEventListener("click", generate);
saveBtn.addEventListener("click", savePlanet);

if (!gl) {
  statsEl.textContent = "WebGL is unavailable in this browser.";
} else {
  updateResolutionReadout();
  initProgram();
  loadDefaults().finally(generate);
  draw();
}
