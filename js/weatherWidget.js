
let instance = null;

class WeatherWidget {

    constructor(opts = {}) {
        if (instance) return instance;
        this.apiKey = opts.apiKey || (window.WW_CONFIG && window.WW_CONFIG.WEATHER_API_KEY) || '';
        this.onWeather = typeof opts.onWeather === 'function' ? opts.onWeather : null;
        this.unit = 'C';
        this.$container = null;
        this.$icon = null;
        this.$temp = null;
        this.$loc = null;
        this.lastPayload = null;
        this.visible = true;
        instance = this;
        return instance;
    }

    init({ container, unit = 'C', defaultLocation, autoRefreshMinutes, visible = true, apiKey } = {}) {
        // allow passing a selector string or element
        if (typeof container === 'string') {
            container = document.querySelector(container);
        }
        // set apiKey if provided
        if (apiKey) this.apiKey = apiKey;
        if (!this.apiKey && window.WW_CONFIG && window.WW_CONFIG.WEATHER_API_KEY) this.apiKey = window.WW_CONFIG.WEATHER_API_KEY;
        this.unit = (unit === 'F') ? 'F' : 'C';
        this.visible = visible;

        // Try to find or create icon/temp/loc nodes inside container
        // Icon
        this.$icon = this.$container.querySelector('img.icon') || this.$container.querySelector('.ww-icon') || null;
        if (!this.$icon) {
            const img = document.createElement('img');
            img.className = 'ww-icon';
            img.alt = 'weather icon';
            img.style.width = '48px';
            img.style.height = '48px';
            this.$container.appendChild(img);
            this.$icon = img;
            console.log('[WeatherWidget] created missing icon node');
        }

        // Temp
        this.$temp = this.$container.querySelector('#tempText') || this.$container.querySelector('.ww-temp') || null;
        if (!this.$temp) {
            const t = document.createElement('div');
            t.id = 'tempText';
            t.className = 'ww-temp';
            t.textContent = '--°';
            t.style.fontSize = '18px';
            t.style.fontWeight = '600';
            t.style.marginTop = '4px';
            this.$container.appendChild(t);
            this.$temp = t;
            console.log('[WeatherWidget] created missing temp node');
        }

        // Location
        this.$loc = this.$container.querySelector('#locText') || this.$container.querySelector('.ww-loc') || null;
        if (!this.$loc) {
            const l = document.createElement('div');
            l.id = 'locText';
            l.className = 'ww-loc';
            l.textContent = '';
            l.style.fontSize = '12px';
            l.style.opacity = '0.9';
            this.$container.appendChild(l);
            this.$loc = l;
            console.log('[WeatherWidget] created missing loc node');
        }

        // Show/hide initial visibility
        if (!visible) this.hide(); else this.show();

        // If a default location provided, trigger a fetch (non-blocking)
        if (defaultLocation) {
            this.fetchByCity(defaultLocation).catch(e => console.warn('[WeatherWidget] initial fetch failed', e));
        }


        return this;
    }


    setUnits(u) {
        this.unit = (u === 'F') ? 'F' : 'C';
        if (this.lastPayload) this._render(this.lastPayload);
    }

    show() {
        if (this.$container) {
            this.$container.style.display = '';
            this.visible = true;
        }
    }

    hide() {
        if (this.$container) {
            this.$container.style.display = 'none';
            this.visible = false;
        }
    }

    isVisible() {
        return this.visible;
    }

    async searchCities(q) {
        try {
            const key = (this.apiKey || (window.WW_CONFIG && window.WW_CONFIG.WEATHER_API_KEY) || '').trim();
            if (!key) throw new Error('No API key available for searchCities');
            const url = `https://api.weatherapi.com/v1/search.json?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('search.json failed: ' + res.status);
            return await res.json();
        } catch (e) {
            console.warn('[WeatherWidget] searchCities error', e);
            return [];
        }
    }

    async fetchByCity(name) {
        if (!name) throw new Error('fetchByCity requires a city name');
        try {
            const key = (this.apiKey || (window.WW_CONFIG && window.WW_CONFIG.WEATHER_API_KEY) || '').trim();
            if (!key) throw new Error('No API key provided. Use setApiKey(key) or set WW_CONFIG.WEATHER_API_KEY');

            const url = `https://api.weatherapi.com/v1/current.json?key=${encodeURIComponent(key)}&q=${encodeURIComponent(name)}&aqi=no`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('current.json failed: ' + res.status);
            const data = await res.json();
            this.lastPayload = data;
            try {
                this._render(data);
            } catch (e) {
                console.warn('[WeatherWidget] UI render failed', e);
            }

            // Notify hourly module (best-effort, non-blocking)
            try {
                if (window._HC && typeof window._HC.fetchAndShowByCity === 'function') {
                    const cityName = (data && data.location && (data.location.name || data.location.locality)) || name || '';
                    if (cityName) {
                        // call but do not await
                        window._HC.fetchAndShowByCity(cityName).catch(err => console.warn('[WeatherWidget] hourly update failed', err));
                    }
                }
            } catch (e) {
                console.warn('[WeatherWidget] hourly notify error', e);
            }

            // Notify motherboard/visuals (best-effort)
            try {
                if (window.__MOTHERBOARD && typeof window.__MOTHERBOARD.updateFromPayload === 'function') {
                    window.__MOTHERBOARD.updateFromPayload(data);
                } else if (window.__MOTHERBOARD && typeof window.__MOTHERBOARD.setWeatherType === 'function') {
                    // fallback: simple mapping
                    const cur = data && data.current ? data.current : {};
                    const txt = (cur.condition && cur.condition.text) || '';
                    const cov = cur.cloud || 0;
                    window.__MOTHERBOARD.setWeatherType(/rain|shower|thunder/i.test(txt) ? 'rain' : /cloud|overcast|cloudy/i.test(txt) ? 'clouds' : 'clear', cov);
                }
            } catch (e) {
                console.warn('[WeatherWidget] motherboard notify failed', e);
            }

            if (this.onWeather) try { this.onWeather(data); } catch (e) { }
            return data;
        } catch (e) {
            console.warn('[WeatherWidget] fetchByCity error', e);
            throw e;
        }
    }

    _render(data) {
        try {
            if (!data) return;
            const cur = data.current || {};
            const loc = data.location || {};
            const icon = cur.condition && cur.condition.icon ? (cur.condition.icon.startsWith('//') ? 'https:' + cur.condition.icon : cur.condition.icon) : '';
            const tempC = (typeof cur.temp_c === 'number') ? cur.temp_c : null;
            const tempF = (typeof cur.temp_f === 'number') ? cur.temp_f : null;

            if (this.$icon) try { this.$icon.src = icon || ''; } catch (e) { /* ignore */ }
            if (this.$temp) {
                const val = (this.unit === 'F') ? tempF : tempC;
                try { this.$temp.textContent = (val != null) ? `${Math.round(val)}°` : '--°'; } catch (e) { }
            }
            if (this.$loc) {
                try { this.$loc.textContent = loc ? `${loc.name}, ${loc.country}` : ''; } catch (e) { }
            }


            // notify visuals directly (best-effort)
            try {
                if (window.visuals && typeof window.visuals.setWeatherType === 'function') {
                    const curTxt = (cur.condition && cur.condition.text) || '';
                    const cov = cur.cloud || 0;
                    const type = (/rain|shower|drizzle|thunder/.test(curTxt)) ? 'rain' : (/cloud|overcast|cloudy/.test(curTxt)) ? 'clouds' : 'clear';
                    window.visuals.setWeatherType(type, cov);
                }
            } catch (e) {
                console.warn('[WeatherWidget] visuals notify failed', e);
            }

        } catch (e) {
            console.warn('[WeatherWidget] _render exception', e);
        }
    }

    getState() {
        return {
            hasPayload: !!this.lastPayload,
            unit: this.unit,
            apiKeySet: !!this.apiKey && this.apiKey !== 'PUT_YOUR_WEATHERAPI_KEY_HERE',
            visible: this.visible
        };
    }

    applyPreset(preset) {

        try {
            if (window.__MOTHERBOARD && typeof window.__MOTHERBOARD.setTheme === 'function') {
                if (preset && preset.toLowerCase().includes('night')) window.__MOTHERBOARD.setTheme('night');
                else if (preset && preset.toLowerCase().includes('rain')) window.__MOTHERBOARD.setTheme('rain');
                else window.__MOTHERBOARD.setTheme('day');
            }
        } catch (e) { console.warn('applyPreset -> motherboard failed', e); }
    }
}

// singleton export
const widget = new WeatherWidget();

export function init(opts) { return widget.init(opts); }
export function fetchByCity(name) { return widget.fetchByCity(name); }
export function searchCities(q) { return widget.searchCities(q); }
export function getState() { return widget.getState(); }
export function setApiKey(key) { widget.apiKey = key; }
export function applyPreset(preset) { return widget.applyPreset(preset); }
export default widget;
