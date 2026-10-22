"""
Interactive Simulation & Curriculum Generator for Sorting and Search Algorithms.
Used by both autonomous AI role tools and manual authoring scripts.
"""
import json

ALGO_JS_LOGIC = {
    "bubble": """
      const n = a.length;
      for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < n - i - 1; j++) {
          generated.push({
            type: "compare",
            indices: [j, j + 1],
            array: [...a],
            narration: `Comparing adjacent elements: a[${j}]=${a[j]} and a[${j+1}]=${a[j+1]}`
          });
          if (a[j] > a[j + 1]) {
            let tmp = a[j]; a[j] = a[j + 1]; a[j + 1] = tmp;
            generated.push({
              type: "swap",
              indices: [j, j + 1],
              array: [...a],
              narration: `Swapped ${a[j+1]} and ${a[j]} because ${a[j+1]} > ${a[j]}`
            });
          }
        }
        generated.push({
          type: "mark_sorted",
          indices: [n - i - 1],
          array: [...a],
          narration: `Element ${a[n - i - 1]} at index ${n - i - 1} is locked into its final sorted position`
        });
      }
      generated.push({
        type: "mark_sorted",
        indices: [0],
        array: [...a],
        narration: `Bubble sort complete! All elements sorted.`
      });
    """,
    "selection": """
      const n = a.length;
      for (let i = 0; i < n - 1; i++) {
        let minIdx = i;
        generated.push({
          type: "pivot",
          indices: [i],
          array: [...a],
          narration: `Pass ${i+1}: Scanning for smallest element starting at index ${i} (value ${a[i]})`
        });
        for (let j = i + 1; j < n; j++) {
          generated.push({
            type: "compare",
            indices: [minIdx, j],
            array: [...a],
            narration: `Comparing current min a[${minIdx}]=${a[minIdx]} with a[${j}]=${a[j]}`
          });
          if (a[j] < a[minIdx]) {
            minIdx = j;
            generated.push({
              type: "pivot",
              indices: [minIdx],
              array: [...a],
              narration: `New minimum value ${a[minIdx]} found at index ${minIdx}!`
            });
          }
        }
        if (minIdx !== i) {
          let tmp = a[i]; a[i] = a[minIdx]; a[minIdx] = tmp;
          generated.push({
            type: "swap",
            indices: [i, minIdx],
            array: [...a],
            narration: `Swapped minimum element ${a[i]} into its sorted position at index ${i}`
          });
        }
        generated.push({
          type: "mark_sorted",
          indices: [i],
          array: [...a],
          narration: `Index ${i} (value ${a[i]}) is placed into sorted prefix.`
        });
      }
      generated.push({
        type: "mark_sorted",
        indices: [a.length - 1],
        array: [...a],
        narration: `Selection sort complete! All elements placed.`
      });
    """,
    "insertion": """
      const n = a.length;
      generated.push({
        type: "mark_sorted",
        indices: [0],
        array: [...a],
        narration: `Single element a[0]=${a[0]} is trivially sorted.`
      });
      for (let i = 1; i < n; i++) {
        let key = a[i];
        let j = i - 1;
        generated.push({
          type: "pivot",
          indices: [i],
          array: [...a],
          narration: `Selected key = ${key} at index ${i} to insert into sorted prefix [0..${i-1}]`
        });
        while (j >= 0) {
          generated.push({
            type: "compare",
            indices: [j, j + 1],
            array: [...a],
            narration: `Comparing key (${key}) with a[${j}]=${a[j]}`
          });
          if (a[j] > key) {
            a[j + 1] = a[j];
            generated.push({
              type: "swap",
              indices: [j, j + 1],
              array: [...a],
              narration: `Shifted element ${a[j+1]} right to index ${j + 1}`
            });
            j--;
          } else {
            break;
          }
        }
        a[j + 1] = key;
        generated.push({
          type: "swap",
          indices: [j + 1],
          array: [...a],
          narration: `Inserted key ${key} at index ${j + 1}`
        });
        for (let k = 0; k <= i; k++) {
          generated.push({
            type: "mark_sorted",
            indices: [k],
            array: [...a],
            narration: `Sorted prefix now covers indices 0 through ${i}`
          });
        }
      }
    """,
    "merge": """
      function mergeSortHelper(arr, start, end) {
        if (start >= end) return;
        const mid = Math.floor((start + end) / 2);
        mergeSortHelper(arr, start, mid);
        mergeSortHelper(arr, mid + 1, end);
        merge(arr, start, mid, end);
      }
      function merge(arr, start, mid, end) {
        let left = arr.slice(start, mid + 1);
        let right = arr.slice(mid + 1, end + 1);
        let i = 0, j = 0, k = start;
        generated.push({
          type: "pivot",
          indices: Array.from({ length: end - start + 1 }, (_, idx) => start + idx),
          array: [...arr],
          narration: `Merging subarrays: [${start}..${mid}] and [${mid+1}..${end}]`
        });
        while (i < left.length && j < right.length) {
          generated.push({
            type: "compare",
            indices: [start + i, mid + 1 + j],
            array: [...arr],
            narration: `Comparing left element ${left[i]} with right element ${right[j]}`
          });
          if (left[i] <= right[j]) {
            arr[k] = left[i];
            i++;
          } else {
            arr[k] = right[j];
            j++;
          }
          generated.push({
            type: "swap",
            indices: [k],
            array: [...arr],
            narration: `Placed ${arr[k]} into merged target position ${k}`
          });
          k++;
        }
        while (i < left.length) {
          arr[k] = left[i];
          generated.push({
            type: "swap",
            indices: [k],
            array: [...arr],
            narration: `Flushed remaining left element ${left[i]} into index ${k}`
          });
          i++; k++;
        }
        while (j < right.length) {
          arr[k] = right[j];
          generated.push({
            type: "swap",
            indices: [k],
            array: [...arr],
            narration: `Flushed remaining right element ${right[j]} into index ${k}`
          });
          j++; k++;
        }
        for (let idx = start; idx <= end; idx++) {
          generated.push({
            type: "mark_sorted",
            indices: [idx],
            array: [...arr],
            narration: `Merged range [${start}..${end}] is sorted.`
          });
        }
      }
      mergeSortHelper(a, 0, a.length - 1);
    """,
    "quick": """
      function quickSortHelper(arr, low, high) {
        if (low < high) {
          let pi = partition(arr, low, high);
          quickSortHelper(arr, low, pi - 1);
          quickSortHelper(arr, pi + 1, high);
        } else if (low === high) {
          generated.push({
            type: "mark_sorted",
            indices: [low],
            array: [...arr],
            narration: `Single element ${arr[low]} at index ${low} is sorted.`
          });
        }
      }
      function partition(arr, low, high) {
        let pivot = arr[high];
        generated.push({
          type: "pivot",
          indices: [high],
          array: [...arr],
          narration: `Selected pivot = ${pivot} at index ${high} for range [${low}..${high}]`
        });
        let i = low - 1;
        for (let j = low; j < high; j++) {
          generated.push({
            type: "compare",
            indices: [j, high],
            array: [...arr],
            narration: `Comparing arr[${j}]=${arr[j]} with pivot ${pivot}`
          });
          if (arr[j] < pivot) {
            i++;
            let tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
            generated.push({
              type: "swap",
              indices: [i, j],
              array: [...arr],
              narration: `Element ${arr[i]} < pivot; moved to smaller partition at index ${i}`
            });
          }
        }
        let tmp = arr[i + 1]; arr[i + 1] = arr[high]; arr[high] = tmp;
        generated.push({
          type: "swap",
          indices: [i + 1, high],
          array: [...arr],
          narration: `Placed pivot ${pivot} into its exact partition index ${i + 1}`
        });
        generated.push({
          type: "mark_sorted",
          indices: [i + 1],
          array: [...arr],
          narration: `Pivot ${pivot} is locked into its permanent sorted index ${i + 1}`
        });
        return i + 1;
      }
      quickSortHelper(a, 0, a.length - 1);
    """
}

TEMPLATE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>__ALGO_NAME__ Visualizer</title>
<style>
  :root {
    --bg-main: #0b0f19;
    --bg-card: #111827;
    --bg-toolbar: #1e293b;
    --text-primary: #f8fafc;
    --text-muted: #94a3b8;
    --accent: #38bdf8;
    --accent-glow: rgba(56, 189, 248, 0.35);
    --compare: #f59e0b;
    --compare-glow: rgba(245, 158, 11, 0.45);
    --swap: #ef4444;
    --swap-glow: rgba(239, 68, 68, 0.45);
    --sorted: #10b981;
    --sorted-glow: rgba(16, 185, 129, 0.4);
    --pivot: #a855f7;
    --pivot-glow: rgba(168, 85, 247, 0.45);
    --bar-default: linear-gradient(180deg, #38bdf8, #2563eb);
    --border: #334155;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: var(--bg-main);
    color: var(--text-primary);
    padding: 16px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 12px;
  }

  .header h2 {
    font-size: 18px;
    font-weight: 700;
    color: #f1f5f9;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .badge {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 999px;
    background: rgba(56, 189, 248, 0.15);
    color: var(--accent);
    border: 1px solid rgba(56, 189, 248, 0.3);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stats-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    background: var(--bg-card);
    padding: 10px 16px;
    border-radius: 8px;
    border: 1px solid var(--border);
    font-size: 13px;
  }

  .stat-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stat-label {
    color: var(--text-muted);
    font-size: 12px;
  }

  .stat-val {
    font-weight: 700;
    color: #f8fafc;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 14px;
  }

  .status-badge {
    margin-left: auto;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 6px;
    background: #1e293b;
    color: #38bdf8;
    border: 1px solid #334155;
    font-size: 12px;
  }

  .canvas-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 20px 16px 12px 16px;
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 250px;
  }

  .array-container {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 8px;
    height: 190px;
    padding: 10px 0;
    width: 100%;
  }

  .bar-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    flex: 1;
    max-width: 46px;
    height: 100%;
    justify-content: flex-end;
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .bar {
    width: 100%;
    border-radius: 6px 6px 2px 2px;
    background: var(--bar-default);
    box-shadow: 0 2px 8px var(--accent-glow);
    transition: height 0.25s ease, background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    position: relative;
  }

  .bar-value {
    font-size: 11px;
    font-weight: 700;
    color: #ffffff;
    text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    margin-top: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  .bar-idx {
    font-size: 10px;
    color: var(--text-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  .bar.comparing {
    background: linear-gradient(180deg, #fbbf24, #d97706) !important;
    box-shadow: 0 0 14px var(--compare-glow) !important;
    transform: translateY(-4px);
  }

  .bar.swapping {
    background: linear-gradient(180deg, #f87171, #dc2626) !important;
    box-shadow: 0 0 14px var(--swap-glow) !important;
    transform: scale(1.06);
  }

  .bar.sorted {
    background: linear-gradient(180deg, #34d399, #059669) !important;
    box-shadow: 0 0 10px var(--sorted-glow) !important;
  }

  .bar.pivot {
    background: linear-gradient(180deg, #c084fc, #7e22ce) !important;
    box-shadow: 0 0 14px var(--pivot-glow) !important;
    transform: translateY(-4px);
  }

  .narration {
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 12.5px;
    color: #e2e8f0;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
  }

  .narration-icon {
    color: var(--accent);
    font-size: 14px;
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
  }

  .btn-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  button {
    background: #1e293b;
    color: #f8fafc;
    border: 1px solid #334155;
    padding: 7px 14px;
    border-radius: 6px;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
  }

  button:hover:not(:disabled) {
    background: #334155;
    border-color: #475569;
    color: #ffffff;
    transform: translateY(-1px);
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  button.btn-primary {
    background: #0284c7;
    border-color: #0369a1;
  }

  button.btn-primary:hover:not(:disabled) {
    background: #0369a1;
  }

  button.btn-danger {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.4);
    color: #fca5a5;
  }

  button.btn-danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.35);
    color: #ffffff;
  }

  .input-group {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-muted);
  }

  input[type="text"] {
    background: #0f172a;
    border: 1px solid #334155;
    color: #f8fafc;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    width: 170px;
    outline: none;
  }

  input[type="text"]:focus {
    border-color: var(--accent);
  }

  .slider-group {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted);
  }

  input[type="range"] {
    accent-color: var(--accent);
    cursor: pointer;
    width: 90px;
  }

  .legend {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    font-size: 11.5px;
    color: var(--text-muted);
    padding: 0 4px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .legend-dot {
    width: 9px;
    height: 9px;
    border-radius: 2px;
  }
</style>
</head>
<body>

  <div class="header">
    <h2>
      <span>⚡ __ALGO_NAME__ Simulation Visualizer</span>
      <span class="badge">__ALGO_NAME__</span>
    </h2>
    <div class="legend">
      <div class="legend-item"><div class="legend-dot" style="background:#38bdf8;"></div> Unsorted</div>
      <div class="legend-item"><div class="legend-dot" style="background:#f59e0b;"></div> Comparing</div>
      <div class="legend-item"><div class="legend-dot" style="background:#ef4444;"></div> Swapping / Writing</div>
      <div class="legend-item"><div class="legend-dot" style="background:#10b981;"></div> Sorted</div>
      __PIVOT_LEGEND__
    </div>
  </div>

  <div class="stats-bar">
    <div class="stat-item">
      <span class="stat-label">Comparisons:</span>
      <span class="stat-val" id="stat-comparisons">0</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">__SWAPS_LABEL__:</span>
      <span class="stat-val" id="stat-swaps">0</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Elements:</span>
      <span class="stat-val" id="stat-elements">0</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Step:</span>
      <span class="stat-val" id="stat-step">0 / 0</span>
    </div>
    <div class="status-badge" id="status-badge">READY</div>
  </div>

  <div class="canvas-card">
    <div class="array-container" id="array-container"></div>
    <div class="narration">
      <span class="narration-icon">💡</span>
      <span id="narration-text">__DESCRIPTION__ Click "Play" or "Step" to begin.</span>
    </div>
  </div>

  <div class="toolbar">
    <div class="btn-group">
      <button id="btn-play" class="btn-primary" onclick="togglePlay()">▶ Play</button>
      <button id="btn-step" onclick="stepForward()">⏭ Step</button>
      <button id="btn-reset" onclick="resetArray()">↺ Reset</button>
      <button id="btn-random" onclick="randomizeArray()">⚄ Random</button>
    </div>

    <div class="input-group">
      <span>Array:</span>
      <input type="text" id="custom-array-input" placeholder="e.g. 35, 12, 88, 42" onkeydown="if(event.key==='Enter') applyCustomArray()" />
      <button onclick="applyCustomArray()">Set</button>
    </div>

    <div class="slider-group">
      <span>Speed:</span>
      <input type="range" id="speed-slider" min="1" max="10" value="6" oninput="updateSpeed()" />
      <span id="speed-val" style="min-width:26px; font-weight:600;">1x</span>
    </div>
  </div>

<script>
  let rawInitial = __INITIAL_JSON__;
  let currentArray = [...rawInitial];
  let steps = [];
  let currentStepIdx = 0;
  let isPlaying = false;
  let playTimer = null;
  let baseDelay = 400;
  let comparisonsCount = 0;
  let swapsCount = 0;

  const container = document.getElementById('array-container');
  const statComp = document.getElementById('stat-comparisons');
  const statSwaps = document.getElementById('stat-swaps');
  const statElem = document.getElementById('stat-elements');
  const statStep = document.getElementById('stat-step');
  const statusBadge = document.getElementById('status-badge');
  const narration = document.getElementById('narration-text');
  const btnPlay = document.getElementById('btn-play');
  const speedSlider = document.getElementById('speed-slider');
  const speedVal = document.getElementById('speed-val');
  const customInput = document.getElementById('custom-array-input');

  function updateSpeed() {
    const val = parseInt(speedSlider.value, 10);
    baseDelay = Math.round(900 - val * 82);
    speedVal.textContent = (val <= 3 ? '0.5x' : (val <= 6 ? '1x' : (val <= 8 ? '2x' : '4x')));
  }

  function renderBars(arr, stateMap = {}) {
    container.innerHTML = '';
    const maxVal = Math.max(...arr, 1);
    arr.forEach((val, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'bar-wrapper';

      const bar = document.createElement('div');
      bar.className = 'bar';
      const pct = Math.max(18, Math.round((val / maxVal) * 160));
      bar.style.height = pct + 'px';

      if (stateMap[idx]) {
        bar.classList.add(stateMap[idx]);
      }

      const valLabel = document.createElement('span');
      valLabel.className = 'bar-value';
      valLabel.textContent = val;
      bar.appendChild(valLabel);

      const idxLabel = document.createElement('span');
      idxLabel.className = 'bar-idx';
      idxLabel.textContent = idx;

      wrapper.appendChild(bar);
      wrapper.appendChild(idxLabel);
      container.appendChild(wrapper);
    });
    statElem.textContent = arr.length;
  }

  function generateSteps(initial) {
    const a = [...initial];
    const generated = [];
    __ALGO_JS_LOGIC__
    return generated;
  }

  function resetArray() {
    pause();
    currentArray = [...rawInitial];
    steps = generateSteps(currentArray);
    currentStepIdx = 0;
    comparisonsCount = 0;
    swapsCount = 0;
    statComp.textContent = '0';
    statSwaps.textContent = '0';
    statStep.textContent = `0 / ${steps.length}`;
    statusBadge.textContent = 'READY';
    statusBadge.style.color = '#38bdf8';
    narration.textContent = '__DESCRIPTION__ Click "Play" or "Step" to run.';
    renderBars(currentArray);
    customInput.value = currentArray.join(', ');
  }

  function randomizeArray() {
    pause();
    const count = 8;
    const randoms = [];
    for (let i = 0; i < count; i++) {
      randoms.push(Math.floor(Math.random() * 85) + 10);
    }
    rawInitial = randoms;
    resetArray();
  }

  function applyCustomArray() {
    pause();
    const txt = customInput.value.trim();
    if (!txt) return;
    const nums = txt.split(/[,\\s]+/).map(x => parseInt(x, 10)).filter(x => !isNaN(x) && x > 0);
    if (nums.length < 2) {
      alert('Please enter at least 2 positive numbers (e.g. 24, 10, 45, 18, 9)');
      return;
    }
    rawInitial = nums.slice(0, 14);
    resetArray();
  }

  function executeStep(step) {
    const stateMap = {};
    if (step.type === 'compare') {
      comparisonsCount++;
      statComp.textContent = comparisonsCount;
      step.indices.forEach(idx => stateMap[idx] = 'comparing');
      statusBadge.textContent = 'COMPARING';
      statusBadge.style.color = '#f59e0b';
    } else if (step.type === 'swap') {
      swapsCount++;
      statSwaps.textContent = swapsCount;
      step.indices.forEach(idx => stateMap[idx] = 'swapping');
      statusBadge.textContent = 'SWAPPING';
      statusBadge.style.color = '#ef4444';
    } else if (step.type === 'pivot') {
      step.indices.forEach(idx => stateMap[idx] = 'pivot');
      statusBadge.textContent = 'PIVOT/DIVIDE';
      statusBadge.style.color = '#a855f7';
    } else if (step.type === 'mark_sorted') {
      step.indices.forEach(idx => stateMap[idx] = 'sorted');
      statusBadge.textContent = 'IN PLACE';
      statusBadge.style.color = '#10b981';
    }

    renderBars(step.array, stateMap);
    narration.textContent = step.narration;
    statStep.textContent = `${currentStepIdx + 1} / ${steps.length}`;
  }

  function stepForward() {
    if (currentStepIdx >= steps.length) {
      statusBadge.textContent = 'COMPLETED 🎉';
      statusBadge.style.color = '#10b981';
      narration.textContent = '__ALGO_NAME__ is fully sorted! All elements are in non-decreasing order.';
      pause();
      return false;
    }
    const step = steps[currentStepIdx];
    executeStep(step);
    currentStepIdx++;
    return true;
  }

  function togglePlay() {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }

  function play() {
    if (currentStepIdx >= steps.length) {
      resetArray();
    }
    isPlaying = true;
    btnPlay.textContent = '⏸ Pause';
    btnPlay.classList.add('btn-danger');
    btnPlay.classList.remove('btn-primary');
    runLoop();
  }

  function pause() {
    isPlaying = false;
    if (playTimer) clearTimeout(playTimer);
    playTimer = null;
    btnPlay.textContent = '▶ Play';
    btnPlay.classList.remove('btn-danger');
    btnPlay.classList.add('btn-primary');
  }

  function runLoop() {
    if (!isPlaying) return;
    const hasMore = stepForward();
    if (hasMore && isPlaying) {
      playTimer = setTimeout(runLoop, baseDelay);
    } else {
      pause();
    }
  }

  updateSpeed();
  resetArray();
</script>
</body>
</html>"""

SORTING_ALGORITHMS = [
    {
        "title": "Bubble Sort",
        "key": "bubble",
        "description": "Bubble Sort repeatedly compares adjacent elements and swaps them if they are in wrong order.",
        "default_arr": [45, 12, 89, 34, 23, 7, 56, 30],
        "theory": """# Bubble Sort

## 1. Algorithmic Overview
**Bubble Sort** is an elementary, comparison-based sorting algorithm. It works by repeatedly stepping through the array from left to right, comparing adjacent elements, and swapping them if the left element is strictly greater than the right element.

With each full iteration (pass) through the unsorted array, the largest remaining unsorted value "bubbles up" to its correct final index at the end of the array.

---

## 2. Mathematical Invariants & Mechanics
- **Outer Loop Invariant ($i$):** After pass $i$ (where $0 \\le i < n$), the sub-array $A[n - i \\dots n - 1]$ contains the $i$ largest elements of $A$ in their sorted final positions.
- **Inner Loop ($j$):** Iterates from $j = 0$ to $n - i - 2$.
  $$\\text{If } A[j] > A[j+1] \\implies \\text{swap}(A[j], A[j+1])$$
- **Optimization (Early Termination):** If an entire pass completes without a single swap, the array is already sorted and the algorithm terminates immediately in $\\mathcal{O}(n)$ time.

---

## 3. Complexity Analysis

| Metric | Complexity | Explanation |
| :--- | :--- | :--- |
| **Best Case Time** | $\\mathcal{O}(n)$ | Occurs when the input array is already sorted (with swap flag check). |
| **Average Case Time** | $\\mathcal{O}(n^2)$ | On average, $\\approx n(n-1)/4$ comparisons and swaps. |
| **Worst Case Time** | $\\mathcal{O}(n^2)$ | Reverse-sorted array; requires $n(n-1)/2$ comparisons and swaps. |
| **Space Complexity** | $\\mathcal{O}(1)$ | In-place algorithm; only a constant amount of auxiliary memory used. |
| **Stability** | **Stable** | Does not alter relative order of identical elements ($A[j] > A[j+1]$ prevents equal swaps). |

---

## 4. Pseudocode
```python
def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        swapped = False
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                swapped = True
        if not swapped:
            break
    return arr
```
""",
        "code": """def bubble_sort(arr):
    n = len(arr)
    comparisons = 0
    swaps = 0
    for i in range(n):
        swapped = False
        for j in range(0, n - i - 1):
            comparisons += 1
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                swaps += 1
                swapped = True
        if not swapped:
            break
    return arr, comparisons, swaps

if __name__ == '__main__':
    sample = [45, 12, 89, 34, 23, 7, 56, 30]
    print("Initial Array:    ", sample)
    sorted_arr, comps, swaps = bubble_sort(sample.copy())
    print("Sorted Array:     ", sorted_arr)
    print(f"Total Comparisons: {comps} | Total Swaps: {swaps}")
"""
    },
    {
        "title": "Selection Sort",
        "key": "selection",
        "description": "Selection Sort repeatedly identifies the minimum element in the unsorted prefix and swaps it into place.",
        "default_arr": [64, 25, 12, 22, 11, 38, 9, 47],
        "theory": """# Selection Sort

## 1. Algorithmic Overview
**Selection Sort** divides the input list into two partitions:
1. A **sorted sublist** on the left (initially empty).
2. An **unsorted sublist** on the right (initially the entire array).

In each pass, the algorithm finds the smallest (minimum) element in the unsorted sublist and swaps it with the leftmost unsorted element, moving the sublist boundary one position to the right.

---

## 2. Invariants & Mechanics
- **Loop Invariant:** At the start of outer iteration $i$, $A[0 \\dots i-1]$ consists of the smallest $i$ elements of the array in sorted order.
- **Minimum Finding:**
  $$min\\_idx = \\arg\\min_{j=i}^{n-1} A[j]$$
- **Swap:** Exactly one swap occurs per outer iteration (at most $n-1$ total swaps), making Selection Sort useful in systems where write operations to EEPROM/Flash memory are expensive.

---

## 3. Complexity Analysis

| Metric | Complexity | Explanation |
| :--- | :--- | :--- |
| **Best Case Time** | $\\mathcal{O}(n^2)$ | Must scan all remaining elements to verify the minimum even if sorted. |
| **Average Case Time** | $\\mathcal{O}(n^2)$ | $\\sum_{i=1}^{n-1} (n-i) = \\frac{n(n-1)}{2}$ comparisons. |
| **Worst Case Time** | $\\mathcal{O}(n^2)$ | Always performs exactly $n(n-1)/2$ comparisons. |
| **Space Complexity** | $\\mathcal{O}(1)$ | In-place; no extra arrays allocated. |
| **Stability** | **Unstable** | Standard swap can reorder equal keys across long distances. |

---

## 4. Pseudocode
```python
def selection_sort(arr):
    n = len(arr)
    for i in range(n - 1):
        min_idx = i
        for j in range(i + 1, n):
            if arr[j] < arr[min_idx]:
                min_idx = j
        if min_idx != i:
            arr[i], arr[min_idx] = arr[min_idx], arr[i]
    return arr
```
""",
        "code": """def selection_sort(arr):
    n = len(arr)
    comparisons = 0
    swaps = 0
    for i in range(n - 1):
        min_idx = i
        for j in range(i + 1, n):
            comparisons += 1
            if arr[j] < arr[min_idx]:
                min_idx = j
        if min_idx != i:
            arr[i], arr[min_idx] = arr[min_idx], arr[i]
            swaps += 1
    return arr, comparisons, swaps

if __name__ == '__main__':
    sample = [64, 25, 12, 22, 11, 38, 9, 47]
    print("Initial Array:    ", sample)
    sorted_arr, comps, swaps = selection_sort(sample.copy())
    print("Sorted Array:     ", sorted_arr)
    print(f"Total Comparisons: {comps} | Total Swaps: {swaps}")
"""
    },
    {
        "title": "Insertion Sort",
        "key": "insertion",
        "description": "Insertion Sort builds the sorted sequence one element at a time by shifting larger elements right.",
        "default_arr": [31, 41, 59, 26, 41, 58, 17, 33],
        "theory": """# Insertion Sort

## 1. Algorithmic Overview
**Insertion Sort** mimics the way people sort a hand of playing cards. Starting with a single sorted card, each subsequent card is picked and inserted into its correct relative position within the already sorted portion of the hand.

It is highly efficient for small data sets ($n < 50$) and is the algorithm of choice for nearly sorted arrays (adaptive behavior).

---

## 2. Invariants & Mechanics
- **Loop Invariant:** At the start of iteration $i$, sub-array $A[0 \\dots i-1]$ consists of the original elements originally in $A[0 \\dots i-1]$, but in sorted order.
- **Shifting vs Swapping:** Elements greater than $key = A[i]$ are shifted one position right ($A[j+1] = A[j]$), avoiding the 3-step swap cost.
- **Adaptive:** If an array is already sorted, each inner while-loop exits on its first check, achieving linear $\\mathcal{O}(n)$ performance.

---

## 3. Complexity Analysis

| Metric | Complexity | Explanation |
| :--- | :--- | :--- |
| **Best Case Time** | $\\mathcal{O}(n)$ | Array already sorted; only 1 comparison per element, zero shifts. |
| **Average Case Time** | $\\mathcal{O}(n^2)$ | Elements move roughly halfway through sorted sub-array. |
| **Worst Case Time** | $\\mathcal{O}(n^2)$ | Reverse-sorted array; every element shifts across entire sorted prefix. |
| **Space Complexity** | $\\mathcal{O}(1)$ | In-place algorithm. |
| **Stability** | **Stable** | Strict comparison ($A[j] > key$) preserves identical element order. |

---

## 4. Pseudocode
```python
def insertion_sort(arr):
    for i in range(1, len(arr)):
        key = arr[i]
        j = i - 1
        while j >= 0 and arr[j] > key:
            arr[j + 1] = arr[j]
            j -= 1
        arr[j + 1] = key
    return arr
```
""",
        "code": """def insertion_sort(arr):
    comparisons = 0
    shifts = 0
    for i in range(1, len(arr)):
        key = arr[i]
        j = i - 1
        while j >= 0:
            comparisons += 1
            if arr[j] > key:
                arr[j + 1] = arr[j]
                shifts += 1
                j -= 1
            else:
                break
        arr[j + 1] = key
    return arr, comparisons, shifts

if __name__ == '__main__':
    sample = [31, 41, 59, 26, 41, 58, 17, 33]
    print("Initial Array:    ", sample)
    sorted_arr, comps, shifts = insertion_sort(sample.copy())
    print("Sorted Array:     ", sorted_arr)
    print(f"Total Comparisons: {comps} | Total Shifts: {shifts}")
"""
    },
    {
        "title": "Merge Sort",
        "key": "merge",
        "description": "Merge Sort uses Divide-and-Conquer to recursively divide the array into halves and merge sorted subarrays.",
        "default_arr": [38, 27, 43, 3, 9, 82, 10, 19],
        "theory": """# Merge Sort

## 1. Algorithmic Overview
**Merge Sort** is an efficient, general-purpose, comparison-based sorting algorithm based on the **Divide and Conquer** paradigm:
1. **Divide:** Split the $n$-element sequence into two sub-sequences of $n/2$ elements each.
2. **Conquer:** Recursively sort the two sub-sequences using Merge Sort. Base case: a sub-array of length $\\le 1$ is already sorted.
3. **Combine (Merge):** Merge the two sorted sub-sequences into a single sorted array.

---

## 2. Recurrence Relation & Master Theorem
The running time $T(n)$ satisfies the recurrence:
$$T(n) = 2T\\left(\\frac{n}{2}\\right) + \\Theta(n)$$
By Case 2 of the Master Theorem ($a = 2, b = 2, f(n) = \\Theta(n)$), $\\log_b(a) = \\log_2(2) = 1$:
$$T(n) = \\Theta(n \\log n)$$
Merge Sort guarantees $\\mathcal{O}(n \\log n)$ time in **all cases** (best, average, worst).

---

## 3. Complexity Analysis

| Metric | Complexity | Explanation |
| :--- | :--- | :--- |
| **Best Case Time** | $\\mathcal{O}(n \\log n)$ | Guaranteed $n \\log n$ split and merge tree depth. |
| **Average Case Time** | $\\mathcal{O}(n \\log n)$ | Balanced binary recursion tree of depth $\\lceil \\log_2 n \\rceil$. |
| **Worst Case Time** | $\\mathcal{O}(n \\log n)$ | Never degrades to quadratic runtime regardless of input distribution. |
| **Space Complexity** | $\\mathcal{O}(n)$ | Requires auxiliary memory for merging sub-arrays. |
| **Stability** | **Stable** | Standard merge chooses the left item on ties ($L[i] \\le R[j]$). |

---

## 4. Pseudocode
```python
def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    return merge(left, right)
```
""",
        "code": """def merge_sort(arr):
    comparisons = [0]
    def sort(sub):
        if len(sub) <= 1:
            return sub
        mid = len(sub) // 2
        left = sort(sub[:mid])
        right = sort(sub[mid:])
        return merge(left, right)
        
    def merge(left, right):
        merged = []
        i = j = 0
        while i < len(left) and j < len(right):
            comparisons[0] += 1
            if left[i] <= right[j]:
                merged.append(left[i])
                i += 1
            else:
                merged.append(right[j])
                j += 1
        merged.extend(left[i:])
        merged.extend(right[j:])
        return merged

    return sort(arr), comparisons[0]

if __name__ == '__main__':
    sample = [38, 27, 43, 3, 9, 82, 10, 19]
    print("Initial Array:    ", sample)
    sorted_arr, comps = merge_sort(sample)
    print("Sorted Array:     ", sorted_arr)
    print(f"Total Comparisons: {comps}")
"""
    },
    {
        "title": "Quick Sort",
        "key": "quick",
        "description": "Quick Sort picks a pivot element, partitions the array around the pivot, and recurses on subarrays.",
        "default_arr": [10, 80, 30, 90, 40, 50, 70, 20],
        "theory": """# Quick Sort

## 1. Algorithmic Overview
**Quick Sort** is an in-place, divide-and-conquer sorting algorithm. It selects an element called the **pivot**, and rearranges the array into two partitions:
- Elements strictly less than the pivot are placed to its left.
- Elements greater than or equal to the pivot are placed to its right.

The pivot is then in its final sorted position. The algorithm recursively sorts the left and right partitions.

---

## 2. Partitioning Schemes (Lomuto vs Hoare)
- **Lomuto Partition:** Chooses the last element as the pivot. Uses pointer $i$ to track boundary of smaller elements. Cleaner, easier to trace, requires fewer swaps on sorted data.
- **Hoare Partition:** Uses two pointers moving toward each other from both ends. Typically makes $3\\times$ fewer swaps than Lomuto in practice.

---

## 3. Complexity Analysis

| Metric | Complexity | Explanation |
| :--- | :--- | :--- |
| **Best Case Time** | $\\mathcal{O}(n \\log n)$ | Pivot always splits sub-array into equal halves ($n/2$). |
| **Average Case Time** | $\\mathcal{O}(n \\log n)$ | Expected runtime across all random permutations is $\\approx 1.39 n \\log_2 n$. |
| **Worst Case Time** | $\\mathcal{O}(n^2)$ | Occurs when pivot is consistently smallest/largest (e.g. sorted array with last element pivot). |
| **Space Complexity** | $\\mathcal{O}(\\log n)$ | Call stack depth for recursion (Worst case $\\mathcal{O}(n)$ stack space). |
| **Stability** | **Unstable** | Swapping elements across the pivot can reorder identical elements. |

---

## 4. Pseudocode (Lomuto Partition)
```python
def quick_sort(arr, low, high):
    if low < high:
        pi = partition(arr, low, high)
        quick_sort(arr, low, pi - 1)
        quick_sort(arr, pi + 1, high)
```
""",
        "code": """def quick_sort(arr):
    comparisons = [0]
    swaps = [0]
    def sort(a, low, high):
        if low < high:
            pi = partition(a, low, high)
            sort(a, low, pi - 1)
            sort(a, pi + 1, high)
            
    def partition(a, low, high):
        pivot = a[high]
        i = low - 1
        for j in range(low, high):
            comparisons[0] += 1
            if a[j] < pivot:
                i += 1
                a[i], a[j] = a[j], a[i]
                swaps[0] += 1
        a[i + 1], a[high] = a[high], a[i + 1]
        swaps[0] += 1
        return i + 1

    arr_copy = arr.copy()
    sort(arr_copy, 0, len(arr_copy) - 1)
    return arr_copy, comparisons[0], swaps[0]

if __name__ == '__main__':
    sample = [10, 80, 30, 90, 40, 50, 70, 20]
    print("Initial Array:    ", sample)
    sorted_arr, comps, swaps = quick_sort(sample)
    print("Sorted Array:     ", sorted_arr)
    print(f"Total Comparisons: {comps} | Total Swaps: {swaps}")
"""
    }
]


def generate_sorting_simulation_html(algo_name: str, algo_key: str, description: str, default_array: list = None) -> str:
    pivot_legend = "<div class='legend-item'><div class='legend-dot' style='background:#a855f7;'></div> Pivot</div>" if algo_key in ("quick", "selection", "insertion") else ""
    swaps_label = "Swaps" if algo_key in ("bubble", "selection", "quick") else "Moves / Writes"
    arr_json = default_array if isinstance(default_array, list) and len(default_array) > 0 else [45, 12, 89, 34, 23, 7, 56, 30]

    html = TEMPLATE_HTML
    html = html.replace("__ALGO_NAME__", algo_name)
    html = html.replace("__DESCRIPTION__", description)
    html = html.replace("__INITIAL_JSON__", json.dumps(arr_json))
    html = html.replace("__PIVOT_LEGEND__", pivot_legend)
    html = html.replace("__SWAPS_LABEL__", swaps_label)
    html = html.replace("__ALGO_JS_LOGIC__", ALGO_JS_LOGIC.get(algo_key, ""))
    return html


def get_sorting_spec(name_or_key: str):
    q = (name_or_key or '').lower().strip()
    for s in SORTING_ALGORITHMS:
        if s['key'] in q or q in s['key'] or s['title'].lower() in q or q in s['title'].lower():
            res = s.copy()
            arr = s.get('default_arr') or s.get('default_array') or [45, 12, 89, 34, 23, 7, 56, 30]
            res['default_arr'] = arr
            res['default_array'] = arr
            return res
    return None
