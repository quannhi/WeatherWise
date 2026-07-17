// effects/utils.js
export function clearChildren(container) {
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);
}

export function rand(min, max) {
    return Math.random() * (max - min) + min;
}
