

const DEFAULT_CONTAINER = 'hourlyPanel';
const HOURS_TO_SHOW = 12; // <-- changed to 12 hours
const SVG_W = 1600, SVG_H = 280;
const LEFT_MARGIN = 80, RIGHT_MARGIN = 80;
const TOP_Y = 60, BOTTOM_Y = 220;

// Move graph up 140px (negative translates up)
const GRAPH_OFFSET_Y = 30; 

let _apiKey = '';
let _inited = false;
let _containerId = DEFAULT_CONTAINER;
let _lastPayload = null;
let _state = { visible: false, lastCity: null, lastUsedHours: 0 };

// helpers
function epochNowSec() { return Math.floor(Date.now() / 1000); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function safeIconUrl(u) { if (!u) return ''; return (u.startsWith('//') ? 'https:' + u : u); }

function ensureRoot(containerId) {
    _containerId = containerId || DEFAULT_CONTAINER;
    let root = document.getElementById(_containerId);
    if (!root) {
        root = document.createElement('div');
        root.id = _containerId;
        document.body.appendChild(root);
    }
    if (!root.classList.contains('ww-hourly-root')) root.classList.add('ww-hourly-root');

    // panel element
    let panel = root.querySelector('.ww-hourly-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.className = 'ww-hourly-panel';
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-label', 'Hourly forecast panel');
        panel.innerHTML = `
      <div class="ww-hourly-inner">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <button class="ww-peek-arrow inline-hidden" aria-label="Open hourly">⤵</button>
          <div class="ww-hourly-title">Hourly — next ${HOURS_TO_SHOW} hours</div>
          <div style="flex:1"></div>
          <div class="ww-hourly-subtitle">No API key set</div>
        </div>
        <div class="ww-hourly-svg-wrap" style="height:${SVG_H}px;width:100%;overflow:visible;position:relative">
          <!-- SVG injected here -->
        </div>
        <div class="ww-hourly-status sr-only" aria-live="polite"></div>
        <div class="ww-hourly-sr sr-only" aria-live="polite"></div>
      </div>
    `;
        root.appendChild(panel);
    }

    // svg wrapper
    let wrap = panel.querySelector('.ww-hourly-svg-wrap');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'ww-hourly-svg-wrap';
        wrap.style.height = SVG_H + 'px';
        wrap.style.width = '100%';
        wrap.style.overflow = 'visible';
        wrap.style.position = 'relative';
        wrap.style.boxSizing = 'border-box';
        panel.querySelector('.ww-hourly-inner').insertBefore(wrap, panel.querySelector('.ww-hourly-status'));
    }

    // create or ensure svg contents
    const svgns = 'http://www.w3.org/2000/svg';
    let svg = wrap.querySelector('.ww-hourly-svg');
    if (!svg) {
        svg = document.createElementNS(svgns, 'svg');
        svg.setAttribute('class', 'ww-hourly-svg');
        svg.setAttribute('viewBox', `0 0 ${SVG_W} ${SVG_H}`);
        svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-hidden', 'true');

        // anchor + offset
        svg.style.width = '100%';
        svg.style.height = 'auto';
        svg.style.position = 'relative';
        svg.style.display = 'block';
        svg.style.transform = `translateY(${GRAPH_OFFSET_Y}px)`; // up 140px
        svg.style.willChange = 'transform';

        const defs = document.createElementNS(svgns, 'defs');
        const grad = document.createElementNS(svgns, 'linearGradient');
        grad.setAttribute('id', 'ww_grad_temp');
        grad.setAttribute('x1', '0'); grad.setAttribute('x2', '0'); grad.setAttribute('y1', '0'); grad.setAttribute('y2', '1');
        const stop1 = document.createElementNS(svgns, 'stop'); stop1.setAttribute('offset', '0%'); stop1.setAttribute('stop-color', '#FF69B4');
        const stop2 = document.createElementNS(svgns, 'stop'); stop2.setAttribute('offset', '100%'); stop2.setAttribute('stop-color', '#0000FF');
        grad.appendChild(stop1); grad.appendChild(stop2); defs.appendChild(grad); svg.appendChild(defs);

        const path = document.createElementNS(svgns, 'path');
        path.setAttribute('id', 'ww_chartLine');
        path.setAttribute('class', 'ww-chart-line');
        path.setAttribute('d', '');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'url(#ww_grad_temp)');
        path.setAttribute('stroke-width', '3');
        svg.appendChild(path);

        const iconsLayer = document.createElementNS(svgns, 'g'); iconsLayer.setAttribute('id', 'ww_iconsLayer'); svg.appendChild(iconsLayer);
        const pointsLayer = document.createElementNS(svgns, 'g'); pointsLayer.setAttribute('id', 'ww_pointsLayer'); svg.appendChild(pointsLayer);

        wrap.appendChild(svg);
    } else {
        // ensure both layers exist on existing svg
        if (!svg.querySelector('#ww_chartLine')) {
            const path = document.createElementNS(svgns, 'path');
            path.setAttribute('id', 'ww_chartLine');
            path.setAttribute('class', 'ww-chart-line');
            path.setAttribute('d', '');
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', 'url(#ww_grad_temp)');
            path.setAttribute('stroke-width', '3');
            svg.insertBefore(path, svg.firstChild || null);
        }
        if (!svg.querySelector('#ww_iconsLayer')) {
            const iconsLayer = document.createElementNS(svgns, 'g'); iconsLayer.setAttribute('id', 'ww_iconsLayer'); svg.appendChild(iconsLayer);
        }
        if (!svg.querySelector('#ww_pointsLayer')) {
            const pointsLayer = document.createElementNS(svgns, 'g'); pointsLayer.setAttribute('id', 'ww_pointsLayer'); svg.appendChild(pointsLayer);
        }
        // ensure transform is correct
        svg.style.transform = `translateY(${GRAPH_OFFSET_Y}px)`; // up 140px
    }

    try { panel.inert = true; } catch (e) { /* inert polyfill missing */ }

    return panel;
}

function ensureStatusElements(panel) {
    if (!panel) return { statusEl: null, srEl: null };
    let statusEl = panel.querySelector('.ww-hourly-status');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.className = 'ww-hourly-status sr-only';
        statusEl.setAttribute('aria-live', 'polite');
        const inner = panel.querySelector('.ww-hourly-inner') || panel;
        inner.appendChild(statusEl);
    }
    let srEl = panel.querySelector('.ww-hourly-sr');
    if (!srEl) {
        srEl = document.createElement('div');
        srEl.className = 'ww-hourly-sr sr-only';
        srEl.setAttribute('aria-live', 'polite');
        const inner2 = panel.querySelector('.ww-hourly-inner') || panel;
        inner2.appendChild(srEl);
    }
    return { statusEl, srEl };
}

function normalizeWeatherApi(resp) {
    if (!resp || !resp.forecast || !resp.forecast.forecastday) return [];
    const days = resp.forecast.forecastday;
    const out = [];
    days.forEach(d => {
        if (Array.isArray(d.hour)) {
            d.hour.forEach(h => out.push({
                epoch: Number(h.time_epoch),
                temp_c: Number(h.temp_c),
                temp_f: Number(h.temp_f || (h.temp_c * 9 / 5 + 32)),
                icon: safeIconUrl(h.condition && h.condition.icon ? h.condition.icon : ''),
                condition: h.condition && h.condition.text ? h.condition.text : ''
            }));
        }
    });
    out.sort((a, b) => a.epoch - b.epoch);
    return out;
}

function findStartIndex(hourly) {
    const now = epochNowSec();
    for (let i = 0; i < hourly.length; i++) if (hourly[i].epoch >= now) return i;
    return 0;
}

function renderHourlyChartIntoRoot(hourly) {
    const panel = ensureRoot(_containerId);
    const { statusEl, srEl } = ensureStatusElements(panel);
    const svg = panel.querySelector('.ww-hourly-svg');
    const line = svg && svg.querySelector('#ww_chartLine');
    const iconsLayer = svg && svg.querySelector('#ww_iconsLayer');
    const pointsLayer = svg && svg.querySelector('#ww_pointsLayer');

    if (!svg || !line || !iconsLayer || !pointsLayer) {
        console.warn('[Hourly] missing SVG elements; abort render', { svg: !!svg, line: !!line });
        if (statusEl) statusEl.textContent = 'UI setup error';
        return;
    }

    // clear layers
    pointsLayer.innerHTML = '';
    iconsLayer.innerHTML = '';

    if (!hourly || !hourly.length) {
        if (statusEl) statusEl.textContent = 'No hourly data';
        return;
    }

    const n = hourly.length;
    const spacing = (SVG_W - LEFT_MARGIN - RIGHT_MARGIN) / Math.max(1, n - 1);

    // Guard temps to avoid NaN
    const temps = hourly.map(h => {
        const v = Number(h.temp_c);
        return Number.isFinite(v) ? v : 0;
    });

    let minT = Math.min(...temps);
    let maxT = Math.max(...temps);
    if (!isFinite(minT)) minT = 0;
    if (!isFinite(maxT)) maxT = minT + 1;
    const denom = (maxT - minT) || 1;

    const yFor = (t) => {
        const norm = (t - minT) / denom;
        return clamp(Math.round(BOTTOM_Y - norm * (BOTTOM_Y - TOP_Y)), TOP_Y, BOTTOM_Y);
    };

    // build path synchronously
    const dparts = [];
    for (let idx = 0; idx < hourly.length; idx++) {
        const h = hourly[idx];
        const x = Math.round(LEFT_MARGIN + idx * spacing);
        const y = yFor(Number.isFinite(Number(h.temp_c)) ? Number(h.temp_c) : 0);
        if (idx === 0) dparts.push('M', x, y);
        else dparts.push('L', x, y);
    }
    const dStr = dparts.join(' ');
    // set path immediately
    line.setAttribute('d', dStr);
    line.style.opacity = '1';

    // Points and icons
    const rectW = Math.round(56 / 2); // halved width
    const rectH = Math.round(34 / 2); // halved height

    for (let idx = 0; idx < hourly.length; idx++) {
        const h = hourly[idx];
        const x = Math.round(LEFT_MARGIN + idx * spacing);
        const y = yFor(Number.isFinite(Number(h.temp_c)) ? Number(h.temp_c) : 0);

        // rectangle background - FORCE white fill
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x - rectW / 2);
        rect.setAttribute('y', y - rectH - 8);
        rect.setAttribute('width', rectW);
        rect.setAttribute('height', rectH);
        rect.setAttribute('rx', 6);
        rect.setAttribute('fill', '#ffffff');
        rect.setAttribute('class', 'ww-temp-rect');
        pointsLayer.appendChild(rect);

        // temp text
        const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        txt.setAttribute('x', x);
        txt.setAttribute('y', y - Math.round(rectH / 2) - 4);
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('class', 'ww-temp-text');
        txt.setAttribute('data-temp-c', String(Number(h.temp_c)));
        txt.textContent = Math.round(h.temp_c) + '°';
        pointsLayer.appendChild(txt);

        // icon
        if (h.icon) {
            const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', h.icon);
            img.setAttribute('x', x - 12);
            img.setAttribute('y', y - 48);
            img.setAttribute('width', 24);
            img.setAttribute('height', 24);
            iconsLayer.appendChild(img);
        }

        // hour label
        const hourText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        hourText.setAttribute('x', x);
        hourText.setAttribute('y', BOTTOM_Y + 18);
        hourText.setAttribute('class', 'ww-hour-label');
        const dt = new Date((h.epoch || (Date.now() / 1000)) * 1000);
        const hh = dt.getHours().toString().padStart(2, '0');
        hourText.textContent = hh + ':00';
        pointsLayer.appendChild(hourText);
    }

    // update sr-only summary (accessibility)
    const sr = hourly.map(h => {
        const dt = new Date((h.epoch || (Date.now() / 1000)) * 1000);
        const hh = dt.getHours().toString().padStart(2, '0') + ':00';
        return `${hh} ${Math.round(h.temp_c)}° ${h.condition || ''}`;
    }).join(' — ');
    if (srEl) srEl.textContent = 'Hourly: ' + sr;

    _lastPayload = hourly;
    _state.lastUsedHours = hourly.length;
}

async function fetchWeatherApiByCity(city, apiKey) {
    const key = (apiKey || _apiKey || (window.WW_CONFIG && window.WW_CONFIG.WEATHER_API_KEY) || '').trim();
    if (!key) throw new Error('No API key provided. Use setApiKeyPublic() or set WW_CONFIG.WEATHER_API_KEY');
    const days = 2;
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${encodeURIComponent(key)}&q=${encodeURIComponent(city)}&days=${days}&aqi=no&alerts=no`;
    const res = await fetch(url);
    if (!res.ok) {
        const txt = await res.text().catch(() => res.statusText);
        throw new Error('Weather API failed: ' + res.status + ' ' + txt);
    }
    return await res.json();
}

function normalizeWeatherApiForecast(resp) {
    return normalizeWeatherApi(resp);
}

async function init(opts = {}) {
    if (_inited) return { ok: true };
    _inited = true;
    if (opts && opts.containerId) _containerId = opts.containerId;
    if (opts && opts.apiKey) _apiKey = opts.apiKey;
    ensureRoot(_containerId);
    hide();
    if (opts && opts.defaultCity) {
        try { await fetchAndShowByCity(opts.defaultCity); } catch (e) { console.warn('hourly.init defaultCity fetch failed', e); }
    }
    return { ok: true };
}

function setApiKeyPublic(k) {
    _apiKey = (k || '').trim();
    const panel = ensureRoot(_containerId);
    const sub = panel.querySelector('.ww-hourly-subtitle');
    if (sub) sub.textContent = _apiKey ? 'API key set' : 'No API key set';
}

async function fetchAndShowByCity(city) {
    if (!city) throw new Error('No city provided');
    try {
        const payload = await fetchWeatherApiByCity(city, _apiKey);
        _lastPayload = payload;
        const hourlyAll = normalizeWeatherApiForecast(payload);
        if (!hourlyAll.length) throw new Error('No hourly results returned');
        let start = findStartIndex(hourlyAll);
        let slice = hourlyAll.slice(start, start + HOURS_TO_SHOW);
        if (slice.length < HOURS_TO_SHOW && hourlyAll.length >= HOURS_TO_SHOW) slice = hourlyAll.slice(hourlyAll.length - HOURS_TO_SHOW);
        // render synchronously
        renderHourlyChartIntoRoot(slice);

        _state.visible = true; _state.lastCity = city; _state.lastUsedHours = slice.length;

        // Notify motherboard (best-effort)
        try {
            if (window.__MOTHERBOARD && typeof window.__MOTHERBOARD.updateFromPayload === 'function') {
                window.__MOTHERBOARD.updateFromPayload(payload);
            }
        } catch (e) {
            console.warn('[Hourly] motherboard notify failed', e);
        }

        return { payload, used: slice };
    } catch (err) {
        console.error('hourly.fetchAndShowByCity error', err);
        const panel = ensureRoot(_containerId);
        const _els = ensureStatusElements(panel);
        if (_els.statusEl) _els.statusEl.textContent = 'Fetch failed: ' + (err && err.message ? err.message : String(err));
        throw err;
    }
}

function show() {
    const panel = ensureRoot(_containerId);
    panel.classList.add('ww-hourly-open');
    try { panel.inert = false; } catch (e) { }
    _state.visible = true;
}

function hide() {
    const panel = ensureRoot(_containerId);
    panel.classList.remove('ww-hourly-open');
    try { panel.inert = true; } catch (e) { }
    _state.visible = false;
}

function getState() {
    return Object.assign({}, _state);
}

function debugDump() {
    const panel = ensureRoot(_containerId);
    const svg = panel.querySelector('.ww-hourly-svg');
    const line = svg ? svg.querySelector('#ww_chartLine') : null;
    console.log('hourly debugDump', {
        containerId: _containerId,
        apiKeySet: !!_apiKey,
        lastCity: _state.lastCity,
        lastUsedHours: _state.lastUsedHours,
        visible: _state.visible,
        payloadPresent: !!_lastPayload,
        svgViewBox: svg ? svg.getAttribute('viewBox') : null,
        svgTransform: svg ? svg.style.transform : null,
        pathD: line ? line.getAttribute('d') : null
    });
}

export default { init, setApiKeyPublic, fetchAndShowByCity, show, hide, getState, debugDump };
