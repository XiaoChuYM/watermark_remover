const imageInput = document.querySelector("#image-input");
const editorCanvas = document.querySelector("#editor-canvas");
const resultCanvas = document.querySelector("#result-canvas");
const clearMaskButton = document.querySelector("#clear-mask");
const runButton = document.querySelector("#run-inpaint");
const downloadButton = document.querySelector("#download-result");
const togglePreviewButton = document.querySelector("#toggle-preview");
const brushSizeInput = document.querySelector("#brush-size");
const radiusInput = document.querySelector("#radius");
const brushSizeValue = document.querySelector("#brush-size-value");
const radiusValue = document.querySelector("#radius-value");
const imageMeta = document.querySelector("#image-meta");
const resultMeta = document.querySelector("#result-meta");
const viewerTitle = document.querySelector("#viewer-title");
const engineStatus = document.querySelector("#opencv-status");
const hintText = document.querySelector("#hint-text");
const editorShell = document.querySelector("#editor-shell");
const editorEmptyState = document.querySelector("#editor-empty-state");
const brushIndicator = document.querySelector("#brush-indicator");
const wipeHighlight = document.querySelector("#wipe-highlight");

const editorCtx = editorCanvas.getContext("2d");
const resultCtx = resultCanvas.getContext("2d");
const offscreenCanvas = document.createElement("canvas");
const offscreenCtx = offscreenCanvas.getContext("2d");
const maskCanvas = document.createElement("canvas");
const maskCtx = maskCanvas.getContext("2d");

const state = { isEngineReady: true, isDrawing: false, hasImage: false, hasResult: false, displayScale: 1, brushSize: 24, repairRadius: 5, previewMode: "before" };
function setCanRun() {
  runButton.disabled = !(state.isEngineReady && state.hasImage);
  downloadButton.disabled = !state.hasResult;
  togglePreviewButton.disabled = !state.hasResult;
}
function updateEmptyStates() { editorEmptyState.classList.toggle("hidden", state.hasImage); }
function syncControlLabels() { brushSizeValue.textContent = `${state.brushSize} px`; radiusValue.textContent = `${state.repairRadius}`; }
function fitCanvas(width, height, maxWidth = 760, maxHeight = 760) { const scale = Math.min(maxWidth / width, maxHeight / height, 1); return { width: Math.round(width * scale), height: Math.round(height * scale) }; }

function redrawEditor() {
  if (!state.hasImage) { updateEmptyStates(); return; }
  editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
  editorCtx.drawImage(offscreenCanvas, 0, 0, editorCanvas.width, editorCanvas.height);
  editorCtx.save();
  editorCtx.globalAlpha = 0.36;
  editorCtx.drawImage(maskCanvas, 0, 0, editorCanvas.width, editorCanvas.height);
  editorCtx.restore();
  updateEmptyStates();
}

function resetResultCanvas() {
  resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
  resultMeta.textContent = "等待处理";
  state.hasResult = false;
  state.previewMode = "before";
  resultCanvas.classList.remove("visible", "animating");
  wipeHighlight.classList.remove("animating");
  viewerTitle.textContent = "原图与遮罩";
  togglePreviewButton.textContent = "查看处理后";
  setCanRun();
}

function prepareCanvases(img) {
  const maxImageEdge = 1600;
  const sourceScale = Math.min(maxImageEdge / img.width, maxImageEdge / img.height, 1);
  const width = Math.round(img.width * sourceScale);
  const height = Math.round(img.height * sourceScale);
  offscreenCanvas.width = width;
  offscreenCanvas.height = height;
  offscreenCtx.clearRect(0, 0, width, height);
  offscreenCtx.drawImage(img, 0, 0, width, height);
  maskCanvas.width = width;
  maskCanvas.height = height;
  maskCtx.clearRect(0, 0, width, height);
  maskCtx.fillStyle = "#ff4d4f";
  maskCtx.strokeStyle = "#ff4d4f";
  maskCtx.lineCap = "round";
  maskCtx.lineJoin = "round";
  const fitted = fitCanvas(width, height);
  state.displayScale = width / fitted.width;
  editorCanvas.width = fitted.width;
  editorCanvas.height = fitted.height;
  resultCanvas.width = fitted.width;
  resultCanvas.height = fitted.height;
  state.hasImage = true;
  redrawEditor();
  requestAnimationFrame(redrawEditor);
  resetResultCanvas();
  imageMeta.textContent = `${width} × ${height}`;
  setCanRun();
}

function setPreviewMode(mode) {
  state.previewMode = mode;
  const showAfter = mode === "after";
  resultCanvas.classList.toggle("visible", showAfter);
  viewerTitle.textContent = showAfter ? "处理后预览" : "原图与遮罩";
  togglePreviewButton.textContent = showAfter ? "查看原图" : "查看处理后";
}

function playRevealAnimation() {
  resultCanvas.classList.remove("visible", "animating");
  wipeHighlight.classList.remove("animating");
  void resultCanvas.offsetWidth;
  resultCanvas.classList.add("visible", "animating");
  wipeHighlight.classList.add("animating");
  state.previewMode = "after";
  viewerTitle.textContent = "处理后预览";
  togglePreviewButton.textContent = "查看原图";
  window.setTimeout(() => {
    resultCanvas.classList.remove("animating");
    wipeHighlight.classList.remove("animating");
  }, 760);
}

function getCanvasPoint(event) {
  const rect = editorCanvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * (editorCanvas.width / rect.width), y: (event.clientY - rect.top) * (editorCanvas.height / rect.height) };
}

function drawToMask(from, to) {
  const scale = state.displayScale;
  maskCtx.lineWidth = state.brushSize * scale;
  maskCtx.beginPath();
  maskCtx.moveTo(from.x * scale, from.y * scale);
  maskCtx.lineTo(to.x * scale, to.y * scale);
  maskCtx.stroke();
  maskCtx.beginPath();
  maskCtx.arc(to.x * scale, to.y * scale, (state.brushSize * scale) / 2, 0, Math.PI * 2);
  maskCtx.fill();
  redrawEditor();
}

function setBrushIndicatorVisible(visible) { brushIndicator.classList.toggle("visible", visible && state.hasImage); }
function updateBrushIndicator(event) {
  if (!state.hasImage) { setBrushIndicatorVisible(false); return; }
  const rect = editorShell.getBoundingClientRect();
  brushIndicator.style.width = `${state.brushSize}px`;
  brushIndicator.style.height = `${state.brushSize}px`;
  brushIndicator.style.left = `${event.clientX - rect.left}px`;
  brushIndicator.style.top = `${event.clientY - rect.top}px`;
  setBrushIndicatorVisible(true);
}

function getMaskFlags(maskData) {
  const flags = new Uint8Array(maskCanvas.width * maskCanvas.height);
  let count = 0;
  for (let i = 0, j = 0; i < maskData.data.length; i += 4, j += 1) {
    const masked = maskData.data[i + 3] > 0 ? 1 : 0;
    flags[j] = masked;
    count += masked;
  }
  return { flags, count };
}

function dilateMask(maskFlags, width, height, radius) {
  let current = maskFlags;
  for (let step = 0; step < radius; step += 1) {
    const next = current.slice();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (current[index]) continue;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (current[ny * width + nx]) { next[index] = 1; dx = 2; dy = 2; }
          }
        }
      }
    }
    current = next;
  }
  return current;
}

function averageNeighbors(data, known, width, height, x, y, radius) {
  let r = 0, g = 0, b = 0, count = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const idx = ny * width + nx;
      if (!known[idx]) continue;
      const p = idx * 4;
      r += data[p]; g += data[p + 1]; b += data[p + 2]; count += 1;
    }
  }
  return count ? [Math.round(r / count), Math.round(g / count), Math.round(b / count)] : null;
}

function diffuseFill(imageData, maskFlags, width, height, radius) {
  const result = new Uint8ClampedArray(imageData.data);
  const known = new Uint8Array(width * height);
  for (let i = 0; i < maskFlags.length; i += 1) known[i] = maskFlags[i] ? 0 : 1;
  const maxIterations = Math.max(24, radius * 18);
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let changed = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (known[index]) continue;
        const avg = averageNeighbors(result, known, width, height, x, y, Math.max(1, radius));
        if (!avg) continue;
        const p = index * 4;
        result[p] = avg[0]; result[p + 1] = avg[1]; result[p + 2] = avg[2]; result[p + 3] = 255;
        known[index] = 1;
        changed += 1;
      }
    }
    if (!changed) break;
  }
  return result;
}

function blurMaskedEdge(data, maskFlags, width, height, passes) {
  let current = data;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Uint8ClampedArray(current);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        if (!maskFlags[index]) continue;
        let r = 0, g = 0, b = 0, count = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const p = ((y + dy) * width + (x + dx)) * 4;
            r += current[p]; g += current[p + 1]; b += current[p + 2]; count += 1;
          }
        }
        const base = index * 4;
        next[base] = Math.round(r / count); next[base + 1] = Math.round(g / count); next[base + 2] = Math.round(b / count);
      }
    }
    current = next;
  }
  return current;
}

function runRepair() {
  if (!(state.isEngineReady && state.hasImage)) return;
  hintText.textContent = "处理中，请稍等。当前版本是本地轻量修补算法，适合小面积水印。";
  setDebugText("开始本地修补");
  runButton.disabled = true;
  requestAnimationFrame(() => {
    try {
      const source = offscreenCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      const mask = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
      const width = offscreenCanvas.width;
      const height = offscreenCanvas.height;
      const { flags, count } = getMaskFlags(mask);
      if (!count) throw new Error("请先涂抹需要修补的水印区域");
      const expandedMask = dilateMask(flags, width, height, Math.max(1, Math.floor(state.repairRadius / 2)));
      const repaired = diffuseFill(source, expandedMask, width, height, state.repairRadius);
      const smoothed = blurMaskedEdge(repaired, expandedMask, width, height, Math.max(1, Math.floor(state.repairRadius / 3)));
      const resultImageData = new ImageData(smoothed, width, height);
      const renderCanvas = document.createElement("canvas");
      renderCanvas.width = width;
      renderCanvas.height = height;
      renderCanvas.getContext("2d").putImageData(resultImageData, 0, 0);
      resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
      resultCtx.drawImage(renderCanvas, 0, 0, resultCanvas.width, resultCanvas.height);
      state.hasResult = true;
      resultMeta.textContent = `已完成 · 遮罩像素 ${count}`;
      hintText.textContent = "处理完成。复杂背景会有限制，尽量缩小涂抹范围可提升效果。";
      playRevealAnimation();
      setCanRun();
    } catch (error) {
      state.hasResult = false;
      resultMeta.textContent = "处理失败";
      hintText.textContent = `处理失败：${error?.message || "未知异常"}`;
      setCanRun();
    } finally {
      runButton.disabled = !(state.isEngineReady && state.hasImage);
      downloadButton.disabled = !state.hasResult;
    }
  });
}

function handleImageUpload(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    prepareCanvases(img);
    hintText.textContent = "开始在左侧图片上涂抹水印区域。";
    URL.revokeObjectURL(url);
  };
  img.onerror = () => {
    hintText.textContent = "图片加载失败，请换一张图再试。";
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function getFirstFileFromDataTransfer(dataTransfer) {
  if (!dataTransfer?.files?.length) return null;
  const file = dataTransfer.files[0];
  return file && file.type.startsWith("image/") ? file : null;
}

function bindUploadTarget(element) {
  ["dragenter", "dragover"].forEach((name) => {
    element.addEventListener(name, (event) => { event.preventDefault(); element.classList.add("drag-over"); });
  });
  ["dragleave", "dragend", "drop"].forEach((name) => {
    element.addEventListener(name, () => element.classList.remove("drag-over"));
  });
  element.addEventListener("drop", (event) => {
    event.preventDefault();
    const file = getFirstFileFromDataTransfer(event.dataTransfer);
    if (file) handleImageUpload(file);
  });
  element.addEventListener("click", () => { if (!state.hasImage) imageInput.click(); });
}

let lastPoint = null;
editorCanvas.addEventListener("pointerdown", (event) => {
  if (!state.hasImage) return;
  state.isDrawing = true;
  updateBrushIndicator(event);
  lastPoint = getCanvasPoint(event);
  drawToMask(lastPoint, lastPoint);
});
editorCanvas.addEventListener("pointermove", (event) => {
  if (!state.isDrawing || !lastPoint) { updateBrushIndicator(event); return; }
  updateBrushIndicator(event);
  const currentPoint = getCanvasPoint(event);
  drawToMask(lastPoint, currentPoint);
  lastPoint = currentPoint;
});
editorCanvas.addEventListener("pointerenter", (event) => updateBrushIndicator(event));
editorCanvas.addEventListener("pointerleave", () => setBrushIndicatorVisible(false));
["pointerup", "pointercancel"].forEach((name) => {
  editorCanvas.addEventListener(name, () => { state.isDrawing = false; lastPoint = null; });
});

imageInput.addEventListener("change", (event) => { handleImageUpload(event.target.files?.[0]); imageInput.value = ""; });
clearMaskButton.addEventListener("click", () => {
  if (!state.hasImage) return;
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  redrawEditor();
  resetResultCanvas();
});
runButton.addEventListener("click", runRepair);
downloadButton.addEventListener("click", () => {
  if (!state.hasResult) return;
  const link = document.createElement("a");
  link.download = `inpainted-${Date.now()}.png`;
  link.href = resultCanvas.toDataURL("image/png");
  link.click();
});
brushSizeInput.addEventListener("input", () => { state.brushSize = Number(brushSizeInput.value); syncControlLabels(); });
radiusInput.addEventListener("input", () => { state.repairRadius = Number(radiusInput.value); syncControlLabels(); });

bindUploadTarget(editorShell);
syncControlLabels();
engineStatus.textContent = "已就绪";
hintText.textContent = "上传图片后，在图上涂抹需要去除的区域。";
togglePreviewButton.addEventListener("click", () => {
  if (!state.hasResult) return;
  setPreviewMode(state.previewMode === "after" ? "before" : "after");
});
updateEmptyStates();
setCanRun();
