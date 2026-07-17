const SMALL_IMG = encodeURI('assets/images/Cloud_Small.png');
const SEMIBIG_IMG = encodeURI('assets/images/Cloud_Semibig.png');
const BIG_IMG = encodeURI('assets/images/Cloud_Big.png');
const BIG_BG_IMG = encodeURI('assets/images/Cloud_Big_bg.png');

// Night variants
const BIG_IMG_NIGHT = encodeURI('assets/images/Cloud_Big_Night.png');
const BIG_BG_IMG_NIGHT = encodeURI('assets/images/Cloud_Big_Night_bg.png');

let _smallClouds = []; // { el, x, y, wPx, hPx, vx }
let _smallRAF = null;
let _smallLast = 0;

let _fronts = []; // [{el,x}]
let _bgs = [];    // [{el,x}]
let _bigRAF = null;
let _bigActive = false;

let _heavy = {
  container: null,
  cloudWidthPx: 0,
  tileFactor: 0.95
};

const SMALL_SIZE_SHRINK = 1 / 1; 
const SMALL_BASE_VW = 10;
const SMALL_WIDTH_VW = Math.round(SMALL_BASE_VW * SMALL_SIZE_SHRINK * 100) / 100;

// BG offset as percentage of cloud width
let bgOffsetPercent = 0.25;
function computeBgOffsetPx() {
  return Math.round((bgOffsetPercent || 0.2) * (_heavy.cloudWidthPx || Math.max(600, Math.round(window.innerWidth * (_heavy.tileFactor || 0.95)))));
}
export function setBgOffsetPercent(pct) {
  if (typeof pct !== 'number' || Number.isNaN(pct)) return;
  bgOffsetPercent = Math.max(0, Math.min(1, pct));
  if (_bgs[0] || _bgs[1]) {
    const off = computeBgOffsetPx();
    if (_bgs[0]) {
      _bgs[0].x = _fronts[0].x - off;
      _bgs[0].el.style.left = `${Math.round(_bgs[0].x)}px`;
    }
    if (_bgs[1]) {
      _bgs[1].x = _fronts[1].x - off;
      _bgs[1].el.style.left = `${Math.round(_bgs[1].x)}px`;
    }
  }
}

let theme = 'day'; // 'day' or 'night'
export function setTheme(t) {
  theme = (t === 'night') ? 'night' : 'day';
  // swap existing heavy cloud elements' images if present
  if (_fronts && _fronts.length) {
    for (let f of _fronts) {
      if (f && f.el) {
        f.el.style.backgroundImage = `url(${theme === 'night' ? BIG_IMG_NIGHT : BIG_IMG})`;
      }
    }
  }
  if (_bgs && _bgs.length) {
    for (let b of _bgs) {
      if (b && b.el) {
        b.el.style.backgroundImage = `url(${theme === 'night' ? BIG_BG_IMG_NIGHT : BIG_BG_IMG})`;
      }
    }
  }
}

// allow diagnostics to set pad px for spawn
let spawnPadPx = 50;
export function setSpawnPadPx(px) { spawnPadPx = Number(px) || 50; }

// debugging state
export function _debug_state() {
  return {
    smallClouds: _smallClouds.length,
    bigFronts: _fronts.length,
    bigBgs: _bgs.length,
    bigActive: !!_bigActive,
    theme
  };
}

export function startClouds(containerId = 'cloudsContainer', coverage = 30) {
  stopClouds(containerId);
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn('clouds: container not found:', containerId);
    return;
  }

  coverage = Math.max(0, Math.min(100, Number(coverage) || 0));
  const mode = (coverage <= 50) ? 'light' : 'heavy';

  if (mode === 'light') {
    // --- Mode A: small clouds ---
    const count = Math.round(map(coverage, 0, 50, 3, 12));
    const topAreaH = 0.15;

    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'ww-cloud ww-cloud-small';
      const img = Math.random() < 0.7 ? SMALL_IMG : SEMIBIG_IMG;
      el.style.backgroundImage = `url(${img})`;
      el.style.backgroundRepeat = 'no-repeat';
      el.style.backgroundPosition = 'center';
      el.style.backgroundSize = '100% 100%';
      el.style.position = 'absolute';
      el.style.pointerEvents = 'none';
      el.style.opacity = '0';
      el.style.width = `${SMALL_WIDTH_VW}vw`;
      el.style.height = '2px';

      const x = Math.random() * window.innerWidth;
      const y = Math.random() * (window.innerHeight * topAreaH);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;

      container.appendChild(el);

      const probe = new Image();
      probe.src = img;
      probe.onload = () => {
        const aspect = probe.naturalHeight / probe.naturalWidth;
        const widthPx = (SMALL_WIDTH_VW / 100) * window.innerWidth;
        const heightPx = Math.max(8, Math.round(widthPx * aspect * 1.5));
        el.style.height = `${heightPx}px`;
        requestAnimationFrame(() => {
          el.style.transition = 'opacity 900ms ease, transform 900ms ease';
          el.style.opacity = '1';
        });
      };
      probe.onerror = () => {
        const widthPx = (SMALL_WIDTH_VW / 100) * window.innerWidth;
        const heightPx = Math.round(widthPx * 0.45 * 1.5); 
        el.style.height = `${heightPx}px`;
        requestAnimationFrame(() => { el.style.opacity = '1'; });
      };

      const vx = randRange(8, 40) * (Math.random() < 0.5 ? 1 : -1);
      _smallClouds.push({ el, x, y, wPx: null, hPx: null, vx });
    }

    if (!_smallRAF) {
      _smallLast = performance.now();
      _smallRAF = requestAnimationFrame(_smallTick);
    }

    return { mode, count, coverage };
  } else {
    // --- Mode B: heavy overcast ---
    _bigActive = true;
    _heavy.container = container;

    const tileWidth = Math.max(600, Math.round(window.innerWidth * _heavy.tileFactor));
    _heavy.cloudWidthPx = tileWidth;
    const tileHeight = 150;

    function makeCloud(isBg) {
      const el = document.createElement('div');
      el.className = isBg ? 'ww-cloud ww-cloud-big bg' : 'ww-cloud ww-cloud-big fg';
      // pick night/day image
      const useImg = theme === 'night' ? (isBg ? BIG_BG_IMG_NIGHT : BIG_IMG_NIGHT) : (isBg ? BIG_BG_IMG : BIG_IMG);
      el.style.backgroundImage = `url(${useImg})`;
      el.style.backgroundRepeat = 'no-repeat';
      el.style.backgroundPosition = 'center center';
      el.style.backgroundSize = '100% 100%';
      el.style.position = 'absolute';
      el.style.pointerEvents = 'none';
      el.style.top = '0px';
      el.style.width = `${tileWidth}px`;
      el.style.height = `${tileHeight}px`;
      el.style.opacity = isBg ? '0.96' : '1';
      el.style.zIndex = isBg ? '0' : '1';
      container.appendChild(el);
      return { el, x: 0 };
    }

    _fronts = [makeCloud(false), makeCloud(false)];
    _bgs = [makeCloud(true), makeCloud(true)];

    _fronts[0].x = -spawnPadPx; 
    _fronts[1].x = tileWidth - spawnPadPx;
    const off = computeBgOffsetPx();
    _bgs[0].x = _fronts[0].x - off;
    _bgs[1].x = _fronts[1].x - off;

    _fronts.forEach(f => f.el.style.left = `${f.x}px`);
    _bgs.forEach(b => b.el.style.left = `${b.x}px`);

    let last = performance.now();
    function bigTick(now) {
      if (!_bigActive) return;
      const dt = (now - last) / 1000;
      last = now;
      const speed = Math.max(25, Math.round(window.innerWidth / 25));

      for (let i = 0; i < 2; i++) {
        _fronts[i].x -= speed * dt;
        _bgs[i].x = _fronts[i].x - computeBgOffsetPx();
      }

      for (let i = 0; i < 2; i++) {
        if (_fronts[i].x <= -tileWidth+230) {
          const other = (i === 0 ? 1 : 0);
          _fronts[i].x = _fronts[other].x + tileWidth;
          _bgs[i].x = _fronts[i].x - computeBgOffsetPx();
        }
      }

      for (let i = 0; i < 2; i++) {
        _fronts[i].el.style.left = `${Math.round(_fronts[i].x)}px`;
        _bgs[i].el.style.left = `${Math.round(_bgs[i].x)}px`;
      }

      _bigRAF = requestAnimationFrame(bigTick);
    }
    _bigRAF = requestAnimationFrame(bigTick);

    return { mode, coverage };
  }
}

export function stopClouds(containerId = 'cloudsContainer') {
  if (_smallRAF) {
    cancelAnimationFrame(_smallRAF);
    _smallRAF = null;
  }
  _smallClouds.forEach(s => { if (s.el && s.el.parentNode) s.el.parentNode.removeChild(s.el); });
  _smallClouds = [];

  _bigActive = false;
  if (_bigRAF) {
    cancelAnimationFrame(_bigRAF);
    _bigRAF = null;
  }
  _fronts.forEach(f => { if (f.el && f.el.parentNode) f.el.parentNode.removeChild(f.el); });
  _bgs.forEach(b => { if (b.el && b.el.parentNode) b.el.parentNode.removeChild(b.el); });
  _fronts = [];
  _bgs = [];
}

/* ==== internals ==== */
function _smallTick(now) {
  if (!_smallRAF) return;
  const dt = (now - _smallLast) / 1000;
  _smallLast = now;
  const wrapPad = 60;
  for (let i = 0; i < _smallClouds.length; i++) {
    const s = _smallClouds[i];
    s.x += s.vx * dt;
    if (s.x < -wrapPad) s.x = window.innerWidth + wrapPad;
    if (s.x > window.innerWidth + wrapPad) s.x = -wrapPad;
    if (s.el) s.el.style.left = `${Math.round(s.x)}px`;
  }
  _smallRAF = requestAnimationFrame(_smallTick);
}

/* helpers */
function randRange(a, b) { return +(a + Math.random() * (b - a)); }
function map(v, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return outMin;
  const t = Math.max(0, Math.min(1, (v - inMin) / (inMax - inMin)));
  return Math.round(outMin + t * (outMax - outMin));
}
