import { useEffect, useMemo, useRef, useState } from "react";
import {
  resolveLandingLevel,
  storageSnapshotSchema,
  type Freezer,
  type Rack,
  type Sample,
  type StorageBox,
  type StorageSnapshot
} from "../../../packages/contracts/src/index.js";
import { createDemoStorage } from "./demo-storage.js";

type ThemePreference = "system" | "light" | "dark";
type Location = { freezer: Freezer; rack: Rack; box?: StorageBox };
type SearchResult = Required<Location> & { sample: Sample };

function getThemePreference(): ThemePreference {
  const value = localStorage.getItem("crio-theme");
  return value === "light" || value === "dark" ? value : "system";
}

function applyTheme(preference: ThemePreference) {
  const dark = preference === "dark" || (preference === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0d1317" : "#f4f7fa");
}

function positionLabel(position: number, columns = 8) {
  return `${String.fromCharCode(65 + Math.floor((position - 1) / columns))}${((position - 1) % columns) + 1}`;
}

function BoxCard({ box, onOpen }: { box: StorageBox; onOpen: () => void }) {
  const samplePositions = new Set(box.samples.map((sample) => sample.position));
  const capacity = box.rows * box.columns;

  return <button className="box-card" type="button" onClick={onOpen}>
    <div className="box-card-head">
      <div><h3>{box.name}</h3><small>{box.rows} × {box.columns} positions</small></div>
      <span className="pill">{box.samples.length}/{capacity}</span>
    </div>
    <div className="mini-grid" style={{ gridTemplateColumns: `repeat(${box.columns}, 1fr)` }} aria-hidden="true">
      {Array.from({ length: capacity }, (_, index) => <span key={index} className={`mini-cell ${samplePositions.has(index + 1) ? "occupied" : ""}`} />)}
    </div>
  </button>;
}

function BoxesView({ snapshot, freezer, rack, onOpenBox }: { snapshot: StorageSnapshot; freezer: Freezer; rack: Rack; onOpenBox: (box: StorageBox) => void }) {
  const total = rack.boxes.reduce((sum, box) => sum + box.samples.length, 0);
  const capacity = rack.boxes.reduce((sum, box) => sum + box.rows * box.columns, 0);

  return <section className="page">
    <div className="page-head">
      <div>
        <span className="eyebrow">{snapshot.workspace.name}</span>
        <h1>Vos boxes, sans détour.</h1>
        <p className="subtitle">cr.io adapte le parcours à votre stockage et vous amène directement là où vous travaillez.</p>
      </div>
      <div className="context"><i className="context-dot" />{freezer.name} <span>·</span> {rack.name}</div>
    </div>
    <div className="metrics">
      <div className="metric"><strong>{rack.boxes.length}</strong><span>boxes</span></div>
      <div className="metric"><strong>{total}</strong><span>échantillons</span></div>
      <div className="metric"><strong>{capacity - total}</strong><span>places libres</span></div>
    </div>
    <div className="box-grid">{rack.boxes.map((box) => <BoxCard key={box.id} box={box} onOpen={() => onOpenBox(box)} />)}</div>
  </section>;
}

function BoxView({ location, selectedPosition, onBack, onSelect }: { location: Required<Location>; selectedPosition: number | null; onBack: () => void; onSelect: (position: number) => void }) {
  const { freezer, rack, box } = location;
  const capacity = box.rows * box.columns;
  const samplesByPosition = new Map(box.samples.map((sample) => [sample.position, sample]));
  const selectedSample = selectedPosition ? samplesByPosition.get(selectedPosition) : undefined;

  return <section className="page">
    <button className="back" type="button" onClick={onBack}>‹ Boxes</button>
    <div className="page-head">
      <div>
        <span className="eyebrow">{freezer.name} · {rack.name}</span>
        <h1>{box.name}</h1>
        <p className="subtitle">Sélectionnez une position pour afficher les informations de l’échantillon.</p>
      </div>
      <div className="context">{box.samples.length} occupées · {capacity - box.samples.length} libres</div>
    </div>
    <div className="sample-grid-wrap">
      <div className="sample-grid" style={{ gridTemplateColumns: `34px repeat(${box.columns}, minmax(60px, 1fr))` }}>
        <span />
        {Array.from({ length: box.columns }, (_, index) => <span key={index} className="grid-label">{index + 1}</span>)}
        {Array.from({ length: box.rows }, (_, row) => {
          const letter = String.fromCharCode(65 + row);
          return <div key={letter} style={{ display: "contents" }}>
            <span className="grid-label">{letter}</span>
            {Array.from({ length: box.columns }, (_, column) => {
              const position = row * box.columns + column + 1;
              const sample = samplesByPosition.get(position);
              return <button
                key={position}
                className={`sample-cell ${sample ? "occupied" : ""} ${selectedPosition === position ? "selected" : ""}`}
                type="button"
                onClick={() => onSelect(position)}
                aria-label={`${letter}${column + 1}${sample ? `, ${sample.name}` : ", vide"}`}
              >
                {sample ? <><span className="cell-code">{letter}{column + 1}</span><span className="cell-name">{sample.name}</span></> : <span className="empty-mark">·</span>}
              </button>;
            })}
          </div>;
        })}
      </div>
    </div>
    <div className="legend"><span><i />Libre</span><span><i className="occupied" />Occupée</span><span><i className="selected" />Sélectionnée</span></div>
    {selectedPosition && <div className="sample-panel">
      <div><span className="eyebrow">{selectedSample ? positionLabel(selectedPosition, box.columns) : "Position libre"}</span><h2>{selectedSample?.name ?? "Emplacement disponible"}</h2></div>
      {selectedSample ? <dl>
        <div><dt>Identifiant</dt><dd>{selectedSample.id}</dd></div>
        <div><dt>Projet</dt><dd>{selectedSample.project}</dd></div>
        <div><dt>Stocké le</dt><dd>{new Date(`${selectedSample.date}T00:00:00`).toLocaleDateString("fr-FR")}</dd></div>
      </dl> : <span className="pill">{positionLabel(selectedPosition, box.columns)}</span>}
    </div>}
  </section>;
}

export function App() {
  const [snapshot, setSnapshot] = useState<StorageSnapshot>();
  const [location, setLocation] = useState<Location>();
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference);
  const searchDialog = useRef<HTMLDialogElement>(null);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/storage", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`API ${response.status}`);
        return storageSnapshotSchema.parse(await response.json());
      })
      .catch(() => createDemoStorage())
      .then((data) => {
        const landing = resolveLandingLevel(data);
        setSnapshot(data);
        if (landing.level === "boxes") setLocation({ freezer: landing.freezer, rack: landing.rack });
        else if (landing.level === "racks" && landing.freezer.racks[0]) setLocation({ freezer: landing.freezer, rack: landing.freezer.racks[0] });
        else if (data.freezers[0]?.racks[0]) setLocation({ freezer: data.freezers[0], rack: data.freezers[0].racks[0] });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    localStorage.setItem("crio-theme", theme);
    applyTheme(theme);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => theme === "system" && applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const results = useMemo<SearchResult[]>(() => {
    if (!snapshot) return [];
    const normalized = query.trim().toLocaleLowerCase("fr");
    return snapshot.freezers.flatMap((freezer) => freezer.racks.flatMap((rack) => rack.boxes.flatMap((box) => box.samples
      .filter((sample) => !normalized || [sample.id, sample.name, sample.project, box.name].some((value) => value.toLocaleLowerCase("fr").includes(normalized)))
      .map((sample) => ({ freezer, rack, box, sample })))))
      .slice(0, normalized ? 12 : 5);
  }, [query, snapshot]);

  function openSearch() {
    setQuery("");
    searchDialog.current?.showModal();
    window.setTimeout(() => searchInput.current?.focus(), 0);
  }

  function openResult(result: SearchResult) {
    setLocation({ freezer: result.freezer, rack: result.rack, box: result.box });
    setSelectedPosition(result.sample.position);
    searchDialog.current?.close();
  }

  function goHome() {
    if (!snapshot) return;
    const landing = resolveLandingLevel(snapshot);
    if (landing.level === "boxes") setLocation({ freezer: landing.freezer, rack: landing.rack });
    setSelectedPosition(null);
  }

  return <>
    <header className="app-header">
      <button className="brand" type="button" onClick={goHome} aria-label="Accueil cr.io"><span className="brand-mark" aria-hidden="true">cr</span><span>.io</span></button>
      <div className="header-actions">
        <button className="icon-button" type="button" onClick={openSearch} aria-label="Rechercher"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" /></svg></button>
        <button className="icon-button" type="button" onClick={() => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark")} aria-label="Changer de thème"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.9-.1-1.34A7 7 0 0 1 13.34 3.1C12.9 3.04 12.46 3 12 3Z" /></svg></button>
        <button className="avatar" type="button" onClick={() => settingsDialog.current?.showModal()} aria-label="Ouvrir les réglages">CL</button>
      </div>
    </header>

    <main id="app" tabIndex={-1}>
      {!snapshot || !location ? <section className="page"><span className="eyebrow">Connexion</span><h1>Chargement du stockage…</h1></section> : location.box
        ? <BoxView location={location as Required<Location>} selectedPosition={selectedPosition} onBack={() => { setLocation({ freezer: location.freezer, rack: location.rack }); setSelectedPosition(null); }} onSelect={setSelectedPosition} />
        : <BoxesView snapshot={snapshot} freezer={location.freezer} rack={location.rack} onOpenBox={(box) => { setLocation({ ...location, box }); setSelectedPosition(null); }} />}
    </main>

    <dialog ref={searchDialog} className="dialog search-dialog">
      <div className="dialog-shell">
        <div className="dialog-head"><div><span className="eyebrow">Recherche globale</span><h2>Retrouver un échantillon</h2></div><button className="icon-button" type="button" onClick={() => searchDialog.current?.close()} aria-label="Fermer">×</button></div>
        <label className="search-field"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" /></svg><input ref={searchInput} type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, identifiant, projet…" /></label>
        <div className="search-results" aria-live="polite">{results.length ? results.map((result) => <button className="result" type="button" key={`${result.box.id}-${result.sample.position}`} onClick={() => openResult(result)}><span><strong>{result.sample.name}</strong><br /><small>{result.sample.id} · {result.sample.project}</small></span><small>{result.box.name} / {positionLabel(result.sample.position, result.box.columns)}</small></button>) : <div className="empty-results">Aucun échantillon trouvé.</div>}</div>
      </div>
    </dialog>

    <dialog ref={settingsDialog} className="dialog settings-dialog">
      <div className="dialog-shell">
        <div className="dialog-head"><div><span className="eyebrow">Préférences</span><h2>Réglages</h2></div><button className="icon-button" type="button" onClick={() => settingsDialog.current?.close()} aria-label="Fermer">×</button></div>
        <fieldset className="theme-options"><legend>Thème</legend>{(["system", "light", "dark"] as const).map((value) => <label key={value}><input type="radio" name="theme" value={value} checked={theme === value} onChange={() => setTheme(value)} /><span>{{ system: "Système", light: "Clair", dark: "Sombre" }[value]}</span></label>)}</fieldset>
        <div className="about"><strong>cr.io</strong><span>Version 0.2.0 · fondation full-stack</span></div>
      </div>
    </dialog>
  </>;
}
