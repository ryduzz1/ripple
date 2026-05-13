const UI_STATE_KEY = "Ripple.uiState.v1";

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
  showMuted: true,
  showBadges: true,
  compactRows: false
};

const els = {
  refreshComp: document.getElementById("refreshComp"),
  openSettings: document.getElementById("openSettings"),
  closeSettings: document.getElementById("closeSettings"),
  settingsOverlay: document.getElementById("settingsOverlay"),
  settingsBackdrop: document.getElementById("settingsBackdrop"),
  splitAtPlayhead: document.getElementById("splitAtPlayhead"),
  timeRuler: document.getElementById("timeRuler"),
  playhead: document.getElementById("playhead"),
  layerList: document.getElementById("layerList"),
  emptyState: document.getElementById("emptyState"),
  showMuted: document.getElementById("showMuted"),
  showBadges: document.getElementById("showBadges"),
  compactRows: document.getElementById("compactRows"),
  toast: document.getElementById("toast"),
  toolTip: document.getElementById("toolTip")
};

function getCSInterface() {
  if (window.__adobe_cep__ && typeof CSInterface !== "undefined") {
    return new CSInterface();
  }
  return null;
}

function evalHost(script) {
  const csInterface = getCSInterface();
  if (!csInterface) {
    return Promise.resolve(JSON.stringify(fallbackSnapshot));
  }

  return new Promise((resolve) => {
    csInterface.evalScript(script, (result) => resolve(result));
  });
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function loadUiState() {
  try {
    const saved = JSON.parse(localStorage.getItem(UI_STATE_KEY) || "{}");
    Object.assign(state, saved);
  } catch (error) {}

  els.showMuted.checked = state.showMuted;
  els.showBadges.checked = state.showBadges;
  els.compactRows.checked = state.compactRows;
}

function saveUiState() {
  localStorage.setItem(UI_STATE_KEY, JSON.stringify({
    showMuted: state.showMuted,
    showBadges: state.showBadges,
    compactRows: state.compactRows
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
  const label = button.getAttribute("aria-label") || button.getAttribute("title");
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

function renderRuler(comp, timelineWidth) {
  const duration = Math.max(1, comp.duration || 1);
  const tickCount = 6;
  const labelWidth = 140;
  const contentWidth = Math.max(480, timelineWidth - labelWidth);

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
    els.emptyState.style.display = "grid";
    return;
  }

  const comp = snapshot.comp;
  const layers = (snapshot.layers || []).filter((layer) => state.showMuted || layer.enabled);
  const duration = Math.max(1, comp.duration || 1);
  const timelineWidth = Math.round(Math.max(520, duration * 42));
  const playheadLeft = 148 + Math.max(0, Math.min(1, (comp.currentTime || 0) / duration)) * timelineWidth;

  els.playhead.style.left = `${playheadLeft}px`;
  els.layerList.style.width = `${timelineWidth + 140}px`;
  els.layerList.classList.toggle("compact", state.compactRows);
  els.emptyState.style.display = layers.length ? "none" : "grid";

  renderRuler(comp, timelineWidth + 140);

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
          <div class="clip ${type}" style="left:${left}px;width:${width}px">
            <span class="clip-label">${badge}<span>${layerName}</span></span>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

async function refreshTimeline() {
  const result = await callHost("getTimelineSnapshot");
  state.snapshot = result;

  if (!result.ok) {
    showToast(result.error || "Open an active comp to use Ripple.");
  }

  renderTimeline();
}

async function runCommand(command) {
  const result = await callHost(command);
  if (!result.ok) {
    showToast(result.error || "Command failed.");
    return;
  }

  showToast(result.message || "Done.");
  await refreshTimeline();
}

function bindEvents() {
  els.refreshComp.addEventListener("click", refreshTimeline);
  els.openSettings.addEventListener("click", () => setSettingsOpen(true));
  els.closeSettings.addEventListener("click", () => setSettingsOpen(false));
  els.settingsBackdrop.addEventListener("click", () => setSettingsOpen(false));
  els.splitAtPlayhead.addEventListener("click", () => runCommand("splitAtPlayhead"));

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
}

loadUiState();
bindEvents();
refreshTimeline();
