// effects/drones.js
// Drone visual effects module (auto-starts on import after DOM ready)
// Exports: startDrones(opts), stopDrones(), setTheme(theme), setSpawnPadPx(px),
//          spawnBigDrone(), spawnSmallPack(), _debug_state()

/* ---------- CONFIG / ASSETS ---------- */
// Paths — update if your assets live elsewhere
const IMG = {
    drone_day: 'assets/images/drone_day.png',
    drone_night: 'assets/images/drone_night.png',
    // package drone only for day
    drone_package_day: 'assets/images/drone_package_day.png',
    drone_small_day: 'assets/images/drone_small_day.png',
    drone_small_night: 'assets/images/drone_small_night.png'
};

/* ---------- INTERNAL STATE ---------- */
let _frontContainer = null;
let _backContainer = null;
let _bigDrones = [];        // {el, dir, speed, widthPx, heightPx, _x}
let _smallDrones = [];      // {el, targetY, speed, dir, widthPx, heightPx, state, _x}
let _bigRAF = null;
let _smallRAF = null;
let _bigSpawnerTimer = null;
let _smallSpawnerTimer = null;
let _theme = 'day';
let _spawnPadPx = 60;
let _enabled = false;

/* ---------- DETERMINISTIC SIZING & SPEED (fixed, no randomness) ---------- */
const SIZE_SCALE = 1 / 2.5; // scale down

const BIG_WIDTH_PX = Math.round(125 * SIZE_SCALE); // ~50
const BIG_HEIGHT_MULT = 0.45;
const BIG_HEIGHT_PX = Math.round(BIG_WIDTH_PX * BIG_HEIGHT_MULT);

const SMALL_WIDTH_PX = Math.round(36 * SIZE_SCALE); // ~14
const SMALL_HEIGHT_MULT = 0.46;
const SMALL_HEIGHT_PX = Math.round(SMALL_WIDTH_PX * SMALL_HEIGHT_MULT);

const BIG_SPEED_PX_S = 220;
const SMALL_SPEED_PX_S = 100;

const BIG_SPAWN_INTERVAL_MS = 2000;
const SMALL_SPAWN_INTERVAL_MS = 3500;
const SMALL_PACK_MAX = 3;
let MAX_BIG_ONSCREEN = 1; // will adapt based on theme
const MAX_SMALL_ONSCREEN = 18;

/* ---------- STYLES (injected) ---------- */
(function injectStyles() {
    if (document.getElementById('effects-drones-styles')) return;
    const s = document.createElement('style');
    s.id = 'effects-drones-styles';
    s.textContent = `
    #dronesLayerFront, #dronesLayerBack { position: fixed; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; }
    #dronesLayerFront { z-index: 4; } /* intended to sit between bg and trees */
    #dronesLayerBack { z-index: -5; } /* behind everything */
    .ww-drone { position:absolute; will-change: transform, left, top; pointer-events:none; user-select:none; }
    .ww-drone img { display:block; width:100%; height:100%; pointer-events:none; user-select:none; }
    .ww-drone.small { transition: top 700ms cubic-bezier(.2,.9,.2,1); }
  `;
    document.head.appendChild(s);
})();

/* ---------- HELPERS ---------- */
function randRange(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* Ensure containers exist */
/* Ensure containers exist */
function ensureContainers() {
    if (_frontContainer && document.getElementById('dronesLayerFront')) {
        return { front: _frontContainer, back: _backContainer };
    }

    const existingFront = document.getElementById('dronesLayerFront');
    const existingBack = document.getElementById('dronesLayerBack');

    if (existingFront) _frontContainer = existingFront;
    if (existingBack) _backContainer = existingBack;

    if (!_frontContainer) {
        const el = document.createElement('div');
        el.id = 'dronesLayerFront';
        el.className = 'drones-layer-front';
        el.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:4;';

        const bg = document.getElementById('riveCanvasBg');
        const trees = document.getElementById('riveCanvasTrees');

        if (bg && trees && bg.parentNode && bg.parentNode === trees.parentNode) {
            // safe: same parent
            bg.parentNode.insertBefore(el, trees);
        } else if (bg && bg.parentNode) {
            // fallback: just insert right after bg
            bg.parentNode.insertBefore(el, bg.nextSibling);
        } else {
            // ultimate fallback: body append
            document.body.appendChild(el);
        }
        _frontContainer = el;
    }

    if (!_backContainer) {
        const el2 = document.createElement('div');
        el2.id = 'dronesLayerBack';
        el2.className = 'drones-layer-back';
        el2.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:-5;';

        const bg = document.getElementById('riveCanvasBg');
        if (bg && bg.parentNode) {
            bg.parentNode.insertBefore(el2, bg);
        } else {
            document.body.insertBefore(el2, document.body.firstChild);
        }
        _backContainer = el2;
    }

    return { front: _frontContainer, back: _backContainer };
}


/* Create drone DOM */
function makeDroneEl(imgUrl, widthPx, heightPx, extraClass) {
    const el = document.createElement('div');
    el.className = 'ww-drone' + (extraClass ? ' ' + extraClass : '');
    el.style.width = (widthPx || 60) + 'px';
    el.style.height = (heightPx || 30) + 'px';
    el.style.left = '-9999px';
    el.style.top = '-9999px';
    el.style.position = 'absolute';
    el.style.pointerEvents = 'none';
    el.style.transform = 'translate3d(0,0,0)';
    const img = document.createElement('img');
    img.src = imgUrl;
    img.draggable = false;
    img.alt = 'drone';
    el.appendChild(img);
    return el;
}

/* ---------- SPAWN ---------- */
export function spawnBigDrone() {
    ensureContainers();
    if (!_frontContainer) return null;
    if (_bigDrones.length >= MAX_BIG_ONSCREEN) return null;

    let img;
    if (_theme === 'night') img = IMG.drone_night;
    else img = (Math.random() < 0.18) ? IMG.drone_package_day : IMG.drone_day;

    const el = makeDroneEl(img, BIG_WIDTH_PX, BIG_HEIGHT_PX, 'big');

    const dir = (_theme === 'night') ? -1 : (Math.random() < 0.5 ? -1 : 1);
    const startX = dir === -1 ? (window.innerWidth + _spawnPadPx + BIG_WIDTH_PX) : (-_spawnPadPx - BIG_WIDTH_PX);
    const y = clamp(Math.round(window.innerHeight * 0.71 - (BIG_HEIGHT_PX / 2)), 12, Math.max(12, window.innerHeight - 120));

    el.style.left = startX + 'px';
    el.style.top = y + 'px';

    const droneObj = { el, dir, speed: BIG_SPEED_PX_S, widthPx: BIG_WIDTH_PX, heightPx: BIG_HEIGHT_PX, _x: startX };
    _frontContainer.appendChild(el);
    _bigDrones.push(droneObj);

    if (!_bigRAF) startBigRAF();

    return droneObj;
}

export function spawnSmallPack() {
    ensureContainers();
    if (!_backContainer) return null;
    if (_smallDrones.length >= MAX_SMALL_ONSCREEN) return null;

    const packSize = Math.max(1, Math.round(randRange(1, SMALL_PACK_MAX + 0.49)));
    const created = [];

    for (let i = 0; i < packSize; i++) {
        const img = (_theme === 'night') ? IMG.drone_small_night : IMG.drone_small_day;
        const el = makeDroneEl(img, SMALL_WIDTH_PX, SMALL_HEIGHT_PX, 'small');

        const bottomY = window.innerHeight + 8;
        const targetY = clamp(Math.round(window.innerHeight * 0.60 - (SMALL_HEIGHT_PX / 2)), 12, Math.max(12, window.innerHeight - 80));
        const spawnX = Math.round(randRange(window.innerWidth * 0.05, window.innerWidth * 0.95));
        el.style.left = spawnX + 'px';
        el.style.top = bottomY + 'px';

        _backContainer.appendChild(el);

        const dir = (_theme === 'night') ? -1 : (Math.random() < 0.5 ? -1 : 1);
        const droneObj = { el, targetY, speed: SMALL_SPEED_PX_S, dir, widthPx: SMALL_WIDTH_PX, heightPx: SMALL_HEIGHT_PX, state: 'rising', _x: spawnX };
        _smallDrones.push(droneObj);
        created.push(droneObj);

        setTimeout(() => { el.style.top = targetY + 'px'; }, Math.round(i * 90 + Math.random() * 160));
    }

    if (!_smallRAF) startSmallRAF();
    return created;
}

/* ---------- RAF (movement) ---------- */
function startBigRAF() {
    if (_bigRAF) return;
    let last = performance.now();
    function tick(now) {
        const dt = (now - last) / 1000; last = now;
        for (let i = _bigDrones.length - 1; i >= 0; i--) {
            const d = _bigDrones[i];
            d._x = d._x + (d.dir * d.speed * dt);
            d.el.style.left = Math.round(d._x) + 'px';
            if ((d.dir === -1 && d._x < -d.widthPx - _spawnPadPx) || (d.dir === 1 && d._x > window.innerWidth + d.widthPx + _spawnPadPx)) {
                d.el.remove(); _bigDrones.splice(i, 1);
            }
        }
        _bigRAF = requestAnimationFrame(tick);
    }
    _bigRAF = requestAnimationFrame(tick);
}

function startSmallRAF() {
    if (_smallRAF) return;
    let last = performance.now();
    function tick(now) {
        const dt = (now - last) / 1000; last = now;
        for (let i = _smallDrones.length - 1; i >= 0; i--) {
            const d = _smallDrones[i];
            const curTop = parseFloat(d.el.style.top) || d.targetY;
            if (d.state === 'rising' && Math.abs(curTop - d.targetY) < 6) { d.state = 'flying'; }
            if (d.state === 'flying') {
                d._x = d._x + (d.dir * d.speed * dt);
                d.el.style.left = Math.round(d._x) + 'px';
                if ((d.dir === -1 && d._x < -d.widthPx - _spawnPadPx) || (d.dir === 1 && d._x > window.innerWidth + d.widthPx + _spawnPadPx)) {
                    d.el.remove(); _smallDrones.splice(i, 1);
                }
            }
        }
        _smallRAF = requestAnimationFrame(tick);
    }
    _smallRAF = requestAnimationFrame(tick);
}

/* ---------- SPAWNER INTERVALS ---------- */
function _startSpawners() {
    _stopSpawners();
    _bigSpawnerTimer = setInterval(() => {
        if (_enabled && _bigDrones.length < MAX_BIG_ONSCREEN) spawnBigDrone();
    }, BIG_SPAWN_INTERVAL_MS + Math.round(Math.random() * 800));

    _smallSpawnerTimer = setInterval(() => {
        if (_enabled && _smallDrones.length < MAX_SMALL_ONSCREEN) spawnSmallPack();
    }, SMALL_SPAWN_INTERVAL_MS + Math.round(Math.random() * 1200));
}

function _stopSpawners() {
    if (_bigSpawnerTimer) clearInterval(_bigSpawnerTimer), _bigSpawnerTimer = null;
    if (_smallSpawnerTimer) clearInterval(_smallSpawnerTimer), _smallSpawnerTimer = null;
}

/* ---------- PUBLIC API ---------- */
export function startDrones(opts = {}) {
    if (_enabled) return true;
    if (opts.theme) _theme = opts.theme === 'night' ? 'night' : 'day';
    MAX_BIG_ONSCREEN = (_theme === 'night') ? 1 : 2;
    ensureContainers();
    _enabled = true;
    _startSpawners();
    if (_bigDrones.length > 0 && !_bigRAF) startBigRAF();
    if (_smallDrones.length > 0 && !_smallRAF) startSmallRAF();
    console.log('[drones] startDrones called, theme:', _theme);
    return true;
}

export function stopDrones() {
    _enabled = false;
    _stopSpawners();
    if (_bigRAF) cancelAnimationFrame(_bigRAF), _bigRAF = null;
    if (_smallRAF) cancelAnimationFrame(_smallRAF), _smallRAF = null;
    _bigDrones.forEach(d => d.el.remove());
    _smallDrones.forEach(d => d.el.remove());
    _bigDrones = []; _smallDrones = [];
    console.log('[drones] stopDrones cleaned');
    return true;
}

export function setTheme(themeName) {
    _theme = themeName === 'night' ? 'night' : 'day';
    MAX_BIG_ONSCREEN = (_theme === 'night') ? 1 : 2;
    _bigDrones.forEach(d => {
        const img = d.el.querySelector('img');
        if (img) img.src = (_theme === 'night') ? IMG.drone_night : (Math.random() < 0.18 ? IMG.drone_package_day : IMG.drone_day);
    });
    _smallDrones.forEach(d => {
        const img = d.el.querySelector('img');
        if (img) img.src = (_theme === 'night') ? IMG.drone_small_night : IMG.drone_small_day;
    });
    console.log('[drones] setTheme ->', _theme);
}

export function setSpawnPadPx(px) { _spawnPadPx = Number(px) || _spawnPadPx; }

export function _debug_state() {
    return {
        enabled: _enabled, theme: _theme,
        bigCount: _bigDrones.length, smallCount: _smallDrones.length,
        frontContainerExists: !!_frontContainer, backContainerExists: !!_backContainer,
        bigRAF: !!_bigRAF, smallRAF: !!_smallRAF,
        bigSpawnerTimer: !!_bigSpawnerTimer, smallSpawnerTimer: !!_smallSpawnerTimer
    };
}

export { spawnBigDrone as _spawnBigDrone, spawnSmallPack as _spawnSmallPack };

/* ---------- AUTO-START ---------- */
(function registerAndAutoStart() {
    try {
        window.__EFFECTS = window.__EFFECTS || {};
        window.__EFFECTS.drones = { startDrones, stopDrones, setTheme, setSpawnPadPx, _debug_state, _spawnBigDrone: spawnBigDrone, _spawnSmallPack: spawnSmallPack };
        window.effects = window.effects || {};
        window.effects.drones = window.__EFFECTS.drones;
        console.log('[drones] registered at window.__EFFECTS.drones');
    } catch (e) { console.warn('[drones] registration failed', e); }

    let attempts = 0;
    const poll = setInterval(() => {
        attempts++;
        const docReady = document.readyState === 'complete' || document.readyState === 'interactive';
        if (docReady) {
            const theme = (document.documentElement.classList.contains('night')) ? 'night' : 'day';
            startDrones({ theme });
            clearInterval(poll);
        }
        if (attempts > 30) clearInterval(poll);
    }, 200);
})();
