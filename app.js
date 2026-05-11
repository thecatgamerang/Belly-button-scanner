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
    piercingStatus: [
      { label: 'Pierced',   weight: 35 },
      { label: 'Unpierced', weight: 63 },
      { label: 'Unknown',   weight: 2  },
    ],
    piercingTypes: [
      { label: 'Belly Bar',        weight: 35 },
      { label: 'Captive Ring',     weight: 20 },
      { label: 'Curved Barbell',   weight: 15 },
      { label: 'Gem Stud',         weight: 15 },
      { label: 'Shield Piercing',  weight: 8  },
      { label: 'Multi-Pierced',    weight: 7  },
    ],
    piercingConditions: ['Freshly Done', 'Well Healed', 'Vintage', 'Battle-Hardened'],
    metalCompatibility: [
      { label: 'High',      weight: 50 },
      { label: 'Moderate',  weight: 35 },
      { label: 'Sensitive', weight: 15 },
    ],
    piercingComments: [
      'A fine specimen of navel adornment.',
      'Metal detected. Humanity enhanced.',
      'The jewelry and the belly are one.',
      'Your piercer chose wisely.',
      'Certified glitter-friendly zone.',
      'This belly button has seen things.',
      'The metal sings to the navel gods.',
      'Structural integrity: enhanced.',
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
  let piercingAnalysis = null;
  let metalScanActive = false;
  let metalScanEnd = 0;
  let scanTimers = [];
  let flickerAlpha = 1;
  const ORBITAL_NODES = [
    { speed:  0.38, offset: 0,              rFactor: 1.22, sz: 2.5, trail: [] },
    { speed: -0.22, offset: Math.PI * 0.7,  rFactor: 1.30, sz: 2.0, trail: [] },
    { speed:  0.55, offset: Math.PI * 1.3,  rFactor: 1.17, sz: 3.0, trail: [] },
  ];

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
    const armLen = r * 0.30;
    const alpha = 0.55 + 0.45 * Math.sin(t * 1.5);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

    corners.forEach(([sx, sy]) => {
      const bx = cx + sx * r;
      const by = cy + sy * r;

      // Main bracket arms
      ctx.save();
      ctx.strokeStyle = `rgba(0, 255, 180, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.lineCap = 'square';
      ctx.setLineDash([]);
      ctx.shadowColor = `rgba(0, 255, 180, ${alpha * 0.6})`;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(bx - sx * armLen, by);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx, by - sy * armLen);
      ctx.stroke();
      ctx.restore();

      // Tick marks along arms
      ctx.save();
      ctx.strokeStyle = `rgba(0, 255, 180, ${alpha * 0.45})`;
      ctx.lineWidth = 0.8;
      ctx.lineCap = 'butt';
      ctx.setLineDash([]);
      for (let j = 1; j <= 3; j++) {
        const frac = j / 4;
        ctx.beginPath();
        ctx.moveTo(bx - sx * armLen * frac, by);
        ctx.lineTo(bx - sx * armLen * frac, by + sy * 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx, by - sy * armLen * frac);
        ctx.lineTo(bx - sx * 4, by - sy * armLen * frac);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  function drawPulseRings() {
    const r = baseRadius();
    const cx = W / 2, cy = H / 2;
    const speed = state === STATES.SCANNING ? CONFIG.ringScanSpeed : CONFIG.ringSpeed;

    for (const ring of pulseRings) {
      ring.phase += speed;
      if (ring.phase > 1) ring.phase -= 1;

      const ringR = r + ring.phase * r * 0.55;
      const alpha = (1 - ring.phase) * 0.75;

      ctx.save();
      ctx.shadowColor = `rgba(0, 255, 180, ${alpha * 0.5})`;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0, 255, 180, ${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawRotatingRings() {
    const r = baseRadius();
    const cx = W / 2, cy = H / 2;
    rotation += CONFIG.rotationSpeed;

    // Outer ring — CW, dashed cyan
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.12, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([12, 8]);
    ctx.stroke();
    ctx.restore();

    // Inner ring — CCW, shorter dashes, green
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-rotation * 0.65);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.96, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 255, 180, 0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 15]);
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
    ctx.arc(cx, cy, r * 0.93, 0, Math.PI * 2);
    ctx.clip();

    // Soft wide glow behind the line
    const glow = ctx.createLinearGradient(cx - r, barY - 16, cx + r, barY + 16);
    glow.addColorStop(0, 'rgba(0,255,180,0)');
    glow.addColorStop(0.5, 'rgba(0,255,180,0.09)');
    glow.addColorStop(1, 'rgba(0,255,180,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - r, barY - 16, r * 2, 32);

    // Bright core line
    const line = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
    line.addColorStop(0,   'rgba(0,255,180,0)');
    line.addColorStop(0.25,'rgba(0,255,180,0.7)');
    line.addColorStop(0.5, 'rgba(200,255,245,1)');
    line.addColorStop(0.75,'rgba(0,255,180,0.7)');
    line.addColorStop(1,   'rgba(0,255,180,0)');
    ctx.fillStyle = line;
    ctx.fillRect(cx - r, barY - 1.5, r * 2, 3);
    ctx.restore();

    // Screen-wide atmospheric glow at bar height
    const screenGlow = ctx.createLinearGradient(0, barY - 24, 0, barY + 24);
    screenGlow.addColorStop(0,   'rgba(0,255,180,0)');
    screenGlow.addColorStop(0.5, 'rgba(0,255,180,0.04)');
    screenGlow.addColorStop(1,   'rgba(0,255,180,0)');
    ctx.fillStyle = screenGlow;
    ctx.fillRect(0, barY - 24, W, 48);
  }

  function drawProgressArc() {
    const r = baseRadius() * 1.05;
    const cx = W / 2, cy = H / 2;
    const elapsed = Date.now() - scanStartTime;
    scanProgress = Math.min(elapsed / CONFIG.scanDuration, 1);
    const endAngle = -Math.PI / 2 + scanProgress * Math.PI * 2;

    // Dim background track
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 255, 180, 0.07)';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.restore();

    // Progress arc with glow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 255, 180, 0.7)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, endAngle);
    ctx.strokeStyle = 'rgba(0, 255, 180, 0.95)';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.stroke();

    // Bright tip dot
    if (scanProgress > 0.01) {
      const tx = cx + Math.cos(endAngle) * r;
      const ty = cy + Math.sin(endAngle) * r;
      ctx.beginPath();
      ctx.arc(tx, ty, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
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

  function drawMetalScan() {
    const r = baseRadius() * 1.1;
    const cx = W / 2, cy = H / 2;
    const elapsed = metalScanEnd - Date.now();
    const progress = 1 - elapsed / 600;
    const alpha = progress < 0.5 ? progress * 2 : (1 - progress) * 2;

    ctx.save();
    ctx.shadowColor = '#e8d060';
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(232, 208, 96, ${alpha * 0.85})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.restore();
  }

  function drawCenterText(t) {
    if (!centerText) return;
    centerTextAlpha = Math.min(centerTextAlpha + 0.05, 1);

    const cx = W / 2, cy = H / 2;
    const isImplant = centerText === 'DETECTING IMPLANTS...';
    const baseColor = isImplant ? '232, 208, 96' : '0, 255, 180';
    const glowColor = isImplant ? 'rgba(232,208,96,0.8)' : 'rgba(0,255,180,0.8)';

    ctx.save();
    ctx.font = 'bold 13px "Courier New"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 16;
    ctx.fillStyle = `rgba(${baseColor}, ${centerTextAlpha})`;

    // Occasional glitch horizontal offset for DETECTING IMPLANTS
    const offX = isImplant && Math.random() < 0.07 ? (Math.random() - 0.5) * 5 : 0;
    ctx.fillText(centerText, cx + offX, cy);
    ctx.restore();
  }

  function drawScreenVignette() {
    const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.22, W / 2, H / 2, Math.max(W, H) * 0.72);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.58)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  function drawDepthRings(t) {
    const cx = W / 2, cy = H / 2;
    const r = baseRadius();
    const layers = [
      { r: r * 1.55, rot:  t * 0.07, color: 'rgba(0,200,255,0.07)', dash: [22, 18], lw: 0.7 },
      { r: r * 1.35, rot: -t * 0.05, color: 'rgba(0,255,180,0.07)', dash: [10, 24], lw: 0.7 },
      { r: r * 0.70, rot:  t * 0.11, color: 'rgba(0,200,255,0.09)', dash: [6, 12],  lw: 0.7 },
    ];
    layers.forEach(l => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(l.rot);
      ctx.beginPath();
      ctx.arc(0, 0, l.r, 0, Math.PI * 2);
      ctx.strokeStyle = l.color;
      ctx.lineWidth = l.lw;
      ctx.setLineDash(l.dash);
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawTickRing(t) {
    const cx = W / 2, cy = H / 2;
    const r = baseRadius() * 1.20;
    const rot = t * 0.055;
    const numTicks = 48;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.setLineDash([]);
    for (let i = 0; i < numTicks; i++) {
      const angle = (i / numTicks) * Math.PI * 2;
      const isMajor = i % 12 === 0;
      const isMid   = i % 4 === 0;
      const tickLen = isMajor ? 12 : isMid ? 6 : 3;
      const alpha   = isMajor ? 0.65 : isMid ? 0.32 : 0.14;
      const lw      = isMajor ? 1.5 : 0.8;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      ctx.beginPath();
      ctx.moveTo(cos * r, sin * r);
      ctx.lineTo(cos * (r - tickLen), sin * (r - tickLen));
      ctx.strokeStyle = `rgba(0, 255, 180, ${alpha})`;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawOrbitalNodes(t) {
    const cx = W / 2, cy = H / 2;
    const r = baseRadius();

    ORBITAL_NODES.forEach(node => {
      const angle = t * node.speed + node.offset;
      const nr = r * node.rFactor;
      const x = cx + Math.cos(angle) * nr;
      const y = cy + Math.sin(angle) * nr;

      node.trail.push({ x, y });
      if (node.trail.length > 10) node.trail.shift();

      // Trail (fading)
      node.trail.forEach((pt, i) => {
        const a = (i / node.trail.length) * 0.3;
        const s = node.sz * (i / node.trail.length) * 0.6;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(0.5, s), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 200, 255, ${a})`;
        ctx.fill();
      });

      // Node
      ctx.save();
      ctx.shadowColor = '#00e0ff';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(x, y, node.sz, 0, Math.PI * 2);
      ctx.fillStyle = '#00e0ff';
      ctx.fill();
      ctx.restore();
    });
  }

  function drawWaveform(t) {
    const r = baseRadius();
    const cx = W / 2, cy = H / 2;
    // Right side of scan zone
    const wx = cx + r * 1.44;
    const wh = r * 0.80;
    const ww = r * 0.20;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      const p = i / steps;
      const wy = cy - wh / 2 + p * wh;
      const wx2 = wx + Math.sin(p * Math.PI * 4 + t * 2.8) * ww * (0.65 + 0.35 * Math.sin(t + p * 6));
      if (i === 0) ctx.moveTo(wx2, wy);
      else ctx.lineTo(wx2, wy);
    }
    ctx.stroke();

    // Axis guide
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.12)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(wx, cy - wh / 2);
    ctx.lineTo(wx, cy + wh / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = '7px "Courier New"';
    ctx.fillStyle = 'rgba(0, 200, 255, 0.28)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('BIO-SIG', wx, cy - wh / 2 - 3);
    ctx.restore();
  }

  // ─── DRAW LOOP ─────────────────────────────────────────────────
  function drawLoop(timestamp) {
    ctx.clearRect(0, 0, W, H);
    frameCount++;
    const t = timestamp / 1000;

    // Rare signal-glitch flicker
    if (Math.random() < 0.004) flickerAlpha = 0.25 + Math.random() * 0.5;
    else flickerAlpha = Math.min(1, flickerAlpha + 0.18);
    ctx.globalAlpha = flickerAlpha;

    if (state === STATES.IDLE || state === STATES.SCANNING || state === STATES.RESULTS) {
      drawScreenVignette();
      drawDepthRings(t);
      drawTickRing(t);
      drawPulseRings();
      drawRotatingRings();
      drawCornerBrackets(t);
      drawCrosshairs();
      drawOrbitalNodes(t);
      drawWaveform(t);
      drawDataReadout();
    }

    if (state === STATES.SCANNING) {
      drawScanBar();
      drawProgressArc();
      drawCenterText(t);
      if (metalScanActive) {
        if (Date.now() < metalScanEnd) drawMetalScan();
        else metalScanActive = false;
      }
    }

    if (state === STATES.RESULTS) {
      drawLockedState();
    }

    ctx.globalAlpha = 1;
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

  // ─── PIERCING IMAGE ANALYSIS ───────────────────────────────────
  function analyzeImageForPiercing() {
    const video = els.video;
    if (!video.videoWidth) return null;

    const S = 120; // sample canvas size
    const offscreen = document.createElement('canvas');
    offscreen.width = S;
    offscreen.height = S;
    const oc = offscreen.getContext('2d', { willReadFrequently: true });

    // Map the scan zone to video-pixel coordinates, accounting for object-fit:cover
    const vW = video.videoWidth, vH = video.videoHeight;
    const videoAspect = vW / vH;
    const screenAspect = W / H;
    let vidDispW, vidDispH, vidOffX = 0, vidOffY = 0;
    if (videoAspect > screenAspect) {
      vidDispH = H;
      vidDispW = H * videoAspect;
      vidOffX = (W - vidDispW) / 2;
    } else {
      vidDispW = W;
      vidDispH = W / videoAspect;
      vidOffY = (H - vidDispH) / 2;
    }

    const scanR = Math.min(W, H) * CONFIG.baseRadiusRatio * 1.1;
    const cx = W / 2, cy = H / 2;
    const scX = vW / vidDispW, scY = vH / vidDispH;
    const sx = ((cx - scanR) - vidOffX) * scX;
    const sy = ((cy - scanR) - vidOffY) * scY;
    const sw = scanR * 2 * scX;
    const sh = scanR * 2 * scY;

    oc.drawImage(video,
      Math.max(0, sx), Math.max(0, sy),
      Math.min(sw, vW - Math.max(0, sx)),
      Math.min(sh, vH - Math.max(0, sy)),
      0, 0, S, S);

    const d = oc.getImageData(0, 0, S, S).data;

    // Analyse upper-centre of the zone — belly button piercings sit at the top rim
    const y1 = 5, y2 = Math.floor(S * 0.58);
    const x1 = Math.floor(S * 0.22), x2 = Math.ceil(S * 0.78);

    let glintScore = 0;
    let gemScore = 0;

    for (let py = y1 + 2; py < y2 - 2; py++) {
      for (let px = x1 + 2; px < x2 - 2; px++) {
        const i = (py * S + px) * 4;
        const r = d[i], g = d[i+1], b = d[i+2];
        const luma = r * 0.299 + g * 0.587 + b * 0.114;

        // Local neighbourhood average (5×5, excluding centre)
        let nbSum = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (!dx && !dy) continue;
            const ni = ((py+dy) * S + (px+dx)) * 4;
            nbSum += d[ni] * 0.299 + d[ni+1] * 0.587 + d[ni+2] * 0.114;
          }
        }
        const nbAvg = nbSum / 24;
        const localContrast = luma - nbAvg;

        // Sharp local brightness peak → metallic specular glint
        if (luma > 185 && localContrast > 32) {
          glintScore += localContrast / 75;
        }

        // Saturated non-skin colour → gem or coloured jewellery
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const sat = maxC > 1 ? (maxC - minC) / maxC : 0;
        // Exclude typical skin tones (R > G > B, low-to-mid saturation)
        const isSkinLike = r > g && g > b * 0.75 && sat < 0.42;
        if (sat > 0.38 && maxC > 90 && !isSkinLike) {
          gemScore += sat;
        }
      }
    }

    const area = (y2 - y1 - 4) * (x2 - x1 - 4);
    const normGlint = Math.min(glintScore / 3, 1);
    const normGem   = Math.min(gemScore / (area * 0.07), 1);
    const score = Math.min(Math.max(normGlint, normGem * 0.85), 1);

    return { score, normGlint, normGem };
  }

  // ─── SCAN SEQUENCE ─────────────────────────────────────────────
  function clearScanTimers() {
    scanTimers.forEach(clearTimeout);
    scanTimers = [];
  }

  function startScan() {
    clearScanTimers();
    piercingAnalysis = null;
    metalScanActive = false;
    setState(STATES.SCANNING);
    scanStartTime = Date.now();
    scanPhase = 0;
    scanProgress = 0;
    centerText = '';
    centerTextAlpha = 0;

    playBeep(660, 0.15);

    scanTimers.push(setTimeout(() => playBeep(880, 0.12), 400));
    scanTimers.push(setTimeout(() => { centerText = 'ANALYZING...'; centerTextAlpha = 0; }, 900));
    scanTimers.push(setTimeout(() => {
      centerText = 'DETECTING IMPLANTS...';
      centerTextAlpha = 0;
      metalScanActive = true;
      metalScanEnd = Date.now() + 650;
      piercingAnalysis = analyzeImageForPiercing();
    }, 1800));
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
    // Bias piercing detection weights based on real camera analysis
    let pw = 35, uw = 63, xw = 2;
    let signalStrength = null;
    if (piercingAnalysis !== null) {
      const s = piercingAnalysis.score;
      if      (s >= 0.60) { pw = 90; uw =  8; xw = 2; }
      else if (s >= 0.40) { pw = 75; uw = 23; xw = 2; }
      else if (s >= 0.22) { pw = 50; uw = 48; xw = 2; }
      else if (s >= 0.10) { pw = 25; uw = 73; xw = 2; }
      else                { pw =  8; uw = 90; xw = 2; }
      // Signal strength shown in results (slightly jittered so it doesn't look algorithmic)
      signalStrength = Math.round(Math.min(98, Math.max(12, s * 100 + (Math.random() - 0.5) * 8)));
    }
    const piercingStatusOptions = [
      { label: 'Pierced', weight: pw }, { label: 'Unpierced', weight: uw }, { label: 'Unknown', weight: xw },
    ];
    const piercingStatus = weightedRandom(piercingStatusOptions);
    const isPierced = piercingStatus === 'Pierced';
    const piercingType      = isPierced ? weightedRandom(DATA.piercingTypes) : null;
    const piercingCondition = isPierced ? pick(DATA.piercingConditions) : null;
    const metalCompat       = isPierced ? weightedRandom(DATA.metalCompatibility) : null;
    const piercingComment   = isPierced ? pick(DATA.piercingComments) : null;
    return { type, score, depth, lint, trait, prophecy, rank, symmetry,
             piercingStatus, isPierced, piercingType, piercingCondition, metalCompat, piercingComment,
             signalStrength };
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

    if (r.isPierced) drawPiercing(c, cx, cy - H * 0.30, W, H, r.piercingType);
  }

  function drawOutieTopography(c, cx, cy, W, H, r) {
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

    if (r.isPierced) drawPiercing(c, cx, cy - H * 0.26, W, H, r.piercingType);
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

  // px, py = piercing anchor point (top of navel rim)
  function drawPiercing(c, px, py, W, H, type) {
    const gold = '#e8d060';
    const silver = '#c8d8e8';
    c.save();
    c.shadowBlur = 10;
    c.shadowColor = gold;

    if (type === 'Belly Bar' || type === 'Curved Barbell') {
      const barLen = H * 0.16;
      // Bar shaft
      c.strokeStyle = silver;
      c.lineWidth = 1.5;
      c.setLineDash([]);
      c.beginPath();
      c.moveTo(px, py - barLen * 0.5);
      c.lineTo(px, py + barLen * 0.5);
      c.stroke();
      // Top ball
      c.beginPath();
      c.arc(px, py - barLen * 0.5, 3.5, 0, Math.PI * 2);
      c.fillStyle = gold;
      c.fill();
      // Bottom ball
      c.beginPath();
      c.arc(px, py + barLen * 0.5, 3.5, 0, Math.PI * 2);
      c.fillStyle = gold;
      c.fill();
      // Piercing callout
      piercingCallout(c, px + 5, py, W, type);

    } else if (type === 'Captive Ring') {
      const rr = H * 0.09;
      c.beginPath();
      c.arc(px, py, rr, Math.PI * 0.15, Math.PI * 1.85);
      c.strokeStyle = silver;
      c.lineWidth = 2;
      c.stroke();
      // Captive bead
      c.shadowColor = gold;
      c.beginPath();
      c.arc(px, py + rr, 3, 0, Math.PI * 2);
      c.fillStyle = gold;
      c.fill();
      piercingCallout(c, px + rr + 4, py, W, type);

    } else if (type === 'Gem Stud') {
      const gemColors = ['#ff4d8d', '#4d8dff', '#4dffd4', '#ff8d4d', '#c84dff'];
      const gemColor = gemColors[Math.floor(Math.random() * gemColors.length)];
      c.shadowColor = gemColor;
      c.shadowBlur = 14;
      c.beginPath();
      c.arc(px, py, 5, 0, Math.PI * 2);
      c.fillStyle = gemColor;
      c.fill();
      // Sparkle cross
      c.shadowBlur = 0;
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(px - 8, py); c.lineTo(px + 8, py);
      c.moveTo(px, py - 8); c.lineTo(px, py + 8);
      c.stroke();
      piercingCallout(c, px + 8, py, W, type);

    } else if (type === 'Shield Piercing') {
      // Teardrop/shield shape
      const sh = H * 0.16, sw = W * 0.06;
      c.beginPath();
      c.moveTo(px, py - sh * 0.55);
      c.lineTo(px + sw, py);
      c.lineTo(px, py + sh * 0.45);
      c.lineTo(px - sw, py);
      c.closePath();
      c.strokeStyle = silver;
      c.lineWidth = 1.2;
      c.stroke();
      c.fillStyle = 'rgba(200, 216, 232, 0.18)';
      c.fill();
      // Inner gem dot
      c.beginPath();
      c.arc(px, py, 2.5, 0, Math.PI * 2);
      c.fillStyle = gold;
      c.fill();
      piercingCallout(c, px + sw + 4, py, W, type);

    } else if (type === 'Multi-Pierced') {
      const offsets = [-W * 0.07, 0, W * 0.07];
      offsets.forEach((ox, idx) => {
        const barLen = H * 0.12;
        c.strokeStyle = silver;
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(px + ox, py - barLen * 0.5);
        c.lineTo(px + ox, py + barLen * 0.5);
        c.stroke();
        c.beginPath();
        c.arc(px + ox, py - barLen * 0.5, 2.5, 0, Math.PI * 2);
        c.fillStyle = idx === 1 ? gold : silver;
        c.fill();
        c.beginPath();
        c.arc(px + ox, py + barLen * 0.5, 2.5, 0, Math.PI * 2);
        c.fillStyle = gold;
        c.fill();
      });
      piercingCallout(c, px + W * 0.07 + 6, py, W, type);
    }

    c.restore();
  }

  function piercingCallout(c, x, y, W, label) {
    const endX = Math.min(x + W * 0.08, W * 0.48);
    c.save();
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(232, 208, 96, 0.4)';
    c.lineWidth = 0.8;
    c.setLineDash([2, 3]);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(endX, y);
    c.stroke();
    c.setLineDash([]);
    c.font = '7px "Courier New"';
    c.fillStyle = 'rgba(232, 208, 96, 0.7)';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(label.toUpperCase(), endX + 2, y);
    c.restore();
  }

  function renderResults(r) {
    const isOutie = r.type === 'Outie';
    const rows = [
      { label: 'BELLY BUTTON TYPE', value: r.type,            accent: isOutie },
      { label: 'NAVEL SCORE',       value: `${r.score} / 100`, accent: false },
      { label: 'DEPTH CLASS',       value: r.depth,            accent: false },
      { label: 'LINT RISK',         value: r.lint,             accent: r.lint === 'Legendary' },
      { label: 'PIERCING STATUS',   value: r.piercingStatus,   accent: r.isPierced },
      ...(r.signalStrength !== null ? [
        { label: 'IMPLANT SIGNAL',  value: r.signalStrength + '%', accent: r.signalStrength > 55 },
      ] : []),
      ...(r.isPierced ? [
        { label: 'PIERCING TYPE',   value: r.piercingType,     accent: false },
        { label: 'CONDITION',       value: r.piercingCondition, accent: false },
        { label: 'METAL COMPAT',    value: r.metalCompat,      accent: r.metalCompat === 'Sensitive' },
      ] : []),
    ];

    const blocks = [
      { label: 'PERSONALITY TRAIT',   value: `"${r.trait}"` },
      ...(r.isPierced ? [{ label: 'PIERCING ANALYSIS', value: `"${r.piercingComment}"` }] : []),
      { label: 'ANCIENT PROPHECY',    value: `"${r.prophecy}"` },
      { label: 'NAVAL ACADEMY RANK',  value: r.rank },
    ];

    let html = '';

    rows.forEach((row, i) => {
      const delay = i * 70;
      html += `<div class="result-row" style="animation-delay:${delay}ms">
        <span class="result-label">${row.label}</span>
        <span class="result-value${row.accent ? ' accent' : ''}">${row.value}</span>
      </div>`;
    });

    html += `<div class="results-divider" style="opacity:0;animation:fadeInUp 0.4s ease ${rows.length * 70}ms forwards"></div>`;

    blocks.forEach((block, i) => {
      const delay = rows.length * 70 + 40 + i * 70;
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
