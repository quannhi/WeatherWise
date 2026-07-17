// effects/stars.js


import { clearChildren, rand } from "./utils.js";

let _starsState = { active: false, container: null };

export function startStars(containerId = "starsContainer", count = 500) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn("startStars: container not found:", containerId);
        return;
    }
    if (_starsState.active && _starsState.container === container) return;

    _starsState.active = true;
    _starsState.container = container;
    clearChildren(container);

    for (let i = 0; i < count; i++) {
        const s = document.createElement("div");
        s.className = "ww-star";
        s.style.position = "absolute";
        s.style.left = `${rand(0, 100)}%`;
        s.style.top = `${rand(0, 60)}%`; // keep star field mostly in sky area
        const size = Math.floor(rand(1, 3));
        s.style.width = `${size}px`;
        s.style.height = `${size}px`;
        s.style.borderRadius = "50%";
        s.style.background = "white";
        s.style.opacity = `${rand(0.2, 0.95)}`;
        s.style.pointerEvents = "none";

        // small twinkle using animation
        s.style.animation = `ww-twinkle ${rand(2, 6)}s infinite ease-in-out`;
        s.style.animationDelay = `${rand(0, 6)}s`;
        container.appendChild(s);
    }
}

export function stopStars(containerId = "starsContainer") {
    const container = document.getElementById(containerId);
    if (!container) return;
    clearChildren(container);
    _starsState.active = false;
}
