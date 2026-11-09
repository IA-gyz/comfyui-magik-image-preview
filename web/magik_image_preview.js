import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const LIMIT = 8;
const key = item => JSON.stringify([item.type || "temp", item.subfolder || "", item.filename]);
const url = (item, thumb = false) => api.apiURL(`/view?${new URLSearchParams({filename: thumb ? item.thumbnail || item.filename : item.filename, subfolder: item.subfolder || "", type: item.type || "temp"})}`);

app.registerExtension({
    name: "Magik.ImagePreview",
    async beforeRegisterNodeDef(type, data) {
        if (data.name !== "MagikImagePreview") return;
        const original = type.prototype.onNodeCreated;
        type.prototype.onNodeCreated = function () {
            original?.apply(this, arguments);
            install(this);
        };
    },
});

function install(node) {
    let disposed = false;
    let grid = false;
    let compare = false;
    let selected = "";
    let aKey = "";
    let bKey = "";
    let serial = 0;
    let layout = () => {};
    node.properties ||= {};
    const state = () => node.properties.magikPreview ||= {history: [], notes: {}, alignment: "Fit each image"};
    const items = () => state().history.flatMap(g => g.images);
    const lookup = value => items().find(i => key(i) === value);
    function normalize() {
        const s = state();
        s.history = (Array.isArray(s.history) ? s.history : []).filter(g => Array.isArray(g.images)).slice(-LIMIT);
        s.notes = s.notes && typeof s.notes === "object" ? s.notes : {};
        const valid = new Set(items().map(key));
        for (const k of Object.keys(s.notes)) if (!valid.has(k)) delete s.notes[k];
        if (!valid.has(selected)) selected = items().length ? key(items().at(-1)) : "";
        if (!valid.has(bKey)) bKey = selected;
        if (!valid.has(aKey)) aKey = items().length > 1 ? key(items().at(-2)) : bKey;
    }
    const root = document.createElement("div");
    root.style.cssText = "width:100%;height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:#171b22;color:#e4e9ef;font:12px sans-serif;box-sizing:border-box;border-radius:6px";
    const bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:5px;flex-wrap:wrap;padding:6px;background:#252d39;flex:none";
    root.append(bar);
    function button(label, title, action) {
        const el = document.createElement("button");
        el.textContent = label; el.title = title;
        el.style.cssText = "cursor:pointer;background:#344459;color:#eef4ff;border:1px solid #536780;border-radius:4px;padding:4px 7px";
        el.onclick = action; bar.append(el); return el;
    }
    const historyBtn = button("History", "Browse the last eight generations, including their batches", () => { grid = !grid; render(); });
    button("◀", "Previous image across retained batches", () => navigate(-1));
    button("▶", "Next image across retained batches", () => navigate(1));
    button("Latest", "Show the latest image", () => { selected = items().length ? key(items().at(-1)) : ""; grid = compare = false; render(); });
    const compareBtn = button("Compare", "Compare any two retained images", () => { compare = !compare; grid = false; render(); });
    button("Note", "Edit the selected image's note; in comparison mode this is image B", () => {
        const k = compare ? bKey : selected;
        if (!lookup(k)) return;
        const value = window.prompt("Note for this image (empty removes it)", state().notes[k] || "");
        if (value === null) return;
        if (value.trim()) state().notes[k] = value.trim().slice(0, 4000); else delete state().notes[k];
        node.graph?.setDirtyCanvas(true, true); render();
    });
    button("Open", "Open selected image at full resolution in a new tab", () => {
        const item = lookup(compare ? bKey : selected);
        if (item) window.open(url(item), "_blank", "noopener,noreferrer");
    });
    button("Clear", "Clear this node's history and notes; temporary files remain managed by ComfyUI", () => {
        state().history = []; state().notes = {}; selected = aKey = bKey = ""; compare = grid = false; render();
    });
    const controls = document.createElement("div");
    controls.style.cssText = "display:flex;gap:5px;flex-wrap:wrap;padding:5px;flex:none";
    root.append(controls);
    const viewport = document.createElement("div");
    viewport.style.cssText = "position:relative;flex:1;min-height:120px;overflow:hidden;background:#101318";
    root.append(viewport);
    const observer = new ResizeObserver(() => layout());
    observer.observe(viewport);
    const status = document.createElement("div");
    status.style.cssText = "padding:5px 7px;flex:none;white-space:pre-wrap;overflow-wrap:anywhere;max-height:70px;overflow:auto";
    root.append(status);
    // Let ComfyUI own DOM placement and scaling; never resize its parent wrapper.
    const widget = node.addDOMWidget("magik_preview", "custom", root, {serialize: false});
    widget.computeSize = width => [width, 330];
    widget.options ||= {};
    widget.options.getMinHeight = () => 240;
    node.setSize([Math.max(node.size[0], 460), Math.max(node.size[1], 400)]);

    function navigate(delta) {
        const all = items();
        if (!all.length) return;
        const idx = all.findIndex(i => key(i) === selected);
        selected = key(all[(idx + delta + all.length) % all.length]);
        grid = compare = false; render();
    }
    function label(item) {
        const s = state();
        const g = s.history.findIndex(g => g.images.some(i => key(i) === key(item)));
        return `Run ${g + 1} · Image ${item.batch_index + 1} · ${item.width}×${item.height}`;
    }
    function selector(title, value, change) {
        const select = document.createElement("select");
        select.title = title; select.style.cssText = "max-width:100%;min-width:0;background:#293446;color:white";
        for (const item of items()) {
            const option = document.createElement("option");
            option.value = key(item); option.textContent = `${title}: ${label(item)}`; select.append(option);
        }
        select.value = value; select.onchange = () => change(select.value); controls.append(select);
    }
    function imageElement(item, thumb, token) {
        const image = document.createElement("img");
        image.alt = label(item); image.draggable = false;
        image.style.cssText = "display:block;width:100%;height:100%;object-fit:contain;pointer-events:none";
        image.onload = () => { if (disposed || token !== serial) return; image.title = label(item); };
        image.onerror = () => {
            if (disposed || token !== serial) return;
            image.style.display = "none";
            const error = document.createElement("span");
            error.textContent = thumb ? "Preview unavailable" : "Image unavailable. Temporary files may have been cleared; execute the node again.";
            error.style.cssText = "position:absolute;inset:10px;color:#ffb6a8;pointer-events:none";
            image.parentElement?.append(error);
        };
        image.loading = thumb ? "lazy" : "eager";
        image.src = url(item, thumb); return image;
    }
    function render() {
        if (disposed) return;
        const token = ++serial;
        layout = () => {};
        normalize();
        controls.replaceChildren(); viewport.replaceChildren(); viewport.onpointermove = null;
        historyBtn.style.background = grid ? "#286d76" : "#344459";
        compareBtn.style.background = compare ? "#286d76" : "#344459";
        const active = lookup(compare ? bKey : selected);
        status.textContent = active ? `${label(active)}${state().notes[key(active)] ? "\n" + state().notes[key(active)] : ""}` : "Connect IMAGE and run the workflow to preview images.";
        if (!active) return;
        if (grid) {
            const list = document.createElement("div");
            list.style.cssText = "position:absolute;inset:0;overflow:auto;padding:6px;box-sizing:border-box";
            for (const generation of state().history) {
                const heading = document.createElement("div");
                heading.textContent = `${new Date(generation.time).toLocaleString()} · ${generation.images.length} image(s)`;
                heading.style.padding = "6px"; list.append(heading);
                const row = document.createElement("div");
                row.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:5px";
                for (const item of generation.images) {
                    const cell = document.createElement("button");
                    cell.title = `${label(item)}\n${state().notes[key(item)] || ""}`;
                    cell.style.cssText = `position:relative;height:110px;overflow:hidden;cursor:pointer;background:#202733;border:2px solid ${key(item) === selected ? "#78c8df" : "#3a4658"}`;
                    cell.append(imageElement(item, true, token));
                    cell.onclick = () => { selected = key(item); grid = compare = false; render(); };
                    row.append(cell);
                }
                list.append(row);
            }
            viewport.append(list); return;
        }
        if (compare && items().length > 1) {
            selector("A", aKey, value => { aKey = value; render(); });
            selector("B", bKey, value => { bKey = value; render(); });
            const alignment = document.createElement("select");
            alignment.title = "Fit each image aligns an original and upscale; same pixel scale preserves relative pixel sizes.";
            for (const name of ["Fit each image", "Same pixel scale"]) {
                const option = document.createElement("option"); option.textContent = name; alignment.append(option);
            }
            alignment.value = state().alignment || "Fit each image";
            alignment.onchange = () => { state().alignment = alignment.value; render(); }; controls.append(alignment);
            const left = lookup(aKey), right = lookup(bKey);
            for (const [item, isTop] of [[left, false], [right, true]]) {
                const layer = document.createElement("div");
                layer.style.cssText = "position:absolute;inset:0;pointer-events:none";
                if (isTop) layer.style.clipPath = "inset(0 0 0 50%)";
                const img = imageElement(item, false, token);
                if (state().alignment === "Same pixel scale") {
                    const maxW = Math.max(left.width, right.width), maxH = Math.max(left.height, right.height);
                    const frame = document.createElement("div");
                    frame.style.cssText = `position:absolute;inset:0;margin:auto;max-width:100%;max-height:100%;aspect-ratio:${maxW}/${maxH};width:100%;height:auto`;
                    img.style.cssText += `;position:absolute;width:${item.width/maxW*100}%;height:${item.height/maxH*100}%;left:${(1-item.width/maxW)*50}%;top:${(1-item.height/maxH)*50}%`;
                    const previousLayout = layout;
                    layout = () => {
                        previousLayout();
                        const scale = Math.min(viewport.clientWidth / maxW, viewport.clientHeight / maxH);
                        frame.style.width = `${maxW * scale}px`;
                        frame.style.height = `${maxH * scale}px`;
                    };
                    frame.append(img); layer.append(frame);
                } else layer.append(img);
                viewport.append(layer);
            }
            const line = document.createElement("div");
            line.style.cssText = "position:absolute;top:0;bottom:0;left:50%;width:2px;background:#d6e9ff;pointer-events:none";
            viewport.append(line);
            const top = viewport.children[1];
            const split = percent => { top.style.clipPath = `inset(0 0 0 ${percent}%)`; line.style.left = `${percent}%`; };
            viewport.onpointermove = event => {
                const rect = viewport.getBoundingClientRect();
                if (rect.width > 0) split(Math.max(0, Math.min(100, (event.clientX-rect.left)/rect.width*100)));
            };
            const slider = document.createElement("input"); slider.type = "range"; slider.min = "0"; slider.max = "100"; slider.value = "50";
            slider.title = "Comparison divider: A on the left, B on the right";
            slider.oninput = () => split(Number(slider.value)); controls.append(slider);
            layout();
        } else viewport.append(imageElement(active, false, token));
    }
    const executed = node.onExecuted;
    node.onExecuted = function (message) {
        executed?.apply(this, arguments);
        if (!Array.isArray(message?.magik_preview)) return;
        const incoming = message.magik_preview.filter(i => i && typeof i.filename === "string");
        if (!incoming.length) { state().history = []; state().notes = {}; render(); return; }
        const id = incoming[0].generation || key(incoming[0]);
        if (!state().history.some(g => g.id === id)) {
            state().history.push({id, time: Date.now(), images: incoming});
        }
        selected = bKey = key(incoming.at(-1));
        const previous = state().history.at(-2);
        aKey = previous?.images.length ? key(previous.images[Math.min(incoming.length - 1, previous.images.length - 1)]) : key(incoming[0]);
        grid = false; render();
    };
    const configured = node.onConfigure;
    node.onConfigure = function () { configured?.apply(this, arguments); render(); };
    const removed = node.onRemoved;
    node.onRemoved = function () {
        disposed = true; serial++; observer.disconnect();
        root.querySelectorAll("img").forEach(img => { img.onload = img.onerror = null; img.removeAttribute("src"); });
        root.remove(); removed?.apply(this, arguments);
    };
    render();
}
