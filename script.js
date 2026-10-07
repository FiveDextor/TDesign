const SPECIAL_SLOTS = ["DPS", "Bait", "Empty"]; // extra choices in the loadout

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

/* ---------- Game / tower helpers ---------- */
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

/* ---------- State helpers ---------- */
function normalize() {
  const ids = Object.keys(GAMES);
  if (!GAMES[data.game]) data.game = ids[0];

  const knownActions = ACTIONS.map(a => a.id);
  data.maps.forEach(m => {
    if (!m.game) m.game = ids[0];
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

document.getElementById("addMap").onclick = () => {
  const name = prompt("Map name?");
  if (!name) return;
  const m = { id: uid(), name, game: data.game, notes: "", steps: [], loadout: [] };
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

// Actions: DPS and loadout towers first, then every other tower (no Bait / Empty)
function actionGroups(m, towers) {
  const inLoad = [];
  m.loadout.forEach(sl => {
    if (sl.tower && !isSpecial(sl.tower) && !inLoad.includes(sl.tower)) inLoad.push(sl.tower);
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
        imgBox.append(el("img", {
          src: towerImg(m, slot.tower),
          alt: slot.tower,
          onerror: () => {
            imgBox.innerHTML = "";
            imgBox.append(badge(m, slot.tower));
          }
        }));
      }
    }

    card.append(
      imgBox,
      towerPicker(slot, loadoutGroups(towers), () => renderMain())
    );
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
    main.append(el("p", { textContent: "Add or select a map to start." }));
    return;
  }

  const towers = gameOf(m).towers || [];

  main.append(el("input", {
    id: "mapName", value: m.name,
    oninput: e => { m.name = e.target.value; save(); renderSidebar(); }
  }));

  main.append(el("textarea", {
    id: "mapNotes", value: m.notes, placeholder: "General strategy notes for this map...",
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

    row.append(el("td", {}, el("input", {
      className: "wave", value: s.wave,
      oninput: e => { s.wave = e.target.value; save(); }
    })));

    row.append(el("td", {}, actionSelect(s)));

    const def = ACTIONS.find(a => a.id === s.action);
    const details = el("div", { className: "details" });
    if (def) def.fields.forEach(f => details.append(fieldFor(f, s, m, towers)));
    row.append(el("td", {}, details));

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
      m.steps.push({ wave: "", action: "", tower: "", time: "", text: "", notes: "" });
      save(); renderMain();
    }
  }));

  main.append(el("button", {
    textContent: "Delete this map",
    onclick: () => {
      if (!confirm("Delete this map?")) return;
      data.maps = data.maps.filter(x => x.id !== m.id);
      normalize();
      save(); renderAll();
    }
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
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (!d || !Array.isArray(d.maps)) throw new Error("Bad format");
      if (!confirm("This replaces everything currently in the site. Continue?")) return;
      data = d;
      normalize();
      save(); renderAll();
    } catch (err) {
      alert("Couldn't import that file.");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
};

renderAll();