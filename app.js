(function () {
  'use strict';

  // ─── CONFIG ────────────────────────────────────────────────────
  const CONFIG = {
    baseRadiusRatio: 0.28,
    scanDuration: 3000,
    ringSpeed: 0.008,
    ringScanSpeed: 0.018,
    rotationSpeed: 0.005,
    crosshairCounterSpeed: 0.003,
    dataTickInterval: 5,
  };

  const CAMERA_CONSTRAINTS = {
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false,
  };

  // ─── RESULTS DATA ──────────────────────────────────────────────
  const DATA = {
    types: [
      { label: 'Innie', weight: 88 },
      { label: 'Outie', weight: 10 },
      { label: 'Enigmatic', weight: 2 },
    ],
    depths: [
      { label: 'Shallow', weight: 20 },
      { label: 'Standard', weight: 45 },
      { label: 'Deep', weight: 30 },
      { label: 'Cavernous', weight: 5 },
    ],
    lintRisks: ['Low', 'Moderate', 'High', 'Legendary'],
    traits: [
      'Secret keeper of mysteries',
      'Natural-born napper',
      'Excellent at collecting loose change',
      'Drawn to carbohydrates during full moons',
      'Future archaeologist magnet',
      'Belly dancer in a past life',
      'Has a sixth sense for buffets',
      'Instinctively knows when pizza arrives',
      'Considered a lint whisperer by peers',
      'Fortune 500 companies envy your core',
      'Was once briefly considered a portal',
      'Scientifically classified as cozy',
    ],
    prophecies: [
      'The belly button that was once an opening shall become a legend.',
      'Great snacks await those who trust their gut.',
      'Your navel is aligned with the cosmic center. Slightly.',
      'Three fuzzy things surround your destiny.',
      'The lint you collect today is the art of tomorrow.',
    ],
    ranks: [
      'Admiral of the Innie Fleet',
      'Sergeant of Navel Affairs',
      'Grand Vizier of Belly Culture',
      'Lieutenant of Lint Prevention',
      'Chief Navigator of the Gut Feeling Division',
      'Rear Admiral (Lower Half)',
    ],
  };

  // ─── STATE ─────────────────────────────────────────────────────
  const STATES = { SPLASH: 0, REQUESTING: 1, IDLE: 2, SCANNING: 3, RESULTS: 4, ERROR: 5 };
  let state = STATES.SPLASH;
  let stream = null;
  let animFrameId = null;

  // ─── DOM REFS ──────────────────────────────────────────────────
  let els = {};

  // ─── CANVAS STATE ──────────────────────────────────────────────
  let ctx, W, H;
  let rotation = 0;
  let crossRotation = 0;
  let frameCount = 0;
  let pulseRings = [{ phase: 0 }, { phase: 0.5 }];
  let scanPhase = 0;
  let scanProgress = 0;
  let scanStartTime = 0;
  let centerText = '';
  let centerTextAlpha = 0;
  let displayData = { depth: '--', topology: 'STANDBY', lint: '--', symmetry: '--' };
  let scanTimers = [];

  // ─── UTILS ─────────────────────────────────────────────────────
  function weightedRandom(items) {
    const total = items.reduce((s, i) => s + (i.weight || 1), 0);
    let r = Math.random() * total;
    for (const item of items) {
      r -= (item.weight || 1);
      if (r <= 0) return item.label !== undefined ? item.label : item;
    }
    return items[items.length - 1].label !== undefined ? items[items.length - 1].label : items[items.length - 1];
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function isIOS() {
    return /iP(hone|ad|od)/.test(navigator.userAgent);
  }

  // ─── AUDIO ─────────────────────────────────────────────────────
  function playBeep(freq = 880, duration = 0.18) {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.25, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + duration);
    } catch (_) {}
  }

  // ─── CANVAS RESIZE ─────────────────────────────────────────────
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    els.canvas.width = W * dpr;
    els.canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ─── DRAW HELPERS ──────────────────────────────────────────────
  function baseRadius() {
    return Math.min(W, H) * CONFIG.baseRadiusRatio;
  }

  function drawCornerBrackets(t) {
    const r = baseRadius();
    const cx = W / 2, cy = H / 2;
    const armLen = r * 0.28;
    const alpha = 0.6 + 0.4 * Math.sin(t * 1.5);
    const positions = [
      [-1, -1, Math.PI * 0.5, 0],
      [1, -1, Math.PI, Math.PI * 0.5],
      [1, 1, Math.PI * 1.5, Math.PI],
      [-1, 1, 0, Math.PI * 1.5],
    ];

    ctx.save();
    ctx.strokeStyle = `rgba(0, 255, 180, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.lineCap = 'square';
    ctx.setLineDash([]);

    for (const [sx, sy] of positions) {
      const bx = cx + sx * r;
      const by = cy + sy * r;

      ctx.beginPath();
      ctx.moveTo(bx - sx * armLen, by);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx, by - sy * armLen);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPulseRings() {
    const r = baseRadius();
    const cx = W / 2, cy = H / 2;
    const speed = state === STATES.SCANNING ? CONFIG.ringScanSpeed : CONFIG.ringSpeed;

    ctx.save();
    for (const ring of pulseRings) {
      ring.phase += speed;
      if (ring.phase > 1) ring.phase -= 1;

      const ringR = r + ring.phase * r * 0.55;
      const alpha = (1 - ring.phase) * 0.7;

      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0, 255, 180, ${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRotatingRing() {
    const r = baseRadius() * 1.1;
    const cx = W / 2, cy = H / 2;
    rotation += CONFIG.rotationSpeed;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([10, 7]);
    ctx.stroke();
    ctx.restore();
  }

  function drawCrosshairs() {
    const r = baseRadius();
    const cx = W / 2, cy = H / 2;
    crossRotation -= CONFIG.crosshairCounterSpeed;

    const dirs = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    const outer = r * 0.9;
    const inner = r * 0.55;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(crossRotation);
    ctx.strokeStyle = 'rgba(0, 255, 180, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);

    for (const angle of dirs) {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      ctx.beginPath();
      ctx.moveTo(cos * inner, sin * inner);
      ctx.lineTo(cos * outer, sin * outer);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDataReadout() {
    if (state === STATES.IDLE || state === STATES.SCANNING) {
      if (frameCount % CONFIG.dataTickInterval === 0 && state === STATES.SCANNING) {
        displayData.depth = rand(1.2, 4.8).toFixed(1) + 'mm';
        displayData.topology = pick(['CONCAVE', 'CONVEX', 'PLANAR', 'COMPLEX']);
        displayData.lint = rand(0, 99).toFixed(0) + '%';
        displayData.symmetry = rand(80, 99.9).toFixed(1) + '%';
      }

      const r = baseRadius();
      const cx = W / 2, cy = H / 2;
      const x = cx - r * 0.9;
      const y = cy + r * 0.5;

      ctx.save();
      ctx.font = '10px "Courier New"';
      ctx.fillStyle = 'rgba(0, 200, 255, 0.65)';
      ctx.textAlign = 'left';
      const lines = [
        `DEPTH     ${displayData.depth}`,
        `TOPOLOGY  ${displayData.topology}`,
        `LINT IDX  ${displayData.lint}`,
        `SYMMETRY  ${displayData.symmetry}`,
      ];
      lines.forEach((line, i) => ctx.fillText(line, x, y + i * 14));
      ctx.restore();
    }
  }

  function drawScanBar() {
    const r = baseRadius();
    const cx = W / 2, cy = H / 2;
    scanPhase += 0.04;
    const barY = cy + Math.sin(scanPhase) * r * 0.85;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
    ctx.clip();

    const grad = ctx.createLinearGradient(cx - r, barY, cx + r, barY);
    grad.addColorStop(0, 'rgba(0,255,180,0)');
    grad.addColorStop(0.4, 'rgba(0,255,180,0.6)');
    grad.addColorStop(0.5, 'rgba(0,255,180,0.9)');
    grad.addColorStop(0.6, 'rgba(0,255,180,0.6)');
    grad.addColorStop(1, 'rgba(0,255,180,0)');

    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, barY - 2, r * 2, 4);
    ctx.restore();
  }

  function drawProgressArc() {
    const r = baseRadius() * 1.05;
    const cx = W / 2, cy = H / 2;
    const elapsed = Date.now() - scanStartTime;
    scanProgress = Math.min(elapsed / CONFIG.scanDuration, 1);
    const endAngle = -Math.PI / 2 + scanProgress * Math.PI * 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, endAngle);
    ctx.strokeStyle = 'rgba(0, 255, 180, 0.9)';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.restore();
  }

  function drawLockedState() {
    const r = baseRadius() * 1.05;
    const cx = W / 2, cy = H / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 255, 180, 0.9)';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.stroke();

    // Checkmark inside circle
    ctx.strokeStyle = 'rgba(0, 255, 180, 0.9)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.25, cy);
    ctx.lineTo(cx - r * 0.05, cy + r * 0.22);
    ctx.lineTo(cx + r * 0.3, cy - r * 0.2);
    ctx.stroke();
    ctx.restore();
  }

  function drawCenterText(t) {
    if (!centerText) return;
    centerTextAlpha = Math.min(centerTextAlpha + 0.05, 1);

    const cx = W / 2, cy = H / 2;
    ctx.save();
    ctx.font = 'bold 13px "Courier New"';
    ctx.fillStyle = `rgba(0, 255, 180, ${centerTextAlpha})`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 255, 180, 0.8)';
    ctx.shadowBlur = 12;
    ctx.fillText(centerText, cx, cy);
    ctx.restore();
  }

  // ─── DRAW LOOP ─────────────────────────────────────────────────
  function drawLoop(timestamp) {
    ctx.clearRect(0, 0, W, H);
    frameCount++;
    const t = timestamp / 1000;

    if (state === STATES.IDLE || state === STATES.SCANNING || state === STATES.RESULTS) {
      drawPulseRings();
      drawRotatingRing();
      drawCornerBrackets(t);
      drawCrosshairs();
      drawDataReadout();
    }

    if (state === STATES.SCANNING) {
      drawScanBar();
      drawProgressArc();
      drawCenterText(t);
    }

    if (state === STATES.RESULTS) {
      drawLockedState();
    }

    animFrameId = requestAnimationFrame(drawLoop);
  }

  // ─── CAMERA ────────────────────────────────────────────────────
  async function initCamera() {
    setState(STATES.REQUESTING);
    try {
      stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      els.video.srcObject = stream;
      await els.video.play();
      resizeCanvas();
      setState(STATES.IDLE);
      if (!animFrameId) animFrameId = requestAnimationFrame(drawLoop);
    } catch (err) {
      onCameraError(err);
    }
  }

  function onCameraError(err) {
    setState(STATES.ERROR);
    let detail = 'Please allow camera access in your browser settings.';
    if (isIOS()) detail = 'On iPhone, go to Settings > Safari > Camera and set it to Allow.';
    if (err.name === 'NotFoundError') detail = 'No camera found on this device.';
    els.errorDetail.textContent = detail;
  }

  // ─── SCAN SEQUENCE ─────────────────────────────────────────────
  function clearScanTimers() {
    scanTimers.forEach(clearTimeout);
    scanTimers = [];
  }

  function startScan() {
    clearScanTimers();
    setState(STATES.SCANNING);
    scanStartTime = Date.now();
    scanPhase = 0;
    scanProgress = 0;
    centerText = '';
    centerTextAlpha = 0;

    playBeep(660, 0.15);

    scanTimers.push(setTimeout(() => playBeep(880, 0.12), 400));
    scanTimers.push(setTimeout(() => { centerText = 'ANALYZING...'; centerTextAlpha = 0; }, 1500));
    scanTimers.push(setTimeout(() => { centerText = 'PROCESSING RESULTS...'; centerTextAlpha = 0; }, 2500));
    scanTimers.push(setTimeout(() => completeScan(), CONFIG.scanDuration));
  }

  function completeScan() {
    playBeep(1200, 0.25);
    centerText = '';
    const results = generateResults();
    renderResults(results);
    setState(STATES.RESULTS);
  }

  // ─── RESULTS ───────────────────────────────────────────────────
  function generateResults() {
    const type = weightedRandom(DATA.types);
    const score = (rand(60, 98)).toFixed(1);
    const depth = weightedRandom(DATA.depths);
    const lint = pick(DATA.lintRisks);
    const trait = pick(DATA.traits);
    const prophecy = pick(DATA.prophecies);
    const rank = pick(DATA.ranks);
    return { type, score, depth, lint, trait, prophecy, rank };
  }

  function renderResults(r) {
    const isOutie = r.type === 'Outie';
    const rows = [
      { label: 'BELLY BUTTON TYPE', value: r.type, accent: isOutie },
      { label: 'NAVEL SCORE', value: `${r.score} / 100`, accent: false },
      { label: 'DEPTH CLASS', value: r.depth, accent: false },
      { label: 'LINT RISK', value: r.lint, accent: r.lint === 'Legendary' },
    ];
    const blocks = [
      { label: 'PERSONALITY TRAIT', value: `"${r.trait}"` },
      { label: 'ANCIENT PROPHECY', value: `"${r.prophecy}"` },
      { label: 'NAVAL ACADEMY RANK', value: r.rank },
    ];

    let html = '';

    rows.forEach((row, i) => {
      const delay = i * 80;
      html += `<div class="result-row" style="animation-delay:${delay}ms">
        <span class="result-label">${row.label}</span>
        <span class="result-value${row.accent ? ' accent' : ''}">${row.value}</span>
      </div>`;
    });

    html += '<div class="results-divider" style="opacity:0;animation:fadeInUp 0.4s ease 320ms forwards"></div>';

    blocks.forEach((block, i) => {
      const delay = 360 + i * 80;
      html += `<div class="result-block" style="animation-delay:${delay}ms">
        <span class="result-label">${block.label}</span>
        <span class="result-value">${block.value}</span>
      </div>`;
    });

    els.resultsRows.innerHTML = html;
  }

  // ─── STATE MACHINE ─────────────────────────────────────────────
  function setState(newState) {
    state = newState;

    const isCamera = newState === STATES.IDLE || newState === STATES.SCANNING || newState === STATES.RESULTS;
    els.video.style.display = isCamera ? 'block' : 'none';
    els.canvas.style.display = isCamera ? 'block' : 'none';

    els.scanBtn.classList.toggle('scanning', newState === STATES.SCANNING || newState === STATES.RESULTS);
    els.scanBtn.disabled = newState !== STATES.IDLE;

    if (newState === STATES.RESULTS) {
      els.resultsPanel.classList.remove('hidden');
      requestAnimationFrame(() => els.resultsPanel.classList.add('visible'));
    } else {
      els.resultsPanel.classList.remove('visible');
      if (newState !== STATES.RESULTS) {
        setTimeout(() => {
          if (state !== STATES.RESULTS) els.resultsPanel.classList.add('hidden');
        }, 420);
      }
    }

    els.permissionError.classList.toggle('hidden', newState !== STATES.ERROR);

    const statusMap = {
      [STATES.SPLASH]: 'OFFLINE',
      [STATES.REQUESTING]: 'INITIALIZING',
      [STATES.IDLE]: 'READY',
      [STATES.SCANNING]: 'SCANNING',
      [STATES.RESULTS]: 'COMPLETE',
      [STATES.ERROR]: 'ERROR',
    };
    els.hudStatus.textContent = statusMap[newState] || '';
  }

  // ─── INIT ──────────────────────────────────────────────────────
  function init() {
    els = {
      splash: document.getElementById('splash'),
      video: document.getElementById('camera-feed'),
      canvas: document.getElementById('ar-overlay'),
      hudStatus: document.getElementById('hud-status'),
      scanBtn: document.getElementById('scan-btn'),
      resultsPanel: document.getElementById('results-panel'),
      resultsRows: document.getElementById('results-rows'),
      permissionError: document.getElementById('permission-error'),
      errorDetail: document.getElementById('error-detail'),
      scanAgainBtn: document.getElementById('scan-again-btn'),
      retryBtn: document.getElementById('retry-btn'),
    };

    ctx = els.canvas.getContext('2d');
    W = window.innerWidth;
    H = window.innerHeight;

    // Hide camera elements until camera is ready
    els.video.style.display = 'none';
    els.canvas.style.display = 'none';

    // Splash tap → request camera
    els.splash.addEventListener('click', () => {
      els.splash.style.transition = 'opacity 0.5s';
      els.splash.style.opacity = '0';
      setTimeout(() => els.splash.remove(), 500);
      initCamera();
    });

    // Scan button
    els.scanBtn.addEventListener('click', () => {
      if (state === STATES.IDLE) startScan();
    });

    // Scan again
    els.scanAgainBtn.addEventListener('click', () => {
      clearScanTimers();
      centerText = '';
      displayData = { depth: '--', topology: 'STANDBY', lint: '--', symmetry: '--' };
      setState(STATES.IDLE);
    });

    // Retry camera
    els.retryBtn.addEventListener('click', () => initCamera());

    // Canvas resize on orientation / window resize
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 200));

    // Stop stream when page hidden (saves battery)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
      }
    });

    // Check for camera support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      els.splash.style.display = 'none';
      setState(STATES.ERROR);
      els.errorDetail.textContent = 'Your browser does not support camera access. Try Chrome or Safari.';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
