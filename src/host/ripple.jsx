var Ripple = (function () {
  function getActiveComp() {
    var item = app.project ? app.project.activeItem : null;
    if (!item || !(item instanceof CompItem)) {
      return null;
    }
    return item;
  }

  function parsePayload(raw) {
    if (!raw) {
      return {};
    }

    try {
      if (typeof JSON !== "undefined" && JSON.parse) {
        return JSON.parse(raw);
      }
    } catch (error) {}

    try {
      return eval("(" + raw + ")");
    } catch (fallbackError) {
      return {};
    }
  }

  function stringifyPayload(value) {
    try {
      if (typeof JSON !== "undefined" && JSON.stringify) {
        return JSON.stringify(value);
      }
    } catch (jsonError) {}

    return String(value);
  }

  function ok(payload) {
    payload.ok = true;
    return stringifyPayload(payload);
  }

  function fail(message) {
    return stringifyPayload({
      ok: false,
      error: message
    });
  }

  function getSelectedLayers(comp) {
    return comp && comp.selectedLayers ? comp.selectedLayers : [];
  }

  function requireComp() {
    var comp = getActiveComp();
    if (!comp) {
      throw new Error("Open an active composition.");
    }
    return comp;
  }

  function requireSelectedLayers(comp) {
    var selected = getSelectedLayers(comp);
    if (!selected.length) {
      throw new Error("Select at least one layer.");
    }
    return selected;
  }

  function layerType(layer) {
    if (layer instanceof CameraLayer) {
      return "camera";
    }

    if (layer instanceof LightLayer) {
      return "light";
    }

    if (layer.nullLayer) {
      return "null";
    }

    if (layer.matchName === "ADBE Text Layer") {
      return "text";
    }

    if (layer instanceof AVLayer && layer.source) {
      if (layer.source instanceof CompItem) {
        return "precomp";
      }

      if (layer.source.mainSource && layer.source.mainSource.color) {
        return "solid";
      }

      if (layer.source.hasAudio && !layer.source.hasVideo) {
        return "audio";
      }

      if (layer.source.hasVideo) {
        return "video";
      }
    }

    return "layer";
  }

  function buildLayerSnapshot(layer) {
    var hasAudio = false;
    var hasVideo = false;

    try {
      hasAudio = !!layer.hasAudio;
      hasVideo = !!layer.hasVideo;
    } catch (capabilityError) {}

    return {
      index: layer.index,
      name: layer.name,
      type: layerType(layer),
      startTime: layer.startTime,
      inPoint: layer.inPoint,
      outPoint: layer.outPoint,
      enabled: layer.enabled,
      solo: layer.solo,
      locked: layer.locked,
      shy: layer.shy,
      hasAudio: hasAudio,
      hasVideo: hasVideo,
      selected: layer.selected
    };
  }

  function getTimelineSnapshot() {
    try {
      var comp = requireComp();
      var layers = [];

      for (var index = 1; index <= comp.numLayers; index += 1) {
        layers.push(buildLayerSnapshot(comp.layer(index)));
      }

      return ok({
        comp: {
          name: comp.name,
          duration: comp.duration,
          frameRate: comp.frameRate,
          currentTime: comp.time,
          workAreaStart: comp.workAreaStart,
          workAreaDuration: comp.workAreaDuration
        },
        layers: layers
      });
    } catch (error) {
      return fail(error.message || String(error));
    }
  }

  function splitLayerAtTime(layer, time) {
    if (time <= layer.inPoint || time >= layer.outPoint) {
      return false;
    }

    layer.splitLayer(time);
    return true;
  }

  function selectLayer(rawPayload) {
    var payload = parsePayload(rawPayload);

    try {
      var comp = requireComp();
      var layerIndex = Number(payload.layerIndex);

      if (!layerIndex || layerIndex < 1 || layerIndex > comp.numLayers) {
        throw new Error("Layer not found.");
      }

      for (var index = 1; index <= comp.numLayers; index += 1) {
        comp.layer(index).selected = false;
      }

      comp.layer(layerIndex).selected = true;

      return ok({
        message: "Selected layer."
      });
    } catch (error) {
      return fail(error.message || String(error));
    }
  }

  function selectLayers(rawPayload) {
    var payload = parsePayload(rawPayload);
    var selected = payload.layerIndices || [];

    try {
      var comp = requireComp();

      for (var index = 1; index <= comp.numLayers; index += 1) {
        comp.layer(index).selected = false;
      }

      for (var selectedIndex = 0; selectedIndex < selected.length; selectedIndex += 1) {
        var layerIndex = Number(selected[selectedIndex]);
        if (layerIndex >= 1 && layerIndex <= comp.numLayers) {
          comp.layer(layerIndex).selected = true;
        }
      }

      return ok({
        message: "Selected layers."
      });
    } catch (error) {
      return fail(error.message || String(error));
    }
  }

  function clearSelection(rawPayload) {
    parsePayload(rawPayload);

    try {
      var comp = requireComp();

      for (var index = 1; index <= comp.numLayers; index += 1) {
        comp.layer(index).selected = false;
      }

      return ok({
        message: "Cleared selection."
      });
    } catch (error) {
      return fail(error.message || String(error));
    }
  }

  function moveLayer(rawPayload) {
    var payload = parsePayload(rawPayload);

    try {
      var comp = requireComp();
      var layerIndex = Number(payload.layerIndex);
      var newInPoint = Number(payload.newInPoint);

      if (!layerIndex || layerIndex < 1 || layerIndex > comp.numLayers) {
        throw new Error("Layer not found.");
      }

      if (isNaN(newInPoint)) {
        throw new Error("Invalid layer time.");
      }

      var layer = comp.layer(layerIndex);
      if (layer.locked) {
        throw new Error("Layer is locked.");
      }

      var layerDuration = Math.max(0, layer.outPoint - layer.inPoint);
      var maxInPoint = Math.max(0, comp.duration - layerDuration);
      var clampedInPoint = Math.max(0, Math.min(newInPoint, maxInPoint));

      app.beginUndoGroup("Ripple Move Layer");
      moveLayerKeepingTrim(layer, clampedInPoint);
      for (var index = 1; index <= comp.numLayers; index += 1) {
        comp.layer(index).selected = false;
      }
      layer.selected = true;
      app.endUndoGroup();

      return ok({
        message: "Moved layer."
      });
    } catch (error) {
      try {
        app.endUndoGroup();
      } catch (undoError) {}
      return fail(error.message || String(error));
    }
  }

  function getClampedGroupDelta(comp, layers, requestedDelta) {
    var minDelta = -999999;
    var maxDelta = 999999;

    for (var index = 0; index < layers.length; index += 1) {
      minDelta = Math.max(minDelta, -layers[index].inPoint);
      maxDelta = Math.min(maxDelta, comp.duration - layers[index].outPoint);
    }

    return Math.max(minDelta, Math.min(maxDelta, requestedDelta));
  }

  function moveLayers(rawPayload) {
    var payload = parsePayload(rawPayload);

    try {
      var comp = requireComp();
      var layerIndices = payload.layerIndices || [];
      var requestedDelta = Number(payload.delta);
      var layers = [];

      if (isNaN(requestedDelta)) {
        throw new Error("Invalid move amount.");
      }

      for (var index = 0; index < layerIndices.length; index += 1) {
        var layerIndex = Number(layerIndices[index]);
        if (layerIndex >= 1 && layerIndex <= comp.numLayers) {
          var layer = comp.layer(layerIndex);
          if (!layer.locked && layer.outPoint > layer.inPoint) {
            layers.push(layer);
          }
        }
      }

      if (!layers.length) {
        throw new Error("No movable selected layers.");
      }

      var delta = getClampedGroupDelta(comp, layers, requestedDelta);

      app.beginUndoGroup("Ripple Move Layers");
      for (var clearIndex = 1; clearIndex <= comp.numLayers; clearIndex += 1) {
        comp.layer(clearIndex).selected = false;
      }

      for (var moveIndex = 0; moveIndex < layers.length; moveIndex += 1) {
        layers[moveIndex].startTime += delta;
        layers[moveIndex].selected = true;
      }
      app.endUndoGroup();

      return ok({
        message: "Moved " + layers.length + " layer(s)."
      });
    } catch (error) {
      try {
        app.endUndoGroup();
      } catch (undoError) {}
      return fail(error.message || String(error));
    }
  }

  function trimLayer(rawPayload) {
    var payload = parsePayload(rawPayload);

    try {
      var comp = requireComp();
      var layerIndex = Number(payload.layerIndex);
      var newInPoint = Number(payload.newInPoint);
      var newOutPoint = Number(payload.newOutPoint);
      var hasNewInPoint = !isNaN(newInPoint);
      var hasNewOutPoint = !isNaN(newOutPoint);
      var minimumDuration = 1 / Math.max(1, comp.frameRate || 30);

      if (!layerIndex || layerIndex < 1 || layerIndex > comp.numLayers) {
        throw new Error("Layer not found.");
      }

      if (!hasNewInPoint && !hasNewOutPoint) {
        throw new Error("Invalid trim time.");
      }

      var layer = comp.layer(layerIndex);
      if (layer.locked) {
        throw new Error("Layer is locked.");
      }

      app.beginUndoGroup("Ripple Trim Layer");

      if (hasNewInPoint) {
        layer.inPoint = Math.max(0, Math.min(newInPoint, layer.outPoint - minimumDuration));
      }

      if (hasNewOutPoint) {
        layer.outPoint = Math.max(layer.inPoint + minimumDuration, Math.min(newOutPoint, comp.duration));
      }

      for (var index = 1; index <= comp.numLayers; index += 1) {
        comp.layer(index).selected = false;
      }
      layer.selected = true;
      app.endUndoGroup();

      return ok({
        message: "Trimmed layer."
      });
    } catch (error) {
      try {
        app.endUndoGroup();
      } catch (undoError) {}
      return fail(error.message || String(error));
    }
  }

  function splitAtPlayhead(rawPayload) {
    parsePayload(rawPayload);

    try {
      var comp = requireComp();
      var selected = requireSelectedLayers(comp);
      var splitCount = 0;

      app.beginUndoGroup("Ripple Split At Playhead");
      for (var index = 0; index < selected.length; index += 1) {
        if (!selected[index].locked && splitLayerAtTime(selected[index], comp.time)) {
          splitCount += 1;
        }
      }
      app.endUndoGroup();

      return ok({
        message: splitCount ? "Split " + splitCount + " layer(s)." : "No selected layers crossed the playhead."
      });
    } catch (error) {
      try {
        app.endUndoGroup();
      } catch (undoError) {}
      return fail(error.message || String(error));
    }
  }

  function trimStartToPlayhead(rawPayload) {
    parsePayload(rawPayload);

    try {
      var comp = requireComp();
      var selected = requireSelectedLayers(comp);
      var trimCount = 0;

      app.beginUndoGroup("Ripple Trim Start To Playhead");
      for (var index = 0; index < selected.length; index += 1) {
        var layer = selected[index];
        if (!layer.locked && comp.time < layer.outPoint) {
          layer.inPoint = comp.time;
          trimCount += 1;
        }
      }
      app.endUndoGroup();

      return ok({
        message: trimCount ? "Trimmed " + trimCount + " layer start(s)." : "No selected layer starts were trimmed."
      });
    } catch (error) {
      try {
        app.endUndoGroup();
      } catch (undoError) {}
      return fail(error.message || String(error));
    }
  }

  function trimEndToPlayhead(rawPayload) {
    parsePayload(rawPayload);

    try {
      var comp = requireComp();
      var selected = requireSelectedLayers(comp);
      var trimCount = 0;

      app.beginUndoGroup("Ripple Trim End To Playhead");
      for (var index = 0; index < selected.length; index += 1) {
        var layer = selected[index];
        if (!layer.locked && comp.time > layer.inPoint) {
          layer.outPoint = comp.time;
          trimCount += 1;
        }
      }
      app.endUndoGroup();

      return ok({
        message: trimCount ? "Trimmed " + trimCount + " layer end(s)." : "No selected layer ends were trimmed."
      });
    } catch (error) {
      try {
        app.endUndoGroup();
      } catch (undoError) {}
      return fail(error.message || String(error));
    }
  }

  function setCompTime(rawPayload) {
    var payload = parsePayload(rawPayload);

    try {
      var comp = requireComp();
      var time = Number(payload.time);

      if (isNaN(time)) {
        throw new Error("Invalid playhead time.");
      }

      comp.time = Math.max(0, Math.min(comp.duration, time));

      return ok({
        message: "Moved playhead."
      });
    } catch (error) {
      return fail(error.message || String(error));
    }
  }

  function sortByInPoint(a, b) {
    if (a.inPoint === b.inPoint) {
      return a.index - b.index;
    }
    return a.inPoint - b.inPoint;
  }

  function moveLayerKeepingTrim(layer, newInPoint) {
    var delta = newInPoint - layer.inPoint;
    layer.startTime += delta;
  }

  function closeGaps(rawPayload) {
    parsePayload(rawPayload);

    try {
      var comp = requireComp();
      var layers = [];
      var current = 0;

      for (var index = comp.numLayers; index >= 1; index -= 1) {
        var layer = comp.layer(index);
        if (!layer.locked && layer.enabled && layer.outPoint > layer.inPoint) {
          layers.push(layer);
        }
      }

      layers.sort(sortByInPoint);

      app.beginUndoGroup("Ripple Close Gaps");
      for (var layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
        moveLayerKeepingTrim(layers[layerIndex], current);
        current += layers[layerIndex].outPoint - layers[layerIndex].inPoint;
      }
      app.endUndoGroup();

      return ok({
        message: layers.length ? "Closed gaps across " + layers.length + " layer(s)." : "No eligible layers to close."
      });
    } catch (error) {
      try {
        app.endUndoGroup();
      } catch (undoError) {}
      return fail(error.message || String(error));
    }
  }

  function sequenceSelected(rawPayload) {
    parsePayload(rawPayload);

    try {
      var comp = requireComp();
      var selected = requireSelectedLayers(comp);
      var current = comp.time;
      var layers = [];

      for (var index = 0; index < selected.length; index += 1) {
        if (!selected[index].locked && selected[index].outPoint > selected[index].inPoint) {
          layers.push(selected[index]);
        }
      }

      layers.sort(sortByInPoint);

      app.beginUndoGroup("Ripple Sequence Selected");
      for (var layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
        moveLayerKeepingTrim(layers[layerIndex], current);
        current += layers[layerIndex].outPoint - layers[layerIndex].inPoint;
      }
      app.endUndoGroup();

      return ok({
        message: layers.length ? "Sequenced " + layers.length + " selected layer(s)." : "No eligible selected layers."
      });
    } catch (error) {
      try {
        app.endUndoGroup();
      } catch (undoError) {}
      return fail(error.message || String(error));
    }
  }

  return {
    getTimelineSnapshot: getTimelineSnapshot,
    selectLayer: selectLayer,
    selectLayers: selectLayers,
    clearSelection: clearSelection,
    moveLayer: moveLayer,
    moveLayers: moveLayers,
    trimLayer: trimLayer,
    setCompTime: setCompTime,
    splitAtPlayhead: splitAtPlayhead,
    trimStartToPlayhead: trimStartToPlayhead,
    trimEndToPlayhead: trimEndToPlayhead,
    closeGaps: closeGaps,
    sequenceSelected: sequenceSelected
  };
})();
