const imageInput = document.querySelector("#image-input");
const editorCanvas = document.querySelector("#editor-canvas");
const resultCanvas = document.querySelector("#result-canvas");
const clearMaskButton = document.querySelector("#clear-mask");
const runButton = document.querySelector("#run-inpaint");
const downloadButton = document.querySelector("#download-result");
const brushSizeInput = document.querySelector("#brush-size");
const radiusInput = document.querySelector("#radius");
const brushSizeValue = document.querySelector("#brush-size-value");
const radiusValue = document.querySelector("#radius-value");
const imageMeta = document.querySelector("#image-meta");
const resultMeta = document.querySelector("#result-meta");
const opencvStatus = document.querySelector("#opencv-status");
const hintText = document.querySelector("#hint-text");
const debugText = document.querySelector("#debug-text");
const editorShell = document.querySelector("#editor-shell");
const resultShell = document.querySelector("#result-shell");
const editorEmptyState = document.querySelector("#editor-empty-state");
const resultEmptyState = document.querySelector("#result-empty-state");
const brushIndicator = document.querySelector("#brush-indicator");

const editorCtx = editorCanvas.getContext("2d");
const resultCtx = resultCanvas.getContext("2d");
const offscreenCanvas = document.createElement("canvas");
const offscreenCtx = offscreenCanvas.getContext("2d");
const maskCanvas = document.createElement("canvas");
const maskCtx = maskCanvas.getContext("2d");

const state = {
  isEngineReady: true,
  isDrawing: false,
  hasImage: false,
  hasResult: false,
  displayScale: 1,
  imageWidth: 0,
  imageHeight: 0,
  brushSize: Number(brushSizeInput.value),
  repairRadius: Number(radiusInput.value)
};

function updateEngineStatus(kind, text) {
  opencvStatus.className = `status-pill ${kind}`;
  opencvStatus.textContent = text;
}

function syncControlLabels() {
  brushSizeValue.textContent = `${state.brushSize} px`;
  radiusValue.textContent = `${state.repairRadius}`;
}

function setDebugText(text) {
  debugText.textContent = `调试信息：${text}`;
}

function setCanRun() {
  runButton.disabled = !(state.isEngineReady && state.hasImage);
  downloadButton.disabled = !state.hasResult;
}

function updateEmptyStates() {
  editorEmptyState.classList.toggle("hidden", state.hasImage);
  resultEmptyState.classList.toggle("hidden", state.hasImage || state.hasResult);
}

function fitCanvas(width, height, maxWidth = 760, maxHeight = 760) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    scale
  };
}

function redrawEditor() {
  if (!state.hasImage) {
    updateEmptyStates();
    return;
  }

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
  updateEmptyStates();
  setCanRun();
}

function prepareCanvases(img) {
  const maxImageEdge = 1600;
  const sourceScale = Math.min(maxImageEdge / img.width, maxImageEdge / img.height, 1);
  const sourceWidth = Math.round(img.width * sourceScale);
  const sourceHeight = Math.round(img.height * sourceScale);

  state.imageWidth = sourceWidth;
  state.imageHeight = sourceHeight;

  offscreenCanvas.width = sourceWidth;
  offscreenCanvas.height = sourceHeight;
  offscreenCtx.clearRect(0, 0, sourceWidth, sourceHeight);
  offscreenCtx.drawImage(img, 0, 0, sourceWidth, sourceHeight);

  maskCanvas.width = sourceWidth;
  maskCanvas.height = sourceHeight;
  maskCtx.clearRect(0, 0, sourceWidth, sourceHeight);
  maskCtx.fillStyle = "#ff4d4f";
  maskCtx.strokeStyle = "#ff4d4f";
  maskCtx.lineCap = "round";
  maskCtx.lineJoin = "round";

  const fitted = fitCanvas(sourceWidth, sourceHeight);
  state.displayScale = sourceWidth / fitted.width;

  editorCanvas.width = fitted.width;
  editorCanvas.height = fitted.height;
  resultCanvas.width = fitted.width;
  resultCanvas.height = fitted.height;

  redrawEditor();
  requestAnimationFrame(redrawEditor);
  resetResultCanvas();

  state.hasImage = true;
  imageMeta.textContent = `${sourceWidth} × ${sourceHeight}`;
  updateEmptyStates();
  setCanRun();
}

function getCanvasPoint(event) {
  const rect = editorCanvas.getBoundingClientRect();
  const scaleX = editorCanvas.width / rect.width;
  const scaleY = editorCanvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function drawToMask(from, to) {
  const maskFrom = {
    x: from.x * state.displayScale,
    y: from.y * state.displayScale
  };
  const maskTo = {
    x: to.x * state.displayScale,
    y: to.y * state.displayScale
  };

  maskCtx.lineWidth = state.brushSize * state.displayScale;
  maskCtx.beginPath();
  maskCtx.moveTo(maskFrom.x, maskFrom.y);
  maskCtx.lineTo(maskTo.x, maskTo.y);
  maskCtx.stroke();

  maskCtx.beginPath();
  maskCtx.arc(maskTo.x, maskTo.y, (state.brushSize * state.displayScale) / 2, 0, Math.PI * 2);
  maskCtx.fill();

  redrawEditor();
}

function clearMask() {
  if (!state.hasImage) {
    return;
  }
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  redrawEditor();
  resetResultCanvas();
  setDebugText("遮罩已清空");
}

function setBrushIndicatorVisible(visible) {
  brushIndicator.classList.toggle("visible", visible && state.hasImage);
}

function updateBrushIndicator(event) {
  if (!state.hasImage) {
    setBrushIndicatorVisible(false);
    return;
  }

  const rect = editorShell.getBoundingClientRect();
  brushIndicator.style.width = `${state.brushSize}px`;
  brushIndicator.style.height = `${state.brushSize}px`;
  brushIndicator.style.left = `${event.clientX - rect.left}px`;
  brushIndicator.style.top = `${event.clientY - rect.top}px`;
  setBrushIndicatorVisible(true);
}

function getFirstFileFromDataTransfer(dataTransfer) {
  if (!dataTransfer?.files?.length) {
    return null;
  }
  const file = dataTransfer.files[0];
  return file && file.type.startsWith("image/") ? file : null;
}

function bindUploadTarget(element) {
  ["dragenter", "dragover"].forEach((eventName) => {
    element.addEventListener(eventName, (event) => {
      event.preventDefault();
      element.classList.add("drag-over");
    });
  });

  ["dragleave", "dragend", "drop"].forEach((eventName) => {
    element.addEventListener(eventName, () => {
      element.classList.remove("drag-over");
    });
  });

  element.addEventListener("drop", (event) => {
    event.preventDefault();
    const file = getFirstFileFromDataTransfer(event.dataTransfer);
    if (file) {
      handleImageUpload(file);
    }
  });

  element.addEventListener("click", () => {
    if (!state.hasImage) {
      imageInput.click();
    }
  });
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
  if (radius <= 0) {
    return maskFlags;
  }

  let current = maskFlags;
  for (let step = 0; step < radius; step += 1) {
    const next = current.slice();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (current[index]) {
          continue;
        }
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) {
              continue;
            }
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              continue;
            }
            if (current[ny * width + nx]) {
              next[index] = 1;
              dx = 2;
              dy = 2;
            }
          }
        }
      }
    }
    current = next;
  }
  return current;
}

function averageNeighbors(data, known, width, height, x, y, radius) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      const neighborIndex = ny * width + nx;
      if (!known[neighborIndex]) {
        continue;
      }
      const pixelIndex = neighborIndex * 4;
      r += data[pixelIndex];
      g += data[pixelIndex + 1];
      b += data[pixelIndex + 2];
      count += 1;
    }
  }

  if (count === 0) {
    return null;
  }

  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

function diffuseFill(imageData, maskFlags, width, height, radius) {
  const result = new Uint8ClampedArray(imageData.data);
  const known = new Uint8Array(width * height);

  for (let i = 0; i < maskFlags.length; i += 1) {
    known[i] = maskFlags[i] ? 0 : 1;
  }

  const maxIterations = Math.max(24, radius * 18);
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let changed = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (known[index]) {
          continue;
        }
        const averaged = averageNeighbors(result, known, width, height, x, y, Math.max(1, radius));
        if (!averaged) {
          continue;
        }
        const pixelIndex = index * 4;
        result[pixelIndex] = averaged[0];
        result[pixelIndex + 1] = averaged[1];
        result[pixelIndex + 2] = averaged[2];
        result[pixelIndex + 3] = 255;
        known[index] = 1;
        changed += 1;
      }
    }
    if (changed === 0) {
      break;
    }
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
        if (!maskFlags[index]) {
          continue;
        }
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const neighbor = ((y + dy) * width + (x + dx)) * 4;
            r += current[neighbor];
            g += current[neighbor + 1];
            b += current[neighbor + 2];
            count += 1;
          }
        }
        const pixelIndex = index * 4;
        next[pixelIndex] = Math.round(r / count);
        next[pixelIndex + 1] = Math.round(g / count);
        next[pixelIndex + 2] = Math.round(b / count);
      }
    }
    current = next;
  }
  return current;
}

function runRepair() {
  if (!(state.isEngineReady && state.hasImage)) {
    return;
  }

  hintText.textContent = "处理中，请稍等。当前版本是本地轻量修补算法，适合小面积水印。";
  setDebugText("开始本地修补");
  runButton.disabled = true;

  requestAnimationFrame(() => {
    try {
      const sourceImageData = offscreenCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      const maskImageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
      const width = offscreenCanvas.width;
      const height = offscreenCanvas.height;
      const { flags, count } = getMaskFlags(maskImageData);

      if (count === 0) {
        throw new Error("请先涂抹需要修补的水印区域");
      }

      const maskRadius = Math.max(1, Math.floor(state.repairRadius / 2));
      const expandedMask = dilateMask(flags, width, height, maskRadius);
      const repaired = diffuseFill(sourceImageData, expandedMask, width, height, state.repairRadius);
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
      updateEmptyStates();
      hintText.textContent = "处理完成。复杂背景会有限制，尽量缩小涂抹范围可提升效果。";
      setDebugText(`处理成功，遮罩像素 ${count}`);
      setCanRun();
    } catch (error) {
      console.error(error);
      state.hasResult = false;
      resultMeta.textContent = "处理失败";
      hintText.textContent = `处理失败：${error?.message || "未知异常"}`;
      setDebugText(error?.stack || error?.message || "未知异常");
      setCanRun();
    } finally {
      runButton.disabled = !(state.isEngineReady && state.hasImage);
      downloadButton.disabled = !state.hasResult;
    }
  });
}

function downloadResult() {
  if (!state.hasResult) {
    return;
  }

  const link = document.createElement("a");
  link.download = `inpainted-${Date.now()}.png`;
  link.href = resultCanvas.toDataURL("image/png");
  link.click();
}

function handleImageUpload(file) {
  if (!file) {
    return;
  }

  const img = new Image();
  img.onload = () => {
    prepareCanvases(img);
    hintText.textContent = "开始在左侧图片上涂抹水印区域。";
    setDebugText(`图片已加载，原始尺寸 ${img.width}x${img.height}`);
    URL.revokeObjectURL(img.src);
  };
  img.onerror = () => {
    hintText.textContent = "图片加载失败，请换一张图再试。";
    setDebugText("图片加载失败");
  };
  img.src = URL.createObjectURL(file);
}

let lastPoint = null;

editorCanvas.addEventListener("pointerdown", (event) => {
  if (!state.hasImage) {
    return;
  }
  state.isDrawing = true;
  updateBrushIndicator(event);
  lastPoint = getCanvasPoint(event);
  drawToMask(lastPoint, lastPoint);
});

editorCanvas.addEventListener("pointermove", (event) => {
  if (!state.isDrawing || !lastPoint) {
    updateBrushIndicator(event);
    return;
  }
  updateBrushIndicator(event);
  const currentPoint = getCanvasPoint(event);
  drawToMask(lastPoint, currentPoint);
  lastPoint = currentPoint;
});

["pointerup", "pointerleave", "pointercancel"].forEach((name) => {
  editorCanvas.addEventListener(name, () => {
    state.isDrawing = false;
    lastPoint = null;
    if (name !== "pointerup") {
      setBrushIndicatorVisible(false);
    }
  });
});

editorCanvas.addEventListener("pointerenter", (event) => {
  updateBrushIndicator(event);
});

editorCanvas.addEventListener("pointerleave", () => {
  setBrushIndicatorVisible(false);
});

imageInput.addEventListener("change", (event) => {
  handleImageUpload(event.target.files?.[0]);
  imageInput.value = "";
});

clearMaskButton.addEventListener("click", clearMask);
runButton.addEventListener("click", runRepair);
downloadButton.addEventListener("click", downloadResult);

brushSizeInput.addEventListener("input", () => {
  state.brushSize = Number(brushSizeInput.value);
  syncControlLabels();
});

radiusInput.addEventListener("input", () => {
  state.repairRadius = Number(radiusInput.value);
  syncControlLabels();
});

bindUploadTarget(editorShell);
bindUploadTarget(resultShell);
syncControlLabels();
updateEngineStatus("ready", "本地修补引擎已就绪");
hintText.textContent = "当前版本不依赖 OpenCV，图片只在浏览器本地处理。";
setDebugText("本地修补引擎初始化完成");
updateEmptyStates();
setCanRun();
