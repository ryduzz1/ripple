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
    splitAtPlayhead: splitAtPlayhead,
    trimStartToPlayhead: trimStartToPlayhead,
    trimEndToPlayhead: trimEndToPlayhead,
    closeGaps: closeGaps,
    sequenceSelected: sequenceSelected
  };
})();
