const DEFAULT_DROP_IMAGES = [
    'assets/images/Raindrop_big.png',
    'assets/images/Raindrop_mid.png',
    'assets/images/Raindrop_small.png'
];

function randRange(a, b) { return a + Math.random() * (b - a); }

let _cfg = {
    containerId: 'rainContainer',
    dropImages: DEFAULT_DROP_IMAGES.slice(),
    spawnRateMs: 100,
    maxDrops: 40,
    sizeBias: 0.45,
    zIndex: 6,         
    splashCount: 6,
    splashSizeRange: [2, 4],
    splashVYRange: [-652, -280],
    splashVXRange: [-100, 100],
    splashGravity: 1950,
    showAbove: false
};
let _state = {
    containerEl: null,
    running: false,
    drops: [],
    splashes: [],
    lastSpawn: 0,
    rafId: null,
    lastTick: performance.now()
};

/* ========== Public: preload images ========== */
export function preload() {
    return Promise.all(_cfg.dropImages.map(src => new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve({ src, ok: true, w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ src, ok: false });
        img.src = src;
    })));
}

/* ========== Config setters/getters ========== */
export function setConfig(opts = {}) {
    if (typeof opts !== 'object' || !opts) return;
    if (typeof opts.spawnRateMs === 'number') _cfg.spawnRateMs = opts.spawnRateMs;
    if (typeof opts.maxDrops === 'number') _cfg.maxDrops = opts.maxDrops;
    if (typeof opts.sizeBias === 'number') _cfg.sizeBias = opts.sizeBias;
    if (Array.isArray(opts.dropImages) && opts.dropImages.length) _cfg.dropImages = opts.dropImages.slice();
    if (typeof opts.zIndex === 'number') _cfg.zIndex = opts.zIndex;
    if (typeof opts.containerId === 'string') _cfg.containerId = opts.containerId;
}

export function setSplashConfig(opts = {}) {
    if (typeof opts !== 'object' || !opts) return;
    if (Array.isArray(opts.splashSizeRange)) _cfg.splashSizeRange = opts.splashSizeRange.slice();
    if (Array.isArray(opts.splashVYRange)) _cfg.splashVYRange = opts.splashVYRange.slice();
    if (Array.isArray(opts.splashVXRange)) _cfg.splashVXRange = opts.splashVXRange.slice();
    if (typeof opts.splashCount === 'number') _cfg.splashCount = opts.splashCount;
    if (typeof opts.splashGravity === 'number') _cfg.splashGravity = opts.splashGravity;
}

export function setShowAbove(v) {
    _cfg.showAbove = !!v;
}

export function getState() {
    return {
        running: _state.running,
        dropsCount: _state.drops.length,
        splashesCount: _state.splashes.length,
        spawnRateMs: _cfg.spawnRateMs,
        maxDrops: _cfg.maxDrops,
        zIndex: _cfg.zIndex
    };
}

export function getDrops() {
    // return copies with useful fields
    return _state.drops.map(d => ({ left: d.absLeft, top: d.absTop, w: d.w, h: d.h, speed: d.speed }));
}

/* ========== Internals: container / helpers ========== */
function _ensureContainer(containerId) {
    const id = containerId || _cfg.containerId;
    _cfg.containerId = id;
    _state.containerEl = document.getElementById(id) || null;
    return _state.containerEl;
}

function _getContainerRectSafe() {
    if (_state.containerEl) {
        try {
            const r = _state.containerEl.getBoundingClientRect();
            if (!r.width || r.width < 4) {
                return { left: 0, top: 0, width: Math.max(320, window.innerWidth), height: window.innerHeight };
            }
            return r;
        } catch (e) {
            return { left: 0, top: 0, width: Math.max(320, window.innerWidth), height: window.innerHeight };
        }
    }
    return { left: 0, top: 0, width: Math.max(320, window.innerWidth), height: window.innerHeight };
}

function chooseDropImage() {
    // simple biased chooser
    const r = Math.random();
    if (r < 0.33) return _cfg.dropImages[0];
    if (r < 0.66) return _cfg.dropImages[1];
    return _cfg.dropImages[2];
}

/* ========== Make drop & splash ========== */
function _makeDrop() {
    const crect = _getContainerRectSafe();
    const img = chooseDropImage();
    const el = document.createElement('div');
    el.className = 'ww-drop';
    el.style.backgroundImage = `url(${img})`;
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundPosition = 'center';
    el.style.backgroundSize = 'contain';

    // size & speed heuristics copied from test harness
    const map = {
        'Raindrop_big.png': { w: Math.round(28 * 1.5), speed: randRange(560 * 3, 820 * 3) },
        'Raindrop_mid.png': { w: Math.round(20 * 1.5), speed: randRange(420 * 3, 660 * 3) },
        'Raindrop_small.png': { w: Math.round(12 * 1.5), speed: randRange(300 * 3, 520 * 3) }
    };
    const fname = img.split('/').pop();
    const info = map[fname] || { w: Math.round(18 * 1.5), speed: randRange(320 * 3, 720 * 3) };
    const w = info.w, h = Math.round(w * 1.8);
    const relX = Math.round(Math.random() * Math.max(0, crect.width - w));
    const relY = -h - Math.round(randRange(0, 50));

    const absLeft = Math.round(crect.left + relX);
    const absTop = Math.round(crect.top + relY);

    if (_state.containerEl) {
        // append inside container so drops are inside overlay stacking context
        el.style.position = 'absolute';
        el.style.left = `${relX}px`;
        el.style.top = `${relY}px`;
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
        el.style.zIndex = String(_cfg.zIndex);
        _state.containerEl.appendChild(el);
    } else {
        // fallback to body-fixed (rare)
        el.style.position = 'fixed';
        el.style.left = `${absLeft}px`;
        el.style.top = `${absTop}px`;
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
        el.style.zIndex = String(_cfg.zIndex);
        document.body.appendChild(el);
    }

    const drop = {
        el,
        inContainer: !!_state.containerEl,
        relX, relY,
        absLeft, absTop,
        w, h, speed: info.speed,
        created: performance.now()
    };
    _state.drops.push(drop);
    _state.lastSpawn = performance.now();
    return drop;
}

function _makeSplashesAt(sx, sy) {
    // sx,sy are absolute page coords (drop bottom)
    const crect = _getContainerRectSafe();
    for (let i = 0; i < _cfg.splashCount; i++) {
        const size = Math.round(randRange(_cfg.splashSizeRange[0], _cfg.splashSizeRange[1]));
        const el = document.createElement('div');
        el.className = 'ww-splash';
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.background = '#93D8E6';
        el.style.borderRadius = '50%';
        el.style.opacity = '1';
        el.style.transition = 'transform 160ms cubic-bezier(.2,.9,.2,1), opacity 360ms linear';
        el.style.mixBlendMode = 'screen';

        if (_cfg.showAbove) {
            el.style.position = 'fixed';
            el.style.left = `${Math.round(sx - size / 2)}px`;
            el.style.top = `${Math.round(sy - size / 2)}px`;
            el.style.zIndex = '999999';
            document.body.appendChild(el);
        } else if (_state.containerEl) {
            el.style.position = 'absolute';
            el.style.left = `${Math.round(sx - crect.left - size / 2)}px`;
            el.style.top = `${Math.round(sy - crect.top - size / 2)}px`;
            el.style.zIndex = String(_cfg.zIndex);
            _state.containerEl.appendChild(el);
        } else {
            // fallback
            el.style.position = 'fixed';
            el.style.left = `${Math.round(sx - size / 2)}px`;
            el.style.top = `${Math.round(sy - size / 2)}px`;
            el.style.zIndex = String(_cfg.zIndex);
            document.body.appendChild(el);
        }

        const splash = {
            el,
            x: sx - size / 2,
            y: sy - size / 2,
            vx: randRange(_cfg.splashVXRange[0], _cfg.splashVXRange[1]),
            vy: randRange(_cfg.splashVYRange[0], _cfg.splashVYRange[1]),
            size,
            created: performance.now()
        };
        _state.splashes.push(splash);
    }
}

/* ========== Tick loop ========== */
function _fillToMax() {
    while (_state.drops.length < _cfg.maxDrops) _makeDrop();
}

function _tick(now) {
    const dt = (now - _state.lastTick) / 1000;
    _state.lastTick = now;

    if (_state.running && (now - _state.lastSpawn) >= _cfg.spawnRateMs && _state.drops.length < _cfg.maxDrops) {
        _makeDrop();
    }

    const crect = _getContainerRectSafe();
    const viewportH = window.innerHeight;

    // update drops
    for (let i = _state.drops.length - 1; i >= 0; i--) {
        const d = _state.drops[i];
        d.absTop += d.speed * dt;

        // update DOM position
        if (d.inContainer && d.el && d.el.parentNode === _state.containerEl) {
            d.el.style.top = `${Math.round(d.absTop - crect.top)}px`;
        } else if (d.el) {
            d.el.style.top = `${Math.round(d.absTop)}px`;
        }

        // collision detection — sample FG canvas alpha at drop-bottom.
        const bottomX = d.absLeft + Math.round(d.w / 2);
        const bottomY = d.absTop + d.h;

        let collided = false;
        const fgCanvas = document.getElementById('riveCanvasFg');
        if (fgCanvas instanceof HTMLCanvasElement) {
            // map bottomX/bottomY to FG canvas pixels
            try {
                const fgRect = fgCanvas.getBoundingClientRect();
                const cw = fgCanvas.width, ch = fgCanvas.height;
                const px = Math.floor((bottomX - fgRect.left) * (cw / fgRect.width));
                const py = Math.floor((bottomY - fgRect.top) * (ch / fgRect.height));
                if (px >= 0 && py >= 0 && px < cw && py < ch) {
                    const ctx = fgCanvas.getContext('2d', { willReadFrequently: true });
                    const data = ctx.getImageData(px, py, 1, 1).data;
                    if (data && data[3] > 24) collided = true;
                }
            } catch (e) {
                // sampling may fail due to tainting; fall back to container-bottom
                const crect2 = _getContainerRectSafe();
                if (d.absTop + d.h >= crect2.top + crect2.height - 2) collided = true;
            }
        } else {
            // no fg canvas; fallback: container bottom
            const crect2 = _getContainerRectSafe();
            if (d.absTop + d.h >= crect2.top + crect2.height - 2) collided = true;
        }

        if (collided) {
            // create splashes at bottom
            _makeSplashesAt(bottomX, bottomY);
            // remove drop
            if (d.el && d.el.parentNode) d.el.parentNode.removeChild(d.el);
            _state.drops.splice(i, 1);
            continue;
        }

        if (d.absTop > viewportH + 200) {
            if (d.el && d.el.parentNode) d.el.parentNode.removeChild(d.el);
            _state.drops.splice(i, 1);
        }
    }

    // update splashes
    for (let i = _state.splashes.length - 1; i >= 0; i--) {
        const s = _state.splashes[i];
        s.vy += _cfg.splashGravity * dt;
        s.vx *= (1 - Math.min(0.45, 0.02 * dt * 60));
        s.x += s.vx * dt;
        s.y += s.vy * dt;

        if (s.el) {
            if (_cfg.showAbove || !_state.containerEl) {
                // fixed coordinates (body appended)
                s.el.style.left = `${Math.round(s.x)}px`;
                s.el.style.top = `${Math.round(s.y)}px`;
            } else {
                // container-relative
                const crect2 = _getContainerRectSafe();
                s.el.style.left = `${Math.round(s.x - crect2.left)}px`;
                s.el.style.top = `${Math.round(s.y - crect2.top)}px`;
            }
            // scale/opacity timeline
            const ago = (performance.now() - s.created) / 1000;
            if (ago < 0.12) s.el.style.transform = 'scale(1.25)';
            else if (ago < 0.36) s.el.style.transform = 'scale(1.02)';
            else s.el.style.transform = 'scale(1)';
            if (ago > 1.6) s.el.style.opacity = String(Math.max(0, 1 - (ago - 1.6)));
        }

        if (s.y > window.innerHeight + 320 || s.x < -400 || s.x > window.innerWidth + 400) {
            if (s.el && s.el.parentNode) s.el.parentNode.removeChild(s.el);
            _state.splashes.splice(i, 1);
        }
    }

    _state.rafId = requestAnimationFrame(_tick);
}

/* ========== Public runners ========== */
export function startRain(containerId = undefined, options = {}) {
    _ensureContainer(containerId);
    if (typeof options === 'object' && options) {
        if (options.containerId) _cfg.containerId = options.containerId;
        if (options.dropImages) _cfg.dropImages = options.dropImages.slice();
        if (typeof options.maxDrops === 'number') _cfg.maxDrops = options.maxDrops;
        if (typeof options.spawnRateMs === 'number') _cfg.spawnRateMs = options.spawnRateMs;
    }

    _state.running = true;
    _state.lastTick = performance.now();
    _state.lastSpawn = 0;

    // warm fill
    _fillToMax();

    if (!_state.rafId) _state.rafId = requestAnimationFrame(_tick);
    return true;
}

export function stopRain() {
    _state.running = false;
    if (_state.rafId) {
        cancelAnimationFrame(_state.rafId);
        _state.rafId = null;
    }
    return true;
}

export function clearRain() {
    stopRain();
    _state.drops.forEach(d => { try { if (d.el && d.el.parentNode) d.el.parentNode.removeChild(d.el); } catch (_) { } });
    _state.splashes.forEach(s => { try { if (s.el && s.el.parentNode) s.el.parentNode.removeChild(s.el); } catch (_) { } });
    _state.drops = [];
    _state.splashes = [];
    return true;
}

export function spawnBurst(n = 10) {
    for (let i = 0; i < n; i++) {
        if (_state.drops.length >= _cfg.maxDrops) break;
        _makeDrop();
    }
    return _state.drops.length;
}

/* debug hook */
if (typeof window !== 'undefined') {
    window._RAIN = window._RAIN || {};
    window._RAIN.get = () => ({ getState, getDrops, startRain, stopRain, clearRain, spawnBurst, setConfig, setSplashConfig, setShowAbove });
}
