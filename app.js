"use strict";

const workspace = {
  name: "Laboratoire CryoBio",
  freezers: [{
    id: "f80",
    name: "Freezer −80 °C",
    racks: [{
      id: "rack-a",
      name: "Rack A",
      boxes: [
        { id: "b1", name: "Box 01", rows: 8, columns: 8, samples: makeSamples(1, 41) },
        { id: "b2", name: "Box 02", rows: 8, columns: 8, samples: makeSamples(2, 26) },
        { id: "b3", name: "Box 03", rows: 8, columns: 8, samples: makeSamples(3, 53) },
        { id: "b4", name: "Box 04", rows: 8, columns: 8, samples: makeSamples(4, 14) },
        { id: "b5", name: "Box 05", rows: 8, columns: 8, samples: makeSamples(5, 36) },
        { id: "b6", name: "Box 06", rows: 8, columns: 8, samples: makeSamples(6, 0) }
      ]
    }]
  }]
};

const state = { currentBox: null, selectedPosition: null };
const app = document.querySelector("#app");
const searchDialog = document.querySelector("#search-dialog");
const searchInput = document.querySelector("#search-input");
const searchResults = document.querySelector("#search-results");
const settingsDialog = document.querySelector("#settings-dialog");
const systemTheme = matchMedia("(prefers-color-scheme: dark)");

function makeSamples(seed, count) {
  const projects = ["OncoMap", "Immuno-21", "Cohorte Alpha", "Pilot RNA"];
  const samples = {};
  for (let index = 0; index < count; index += 1) {
    const position = index + 1 + ((seed * 7 + index * 3) % Math.max(1, 64 - count));
    if (position > 64 || samples[position]) continue;
    samples[position] = {
      id: `CR-${String(seed).padStart(2, "0")}-${String(index + 1).padStart(3, "0")}`,
      name: `Échantillon ${String.fromCharCode(65 + (index % 5))}${index + 1}`,
      project: projects[(seed + index) % projects.length],
      date: `2026-${String(((seed + index) % 9) + 1).padStart(2, "0")}-${String(((index * 2) % 27) + 1).padStart(2, "0")}`
    };
  }
  return samples;
}

function resolveHome() {
  const freezer = workspace.freezers.length === 1 ? workspace.freezers[0] : null;
  const rack = freezer && freezer.racks.length === 1 ? freezer.racks[0] : null;
  if (rack) renderBoxes(freezer, rack);
}

function renderBoxes(freezer, rack) {
  state.currentBox = null;
  const total = rack.boxes.reduce((sum, box) => sum + Object.keys(box.samples).length, 0);
  app.innerHTML = `
    <section class="page">
      <div class="page-head">
        <div>
          <span class="eyebrow">${workspace.name}</span>
          <h1>Vos boxes, sans détour.</h1>
          <p class="subtitle">Un seul freezer et un seul rack sont configurés : cr.io vous amène directement là où vous travaillez.</p>
        </div>
        <div class="context"><i class="context-dot"></i>${freezer.name} <span>·</span> ${rack.name}</div>
      </div>
      <div class="metrics">
        <div class="metric"><strong>${rack.boxes.length}</strong><span>boxes</span></div>
        <div class="metric"><strong>${total}</strong><span>échantillons</span></div>
        <div class="metric"><strong>${rack.boxes.length * 64 - total}</strong><span>places libres</span></div>
      </div>
      <div class="box-grid">
        ${rack.boxes.map(box => boxCard(box)).join("")}
      </div>
    </section>`;
}

function boxCard(box) {
  const occupied = Object.keys(box.samples).length;
  return `<button class="box-card" type="button" data-box="${box.id}">
    <div class="box-card-head">
      <div><h3>${box.name}</h3><small>8 × 8 positions</small></div>
      <span class="pill">${occupied}/64</span>
    </div>
    <div class="mini-grid" aria-hidden="true">
      ${Array.from({ length: 64 }, (_, i) => `<span class="mini-cell ${box.samples[i + 1] ? "occupied" : ""}"></span>`).join("")}
    </div>
  </button>`;
}

function renderBox(box) {
  state.currentBox = box;
  state.selectedPosition = null;
  const freezer = workspace.freezers[0];
  const rack = freezer.racks[0];
  app.innerHTML = `
    <section class="page">
      <button class="back" type="button" data-action="home">‹ Boxes</button>
      <div class="page-head">
        <div>
          <span class="eyebrow">${freezer.name} · ${rack.name}</span>
          <h1>${box.name}</h1>
          <p class="subtitle">Sélectionnez une position pour afficher les informations de l’échantillon.</p>
        </div>
        <div class="context">${Object.keys(box.samples).length} occupées · ${64 - Object.keys(box.samples).length} libres</div>
      </div>
      <div class="sample-grid-wrap">
        <div class="sample-grid">
          <span></span>${Array.from({ length: 8 }, (_, i) => `<span class="grid-label">${i + 1}</span>`).join("")}
          ${Array.from({ length: 8 }, (_, row) => {
            const letter = String.fromCharCode(65 + row);
            return `<span class="grid-label">${letter}</span>${Array.from({ length: 8 }, (_, col) => {
              const position = row * 8 + col + 1;
              const sample = box.samples[position];
              return `<button class="sample-cell ${sample ? "occupied" : ""}" type="button" data-position="${position}" aria-label="${letter}${col + 1}${sample ? `, ${sample.name}` : ", vide"}">
                ${sample ? `<span class="cell-code">${letter}${col + 1}</span><span class="cell-name">${sample.name}</span>` : `<span class="empty-mark">·</span>`}
              </button>`;
            }).join("")}`;
          }).join("")}
        </div>
      </div>
      <div class="legend"><span><i></i>Libre</span><span><i class="occupied"></i>Occupée</span><span><i class="selected"></i>Sélectionnée</span></div>
      <div id="sample-panel"></div>
    </section>`;
}

function showSample(position) {
  state.selectedPosition = position;
  document.querySelectorAll(".sample-cell").forEach(cell => cell.classList.toggle("selected", Number(cell.dataset.position) === position));
  const sample = state.currentBox.samples[position];
  const panel = document.querySelector("#sample-panel");
  if (!sample) {
    panel.innerHTML = `<div class="sample-panel"><div><span class="eyebrow">Position libre</span><h2>Emplacement disponible</h2></div><span class="pill">${positionLabel(position)}</span></div>`;
    return;
  }
  panel.innerHTML = `<div class="sample-panel">
    <div><span class="eyebrow">${positionLabel(position)}</span><h2>${sample.name}</h2></div>
    <dl><div><dt>Identifiant</dt><dd>${sample.id}</dd></div><div><dt>Projet</dt><dd>${sample.project}</dd></div><div><dt>Stocké le</dt><dd>${new Date(sample.date).toLocaleDateString("fr-FR")}</dd></div></dl>
  </div>`;
}

function positionLabel(position) {
  return `${String.fromCharCode(65 + Math.floor((position - 1) / 8))}${((position - 1) % 8) + 1}`;
}

function applyTheme(preference) {
  const dark = preference === "dark" || (preference === "system" && systemTheme.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]').content = dark ? "#0d1317" : "#f4f7fa";
}

function setTheme(preference) {
  localStorage.setItem("crio-theme", preference);
  applyTheme(preference);
  const radio = document.querySelector(`input[name="theme"][value="${preference}"]`);
  if (radio) radio.checked = true;
}

function currentPreference() { return localStorage.getItem("crio-theme") || "system"; }

function openSearch() {
  searchInput.value = "";
  renderSearch("");
  searchDialog.showModal();
  setTimeout(() => searchInput.focus(), 0);
}

function allSamples() {
  return workspace.freezers.flatMap(f => f.racks.flatMap(r => r.boxes.flatMap(box => Object.entries(box.samples).map(([position, sample]) => ({ ...sample, box, position: Number(position), freezer: f, rack: r })))));
}

function renderSearch(query) {
  const normalized = query.trim().toLocaleLowerCase("fr");
  const matches = normalized ? allSamples().filter(item => [item.id, item.name, item.project, item.box.name].some(value => value.toLocaleLowerCase("fr").includes(normalized))).slice(0, 12) : allSamples().slice(0, 5);
  searchResults.innerHTML = matches.length ? matches.map(item => `<button class="result" type="button" data-result-box="${item.box.id}" data-result-position="${item.position}"><span><strong>${item.name}</strong><br><small>${item.id} · ${item.project}</small></span><small>${item.box.name} / ${positionLabel(item.position)}</small></button>`).join("") : `<div class="empty-results">Aucun échantillon trouvé.</div>`;
}

document.addEventListener("click", event => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  const boxId = event.target.closest("[data-box]")?.dataset.box;
  const position = Number(event.target.closest("[data-position]")?.dataset.position || 0);
  const result = event.target.closest("[data-result-box]");
  if (action === "home") resolveHome();
  if (action === "search") openSearch();
  if (action === "theme") setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  if (action === "settings") {
    document.querySelector(`input[name="theme"][value="${currentPreference()}"]`).checked = true;
    settingsDialog.showModal();
  }
  if (boxId) renderBox(workspace.freezers[0].racks[0].boxes.find(box => box.id === boxId));
  if (position) showSample(position);
  if (result) {
    const box = workspace.freezers[0].racks[0].boxes.find(item => item.id === result.dataset.resultBox);
    searchDialog.close();
    renderBox(box);
    showSample(Number(result.dataset.resultPosition));
  }
});

searchInput.addEventListener("input", () => renderSearch(searchInput.value));
document.querySelectorAll('input[name="theme"]').forEach(radio => radio.addEventListener("change", () => setTheme(radio.value)));
systemTheme.addEventListener("change", () => { if (currentPreference() === "system") applyTheme("system"); });
applyTheme(currentPreference());
resolveHome();
