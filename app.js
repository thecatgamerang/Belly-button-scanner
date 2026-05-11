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
    const symmetry = parseFloat(rand(80, 99).toFixed(1));
    return { type, score, depth, lint, trait, prophecy, rank, symmetry };
  }

  // ─── RESULT IMAGE ──────────────────────────────────────────────
  function drawResultImage(r) {
    const el = els.resultCanvas;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const cW = el.offsetWidth || 300;
    const cH = el.offsetHeight || 210;
    el.width = cW * dpr;
    el.height = cH * dpr;
    const c = el.getContext('2d');
    c.scale(dpr, dpr);
    const W = cW, H = cH;

    // Background
    c.fillStyle = '#000c18';
    c.fillRect(0, 0, W, H);

    // Dot grid
    c.fillStyle = 'rgba(0, 200, 255, 0.07)';
    for (let gx = 12; gx < W; gx += 18) {
      for (let gy = 12; gy < H; gy += 18) {
        c.fillRect(gx, gy, 1, 1);
      }
    }

    // Scan-line texture
    for (let y = 0; y < H; y += 4) {
      c.fillStyle = 'rgba(0, 255, 180, 0.022)';
      c.fillRect(0, y, W, 2);
    }

    // ── Header strip ──────────────────────────────────────────
    const HEADER_H = 22;
    c.fillStyle = 'rgba(0, 255, 180, 0.05)';
    c.fillRect(0, 0, W, HEADER_H);
    c.strokeStyle = 'rgba(0, 255, 180, 0.18)';
    c.lineWidth = 1;
    c.setLineDash([]);
    c.beginPath();
    c.moveTo(0, HEADER_H);
    c.lineTo(W, HEADER_H);
    c.stroke();

    const scanId = 'BBS#' + Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    const now = new Date();
    const ts = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map(n => String(n).padStart(2, '0')).join(':');

    c.font = '9px "Courier New"';
    c.textBaseline = 'middle';
    const hcy = HEADER_H / 2;

    c.fillStyle = 'rgba(0, 255, 180, 0.55)';
    c.textAlign = 'left';
    c.fillText(scanId, 8, hcy);

    c.fillStyle = 'rgba(0, 200, 255, 0.55)';
    c.textAlign = 'center';
    c.fillText(ts, W / 2, hcy);

    const typeColor = r.type === 'Outie' ? '#ff4d8d' : r.type === 'Enigmatic' ? '#aa88ff' : '#00ffb4';
    c.fillStyle = typeColor;
    c.textAlign = 'right';
    c.fillText(r.type.toUpperCase(), W - 8, hcy);

    // ── Navel illustration ────────────────────────────────────
    const ILL_H = 118;
    const ILL_Y = HEADER_H;
    const cx = W / 2;
    const cy = ILL_Y + ILL_H / 2;

    c.font = '7px "Courier New"';
    c.fillStyle = 'rgba(0, 200, 255, 0.28)';
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillText('NAVEL TOPOGRAPHY', 8, ILL_Y + 5);

    if (r.type === 'Innie') drawInnieTopography(c, cx, cy, W, ILL_H, r);
    else if (r.type === 'Outie') drawOutieTopography(c, cx, cy, W, ILL_H, r);
    else drawEnigmaticTopography(c, cx, cy, W, ILL_H);

    // ── Metric bars ───────────────────────────────────────────
    const BARS_Y = ILL_Y + ILL_H;
    c.strokeStyle = 'rgba(0, 255, 180, 0.14)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, BARS_Y);
    c.lineTo(W, BARS_Y);
    c.stroke();

    const BAR_ROW_H = (H - BARS_Y) / 4;
    const depthFill = { Shallow: 0.22, Standard: 0.5, Deep: 0.75, Cavernous: 1.0 }[r.depth] ?? 0.5;
    const lintFill  = { Low: 0.15, Moderate: 0.45, High: 0.75, Legendary: 1.0 }[r.lint] ?? 0.4;
    const lintColor = lintFill >= 0.75 ? '#ff4d8d' : '#00c8ff';

    const barMetrics = [
      { label: 'SCORE', fill: parseFloat(r.score) / 100, value: r.score + '/100', color: '#00ffb4' },
      { label: 'DEPTH', fill: depthFill,                  value: r.depth,          color: '#00c8ff' },
      { label: 'LINT',  fill: lintFill,                   value: r.lint,           color: lintColor },
      { label: 'SYM',   fill: r.symmetry / 100,           value: r.symmetry.toFixed(1) + '%', color: '#00ffb4' },
    ];

    const LBL_W = 36, VAL_W = 50, BPAD = 8;
    const barW = W - LBL_W - VAL_W - BPAD * 2;
    c.font = '8px "Courier New"';

    barMetrics.forEach((m, i) => {
      const rowCy = BARS_Y + i * BAR_ROW_H + BAR_ROW_H / 2;
      const barX  = BPAD + LBL_W;
      const barHt = 3;

      c.fillStyle = 'rgba(0, 255, 180, 0.4)';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(m.label, BPAD, rowCy);

      c.fillStyle = 'rgba(0, 255, 180, 0.08)';
      c.fillRect(barX, rowCy - barHt / 2, barW, barHt);

      if (m.fill > 0) {
        const fillW = barW * m.fill;
        const grad = c.createLinearGradient(barX, 0, barX + fillW, 0);
        grad.addColorStop(0, m.color + '88');
        grad.addColorStop(1, m.color);
        c.fillStyle = grad;
        c.fillRect(barX, rowCy - barHt / 2, fillW, barHt);

        c.save();
        c.shadowColor = m.color;
        c.shadowBlur = 6;
        c.beginPath();
        c.arc(barX + fillW, rowCy, 2.5, 0, Math.PI * 2);
        c.fillStyle = m.color;
        c.fill();
        c.restore();
      }

      c.fillStyle = m.color;
      c.textAlign = 'right';
      c.fillText(m.value, W - BPAD, rowCy);
    });
  }

  function drawInnieTopography(c, cx, cy, W, H, r) {
    // Topographic map: concentric ellipses darkening toward center
    const rings = [
      { rx: W * 0.34, ry: H * 0.40, fill: '#c4956a' },
      { rx: W * 0.24, ry: H * 0.28, fill: '#9a6840' },
      { rx: W * 0.16, ry: H * 0.19, fill: '#5a3820' },
      { rx: W * 0.09, ry: H * 0.11, fill: '#2a1408' },
      { rx: W * 0.04, ry: H * 0.05, fill: '#080200' },
    ];
    rings.forEach(l => {
      c.beginPath();
      c.ellipse(cx, cy, l.rx, l.ry, 0, 0, Math.PI * 2);
      c.fillStyle = l.fill;
      c.fill();
    });

    // Rim highlight
    c.beginPath();
    c.ellipse(cx, cy, W * 0.24, H * 0.28, 0, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(255, 210, 150, 0.2)';
    c.lineWidth = 1.5;
    c.setLineDash([]);
    c.stroke();

    // Topographic contour lines
    c.strokeStyle = 'rgba(0, 255, 180, 0.18)';
    c.lineWidth = 0.5;
    c.setLineDash([3, 4]);
    [0.28, 0.18, 0.10].forEach(rx => {
      c.beginPath();
      c.ellipse(cx, cy, W * rx, H * rx * 0.72, 0, 0, Math.PI * 2);
      c.stroke();
    });
    c.setLineDash([]);

    // Center crosshair
    c.strokeStyle = 'rgba(0, 255, 180, 0.35)';
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(cx - W * 0.07, cy); c.lineTo(cx + W * 0.07, cy);
    c.moveTo(cx, cy - H * 0.09); c.lineTo(cx, cy + H * 0.09);
    c.stroke();

    // Depth callout
    const depthMm = { Shallow: '1.2', Standard: '2.8', Deep: '4.1', Cavernous: '5.9' }[r.depth] ?? '2.8';
    const ax = cx + W * 0.32;
    c.strokeStyle = 'rgba(0, 200, 255, 0.45)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(cx + W * 0.10, cy);
    c.lineTo(ax - 4, cy);
    c.stroke();
    c.font = '7px "Courier New"';
    c.fillStyle = 'rgba(0, 200, 255, 0.7)';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText('DEPTH ' + depthMm + 'mm', ax, cy);

    // Label
    c.font = '7px "Courier New"';
    c.fillStyle = 'rgba(0, 255, 180, 0.22)';
    c.textAlign = 'left';
    c.textBaseline = 'bottom';
    c.fillText('UMBILICUS FOSSA', 8, cy + H * 0.44);
  }

  function drawOutieTopography(c, cx, cy, W, H) {
    // Skin base ellipse
    c.beginPath();
    c.ellipse(cx, cy, W * 0.36, H * 0.42, 0, 0, Math.PI * 2);
    c.fillStyle = '#a07050';
    c.fill();

    // Bump with radial gradient (bright center = highlight)
    const grad = c.createRadialGradient(cx - W * 0.02, cy - H * 0.05, 2, cx, cy, W * 0.22);
    grad.addColorStop(0, '#f0c080');
    grad.addColorStop(0.35, '#d09060');
    grad.addColorStop(0.75, '#a06840');
    grad.addColorStop(1, '#704020');
    c.beginPath();
    c.ellipse(cx, cy, W * 0.22, H * 0.26, 0, 0, Math.PI * 2);
    c.fillStyle = grad;
    c.fill();

    // Shadow ring
    c.beginPath();
    c.ellipse(cx, cy, W * 0.22, H * 0.26, 0, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    c.lineWidth = 2.5;
    c.setLineDash([]);
    c.stroke();

    // Contour lines
    c.strokeStyle = 'rgba(0, 255, 180, 0.18)';
    c.lineWidth = 0.5;
    c.setLineDash([3, 4]);
    [0.30, 0.20].forEach(rx => {
      c.beginPath();
      c.ellipse(cx, cy, W * rx, H * rx * 0.80, 0, 0, Math.PI * 2);
      c.stroke();
    });
    c.setLineDash([]);

    // Height callout
    const ax = cx + W * 0.32;
    c.strokeStyle = 'rgba(0, 200, 255, 0.45)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(cx + W * 0.22, cy);
    c.lineTo(ax - 4, cy);
    c.stroke();
    c.font = '7px "Courier New"';
    c.fillStyle = 'rgba(0, 200, 255, 0.7)';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText('+3.2mm', ax, cy);

    c.font = '7px "Courier New"';
    c.fillStyle = 'rgba(255, 77, 141, 0.35)';
    c.textAlign = 'left';
    c.textBaseline = 'bottom';
    c.fillText('PROTRUDING OMPHALOS', 8, cy + H * 0.44);
  }

  function drawEnigmaticTopography(c, cx, cy, W, H) {
    const palette = ['#00ffb4', '#00c8ff', '#aa88ff'];
    for (let i = 5; i > 0; i--) {
      const angle = (i / 5) * Math.PI * 0.7;
      const rx = W * (0.08 + i * 0.055);
      const ry = H * (0.10 + i * 0.038);
      c.save();
      c.translate(cx, cy);
      c.rotate(angle);
      c.beginPath();
      c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      c.restore();
      c.strokeStyle = palette[i % 3] + '44';
      c.lineWidth = 1;
      c.setLineDash([]);
      c.stroke();
    }

    // Center ?
    c.save();
    c.shadowColor = '#aa88ff';
    c.shadowBlur = 14;
    c.font = 'bold 22px "Courier New"';
    c.fillStyle = 'rgba(170, 136, 255, 0.75)';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('?', cx, cy);
    c.restore();

    c.font = '7px "Courier New"';
    c.fillStyle = 'rgba(170, 136, 255, 0.35)';
    c.textAlign = 'left';
    c.textBaseline = 'bottom';
    c.fillText('CLASSIFICATION: UNKNOWN', 8, cy + H * 0.44);
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
    setTimeout(() => drawResultImage(r), 60);
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
      resultCanvas: document.getElementById('result-canvas'),
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
