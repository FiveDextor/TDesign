const SPECIAL_SLOTS = ["DPS", "Bait", "Empty"]; // extra choices in the loadout

const SUB_ROLES = [
  ["", "Sub-role: none"],
  ["optional", "Optional"],
  ["change", "Can change to..."],
  ["bait", "Bait"]
];

// Colors offered after the ones drawn on the map
const PALETTE = ["#ff4d4d", "#ffa94d", "#ffe14d", "#5ee26b", "#4dd2ff", "#4d7bff", "#b84dff", "#ff4da6", "#ffffff"];

// Remembered between redraws so your brush settings don't reset
let paintTool = { t: "brush", c: "#ff4d4d", s: 14 };

const KEY = "td-strategy-v1";
let data = load();
normalize();

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.maps)) return d;
  } catch (e) {}
  return { maps: [], current: null, game: null };
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  kids.forEach(k => e.append(k));
  return e;
}

/* ---------- Pop-ups and confirm buttons ---------- */
// Returns a Promise: the typed text (if input), true (OK), or null (cancelled)
function openModal({ title, text, input, ok = "OK", cancel = true, danger = false }) {
  return new Promise(resolve => {
    const overlay = el("div", { className: "modal-overlay" });
    const box = el("div", { className: "modal" });
    box.append(el("h3", { textContent: title }));
    if (text) box.append(el("p", { textContent: text }));

    let field = null;
    if (input) {
      field = el("input", { type: "text", placeholder: input, className: "modal-input" });
      box.append(field);
    }

    function close(value) {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(value);
    }

    const okBtn = el("button", {
      textContent: ok,
      className: danger ? "danger" : "primary",
      onclick: () => {
        if (field) {
          const v = field.value.trim();
          if (!v) { field.focus(); return; }
          close(v);
        } else {
          close(true);
        }
      }
    });

    const buttons = el("div", { className: "modal-buttons" });
    if (cancel) buttons.append(el("button", { textContent: "Cancel", onclick: () => close(null) }));
    buttons.append(okBtn);
    box.append(buttons);

    function onKey(e) {
      if (e.key === "Escape" && cancel) close(null);
      if (e.key === "Enter" && e.target.tagName !== "BUTTON") okBtn.click();
    }
    document.addEventListener("keydown", onKey);
    overlay.onmousedown = e => { if (e.target === overlay && cancel) close(null); };

    overlay.append(box);
    document.body.append(overlay);
    if (field) field.focus(); else okBtn.focus();
  });
}

// Button that turns red and says "Confirm?" on the first click
function confirmButton(label, onConfirm) {
  let armed = false;
  let timer = null;
  const b = el("button", { textContent: label });

  function disarm() {
    armed = false;
    clearTimeout(timer);
    b.textContent = label;
    b.classList.remove("danger");
  }

  b.onclick = () => {
    if (!armed) {
      armed = true;
      b.textContent = "Confirm?";
      b.classList.add("danger");
      timer = setTimeout(disarm, 3000);
    } else {
      disarm();
      onConfirm();
    }
  };
  b.onblur = disarm;
  return b;
}

/* ---------- Game / tower helpers ---------- */
// Note: data.maps holds your STRATEGIES (the name is kept so saved data still works)
function gameOf(m) {
  return GAMES[m.game] || { towers: [] };
}

function isSpecial(name) {
  return SPECIAL_SLOTS.includes(name);
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Image path: the tower's own "img" if set, otherwise images/<game>/<slug>.png
function towerImg(m, name) {
  const t = (gameOf(m).towers || []).find(x => x.name === name);
  if (t && t.img) return t.img;
  return "images/" + m.game + "/" + slug(name) + ".png";
}

function pathCount(m, name) {
  const t = (gameOf(m).towers || []).find(x => x.name === name);
  return (t && t.paths) || 2;
}

function ensureLoadout(m) {
  const size = gameOf(m).loadoutSize || 5;
  if (!Array.isArray(m.loadout)) m.loadout = [];
  while (m.loadout.length < size) m.loadout.push({ tower: "" });
}

// Colors used in this strategy's painting, in the order they were first used
function drawnColors(m) {
  const seen = [];
  (m.paint || []).forEach(st => {
    if (st.t !== "erase" && st.c && !seen.includes(st.c)) seen.push(st.c);
  });
  return seen;
}

/* ---------- State helpers ---------- */
function normalize() {
  const ids = Object.keys(GAMES);
  if (!GAMES[data.game]) data.game = ids[0];

  const knownActions = ACTIONS.map(a => a.id);
  data.maps.forEach(m => {
    if (!m.game) m.game = ids[0];
    if (!Array.isArray(m.paint)) m.paint = [];
    if (m.map === undefined) m.map = "";
    ensureLoadout(m);
    m.steps.forEach(s => {
      // old free-text actions become "Other" with the text kept
      if (s.action && !knownActions.includes(s.action)) {
        s.text = s.text || s.action;
        s.action = "other";
      }
    });
  });

  const cur = currentMap();
  if (!cur || cur.game !== data.game) {
    const first = mapsForGame()[0];
    data.current = first ? first.id : null;
  }
}

function currentMap() {
  return data.maps.find(m => m.id === data.current) || null;
}

function mapsForGame() {
  return data.maps.filter(m => m.game === data.game);
}

function renderAll() {
  renderGames();
  renderSidebar();
  renderMain();
}

/* ---------- Game picker ---------- */
function renderGames() {
  const sel = document.getElementById("gameSelect");
  sel.innerHTML = "";
  Object.keys(GAMES).forEach(id => {
    sel.append(el("option", { value: id, textContent: GAMES[id].name }));
  });
  sel.value = data.game;
  sel.onchange = () => {
    data.game = sel.value;
    normalize();
    save();
    renderAll();
  };
}

/* ---------- Sidebar ---------- */
function renderSidebar() {
  const list = document.getElementById("mapList");
  list.innerHTML = "";
  mapsForGame().forEach(m => {
    list.append(el("button", {
      textContent: m.name || "(unnamed)",
      className: m.id === data.current ? "active" : "",
      onclick: () => { data.current = m.id; save(); renderSidebar(); renderMain(); }
    }));
  });
}

document.getElementById("addMap").onclick = async () => {
  const name = await openModal({
    title: "New strategy",
    text: "Give your strategy a name.",
    input: "Strategy name",
    ok: "Create"
  });
  if (!name) return;
  const m = {
    id: uid(), name, game: data.game, map: "",
    notes: "", steps: [], loadout: [], paint: []
  };
  ensureLoadout(m);
  data.maps.push(m);
  data.current = m.id;
  save(); renderSidebar(); renderMain();
};

/* ---------- Searchable tower dropdown (supports groups) ---------- */
// groups: [ { title: "Loadout" or null, items: [ { value, label } ] } ]
function towerPicker(s, groups, onChange) {
  const wrap = el("div", { className: "combo" });
  const input = el("input", { value: s.tower || "", placeholder: "Search tower..." });
  const list = el("div", { className: "combo-list" });
  list.hidden = true;

  function choose(value) {
    s.tower = value;
    input.value = value;
    save();
    list.hidden = true;
    if (onChange) onChange();
  }

  function item(label, value) {
    return el("div", {
      className: "combo-item",
      textContent: label,
      onmousedown: e => { e.preventDefault(); choose(value); }
    });
  }

  function filtered(query) {
    const q = query.trim().toLowerCase();
    return groups
      .map(g => ({
        title: g.title,
        items: g.items.filter(i =>
          i.label.toLowerCase().includes(q) || i.value.toLowerCase().includes(q))
      }))
      .filter(g => g.items.length);
  }

  function renderList(query) {
    list.innerHTML = "";
    const gs = filtered(query);
    if (!query.trim()) list.append(item("— none —", ""));
    gs.forEach(g => {
      if (g.title) list.append(el("div", { className: "combo-title", textContent: g.title }));
      g.items.forEach(i => list.append(item(i.label, i.value)));
    });
    if (!gs.length) {
      list.append(el("div", { className: "combo-empty", textContent: "No match" }));
    }
  }

  input.onfocus = () => {
    input.select();
    renderList("");
    list.hidden = false;
  };
  input.oninput = () => {
    renderList(input.value);
    list.hidden = false;
  };
  input.onkeydown = e => {
    if (e.key === "Enter") {
      const gs = filtered(input.value);
      if (gs.length) choose(gs[0].items[0].value);
      input.blur();
    } else if (e.key === "Escape") {
      input.blur();
    }
  };
  input.onblur = () => {
    list.hidden = true;
    input.value = s.tower || "";
  };

  wrap.append(input, list);
  return wrap;
}

// Loadout slots: DPS / Bait / Empty first, then every tower
function loadoutGroups(towers) {
  return [
    { title: "Placeholders", items: SPECIAL_SLOTS.map(n => ({ value: n, label: n })) },
    { title: "Towers", items: towers.map(t => ({ value: t.name, label: t.name })) }
  ];
}

// Actions: DPS, loadout towers and swap towers first, then every other tower
function actionGroups(m, towers) {
  const inLoad = [];
  m.loadout.forEach(sl => {
    [sl.tower, sl.sub === "change" ? sl.swap : ""].forEach(n => {
      if (n && !isSpecial(n) && !inLoad.includes(n)) inLoad.push(n);
    });
  });
  const top = [{ value: "DPS", label: "DPS" }]
    .concat(inLoad.map(n => ({ value: n, label: n })));
  const rest = towers
    .filter(t => !inLoad.includes(t.name))
    .map(t => ({ value: t.name, label: t.name }));
  return [
    { title: "Loadout", items: top },
    { title: "All towers", items: rest }
  ];
}

/* ---------- Action fields ---------- */
function choiceSelect(s, key, options) {
  const select = el("select", {
    onchange: e => { s[key] = e.target.value; save(); }
  }, ...options.map(([value, label]) => el("option", { value, textContent: label })));
  select.value = s[key] || "";
  return select;
}

function levelInput(s, key, max, placeholder) {
  return el("input", {
    type: "number", min: 0, max: max, className: "lvl",
    placeholder: placeholder,
    value: s[key] === undefined ? "" : s[key],
    oninput: e => { s[key] = e.target.value; save(); },
    onchange: e => {
      let v = e.target.value;
      if (v !== "") {
        v = String(Math.max(0, Math.min(max, Math.floor(Number(v)))));
        e.target.value = v;
      }
      s[key] = v;
      save();
    }
  });
}

// Round color button; the popup lists colors drawn on the map first
function colorPicker(s, m) {
  const wrap = el("div", { className: "colorpick" });
  const btn = el("button", {
    className: "swatch-btn", title: "Color", textContent: s.color ? "" : "—"
  });
  if (s.color) btn.style.background = s.color;
  const pop = el("div", { className: "swatch-pop" });
  pop.hidden = true;

  function pick(c) { s.color = c; save(); renderMain(); }

  function swatch(c) {
    const b = el("button", {
      className: "swatch" + (s.color === c ? " sel" : ""), title: c
    });
    b.style.background = c;
    b.onclick = () => pick(c);
    return b;
  }

  function buildPop() {
    pop.innerHTML = "";
    const drawn = drawnColors(m);
    if (drawn.length) {
      pop.append(el("div", { className: "swatch-label", textContent: "From your map" }));
      const row = el("div", { className: "swatch-row" });
      drawn.forEach(c => row.append(swatch(c)));
      pop.append(row);
    }
    pop.append(el("div", {
      className: "swatch-label", textContent: drawn.length ? "Other colors" : "Colors"
    }));
    const row2 = el("div", { className: "swatch-row" });
    PALETTE.filter(c => !drawn.includes(c)).forEach(c => row2.append(swatch(c)));
    pop.append(row2);
    pop.append(el("button", {
      className: "swatch-none", textContent: "No color", onclick: () => pick("")
    }));
  }

  function outside(e) { if (!wrap.contains(e.target)) close(); }
  function close() {
    pop.hidden = true;
    document.removeEventListener("mousedown", outside);
  }

  btn.onclick = () => {
    if (!pop.hidden) { close(); return; }
    buildPop();
    pop.hidden = false;
    document.addEventListener("mousedown", outside);
  };

  wrap.append(btn, pop);
  return wrap;
}

function fieldFor(name, s, m, towers) {
  if (name === "tower") {
    return towerPicker(s, actionGroups(m, towers), () => renderMain());
  }
  if (name === "path") {
    const max = gameOf(m).maxLevel || 5;
    const box = el("div", { className: "xx" });
    if (pathCount(m, s.tower) === 1) {
      box.append(levelInput(s, "single", max, "Lv"));
    } else {
      box.append(
        levelInput(s, "top", max, "Top"),
        el("span", { textContent: "-" }),
        levelInput(s, "bottom", max, "Bot")
      );
    }
    return box;
  }
  if (name === "max") {
    const options = pathCount(m, s.tower) === 1
      ? [["", "Max: nil"], ["single", "Max"]]
      : [["", "Max: nil"], ["top", "Max top"], ["bottom", "Max bottom"]];
    return choiceSelect(s, "max", options);
  }
  if (name === "color") {
    return colorPicker(s, m);
  }
  if (name === "time") {
    return el("input", {
      className: "time", value: s.time || "", placeholder: "Time e.g. 0:30",
      oninput: e => { s.time = e.target.value; save(); }
    });
  }
  if (name === "text") {
    return el("input", {
      value: s.text || "", placeholder: "Describe the action...",
      oninput: e => { s.text = e.target.value; save(); }
    });
  }
  return el("span");
}

function actionSelect(s) {
  const select = el("select", {
    onchange: e => { s.action = e.target.value; save(); renderMain(); }
  },
    el("option", { value: "", textContent: "— action —" }),
    ...ACTIONS.map(a => el("option", { value: a.id, textContent: a.label }))
  );
  select.value = s.action || "";
  return select;
}

/* ---------- Map picture + painting ---------- */
function renderBoard(m) {
  const wrap = el("div", { className: "mapbox" });
  const maps = gameOf(m).maps || [];

  // Map picker
  const picker = el("select", {
    onchange: e => { m.map = e.target.value; save(); renderMain(); }
  },
    el("option", { value: "", textContent: "— choose map —" }),
    ...maps.map(mp => el("option", { value: mp.name, textContent: mp.name }))
  );
  picker.value = m.map || "";
  wrap.append(el("div", { className: "maprow" },
    el("span", { textContent: "Map:" }), picker
  ));
  if (!maps.length) {
    wrap.append(el("p", {
      className: "hint",
      textContent: "No maps added for this game yet (add them in games.js). You can still paint on the blank board."
    }));
  }

  // Toolbar
  const bar = el("div", { className: "paintbar" });
  const toolBtns = [["brush", "Brush"], ["lasso", "Lasso"], ["erase", "Eraser"]].map(([t, label]) => {
    const b = el("button", {
      textContent: label,
      className: paintTool.t === t ? "active" : "",
      onclick: () => {
        paintTool.t = t;
        toolBtns.forEach(x => x.classList.toggle("active", x === b));
      }
    });
    return b;
  });
  bar.append(...toolBtns);
  bar.append(
    el("input", {
      type: "color", value: paintTool.c, title: "Color",
      oninput: e => { paintTool.c = e.target.value; }
    }),
    el("span", { textContent: "Size" }),
    el("input", {
      type: "range", min: 4, max: 60, value: paintTool.s,
      oninput: e => { paintTool.s = Number(e.target.value); }
    }),
    el("button", {
      textContent: "Undo",
      onclick: () => { m.paint.pop(); save(); redraw(); }
    }),
    confirmButton("Clear", () => { m.paint = []; save(); redraw(); }),
    el("span", { className: "hint", textContent: "Hold Shift for straight lines" })
  );
  wrap.append(bar);

  // Board = picture + transparent canvas on top
  const board = el("div", { className: "board" });
  const canvas = el("canvas", { className: "paint" });
  const mp = maps.find(x => x.name === m.map);

  if (mp) {
    const tries = ["images/" + m.game + "/maps/" + slug(mp.name) + ".png"];
    if (mp.img) tries.push(mp.img);
    let n = 0;
    const img = el("img", { className: "board-img", alt: mp.name, draggable: false });
    img.referrerPolicy = "no-referrer";
    img.onerror = () => {
      n++;
      if (n < tries.length) {
        img.src = tries[n];
      } else {
        img.remove();
        board.classList.add("blank");
      }
    };
    img.src = tries[0];
    board.append(img);
  } else {
    board.classList.add("blank");
  }
  board.append(canvas);
  wrap.append(board);

  // ----- drawing -----
  function drawStroke(ctx, st, preview) {
    const w = canvas.width, h = canvas.height;
    const scale = w / 1000;
    const pts = st.p.map(([x, y]) => [x * w, y * h]);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (st.t === "lasso") {
      if (pts.length >= 2) {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.strokeStyle = st.c;
        ctx.lineWidth = 2 * scale;
        if (preview) {
          ctx.setLineDash([6 * scale, 4 * scale]);
          ctx.stroke();
        } else {
          ctx.closePath();
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = st.c;
          ctx.fill();
          ctx.globalAlpha = 0.9;
          ctx.stroke();
        }
      }
    } else {
      ctx.globalCompositeOperation = st.t === "erase" ? "destination-out" : "source-over";
      ctx.globalAlpha = st.t === "erase" ? 1 : 0.6;
      ctx.strokeStyle = st.c;
      ctx.fillStyle = st.c;
      ctx.lineWidth = st.s * scale;
      ctx.beginPath();
      if (pts.length === 1) {
        ctx.arc(pts[0][0], pts[0][1], (st.s * scale) / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function redraw(live) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    m.paint.forEach(st => drawStroke(ctx, st, false));
    if (live) drawStroke(ctx, live, true);
  }

  function resize() {
    const r = board.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    redraw();
  }
  new ResizeObserver(resize).observe(board);

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return [
      +((e.clientX - r.left) / r.width).toFixed(4),
      +((e.clientY - r.top) / r.height).toFixed(4)
    ];
  }

  let live = null;
  let straightFrom = -1; // where the current Shift (straight) segment starts

  canvas.onpointerdown = e => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    live = { t: paintTool.t, c: paintTool.c, s: paintTool.s, p: [pos(e)] };
    straightFrom = -1;
    redraw(live);
  };

  canvas.onpointermove = e => {
    if (!live) return;
    const p = pos(e);

    if (e.shiftKey) {
      // straight line from where Shift was pressed to the pointer
      if (straightFrom === -1) straightFrom = live.p.length - 1;
      live.p = live.p.slice(0, straightFrom + 1);
      live.p.push(p);
    } else {
      straightFrom = -1;
      const last = live.p[live.p.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.002) return;
      live.p.push(p);
    }
    redraw(live);
  };

  function finish() {
    if (!live) return;
    const st = live;
    live = null;
    straightFrom = -1;
    if (st.t === "lasso" && st.p.length < 2) { redraw(); return; }
    m.paint.push(st);
    save();
    redraw();
  }
  canvas.onpointerup = finish;
  canvas.onpointercancel = finish;

  return wrap;
}

/* ---------- Loadout ---------- */
// Fallback when a tower has no image yet
function badge(m, name) {
  const words = name.split(/\s+/).filter(Boolean);
  const text = (words.length > 1
    ? words.map(w => w[0]).join("").slice(0, 3)
    : name.slice(0, 3)).toUpperCase();

  let hue = 0;
  for (const c of name) hue = (hue * 31 + c.charCodeAt(0)) % 360;

  return el("div", {
    className: "badge",
    textContent: text,
    title: "Add image: " + towerImg(m, name),
    style: "background: hsl(" + hue + ", 45%, 32%)"
  });
}

// DPS / Bait / Empty get a plain labeled badge
function specialBadge(name) {
  return el("div", {
    className: "badge special badge-" + name.toLowerCase(),
    textContent: name.toUpperCase()
  });
}

function renderLoadout(m, towers) {
  const box = el("div", { className: "loadout" });
  box.append(el("h3", { textContent: "Loadout" }));

  const size = gameOf(m).loadoutSize || 5;
  const grid = el("div", { className: "loadout-grid" });

  m.loadout.slice(0, size).forEach(slot => {
    const card = el("div", { className: "slot" });

    const imgBox = el("div", { className: "slot-img" });
    if (slot.tower) {
      if (isSpecial(slot.tower)) {
        imgBox.append(specialBadge(slot.tower));
      } else {
        const t = towers.find(x => x.name === slot.tower);
        const tries = ["images/" + m.game + "/" + slug(slot.tower) + ".png"];
        if (t && t.img) tries.push(t.img);
        let n = 0;
        const img = el("img", { alt: slot.tower });
        img.referrerPolicy = "no-referrer";
        img.onerror = () => {
          n++;
          if (n < tries.length) {
            img.src = tries[n];
          } else {
            imgBox.innerHTML = "";
            imgBox.append(badge(m, slot.tower));
          }
        };
        img.src = tries[0];
        imgBox.append(img);
      }
    }

    // Sub-role dropdown
    const subSelect = el("select", {
      onchange: e => { slot.sub = e.target.value; save(); renderMain(); }
    }, ...SUB_ROLES.map(([value, label]) => el("option", { value, textContent: label })));
    subSelect.value = slot.sub || "";

    card.append(
      imgBox,
      towerPicker(slot, loadoutGroups(towers), () => renderMain()),
      subSelect
    );

    // "Can change to..." shows a second tower search
    if (slot.sub === "change") {
      const swap = {
        get tower() { return slot.swap || ""; },
        set tower(v) { slot.swap = v; }
      };
      card.append(towerPicker(
        swap,
        [{ title: null, items: towers.map(t => ({ value: t.name, label: t.name })) }],
        () => renderMain()
      ));
    }

    grid.append(card);
  });

  box.append(grid);
  return box;
}

/* ---------- Main panel ---------- */
function renderMain() {
  const main = document.getElementById("main");
  main.innerHTML = "";
  const m = currentMap();
  if (!m) {
    main.append(el("p", { textContent: "Add or select a strategy to start." }));
    return;
  }

  const towers = gameOf(m).towers || [];

  main.append(el("input", {
    id: "mapName", value: m.name, placeholder: "Strategy name",
    oninput: e => { m.name = e.target.value; save(); renderSidebar(); }
  }));

  main.append(renderBoard(m));

  main.append(el("textarea", {
    id: "mapNotes", value: m.notes, placeholder: "Notes for this strategy...",
    oninput: e => { m.notes = e.target.value; save(); }
  }));

  main.append(renderLoadout(m, towers));

  main.append(el("h3", { textContent: "Build order" }));

  const table = el("table");
  table.append(el("tr", {},
    el("th", { textContent: "Wave" }),
    el("th", { textContent: "Action" }),
    el("th", { textContent: "Details" }),
    el("th", { textContent: "Notes" }),
    el("th", { textContent: "" })
  ));

  m.steps.forEach((s, i) => {
    const row = el("tr");

    const waveTd = el("td", {}, el("input", {
      className: "wave", value: s.wave,
      oninput: e => { s.wave = e.target.value; save(); }
    }));
    row.append(waveTd);

    row.append(el("td", {}, actionSelect(s)));

    const def = ACTIONS.find(a => a.id === s.action);
    const details = el("div", { className: "details" });
    if (def) def.fields.forEach(f => details.append(fieldFor(f, s, m, towers)));
    row.append(el("td", {}, details));

    // colored bar on the left edge of rows that have a color
    if (def && def.fields.includes("color") && s.color) {
      waveTd.style.boxShadow = "inset 5px 0 0 " + s.color;
    }

    row.append(el("td", {}, el("input", {
      value: s.notes,
      oninput: e => { s.notes = e.target.value; save(); }
    })));

    row.append(el("td", {},
      el("button", { textContent: "↑", onclick: () => moveStep(m, i, -1) }),
      el("button", { textContent: "↓", onclick: () => moveStep(m, i, 1) }),
      el("button", { textContent: "✕", onclick: () => { m.steps.splice(i, 1); save(); renderMain(); } })
    ));

    table.append(row);
  });
  main.append(table);

  main.append(el("button", {
    textContent: "+ Add step",
    onclick: () => {
      m.steps.push({ wave: "", action: "", tower: "", time: "", text: "", color: "", notes: "" });
      save(); renderMain();
    }
  }));

  main.append(confirmButton("Delete this strategy", () => {
    data.maps = data.maps.filter(x => x.id !== m.id);
    normalize();
    save(); renderAll();
  }));
}

function moveStep(m, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= m.steps.length) return;
  [m.steps[i], m.steps[j]] = [m.steps[j], m.steps[i]];
  save(); renderMain();
}

/* ---------- Export / Import ---------- */
document.getElementById("exportBtn").onclick = () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = el("a", { href: URL.createObjectURL(blob), download: "td-strategies.json" });
  a.click();
  URL.revokeObjectURL(a.href);
};

document.getElementById("importBtn").onclick = () => document.getElementById("importFile").click();

document.getElementById("importFile").onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let d;
    try {
      d = JSON.parse(reader.result);
      if (!d || !Array.isArray(d.maps)) throw new Error("Bad format");
    } catch (err) {
      await openModal({ title: "Import failed", text: "Couldn't import that file.", cancel: false });
      return;
    }
    const yes = await openModal({
      title: "Import strategies",
      text: "This replaces everything currently in the site. Continue?",
      ok: "Replace everything",
      danger: true
    });
    if (!yes) return;
    data = d;
    normalize();
    save(); renderAll();
  };
  reader.readAsText(file);
  e.target.value = "";
};

renderAll();