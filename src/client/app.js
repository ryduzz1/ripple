const UI_STATE_KEY = "Ripple.uiState.v1";
const LAYER_LABEL_WIDTH = 132;
const LAYER_LIST_PADDING = 8;
const TIME_ZERO_X = LAYER_LABEL_WIDTH + LAYER_LIST_PADDING;
const SNAP_TOLERANCE_PX = 10;
const AUTO_SCROLL_EDGE_PX = 34;
const AUTO_SCROLL_STEP_PX = 22;
const BASE_PX_PER_SECOND = 42;
const MAX_ZOOM = 260;
const AUTO_SYNC_INTERVAL_MS = 500;

const fallbackSnapshot = {
  ok: true,
  comp: {
    name: "Ripple Demo Comp",
    duration: 18,
    frameRate: 30,
    currentTime: 4.2,
    workAreaStart: 0,
    workAreaDuration: 18
  },
  layers: [
    { index: 1, name: "Title - Big Hook", type: "text", startTime: 1.2, inPoint: 1.2, outPoint: 5.1, enabled: true, selected: true },
    { index: 2, name: "Main Footage", type: "video", startTime: 0, inPoint: 0, outPoint: 8.8, enabled: true, selected: false },
    { index: 3, name: "Music Bed", type: "audio", startTime: 0, inPoint: 0, outPoint: 18, enabled: true, selected: false },
    { index: 4, name: "Logo Precomp", type: "precomp", startTime: 8.4, inPoint: 8.4, outPoint: 13.2, enabled: true, selected: false },
    { index: 5, name: "Color Grade", type: "solid", startTime: 0, inPoint: 0, outPoint: 18, enabled: true, selected: false }
  ]
};

const state = {
  snapshot: null,
  zoom: 100,
  showMuted: true,
  showBadges: true,
  compactRows: false,
  enableSnapping: true,
  didFitInitialComp: false,
  drag: null,
  playheadDrag: null,
  marquee: null,
  lastShortcut: null,
  lastSnapshotSignature: "",
  syncInFlight: false
};

const els = {
  keySink: document.getElementById("keySink"),
  refreshComp: document.getElementById("refreshComp"),
  openSettings: document.getElementById("openSettings"),
  closeSettings: document.getElementById("closeSettings"),
  settingsOverlay: document.getElementById("settingsOverlay"),
  settingsBackdrop: document.getElementById("settingsBackdrop"),
  splitAtPlayhead: document.getElementById("splitAtPlayhead"),
  timelineFrame: document.querySelector(".timeline-frame"),
  timeRuler: document.getElementById("timeRuler"),
  playhead: document.getElementById("playhead"),
  snapGuide: document.getElementById("snapGuide"),
  layerList: document.getElementById("layerList"),
  emptyState: document.getElementById("emptyState"),
  emptyTitle: document.getElementById("emptyTitle"),
  emptyMessage: document.getElementById("emptyMessage"),
  showMuted: document.getElementById("showMuted"),
  showBadges: document.getElementById("showBadges"),
  compactRows: document.getElementById("compactRows"),
  enableSnapping: document.getElementById("enableSnapping"),
  toast: document.getElementById("toast"),
  toolTip: document.getElementById("toolTip"),
  dragReadout: document.getElementById("dragReadout"),
  marquee: document.getElementById("marquee")
};

function getCSInterface() {
  if (window.__adobe_cep__ && typeof CSInterface !== "undefined") {
    return new CSInterface();
  }
  return null;
}

function registerCepKeyEvents() {
  const keyEvents = [
    { keyCode: 37, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
    { keyCode: 39, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
    { keyCode: 37, ctrlKey: false, altKey: false, shiftKey: true, metaKey: false },
    { keyCode: 39, ctrlKey: false, altKey: false, shiftKey: true, metaKey: false },
    { keyCode: 83, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
    { keyCode: 83, ctrlKey: false, altKey: false, shiftKey: true, metaKey: false },
    { keyCode: 219, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
    { keyCode: 221, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }
  ];

  try {
    const csInterface = getCSInterface();
    if (csInterface && typeof csInterface.registerKeyEventsInterest === "function") {
      csInterface.registerKeyEventsInterest(JSON.stringify(keyEvents));
      return;
    }
  } catch (error) {}

  try {
    if (window.__adobe_cep__ && typeof window.__adobe_cep__.registerKeyEventsInterest === "function") {
      window.__adobe_cep__.registerKeyEventsInterest(JSON.stringify(keyEvents));
    }
  } catch (error) {}
}

function evalHost(script) {
  const csInterface = getCSInterface();
  if (!csInterface) {
    if (window.__adobe_cep__ && typeof window.__adobe_cep__.evalScript === "function") {
      return new Promise((resolve) => {
        window.__adobe_cep__.evalScript(script, (result) => resolve(result));
      });
    }

    return Promise.resolve(runFallbackHost(script));
  }

  return new Promise((resolve) => {
    csInterface.evalScript(script, (result) => resolve(result));
  });
}

function runFallbackHost(script) {
  const match = script.match(/^Ripple\.([a-zA-Z0-9_]+)\('([\s\S]*)'\)$/);
  const method = match ? match[1] : "getTimelineSnapshot";
  let payload = {};

  if (match && match[2]) {
    try {
      payload = JSON.parse(match[2].replace(/\\'/g, "'").replace(/\\\\/g, "\\"));
    } catch (error) {}
  }

  if (method === "selectLayer") {
    fallbackSnapshot.layers.forEach((layer) => {
      layer.selected = layer.index === Number(payload.layerIndex);
    });
    return JSON.stringify({ ok: true, message: "Selected layer." });
  }

  if (method === "selectLayers") {
    const selected = payload.layerIndices || [];
    fallbackSnapshot.layers.forEach((layer) => {
      layer.selected = selected.indexOf(layer.index) !== -1;
    });
    return JSON.stringify({ ok: true, message: "Selected layers." });
  }

  if (method === "clearSelection") {
    fallbackSnapshot.layers.forEach((layer) => {
      layer.selected = false;
    });
    return JSON.stringify({ ok: true, message: "Cleared selection." });
  }

  if (method === "moveLayer") {
    const layer = fallbackSnapshot.layers.find((candidate) => candidate.index === Number(payload.layerIndex));
    if (!layer) {
      return JSON.stringify({ ok: false, error: "Layer not found." });
    }

    const duration = layer.outPoint - layer.inPoint;
    const maxInPoint = Math.max(0, fallbackSnapshot.comp.duration - duration);
    layer.inPoint = Math.max(0, Math.min(maxInPoint, Number(payload.newInPoint) || 0));
    layer.outPoint = layer.inPoint + duration;
    layer.startTime = layer.inPoint;
    fallbackSnapshot.layers.forEach((candidate) => {
      candidate.selected = candidate.index === layer.index;
    });
    return JSON.stringify({ ok: true, message: "Moved layer." });
  }

  if (method === "moveLayers") {
    const selected = payload.layerIndices || [];
    const layers = fallbackSnapshot.layers.filter((layer) => selected.indexOf(layer.index) !== -1);
    const requestedDelta = Number(payload.delta) || 0;
    let minDelta = -Infinity;
    let maxDelta = Infinity;

    layers.forEach((layer) => {
      minDelta = Math.max(minDelta, -layer.inPoint);
      maxDelta = Math.min(maxDelta, fallbackSnapshot.comp.duration - layer.outPoint);
    });

    const delta = Math.max(minDelta, Math.min(maxDelta, requestedDelta));
    layers.forEach((layer) => {
      layer.inPoint += delta;
      layer.outPoint += delta;
      layer.startTime += delta;
    });
    fallbackSnapshot.layers.forEach((layer) => {
      layer.selected = selected.indexOf(layer.index) !== -1;
    });
    return JSON.stringify({ ok: true, message: `Moved ${layers.length} layer(s).` });
  }

  if (method === "trimLayer") {
    const layer = fallbackSnapshot.layers.find((candidate) => candidate.index === Number(payload.layerIndex));
    if (!layer) {
      return JSON.stringify({ ok: false, error: "Layer not found." });
    }

    if (typeof payload.newInPoint === "number") {
      layer.inPoint = Math.max(0, Math.min(payload.newInPoint, layer.outPoint - 1 / fallbackSnapshot.comp.frameRate));
    }

    if (typeof payload.newOutPoint === "number") {
      layer.outPoint = Math.max(layer.inPoint + 1 / fallbackSnapshot.comp.frameRate, Math.min(payload.newOutPoint, fallbackSnapshot.comp.duration));
    }

    fallbackSnapshot.layers.forEach((candidate) => {
      candidate.selected = candidate.index === layer.index;
    });
    return JSON.stringify({ ok: true, message: "Trimmed layer." });
  }

  if (method === "setCompTime") {
    fallbackSnapshot.comp.currentTime = Math.max(0, Math.min(fallbackSnapshot.comp.duration, Number(payload.time) || 0));
    return JSON.stringify({ ok: true, message: "Moved playhead." });
  }

  return JSON.stringify(fallbackSnapshot);
}

function parseHostResult(raw) {
  if (!raw || raw === "EvalScript error.") {
    return { ok: false, error: "After Effects did not return a response." };
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return { ok: false, error: String(raw) };
  }
}

function escapeForExtendScript(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function callHost(method, payload = {}) {
  const rawPayload = escapeForExtendScript(JSON.stringify(payload));
  const raw = await evalHost(`Ripple.${method}('${rawPayload}')`);
  return parseHostResult(raw);
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safeSeconds / 60);
  const secs = Math.floor(safeSeconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatTimecode(seconds) {
  const frameRate = getFrameRate();
  const safeFrames = Math.max(0, Math.round((Number(seconds) || 0) * frameRate));
  const totalSeconds = Math.floor(safeFrames / frameRate);
  const mins = Math.floor(totalSeconds / 60);
  const secs = (totalSeconds % 60).toString().padStart(2, "0");
  const frames = (safeFrames % frameRate).toString().padStart(2, "0");
  return `${mins}:${secs}:${frames}`;
}

function formatFrameDelta(seconds) {
  const frames = Math.round((Number(seconds) || 0) * getFrameRate());
  if (frames === 0) {
    return "0f";
  }
  return `${frames > 0 ? "+" : ""}${frames}f`;
}

function layerTypeLabel(type) {
  const labels = {
    audio: "Aud",
    camera: "Cam",
    light: "Lgt",
    null: "Null",
    precomp: "Pre",
    solid: "Sol",
    text: "Txt",
    video: "Vid"
  };
  return labels[type] || "Lay";
}

function layerTypeIcon(type) {
  const icons = {
    audio: "speaker",
    camera: "camera",
    light: "light",
    null: "target",
    precomp: "stack",
    solid: "square",
    text: "text",
    video: "play"
  };
  return icons[type] || "layer";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parsePixelValue(value, fallback) {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function loadUiState() {
  try {
    const saved = JSON.parse(localStorage.getItem(UI_STATE_KEY) || "{}");
    Object.assign(state, saved);
  } catch (error) {}

  state.zoom = Math.max(10, Math.min(MAX_ZOOM, Number(state.zoom) || 100));
  els.showMuted.checked = state.showMuted;
  els.showBadges.checked = state.showBadges;
  els.compactRows.checked = state.compactRows;
  els.enableSnapping.checked = state.enableSnapping;
}

function saveUiState() {
  localStorage.setItem(UI_STATE_KEY, JSON.stringify({
    zoom: state.zoom,
    showMuted: state.showMuted,
    showBadges: state.showBadges,
    compactRows: state.compactRows,
    enableSnapping: state.enableSnapping
  }));
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("is-hiding");
  els.toast.classList.remove("hidden");
  requestAnimationFrame(() => {
    els.toast.classList.add("is-visible");
  });
  window.clearTimeout(showToast.timeout);
  window.clearTimeout(showToast.hideTimeout);
  showToast.timeout = window.setTimeout(() => {
    hideToast();
  }, 2600);
}

function hideToast() {
  els.toast.classList.remove("is-visible");
  els.toast.classList.add("is-hiding");
  window.clearTimeout(showToast.hideTimeout);
  showToast.hideTimeout = window.setTimeout(() => {
    els.toast.classList.add("hidden");
    els.toast.classList.remove("is-hiding");
  }, 190);
}

function setSettingsOpen(isOpen) {
  els.settingsOverlay.classList.toggle("hidden", !isOpen);
}

function showToolTip(button) {
  const label = button.getAttribute("title") || button.getAttribute("aria-label");
  if (!label) {
    return;
  }

  const rect = button.getBoundingClientRect();
  els.toolTip.textContent = label;
  els.toolTip.style.left = `${rect.right + 8}px`;
  els.toolTip.style.top = `${rect.top + rect.height / 2}px`;
  els.toolTip.classList.remove("is-hiding");
  els.toolTip.classList.remove("hidden");
  window.clearTimeout(showToolTip.hideTimeout);
  requestAnimationFrame(() => {
    els.toolTip.classList.add("is-visible");
  });
}

function hideToolTip() {
  els.toolTip.classList.remove("is-visible");
  els.toolTip.classList.add("is-hiding");
  window.clearTimeout(showToolTip.hideTimeout);
  showToolTip.hideTimeout = window.setTimeout(() => {
    els.toolTip.classList.add("hidden");
    els.toolTip.classList.remove("is-hiding");
  }, 150);
}

function showDragReadout(event, label, timeText, deltaText) {
  els.dragReadout.innerHTML = `
    <span class="drag-readout-label">${escapeHtml(label)}</span>
    <span class="drag-readout-time">${escapeHtml(timeText)}</span>
    <span class="drag-readout-delta">${escapeHtml(deltaText)}</span>
  `;
  moveDragReadout(event);
  els.dragReadout.classList.remove("is-hiding");
  els.dragReadout.classList.remove("hidden");
  requestAnimationFrame(() => {
    els.dragReadout.classList.add("is-visible");
  });
}

function moveDragReadout(event) {
  const offsetX = 12;
  const offsetY = -38;
  const maxLeft = window.innerWidth - 16;
  const minTop = 8;
  const left = Math.min(maxLeft, event.clientX + offsetX);
  const top = Math.max(minTop, event.clientY + offsetY);
  els.dragReadout.style.left = `${left}px`;
  els.dragReadout.style.top = `${top}px`;
}

function hideDragReadout() {
  els.dragReadout.classList.remove("is-visible");
  els.dragReadout.classList.add("is-hiding");
  window.clearTimeout(hideDragReadout.timeout);
  hideDragReadout.timeout = window.setTimeout(() => {
    els.dragReadout.classList.add("hidden");
    els.dragReadout.classList.remove("is-hiding");
  }, 130);
}

function getCompDuration() {
  return Math.max(1, state.snapshot && state.snapshot.comp ? state.snapshot.comp.duration || 1 : 1);
}

function getFrameRate() {
  return Math.max(1, state.snapshot && state.snapshot.comp ? state.snapshot.comp.frameRate || 30 : 30);
}

function getTimelineScale() {
  return getTimelineWidth() / getCompDuration();
}

function getFitTimelineWidth() {
  const frameWidth = els.timelineFrame ? els.timelineFrame.clientWidth : 0;
  return Math.max(160, frameWidth - (LAYER_LABEL_WIDTH + (LAYER_LIST_PADDING * 2)));
}

function getMinimumZoom() {
  const duration = getCompDuration();
  return Math.max(10, (getFitTimelineWidth() / (duration * BASE_PX_PER_SECOND)) * 100);
}

function clampZoom(zoom) {
  return Math.max(getMinimumZoom(), Math.min(MAX_ZOOM, zoom));
}

function getTimelineWidth() {
  if (Math.abs(state.zoom - getMinimumZoom()) < 0.001) {
    return getFitTimelineWidth();
  }

  return Math.round(getCompDuration() * BASE_PX_PER_SECOND * (state.zoom / 100));
}

function snapToFrame(seconds) {
  const frameRate = getFrameRate();
  return Math.round(seconds * frameRate) / frameRate;
}

function setZoom(nextZoom) {
  const previousZoom = state.zoom;
  state.zoom = clampZoom(nextZoom);
  saveUiState();
  renderTimeline();
  if (Math.abs(state.zoom - getMinimumZoom()) < 0.001) {
    els.timelineFrame.scrollLeft = 0;
  }
  if (previousZoom !== state.zoom) {
    showToast(`Zoom ${Math.round(state.zoom)}%`);
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getSnapTargets(layerIndex) {
  if (!state.snapshot || !state.snapshot.comp) {
    return [];
  }

  const comp = state.snapshot.comp;
  const targets = [
    { time: 0, label: "Comp Start" },
    { time: comp.duration, label: "Comp End" },
    { time: comp.currentTime || 0, label: "Playhead" }
  ];

  const selected = getSelectedLayerIndices();
  (state.snapshot.layers || []).forEach((layer) => {
    if (layer.index === layerIndex || selected.indexOf(layer.index) !== -1 || layer.outPoint <= layer.inPoint) {
      return;
    }

    targets.push({ time: layer.inPoint, label: "Layer Start" });
    targets.push({ time: layer.outPoint, label: "Layer End" });
  });

  return targets;
}

function findSnap(time, layerIndex) {
  if (!state.enableSnapping) {
    return null;
  }

  const tolerance = SNAP_TOLERANCE_PX / getTimelineScale();
  let closest = null;

  getSnapTargets(layerIndex).forEach((target) => {
    const distance = Math.abs(target.time - time);
    if (distance <= tolerance && (!closest || distance < closest.distance)) {
      closest = {
        time: target.time,
        label: target.label,
        distance
      };
    }
  });

  return closest;
}

function showSnapGuide(snap) {
  if (!snap) {
    hideSnapGuide();
    return;
  }

  const left = TIME_ZERO_X + snap.time * getTimelineScale();
  els.snapGuide.style.left = `${left}px`;
  els.snapGuide.classList.remove("hidden");
}

function hideSnapGuide() {
  els.snapGuide.classList.add("hidden");
}

function setEmptyState(title, message) {
  els.emptyTitle.textContent = title;
  els.emptyMessage.textContent = message;
  els.emptyState.style.display = "grid";
}

function getSnapshotSignature(snapshot) {
  if (!snapshot || !snapshot.ok || !snapshot.comp) {
    return snapshot && snapshot.error ? `error:${snapshot.error}` : "empty";
  }

  const comp = snapshot.comp;
  const frameRate = Math.max(1, comp.frameRate || 30);
  const currentFrame = Math.round((comp.currentTime || 0) * frameRate);
  const compParts = [
    comp.name,
    comp.duration,
    comp.frameRate,
    currentFrame,
    comp.workAreaStart,
    comp.workAreaDuration
  ];
  const layerParts = (snapshot.layers || []).map((layer) => [
    layer.index,
    layer.name,
    layer.type,
    Math.round((layer.inPoint || 0) * frameRate),
    Math.round((layer.outPoint || 0) * frameRate),
    layer.enabled ? 1 : 0,
    layer.locked ? 1 : 0,
    layer.selected ? 1 : 0
  ].join(":"));

  return `${compParts.join("|")}::${layerParts.join("|")}`;
}

function isTimelineInteractionActive() {
  return !!(state.drag || state.playheadDrag || state.marquee);
}

function getSelectedLayerIndices() {
  if (!state.snapshot || !state.snapshot.layers) {
    return [];
  }

  return state.snapshot.layers
    .filter((layer) => layer.selected)
    .map((layer) => layer.index);
}

function setLocalSelection(layerIndices) {
  if (!state.snapshot || !state.snapshot.layers) {
    return;
  }

  state.snapshot.layers.forEach((layer) => {
    layer.selected = layerIndices.indexOf(layer.index) !== -1;
  });
  renderTimeline();
}

function getClipForLayer(layerIndex) {
  return els.layerList.querySelector(`.clip[data-layer-index="${layerIndex}"]`);
}

function getLayerByIndex(layerIndex) {
  return state.snapshot && state.snapshot.layers
    ? state.snapshot.layers.find((layer) => layer.index === layerIndex)
    : null;
}

function autoScrollTimeline(clientX) {
  const rect = els.timelineFrame.getBoundingClientRect();
  let scrollDelta = 0;

  if (clientX > rect.right - AUTO_SCROLL_EDGE_PX) {
    scrollDelta = AUTO_SCROLL_STEP_PX;
  } else if (clientX < rect.left + AUTO_SCROLL_EDGE_PX) {
    scrollDelta = -AUTO_SCROLL_STEP_PX;
  }

  if (!scrollDelta) {
    return;
  }

  els.timelineFrame.scrollLeft = Math.max(0, els.timelineFrame.scrollLeft + scrollDelta);
}

function getTimeFromClientX(clientX) {
  const rect = els.timelineFrame.getBoundingClientRect();
  const localX = clientX - rect.left + els.timelineFrame.scrollLeft - TIME_ZERO_X;
  return Math.max(0, Math.min(getCompDuration(), localX / getTimelineScale()));
}

function beginPlayheadDrag(event) {
  if (event.button !== 0 || !state.snapshot || !state.snapshot.ok) {
    return;
  }

  focusPanel();
  state.playheadDrag = {
    moved: false,
    lastHostUpdate: 0
  };
  document.body.classList.add("is-dragging-playhead");
  event.preventDefault();
  event.stopPropagation();
}

async function updatePlayheadDrag(event) {
  if (!state.playheadDrag) {
    return;
  }

  autoScrollTimeline(event.clientX);
  state.playheadDrag.moved = true;
  const nextTime = getTimeFromClientX(event.clientX);
  if (state.snapshot && state.snapshot.comp) {
    state.snapshot.comp.currentTime = snapToFrame(nextTime);
    renderTimeline();
  }

  const now = Date.now();
  if (now - state.playheadDrag.lastHostUpdate > 90) {
    state.playheadDrag.lastHostUpdate = now;
    await callHost("setCompTime", { time: snapToFrame(nextTime) });
  }
}

async function endPlayheadDrag(event) {
  if (!state.playheadDrag) {
    return;
  }

  const wasMoved = state.playheadDrag.moved;
  state.playheadDrag = null;
  document.body.classList.remove("is-dragging-playhead");

  if (!state.snapshot || !state.snapshot.ok) {
    return;
  }

  const nextTime = getTimeFromClientX(event.clientX);
  await setCompTime(nextTime, wasMoved);
}

async function beginRulerPlayheadDrag(event) {
  if (event.button !== 0 || !state.snapshot || !state.snapshot.ok || !state.snapshot.comp) {
    return;
  }

  focusPanel();
  state.playheadDrag = {
    moved: true,
    lastHostUpdate: Date.now()
  };
  document.body.classList.add("is-dragging-playhead");
  event.preventDefault();
  event.stopPropagation();
  await setCompTime(getTimeFromClientX(event.clientX), false);
}

function renderRuler(comp, timelineWidth) {
  const duration = Math.max(1, comp.duration || 1);
  const tickCount = 6;
  const labelWidth = 140;
  const totalWidth = timelineWidth + LAYER_LABEL_WIDTH + (LAYER_LIST_PADDING * 2);
  const contentWidth = Math.max(160, totalWidth - labelWidth);

  els.timeRuler.style.width = `${totalWidth}px`;
  els.timeRuler.style.gridTemplateColumns = `${labelWidth}px repeat(${tickCount}, ${contentWidth / tickCount}px)`;
  els.timeRuler.innerHTML = `<span>Layers</span>${Array.from({ length: tickCount }, (_, index) => {
    const time = (duration / (tickCount - 1)) * index;
    return `<span>${formatTime(time)}</span>`;
  }).join("")}`;
}

function renderTimeline() {
  const snapshot = state.snapshot;
  if (!snapshot || !snapshot.ok || !snapshot.comp) {
    els.layerList.innerHTML = "";
    setEmptyState(
      "Open a comp to build the timeline.",
      "Ripple reads the active composition and turns AE layers into cleaner editorial lanes."
    );
    els.playhead.style.display = "none";
    return;
  }

  const comp = snapshot.comp;
  const layers = (snapshot.layers || []).filter((layer) => state.showMuted || layer.enabled);
  const duration = Math.max(1, comp.duration || 1);
  state.zoom = clampZoom(state.zoom);
  const timelineWidth = getTimelineWidth();
  const playheadLeft = TIME_ZERO_X + Math.max(0, Math.min(1, (comp.currentTime || 0) / duration)) * timelineWidth;

  els.playhead.style.display = "block";
  els.playhead.style.left = `${playheadLeft}px`;
  els.layerList.style.width = `${timelineWidth + LAYER_LABEL_WIDTH + (LAYER_LIST_PADDING * 2)}px`;
  els.layerList.classList.toggle("compact", state.compactRows);
  if (layers.length) {
    els.emptyState.style.display = "none";
  } else {
    els.emptyState.style.display = "none";
  }

  renderRuler(comp, timelineWidth);

  els.layerList.innerHTML = layers.map((layer) => {
    const left = Math.max(0, (layer.inPoint / duration) * timelineWidth);
    const width = Math.max(16, ((layer.outPoint - layer.inPoint) / duration) * timelineWidth);
    const type = layer.type || "layer";
    const selected = layer.selected ? " selected" : "";
    const badge = state.showBadges ? `<span class="badge">${layerTypeLabel(type)}</span>` : "";
    const layerName = escapeHtml(layer.name);

    return `
      <div class="layer-row${selected}" data-layer-index="${layer.index}">
        <div class="layer-meta">
          <span class="layer-name">${layerName}</span>
          <span class="layer-type">${type}</span>
        </div>
        <div class="track">
          <div class="clip ${type}" data-layer-index="${layer.index}" data-in-point="${layer.inPoint}" data-out-point="${layer.outPoint}" style="left:${left}px;width:${width}px">
            <span class="trim-handle trim-start" data-trim-edge="start" aria-hidden="true"></span>
            <span class="clip-head">
              <span class="media-icon ${layerTypeIcon(type)}"></span>
              <span class="clip-title">${layerName}</span>
              ${badge}
            </span>
            <span class="clip-body" aria-hidden="true"></span>
            <span class="trim-handle trim-end" data-trim-edge="end" aria-hidden="true"></span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  if (Math.abs(state.zoom - getMinimumZoom()) < 0.001) {
    els.timelineFrame.scrollLeft = 0;
  }

}

function applyTimelineSnapshot(result, options = {}) {
  const scrollLeft = els.timelineFrame.scrollLeft;
  const scrollTop = els.timelineFrame.scrollTop;
  state.snapshot = result;
  state.lastSnapshotSignature = getSnapshotSignature(result);

  if (!result.ok && !options.silent) {
    showToast(result.error || "Open an active comp to use Ripple.");
  }

  if (result.ok && result.comp && !state.didFitInitialComp) {
    state.zoom = getMinimumZoom();
    state.didFitInitialComp = true;
    saveUiState();
    els.timelineFrame.scrollLeft = 0;
  }

  renderTimeline();
  if (options.preserveScroll) {
    els.timelineFrame.scrollLeft = scrollLeft;
    els.timelineFrame.scrollTop = scrollTop;
  }
}

async function refreshTimeline(options = {}) {
  const result = await callHost("getTimelineSnapshot");
  applyTimelineSnapshot(result, options);
  if (!options.silent) {
    reclaimKeyboardFocus();
  }
}

async function syncTimeline() {
  if (state.syncInFlight || isTimelineInteractionActive()) {
    return;
  }

  state.syncInFlight = true;
  try {
    const result = await callHost("getTimelineSnapshot");
    const signature = getSnapshotSignature(result);
    if (signature !== state.lastSnapshotSignature) {
      applyTimelineSnapshot(result, { silent: true, preserveScroll: true });
    }
  } finally {
    state.syncInFlight = false;
  }
}

function startAutoSync() {
  window.setInterval(syncTimeline, AUTO_SYNC_INTERVAL_MS);
}

async function runCommand(command) {
  const result = await callHost(command);
  if (!result.ok) {
    showToast(result.error || "Command failed.");
    reclaimKeyboardFocus();
    return;
  }

  showToast(result.message || "Done.");
  await refreshTimeline();
  reclaimKeyboardFocus();
}

async function setCompTime(time, shouldRefresh) {
  const nextTime = Math.max(0, Math.min(getCompDuration(), snapToFrame(time)));
  if (state.snapshot && state.snapshot.comp) {
    state.snapshot.comp.currentTime = nextTime;
    renderTimeline();
  }

  const result = await callHost("setCompTime", { time: nextTime });
  if (!result.ok) {
    showToast(result.error || "Could not move playhead.");
    reclaimKeyboardFocus();
    return false;
  }

  if (shouldRefresh) {
    await refreshTimeline();
  }

  reclaimKeyboardFocus();
  return true;
}

async function selectLayer(layerIndex) {
  const result = await callHost("selectLayer", { layerIndex });
  if (!result.ok) {
    showToast(result.error || "Could not select layer.");
    return false;
  }

  if (state.snapshot && state.snapshot.layers) {
    state.snapshot.layers.forEach((layer) => {
      layer.selected = layer.index === layerIndex;
    });
    renderTimeline();
  }
  reclaimKeyboardFocus();

  return true;
}

async function selectLayers(layerIndices) {
  const result = await callHost("selectLayers", { layerIndices });
  if (!result.ok) {
    showToast(result.error || "Could not select layers.");
    return false;
  }

  setLocalSelection(layerIndices);
  reclaimKeyboardFocus();
  return true;
}

async function toggleLayerSelection(layerIndex) {
  const selected = getSelectedLayerIndices();
  const nextSelected = selected.indexOf(layerIndex) === -1
    ? selected.concat(layerIndex)
    : selected.filter((index) => index !== layerIndex);

  await selectLayers(nextSelected.length ? nextSelected : [layerIndex]);
}

async function clearSelection() {
  const result = await callHost("clearSelection");
  if (!result.ok) {
    showToast(result.error || "Could not clear selection.");
    return;
  }

  setLocalSelection([]);
  reclaimKeyboardFocus();
}

async function moveLayer(layerIndex, newInPoint) {
  const result = await callHost("moveLayer", { layerIndex, newInPoint });
  if (!result.ok) {
    showToast(result.error || "Could not move layer.");
    await refreshTimeline();
    return;
  }

  showToast(result.message || "Layer moved.");
  await refreshTimeline();
  reclaimKeyboardFocus();
}

async function moveLayers(layerIndices, delta) {
  if (!layerIndices.length || Math.abs(delta) < 0.000001) {
    return;
  }

  const result = await callHost("moveLayers", { layerIndices, delta });
  if (!result.ok) {
    showToast(result.error || "Could not move layers.");
    await refreshTimeline();
    return;
  }

  showToast(result.message || "Layers moved.");
  await refreshTimeline();
  reclaimKeyboardFocus();
}

async function trimLayer(layerIndex, payload) {
  const result = await callHost("trimLayer", {
    layerIndex,
    newInPoint: payload.newInPoint,
    newOutPoint: payload.newOutPoint
  });

  if (!result.ok) {
    showToast(result.error || "Could not trim layer.");
    await refreshTimeline();
    return;
  }

  showToast(result.message || "Layer trimmed.");
  await refreshTimeline();
  reclaimKeyboardFocus();
}

function getDragBounds(clip, layer) {
  const duration = getCompDuration();
  const scale = getTimelineScale();
  const clipDuration = Math.max(0, layer.outPoint - layer.inPoint);
  const timelineWidth = duration * scale;
  const renderedClipWidth = parsePixelValue(clip.style.width, clipDuration * scale);
  const minInPoint = 0;
  const maxInPoint = Math.max(minInPoint, duration - clipDuration);

  return {
    scale,
    minLeft: minInPoint * scale,
    maxLeft: Math.min(maxInPoint * scale, Math.max(0, timelineWidth - renderedClipWidth))
  };
}

function getGroupDragItems(layerIndices) {
  return layerIndices.map((layerIndex) => {
    const layer = getLayerByIndex(layerIndex);
    const clip = getClipForLayer(layerIndex);
    if (!layer || !clip || layer.locked) {
      return null;
    }

    return {
      layerIndex,
      clip,
      startLeft: parsePixelValue(clip.style.left, 0),
      startWidth: parsePixelValue(clip.style.width, 0),
      inPoint: layer.inPoint,
      outPoint: layer.outPoint
    };
  }).filter(Boolean);
}

function getGroupDragBounds(items) {
  const duration = getCompDuration();
  const scale = getTimelineScale();
  const timelineWidth = duration * scale;
  let minDeltaPx = -Infinity;
  let maxDeltaPx = Infinity;

  items.forEach((item) => {
    minDeltaPx = Math.max(minDeltaPx, -item.startLeft);
    maxDeltaPx = Math.min(maxDeltaPx, timelineWidth - (item.startLeft + item.startWidth));
  });

  return {
    scale,
    minDeltaPx,
    maxDeltaPx
  };
}

function getMinimumClipDuration() {
  return 1 / getFrameRate();
}

function beginClipDrag(event) {
  if (event.button !== 0) {
    return;
  }

  focusPanel();
  const clip = event.target.closest(".clip");
  if (!clip || !state.snapshot || !state.snapshot.layers) {
    return;
  }

  const layerIndex = Number(clip.dataset.layerIndex);
  const layer = state.snapshot.layers.find((candidate) => candidate.index === layerIndex);
  if (!layer || layer.locked) {
    showToast(layer && layer.locked ? "Layer is locked." : "Layer not found.");
    return;
  }

  const bounds = getDragBounds(clip, layer);
  const trimEdge = event.target.dataset.trimEdge || null;
  const additiveSelection = event.shiftKey || event.metaKey || event.ctrlKey;
  const selectedIndices = getSelectedLayerIndices();
  const shouldGroupMove = !trimEdge && selectedIndices.indexOf(layerIndex) !== -1 && selectedIndices.length > 1 && !additiveSelection;
  const groupItems = shouldGroupMove ? getGroupDragItems(selectedIndices) : [];
  const groupBounds = groupItems.length > 1 ? getGroupDragBounds(groupItems) : null;
  state.drag = {
    clip,
    layerIndex,
    mode: trimEdge === "start" ? "trim-start" : trimEdge === "end" ? "trim-end" : "move",
    additiveSelection,
    groupItems: groupItems.length > 1 ? groupItems : [],
    groupBounds,
    startClientX: event.clientX,
    startScrollLeft: els.timelineFrame.scrollLeft,
    startLeft: parsePixelValue(clip.style.left, 0),
    startWidth: parsePixelValue(clip.style.width, 0),
    startInPoint: layer.inPoint,
    startOutPoint: layer.outPoint,
    moved: false,
    bounds
  };

  clip.classList.add("is-dragging", `is-${state.drag.mode}`);
  document.body.classList.add("is-dragging-clip", `is-${state.drag.mode}`);
  hideToolTip();
  event.preventDefault();
}

function getMarqueeRect() {
  if (!state.marquee) {
    return null;
  }

  const left = Math.min(state.marquee.startX, state.marquee.currentX);
  const top = Math.min(state.marquee.startY, state.marquee.currentY);
  const width = Math.abs(state.marquee.currentX - state.marquee.startX);
  const height = Math.abs(state.marquee.currentY - state.marquee.startY);

  return { left, top, right: left + width, bottom: top + height, width, height };
}

function renderMarquee() {
  const rect = getMarqueeRect();
  if (!rect || !state.marquee.moved) {
    els.marquee.classList.add("hidden");
    return;
  }

  els.marquee.style.left = `${rect.left}px`;
  els.marquee.style.top = `${rect.top}px`;
  els.marquee.style.width = `${rect.width}px`;
  els.marquee.style.height = `${rect.height}px`;
  els.marquee.classList.remove("hidden");
}

function rectsIntersect(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function getMarqueeSelection() {
  const rect = getMarqueeRect();
  if (!rect) {
    return [];
  }

  return Array.from(els.layerList.querySelectorAll(".clip"))
    .filter((clip) => rectsIntersect(rect, clip.getBoundingClientRect()))
    .map((clip) => Number(clip.dataset.layerIndex))
    .filter(Boolean);
}

function beginMarqueeSelection(event) {
  if (
    event.button !== 0 ||
    event.target.closest(".clip") ||
    event.target.closest(".side-toolbar") ||
    event.target.closest(".playhead") ||
    event.target.closest(".ruler")
  ) {
    return;
  }

  focusPanel();
  state.marquee = {
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    currentY: event.clientY,
    baseSelection: event.shiftKey || event.metaKey || event.ctrlKey ? getSelectedLayerIndices() : [],
    moved: false
  };
  document.body.classList.add("is-marquee-selecting");
  event.preventDefault();
}

function updateMarqueeSelection(event) {
  if (!state.marquee) {
    return;
  }

  state.marquee.currentX = event.clientX;
  state.marquee.currentY = event.clientY;
  if (Math.abs(event.clientX - state.marquee.startX) > 3 || Math.abs(event.clientY - state.marquee.startY) > 3) {
    state.marquee.moved = true;
  }

  renderMarquee();
}

async function endMarqueeSelection() {
  if (!state.marquee) {
    return;
  }

  const marquee = state.marquee;
  const selected = marquee.moved ? getMarqueeSelection() : [];
  const nextSelection = marquee.moved
    ? Array.from(new Set(marquee.baseSelection.concat(selected)))
    : [];

  state.marquee = null;
  els.marquee.classList.add("hidden");
  document.body.classList.remove("is-marquee-selecting");

  if (nextSelection.length) {
    await selectLayers(nextSelection);
    return;
  }

  if (!marquee.moved) {
    await clearSelection();
  }
}

function updateClipDrag(event) {
  if (!state.drag) {
    return;
  }

  moveDragReadout(event);
  autoScrollTimeline(event.clientX);
  const scrollDelta = els.timelineFrame.scrollLeft - state.drag.startScrollLeft;
  const deltaX = event.clientX - state.drag.startClientX + scrollDelta;
  if (Math.abs(deltaX) > 2) {
    state.drag.moved = true;
  }

  if (state.drag.mode === "move") {
    const clipDuration = state.drag.startWidth / state.drag.bounds.scale;
    const isGroupMove = state.drag.groupItems && state.drag.groupItems.length > 1;
    const minDelta = isGroupMove ? state.drag.groupBounds.minDeltaPx : state.drag.bounds.minLeft - state.drag.startLeft;
    const maxDelta = isGroupMove ? state.drag.groupBounds.maxDeltaPx : state.drag.bounds.maxLeft - state.drag.startLeft;
    let snappedDelta = clamp(deltaX, minDelta, maxDelta);
    let nextLeft = state.drag.startLeft + snappedDelta;
    let nextInPoint = nextLeft / state.drag.bounds.scale;
    const startSnap = findSnap(nextInPoint, state.drag.layerIndex);
    const endSnap = findSnap(nextInPoint + clipDuration, state.drag.layerIndex);

    if (startSnap || endSnap) {
      const snap = startSnap && (!endSnap || startSnap.distance <= endSnap.distance) ? startSnap : endSnap;
      nextInPoint = snap === startSnap ? snap.time : snap.time - clipDuration;
      snappedDelta = clamp((nextInPoint * state.drag.bounds.scale) - state.drag.startLeft, minDelta, maxDelta);
      nextLeft = state.drag.startLeft + snappedDelta;
      showSnapGuide(snap);
    } else {
      hideSnapGuide();
    }

    if (isGroupMove) {
      state.drag.groupItems.forEach((item) => {
        item.clip.style.left = `${item.startLeft + snappedDelta}px`;
      });
    } else {
      state.drag.clip.style.left = `${nextLeft}px`;
    }
    showDragReadout(
      event,
      isGroupMove ? "Group move" : "Move",
      formatTimecode(nextInPoint),
      formatFrameDelta(snappedDelta / state.drag.bounds.scale)
    );
    return;
  }

  const minWidth = getMinimumClipDuration() * state.drag.bounds.scale;
  if (state.drag.mode === "trim-start") {
    const maxLeft = state.drag.startLeft + state.drag.startWidth - minWidth;
    let nextLeft = clamp(state.drag.startLeft + deltaX, 0, maxLeft);
    const snap = findSnap(nextLeft / state.drag.bounds.scale, state.drag.layerIndex);
    if (snap) {
      nextLeft = clamp(snap.time * state.drag.bounds.scale, 0, maxLeft);
      showSnapGuide(snap);
    } else {
      hideSnapGuide();
    }
    state.drag.clip.style.left = `${nextLeft}px`;
    state.drag.clip.style.width = `${state.drag.startWidth + (state.drag.startLeft - nextLeft)}px`;
    showDragReadout(
      event,
      "Trim in",
      formatTimecode(nextLeft / state.drag.bounds.scale),
      formatFrameDelta((nextLeft - state.drag.startLeft) / state.drag.bounds.scale)
    );
    return;
  }

  const maxWidth = (getCompDuration() * state.drag.bounds.scale) - state.drag.startLeft;
  let nextWidth = clamp(state.drag.startWidth + deltaX, minWidth, maxWidth);
  const snap = findSnap((state.drag.startLeft + nextWidth) / state.drag.bounds.scale, state.drag.layerIndex);
  if (snap) {
    nextWidth = clamp((snap.time * state.drag.bounds.scale) - state.drag.startLeft, minWidth, maxWidth);
    showSnapGuide(snap);
  } else {
    hideSnapGuide();
  }
  state.drag.clip.style.width = `${nextWidth}px`;
  showDragReadout(
    event,
    "Trim out",
    formatTimecode((state.drag.startLeft + nextWidth) / state.drag.bounds.scale),
    formatFrameDelta((nextWidth - state.drag.startWidth) / state.drag.bounds.scale)
  );
}

async function endClipDrag(event) {
  if (!state.drag) {
    return;
  }

  const drag = state.drag;
  state.drag = null;
  drag.clip.classList.remove("is-dragging", "is-move", "is-trim-start", "is-trim-end");
  document.body.classList.remove("is-dragging-clip", "is-move", "is-trim-start", "is-trim-end");
  hideSnapGuide();
  hideDragReadout();

  if (!drag.moved) {
    if (drag.additiveSelection) {
      await toggleLayerSelection(drag.layerIndex);
      return;
    }

    await selectLayer(drag.layerIndex);
    return;
  }

  if (drag.mode === "move") {
    const nextLeft = parsePixelValue(drag.clip.style.left, drag.startLeft);
    const minInPoint = drag.bounds.minLeft / drag.bounds.scale;
    const maxInPoint = drag.bounds.maxLeft / drag.bounds.scale;
    const newInPoint = Math.max(minInPoint, Math.min(maxInPoint, snapToFrame(nextLeft / drag.bounds.scale)));
    if (drag.groupItems && drag.groupItems.length > 1) {
      const delta = snapToFrame((nextLeft - drag.startLeft) / drag.bounds.scale);
      await moveLayers(drag.groupItems.map((item) => item.layerIndex), delta);
      return;
    }

    await moveLayer(drag.layerIndex, newInPoint);
    return;
  }

  if (drag.mode === "trim-start") {
    const nextLeft = parsePixelValue(drag.clip.style.left, drag.startLeft);
    const newInPoint = Math.max(0, Math.min(drag.startOutPoint - getMinimumClipDuration(), snapToFrame(nextLeft / drag.bounds.scale)));
    await trimLayer(drag.layerIndex, { newInPoint });
    return;
  }

  const nextWidth = parsePixelValue(drag.clip.style.width, drag.startWidth);
  const newOutPoint = Math.max(
    drag.startInPoint + getMinimumClipDuration(),
    Math.min(getCompDuration(), snapToFrame((drag.startLeft + nextWidth) / drag.bounds.scale))
  );
  await trimLayer(drag.layerIndex, { newOutPoint });
}

function cancelClipDrag() {
  if (!state.drag) {
    return;
  }

  const drag = state.drag;
  state.drag = null;
  drag.clip.style.left = `${drag.startLeft}px`;
  drag.clip.style.width = `${drag.startWidth}px`;
  if (drag.groupItems && drag.groupItems.length > 1) {
    drag.groupItems.forEach((item) => {
      item.clip.style.left = `${item.startLeft}px`;
      item.clip.style.width = `${item.startWidth}px`;
    });
  }
  drag.clip.classList.remove("is-dragging", "is-move", "is-trim-start", "is-trim-end");
  document.body.classList.remove("is-dragging-clip", "is-move", "is-trim-start", "is-trim-end");
  hideSnapGuide();
  hideDragReadout();
}

function handleTimelineWheel(event) {
  if (!state.snapshot || !state.snapshot.ok || (!event.ctrlKey && !event.metaKey)) {
    return;
  }

  event.preventDefault();
  const delta = -event.deltaY;
  const step = Math.max(-24, Math.min(24, delta * 0.18));
  setZoom(state.zoom + step);
}

function handleResize() {
  const clamped = clampZoom(state.zoom);
  if (clamped !== state.zoom) {
    state.zoom = clamped;
    saveUiState();
  }
  renderTimeline();
}

function isTypingTarget(target) {
  if (target === els.keySink) {
    return false;
  }

  return target && (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

function focusPanel() {
  try {
    window.focus();
    if (els.keySink) {
      els.keySink.focus();
      els.keySink.value = "";
      return;
    }
    document.body.focus();
  } catch (error) {}
}

function reclaimKeyboardFocus() {
  focusPanel();
  window.setTimeout(focusPanel, 0);
  window.setTimeout(focusPanel, 40);
}

function getArrowDirection(event) {
  if (event.key === "ArrowLeft" || event.keyCode === 37 || event.which === 37) {
    return -1;
  }

  if (event.key === "Left") {
    return -1;
  }

  if (event.key === "ArrowRight" || event.keyCode === 39 || event.which === 39 || event.key === "Right") {
    return 1;
  }

  return 0;
}

function getActionShortcut(event) {
  if (event.altKey || event.metaKey || event.ctrlKey) {
    return "";
  }

  const key = String(event.key || "").toLowerCase();
  const code = event.keyCode || event.which;
  const charCode = event.charCode || 0;

  if (key === "s" || code === 83 || charCode === 83 || charCode === 115) {
    return "splitAtPlayhead";
  }

  if (key === "[" || code === 219 || code === 91 || charCode === 91) {
    return "trimStartToPlayhead";
  }

  if (key === "]" || code === 221 || code === 93 || charCode === 93) {
    return "trimEndToPlayhead";
  }

  return "";
}

function consumeKeyEvent(event) {
  event.preventDefault();
  event.stopPropagation();
  event.cancelBubble = true;
  event.returnValue = false;
}

async function handleKeyDown(event) {
  if (event.defaultPrevented || isTypingTarget(event.target)) {
    return;
  }

  const command = getActionShortcut(event);
  if (command) {
    const now = Date.now();
    if (state.lastShortcut && state.lastShortcut.command === command && now - state.lastShortcut.time < 140) {
      consumeKeyEvent(event);
      return;
    }

    if (event.repeat) {
      return;
    }

    state.lastShortcut = { command, time: now };
    consumeKeyEvent(event);
    await runCommand(command);
    return;
  }

  const direction = getArrowDirection(event);
  if (!direction) {
    return;
  }

  const selected = getSelectedLayerIndices();
  if (!selected.length) {
    return;
  }

  consumeKeyEvent(event);
  const frameStep = event.shiftKey ? 10 : 1;
  await moveLayers(selected, direction * frameStep / getFrameRate());
}

function bindEvents() {
  registerCepKeyEvents();
  document.addEventListener("mousedown", focusPanel, true);
  els.refreshComp.addEventListener("click", refreshTimeline);
  els.openSettings.addEventListener("click", () => setSettingsOpen(true));
  els.closeSettings.addEventListener("click", () => setSettingsOpen(false));
  els.settingsBackdrop.addEventListener("click", () => setSettingsOpen(false));
  els.splitAtPlayhead.addEventListener("click", () => runCommand("splitAtPlayhead"));
  els.timelineFrame.addEventListener("wheel", handleTimelineWheel, { passive: false });
  els.timelineFrame.addEventListener("mousedown", beginMarqueeSelection);
  els.timeRuler.addEventListener("mousedown", beginRulerPlayheadDrag);
  els.playhead.addEventListener("mousedown", beginPlayheadDrag);
  window.addEventListener("resize", handleResize);
  els.layerList.addEventListener("mousedown", beginClipDrag);
  document.addEventListener("mousemove", updateClipDrag);
  document.addEventListener("mousemove", updateMarqueeSelection);
  document.addEventListener("mousemove", updatePlayheadDrag);
  document.addEventListener("mouseup", endClipDrag);
  document.addEventListener("mouseup", endMarqueeSelection);
  document.addEventListener("mouseup", endPlayheadDrag);
  document.addEventListener("mouseleave", cancelClipDrag);
  els.keySink.addEventListener("keydown", handleKeyDown, true);
  els.keySink.addEventListener("keypress", handleKeyDown, true);
  els.keySink.addEventListener("input", () => {
    els.keySink.value = "";
  });
  window.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("keypress", handleKeyDown, true);
  document.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("keypress", handleKeyDown, true);
  document.body.addEventListener("keydown", handleKeyDown, true);
  document.body.addEventListener("keypress", handleKeyDown, true);
  els.timelineFrame.addEventListener("keydown", handleKeyDown, true);
  els.timelineFrame.addEventListener("keypress", handleKeyDown, true);
  window.onkeydown = handleKeyDown;
  document.onkeydown = handleKeyDown;

  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => runCommand(button.dataset.command));
  });

  document.querySelectorAll(".side-toolbar .icon-button").forEach((button) => {
    button.addEventListener("mouseenter", () => showToolTip(button));
    button.addEventListener("focus", () => showToolTip(button));
    button.addEventListener("mouseleave", hideToolTip);
    button.addEventListener("blur", hideToolTip);
  });

  els.showMuted.addEventListener("change", () => {
    state.showMuted = els.showMuted.checked;
    saveUiState();
    renderTimeline();
  });

  els.showBadges.addEventListener("change", () => {
    state.showBadges = els.showBadges.checked;
    saveUiState();
    renderTimeline();
  });

  els.compactRows.addEventListener("change", () => {
    state.compactRows = els.compactRows.checked;
    saveUiState();
    renderTimeline();
  });

  els.enableSnapping.addEventListener("change", () => {
    state.enableSnapping = els.enableSnapping.checked;
    saveUiState();
    hideSnapGuide();
    showToast(state.enableSnapping ? "Snapping enabled." : "Snapping disabled.");
  });
}

loadUiState();
bindEvents();
refreshTimeline();
startAutoSync();
