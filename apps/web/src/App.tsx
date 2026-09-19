import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  authSessionSchema,
  healthSchema,
  resolveLandingLevel,
  sampleSearchResponseSchema,
  storageSnapshotSchema,
  type AuthSession,
  type Freezer,
  type Rack,
  type Sample,
  type StorageBox,
  type StorageSnapshot
} from "../../../packages/contracts/src/index.js";
import { createDemoStorage } from "./demo-storage.js";

type ThemePreference = "system" | "light" | "dark";
type AppMode = "loading" | "demo" | "guest" | "authenticated";
type Location = { freezer: Freezer; rack: Rack; box?: StorageBox };
type SearchResult = Required<Location> & { sample: Sample };
type View =
  | { level: "freezers" }
  | { level: "racks"; freezerId: string }
  | { level: "boxes"; freezerId: string; rackId: string }
  | { level: "box"; freezerId: string; rackId: string; boxId: string };
type EditorState =
  | { kind: "freezer"; entity?: Freezer }
  | { kind: "rack"; freezer: Freezer; entity?: Rack }
  | { kind: "box"; freezer: Freezer; rack: Rack; entity?: StorageBox };
type SampleEditorState =
  | { mode: "create"; box: StorageBox; position: number }
  | { mode: "edit"; box: StorageBox; sample: Sample }
  | { mode: "move"; box: StorageBox; sample: Sample };

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

function landingView(snapshot: StorageSnapshot): View {
  const landing = resolveLandingLevel(snapshot);
  if (landing.level === "freezers") return { level: "freezers" };
  if (landing.level === "racks") return { level: "racks", freezerId: landing.freezer.id };
  return { level: "boxes", freezerId: landing.freezer.id, rackId: landing.rack.id };
}

function AuthView({ onAuthenticated }: { onAuthenticated: (session: AuthSession) => Promise<void> }) {
  const [screen, setScreen] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const values = new FormData(event.currentTarget);
    const payload = screen === "login"
      ? { email: values.get("email"), password: values.get("password") }
      : {
          email: values.get("email"),
          password: values.get("password"),
          displayName: values.get("displayName"),
          workspaceName: values.get("workspaceName")
        };

    try {
      const response = await fetch(`/api/auth/${screen}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = typeof body === "object" && body !== null && "message" in body ? String(body.message) : "Impossible de se connecter.";
        throw new Error(message);
      }
      await onAuthenticated(authSessionSchema.parse(body));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  return <section className="auth-page">
    <div className="auth-intro">
      <span className="eyebrow">Stockage scientifique</span>
      <h1>Vos échantillons.<br />À leur place.</h1>
      <p className="subtitle">Une vue claire de chaque freezer, rack, box et position — sans détour.</p>
    </div>
    <div className="auth-card">
      <div className="auth-tabs" role="tablist">
        <button type="button" className={screen === "login" ? "active" : ""} onClick={() => { setScreen("login"); setError(""); }}>Connexion</button>
        <button type="button" className={screen === "register" ? "active" : ""} onClick={() => { setScreen("register"); setError(""); }}>Créer un compte</button>
      </div>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        {screen === "register" && <>
          <label>Votre nom<input name="displayName" autoComplete="name" required minLength={2} /></label>
          <label>Nom du laboratoire<input name="workspaceName" autoComplete="organization" required minLength={2} /></label>
        </>}
        <label>Adresse e-mail<input name="email" type="email" autoComplete="email" required /></label>
        <label>Mot de passe<input name="password" type="password" autoComplete={screen === "login" ? "current-password" : "new-password"} required minLength={screen === "register" ? 12 : 1} /></label>
        {screen === "register" && <small>12 caractères minimum.</small>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? "Un instant…" : screen === "login" ? "Se connecter" : "Créer mon espace"}</button>
      </form>
    </div>
  </section>;
}

function FreezersView({ snapshot, editable, onCreate, onOpen, onEdit, onDelete }: { snapshot: StorageSnapshot; editable: boolean; onCreate: () => void; onOpen: (freezer: Freezer) => void; onEdit: (freezer: Freezer) => void; onDelete: (freezer: Freezer) => void }) {
  return <section className="page">
    <div className="page-head">
      <div><span className="eyebrow">{snapshot.workspace.name}</span><h1>Vos freezers.</h1><p className="subtitle">Choisissez un freezer pour parcourir son contenu.</p></div>
      <div className="context"><i className="context-dot" />{snapshot.freezers.length} freezer{snapshot.freezers.length > 1 ? "s" : ""}</div>
    </div>
    {editable && <div className="page-actions"><button className="primary-button compact" type="button" onClick={onCreate}>Ajouter un freezer</button></div>}
    {snapshot.freezers.length ? <div className="entity-grid">{snapshot.freezers.map((freezer) => {
      const boxCount = freezer.racks.reduce((sum, rack) => sum + rack.boxes.length, 0);
      return <article className="entity-card" key={freezer.id}>
        <button className="entity-open" type="button" onClick={() => onOpen(freezer)}><span className="eyebrow">{freezer.temperatureCelsius} °C</span><h2>{freezer.name}</h2><p>{freezer.racks.length} racks · {boxCount} boxes</p></button>
        {editable && <div className="card-actions"><button type="button" onClick={() => onEdit(freezer)}>Modifier</button><button className="danger-link" type="button" onClick={() => onDelete(freezer)}>Supprimer</button></div>}
      </article>;
    })}</div> : <div className="empty-state"><h2>Votre espace est prêt</h2><p>Commencez par ajouter votre premier freezer.</p></div>}
  </section>;
}

function RacksView({ snapshot, freezer, editable, onBack, onCreate, onOpen, onEdit, onDelete }: { snapshot: StorageSnapshot; freezer: Freezer; editable: boolean; onBack: () => void; onCreate: () => void; onOpen: (rack: Rack) => void; onEdit: (rack: Rack) => void; onDelete: (rack: Rack) => void }) {
  return <section className="page">
    <button className="back" type="button" onClick={onBack}>‹ Freezers</button>
    <div className="page-head">
      <div><span className="eyebrow">{snapshot.workspace.name}</span><h1>{freezer.name}</h1><p className="subtitle">Sélectionnez le rack que vous souhaitez consulter.</p></div>
      <div className="context">{freezer.temperatureCelsius} °C · {freezer.racks.length} racks</div>
    </div>
    {editable && <div className="page-actions"><button className="primary-button compact" type="button" onClick={onCreate}>Ajouter un rack</button></div>}
    {freezer.racks.length ? <div className="entity-grid">{freezer.racks.map((rack) => <article className="entity-card" key={rack.id}>
      <button className="entity-open" type="button" onClick={() => onOpen(rack)}><span className="eyebrow">Rack</span><h2>{rack.name}</h2><p>{rack.boxes.length} box{rack.boxes.length > 1 ? "es" : ""}</p></button>
      {editable && <div className="card-actions"><button type="button" onClick={() => onEdit(rack)}>Modifier</button><button className="danger-link" type="button" onClick={() => onDelete(rack)}>Supprimer</button></div>}
    </article>)}</div> : <div className="empty-state"><h2>Aucun rack</h2><p>Ajoutez le premier rack de ce freezer.</p></div>}
  </section>;
}

function BoxCard({ box, onOpen, onEdit, onDelete, editable }: { box: StorageBox; onOpen: () => void; onEdit: () => void; onDelete: () => void; editable: boolean }) {
  const samplePositions = new Set(box.samples.map((sample) => sample.position));
  const capacity = box.rows * box.columns;

  return <div className="box-card-wrap">
    <button className="box-card" type="button" onClick={onOpen}>
      <div className="box-card-head">
        <div><h3>{box.name}</h3><small>{box.rows} × {box.columns} positions</small></div>
        <span className="pill">{box.samples.length}/{capacity}</span>
      </div>
      <div className="mini-grid" style={{ gridTemplateColumns: `repeat(${box.columns}, 1fr)` }} aria-hidden="true">
        {Array.from({ length: capacity }, (_, index) => <span key={index} className={`mini-cell ${samplePositions.has(index + 1) ? "occupied" : ""}`} />)}
      </div>
    </button>
    {editable && <div className="card-actions"><button type="button" onClick={onEdit}>Modifier</button><button className="danger-link" type="button" onClick={onDelete}>Supprimer</button></div>}
  </div>;
}

function BoxesView({ snapshot, freezer, rack, editable, onBack, onCreate, onOpenBox, onEditBox, onDeleteBox }: { snapshot: StorageSnapshot; freezer: Freezer; rack: Rack; editable: boolean; onBack: () => void; onCreate: () => void; onOpenBox: (box: StorageBox) => void; onEditBox: (box: StorageBox) => void; onDeleteBox: (box: StorageBox) => void }) {
  const total = rack.boxes.reduce((sum, box) => sum + box.samples.length, 0);
  const capacity = rack.boxes.reduce((sum, box) => sum + box.rows * box.columns, 0);

  return <section className="page">
    <button className="back" type="button" onClick={onBack}>‹ {freezer.name}</button>
    <div className="page-head">
      <div>
        <span className="eyebrow">{snapshot.workspace.name}</span>
        <h1>Vos boxes, sans détour.</h1>
        <p className="subtitle">cr.io adapte le parcours à votre stockage et vous amène directement là où vous travaillez.</p>
      </div>
      <div className="context"><i className="context-dot" />{freezer.name} <span>·</span> {rack.name}</div>
    </div>
    {editable && <div className="page-actions"><button className="primary-button compact" type="button" onClick={onCreate}>Ajouter une box</button></div>}
    <div className="metrics">
      <div className="metric"><strong>{rack.boxes.length}</strong><span>boxes</span></div>
      <div className="metric"><strong>{total}</strong><span>échantillons</span></div>
      <div className="metric"><strong>{capacity - total}</strong><span>places libres</span></div>
    </div>
    {rack.boxes.length ? <div className="box-grid">{rack.boxes.map((box) => <BoxCard key={box.id} box={box} editable={editable} onOpen={() => onOpenBox(box)} onEdit={() => onEditBox(box)} onDelete={() => onDeleteBox(box)} />)}</div> : <div className="empty-state"><h2>Aucune box</h2><p>Ajoutez la première box de ce rack.</p></div>}
  </section>;
}

function BoxView({ location, selectedPosition, editable, onBack, onSelect, onCreate, onEdit, onMove, onDelete }: { location: Required<Location>; selectedPosition: number | null; editable: boolean; onBack: () => void; onSelect: (position: number) => void; onCreate: (position: number) => void; onEdit: (sample: Sample) => void; onMove: (sample: Sample) => void; onDelete: (sample: Sample) => void }) {
  const { freezer, rack, box } = location;
  const capacity = box.rows * box.columns;
  const samplesByPosition = new Map(box.samples.map((sample) => [sample.position, sample]));
  const selectedSample = selectedPosition ? samplesByPosition.get(selectedPosition) : undefined;
  const firstFreePosition = Array.from({ length: capacity }, (_, index) => index + 1).find((position) => !samplesByPosition.has(position));

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
    {editable && firstFreePosition && <div className="page-actions"><button className="primary-button compact" type="button" onClick={() => onCreate(firstFreePosition)}>Ajouter un échantillon</button></div>}
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
      {selectedSample ? <><dl>
        <div><dt>Identifiant</dt><dd>{selectedSample.id}</dd></div>
        <div><dt>Projet</dt><dd>{selectedSample.project}</dd></div>
        <div><dt>Stocké le</dt><dd>{new Date(`${selectedSample.date}T00:00:00`).toLocaleDateString("fr-FR")}</dd></div>
      </dl>{editable && selectedSample.recordId && <div className="sample-panel-actions"><button type="button" onClick={() => onEdit(selectedSample)}>Modifier</button><button type="button" onClick={() => onMove(selectedSample)}>Déplacer</button><button className="danger-link" type="button" onClick={() => onDelete(selectedSample)}>Supprimer</button></div>}</> : <div className="sample-panel-actions"><span className="pill">{positionLabel(selectedPosition, box.columns)}</span>{editable && <button type="button" onClick={() => onCreate(selectedPosition)}>Ajouter ici</button>}</div>}
    </div>}
  </section>;
}

function EntityEditor({ state, onClose, onSaved }: { state: EditorState; onClose: () => void; onSaved: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const entity = state.entity;

  useEffect(() => { dialog.current?.showModal(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const values = new FormData(event.currentTarget);
    const payload = state.kind === "freezer"
      ? { name: values.get("name"), temperatureCelsius: Number(values.get("temperatureCelsius")) }
      : state.kind === "rack"
        ? { name: values.get("name") }
        : { name: values.get("name"), rows: Number(values.get("rows")), columns: Number(values.get("columns")) };
    const endpoint = state.kind === "freezer"
      ? entity ? `/api/freezers/${entity.id}` : "/api/freezers"
      : state.kind === "rack"
        ? entity ? `/api/racks/${entity.id}` : `/api/freezers/${state.freezer.id}/racks`
        : entity ? `/api/boxes/${entity.id}` : `/api/racks/${state.rack.id}/boxes`;

    try {
      const response = await fetch(endpoint, {
        method: entity ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const body: unknown = await response.json();
        const message = typeof body === "object" && body !== null && "message" in body ? String(body.message) : "Enregistrement impossible.";
        throw new Error(message);
      }
      dialog.current?.close();
      await onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  const title = `${entity ? "Modifier" : "Ajouter"} ${state.kind === "freezer" ? "un freezer" : state.kind === "rack" ? "un rack" : "une box"}`;
  return <dialog ref={dialog} className="dialog entity-dialog" onClose={onClose}>
    <div className="dialog-shell">
      <div className="dialog-head"><div><span className="eyebrow">Organisation du stockage</span><h2>{title}</h2></div><button className="icon-button" type="button" onClick={() => dialog.current?.close()} aria-label="Fermer">×</button></div>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>Nom<input name="name" required maxLength={120} defaultValue={entity?.name ?? ""} autoFocus /></label>
        {state.kind === "freezer" && <label>Température (°C)<input name="temperatureCelsius" type="number" min={-196} max={30} required defaultValue={state.entity?.temperatureCelsius ?? -80} /></label>}
        {state.kind === "box" && <div className="form-columns"><label>Lignes<input name="rows" type="number" min={1} max={32} required defaultValue={state.entity?.rows ?? 8} /></label><label>Colonnes<input name="columns" type="number" min={1} max={32} required defaultValue={state.entity?.columns ?? 8} /></label></div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? "Enregistrement…" : "Enregistrer"}</button>
      </form>
    </div>
  </dialog>;
}

function SampleEditor({ state, snapshot, onClose, onSaved }: { state: SampleEditorState; snapshot: StorageSnapshot; onClose: () => void; onSaved: (boxId: string, position: number) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sample = state.mode === "create" ? undefined : state.sample;
  const [targetBoxId, setTargetBoxId] = useState(state.box.id);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const boxes = snapshot.freezers.flatMap((freezer) => freezer.racks.flatMap((rack) => rack.boxes.map((box) => ({ freezer, rack, box }))));
  const targetBox = boxes.find((item) => item.box.id === targetBoxId)?.box ?? state.box;

  useEffect(() => { dialog.current?.showModal(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const values = new FormData(event.currentTarget);
    const position = state.mode === "create" ? state.position : state.mode === "move" ? Number(values.get("position")) : state.sample.position;
    const boxId = state.mode === "move" ? String(values.get("boxId")) : state.box.id;
    const payload = state.mode === "move"
      ? { boxId, position }
      : {
          externalId: values.get("externalId"),
          name: values.get("name"),
          project: values.get("project"),
          storedAt: values.get("storedAt"),
          ...(state.mode === "create" ? { position } : {})
        };
    const endpoint = state.mode === "create" ? `/api/boxes/${state.box.id}/samples` : state.mode === "move" ? `/api/samples/${state.sample.recordId}/move` : `/api/samples/${state.sample.recordId}`;
    const method = state.mode === "edit" ? "PATCH" : "POST";

    try {
      const response = await fetch(endpoint, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) {
        const body: unknown = await response.json();
        const message = typeof body === "object" && body !== null && "message" in body ? String(body.message) : "Enregistrement impossible.";
        throw new Error(message);
      }
      dialog.current?.close();
      await onSaved(boxId, position);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  const title = state.mode === "create" ? `Ajouter en ${positionLabel(state.position, state.box.columns)}` : state.mode === "move" ? "Déplacer l’échantillon" : "Modifier l’échantillon";
  return <dialog ref={dialog} className="dialog sample-dialog" onClose={onClose}>
    <div className="dialog-shell">
      <div className="dialog-head"><div><span className="eyebrow">{state.box.name}</span><h2>{title}</h2></div><button className="icon-button" type="button" onClick={() => dialog.current?.close()} aria-label="Fermer">×</button></div>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        {state.mode === "move" ? <>
          <label>Box<select name="boxId" value={targetBoxId} onChange={(event) => setTargetBoxId(event.target.value)}>{boxes.map(({ freezer, rack, box }) => <option key={box.id} value={box.id}>{freezer.name} · {rack.name} · {box.name}</option>)}</select></label>
          <label>Position<input name="position" type="number" min={1} max={targetBox.rows * targetBox.columns} required defaultValue={sample?.position ?? 1} /></label>
          <small>Positions 1 à {targetBox.rows * targetBox.columns} pour une grille {targetBox.rows} × {targetBox.columns}.</small>
        </> : <>
          <label>Identifiant<input name="externalId" required maxLength={120} defaultValue={sample?.id ?? ""} autoFocus /></label>
          <label>Nom<input name="name" required maxLength={160} defaultValue={sample?.name ?? ""} /></label>
          <label>Projet<input name="project" required maxLength={160} defaultValue={sample?.project ?? ""} /></label>
          <label>Date de stockage<input name="storedAt" type="date" required defaultValue={sample?.date ?? new Date().toISOString().slice(0, 10)} /></label>
        </>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? "Enregistrement…" : state.mode === "move" ? "Déplacer" : "Enregistrer"}</button>
      </form>
    </div>
  </dialog>;
}

export function App() {
  const [mode, setMode] = useState<AppMode>("loading");
  const [authSession, setAuthSession] = useState<AuthSession>();
  const [snapshot, setSnapshot] = useState<StorageSnapshot>();
  const [view, setView] = useState<View>({ level: "freezers" });
  const [editor, setEditor] = useState<EditorState>();
  const [sampleEditor, setSampleEditor] = useState<SampleEditorState>();
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState<SearchResult[]>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference);
  const searchDialog = useRef<HTMLDialogElement>(null);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  function showStorage(data: StorageSnapshot) {
    setSnapshot(data);
    setView(landingView(data));
  }

  async function loadStorage(target?: { boxId: string; position: number | null }) {
    const response = await fetch("/api/storage");
    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = storageSnapshotSchema.parse(await response.json());
    if (!target) {
      showStorage(data);
      return;
    }
    for (const freezer of data.freezers) for (const rack of freezer.racks) {
      const box = rack.boxes.find((item) => item.id === target.boxId);
      if (box) {
        setSnapshot(data);
        setView({ level: "box", freezerId: freezer.id, rackId: rack.id, boxId: box.id });
        setSelectedPosition(target.position);
        return;
      }
    }
    showStorage(data);
  }

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const healthResponse = await fetch("/api/health", { signal: controller.signal });
        if (!healthResponse.ok) throw new Error("API indisponible");
        const health = healthSchema.parse(await healthResponse.json());

        if (health.database === "not_configured") {
          await loadStorage();
          setMode("demo");
          return;
        }

        const sessionResponse = await fetch("/api/auth/session", { signal: controller.signal });
        if (sessionResponse.status === 401) {
          setMode("guest");
          return;
        }
        if (!sessionResponse.ok) throw new Error("Session indisponible");
        setAuthSession(authSessionSchema.parse(await sessionResponse.json()));
        await loadStorage();
        setMode("authenticated");
      } catch {
        if (controller.signal.aborted) return;
        showStorage(createDemoStorage());
        setMode("demo");
      }
    })();
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

  const localResults = useMemo<SearchResult[]>(() => {
    if (!snapshot) return [];
    const normalized = query.trim().toLocaleLowerCase("fr");
    return snapshot.freezers.flatMap((freezer) => freezer.racks.flatMap((rack) => rack.boxes.flatMap((box) => box.samples
      .filter((sample) => !normalized || [sample.id, sample.name, sample.project, box.name].some((value) => value.toLocaleLowerCase("fr").includes(normalized)))
      .map((sample) => ({ freezer, rack, box, sample })))))
      .slice(0, normalized ? 12 : 5);
  }, [query, snapshot]);

  useEffect(() => {
    if (mode !== "authenticated" || !searchOpen || !snapshot) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void fetch(`/api/search?q=${encodeURIComponent(query.trim())}&limit=12`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`API ${response.status}`);
          return sampleSearchResponseSchema.parse(await response.json());
        })
        .then(({ results }) => {
          const mapped = results.flatMap((result): SearchResult[] => {
            const freezer = snapshot.freezers.find((item) => item.id === result.freezer.id);
            const rack = freezer?.racks.find((item) => item.id === result.rack.id);
            const box = rack?.boxes.find((item) => item.id === result.box.id);
            const sample = box?.samples.find((item) => item.recordId === result.recordId);
            return freezer && rack && box && sample ? [{ freezer, rack, box, sample }] : [];
          });
          setRemoteResults(mapped);
        })
        .catch(() => { if (!controller.signal.aborted) setRemoteResults(localResults); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [localResults, mode, query, searchOpen, snapshot]);

  const results = mode === "authenticated" ? remoteResults ?? [] : localResults;

  function openSearch() {
    setQuery("");
    setRemoteResults(undefined);
    setSearchOpen(true);
    searchDialog.current?.showModal();
    window.setTimeout(() => searchInput.current?.focus(), 0);
  }

  function openResult(result: SearchResult) {
    setView({ level: "box", freezerId: result.freezer.id, rackId: result.rack.id, boxId: result.box.id });
    setSelectedPosition(result.sample.position);
    searchDialog.current?.close();
  }

  function goHome() {
    if (!snapshot) return;
    setView(landingView(snapshot));
    setSelectedPosition(null);
  }

  async function removeEntity(kind: "freezers" | "racks" | "boxes", id: string, name: string) {
    if (!window.confirm(`Supprimer « ${name} » et tout son contenu ?`)) return;
    const response = await fetch(`/api/${kind}/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body: unknown = await response.json();
      window.alert(typeof body === "object" && body !== null && "message" in body ? String(body.message) : "Suppression impossible.");
      return;
    }
    await loadStorage();
  }

  async function removeSample(sample: Sample, box: StorageBox) {
    if (!sample.recordId || !window.confirm(`Supprimer l’échantillon « ${sample.name} » ?`)) return;
    const response = await fetch(`/api/samples/${sample.recordId}`, { method: "DELETE" });
    if (!response.ok) {
      const body: unknown = await response.json();
      window.alert(typeof body === "object" && body !== null && "message" in body ? String(body.message) : "Suppression impossible.");
      return;
    }
    await loadStorage({ boxId: box.id, position: sample.position });
  }

  async function handleAuthenticated(session: AuthSession) {
    setAuthSession(session);
    await loadStorage();
    setMode("authenticated");
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      settingsDialog.current?.close();
      setAuthSession(undefined);
      setSnapshot(undefined);
      setView({ level: "freezers" });
      setMode("guest");
    }
  }

  const initials = authSession?.user.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toLocaleUpperCase("fr") || "CL";
  const editable = mode === "authenticated" && (authSession?.workspace.role === "owner" || authSession?.workspace.role === "admin");
  const currentFreezer = view.level === "freezers" ? undefined : snapshot?.freezers.find((freezer) => freezer.id === view.freezerId);
  const currentRack = view.level === "freezers" || view.level === "racks" ? undefined : currentFreezer?.racks.find((rack) => rack.id === view.rackId);
  const currentBox = view.level === "box" ? currentRack?.boxes.find((box) => box.id === view.boxId) : undefined;

  return <>
    <header className="app-header">
      <button className="brand" type="button" onClick={goHome} aria-label="Accueil cr.io"><span className="brand-mark" aria-hidden="true">cr</span><span>.io</span></button>
      <div className="header-actions">
        {(mode === "authenticated" || mode === "demo") && <button className="icon-button" type="button" onClick={openSearch} aria-label="Rechercher"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" /></svg></button>}
        <button className="icon-button" type="button" onClick={() => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark")} aria-label="Changer de thème"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.9-.1-1.34A7 7 0 0 1 13.34 3.1C12.9 3.04 12.46 3 12 3Z" /></svg></button>
        {mode !== "guest" && <button className="avatar" type="button" onClick={() => settingsDialog.current?.showModal()} aria-label="Ouvrir les réglages">{initials}</button>}
      </div>
    </header>

    <main id="app" tabIndex={-1}>
      {mode === "guest" ? <AuthView onAuthenticated={handleAuthenticated} />
        : !snapshot ? <section className="page"><span className="eyebrow">Connexion</span><h1>Chargement du stockage…</h1></section>
          : view.level === "freezers" ? <FreezersView
              snapshot={snapshot}
              editable={editable}
              onCreate={() => setEditor({ kind: "freezer" })}
              onOpen={(freezer) => setView(freezer.racks.length === 1 ? { level: "boxes", freezerId: freezer.id, rackId: freezer.racks[0]!.id } : { level: "racks", freezerId: freezer.id })}
              onEdit={(freezer) => setEditor({ kind: "freezer", entity: freezer })}
              onDelete={(freezer) => void removeEntity("freezers", freezer.id, freezer.name)}
            />
            : view.level === "racks" && currentFreezer ? <RacksView
                snapshot={snapshot}
                freezer={currentFreezer}
                editable={editable}
                onBack={() => setView({ level: "freezers" })}
                onCreate={() => setEditor({ kind: "rack", freezer: currentFreezer })}
                onOpen={(rack) => setView({ level: "boxes", freezerId: currentFreezer.id, rackId: rack.id })}
                onEdit={(rack) => setEditor({ kind: "rack", freezer: currentFreezer, entity: rack })}
                onDelete={(rack) => void removeEntity("racks", rack.id, rack.name)}
              />
              : view.level === "boxes" && currentFreezer && currentRack ? <BoxesView
                  snapshot={snapshot}
                  freezer={currentFreezer}
                  rack={currentRack}
                  editable={editable}
                  onBack={() => setView({ level: "racks", freezerId: currentFreezer.id })}
                  onCreate={() => setEditor({ kind: "box", freezer: currentFreezer, rack: currentRack })}
                  onOpenBox={(box) => { setView({ level: "box", freezerId: currentFreezer.id, rackId: currentRack.id, boxId: box.id }); setSelectedPosition(null); }}
                  onEditBox={(box) => setEditor({ kind: "box", freezer: currentFreezer, rack: currentRack, entity: box })}
                  onDeleteBox={(box) => void removeEntity("boxes", box.id, box.name)}
                />
                : view.level === "box" && currentFreezer && currentRack && currentBox ? <BoxView
                    location={{ freezer: currentFreezer, rack: currentRack, box: currentBox }}
                    selectedPosition={selectedPosition}
                    editable={editable}
                    onBack={() => { setView({ level: "boxes", freezerId: currentFreezer.id, rackId: currentRack.id }); setSelectedPosition(null); }}
                    onSelect={setSelectedPosition}
                    onCreate={(position) => setSampleEditor({ mode: "create", box: currentBox, position })}
                    onEdit={(sample) => setSampleEditor({ mode: "edit", box: currentBox, sample })}
                    onMove={(sample) => setSampleEditor({ mode: "move", box: currentBox, sample })}
                    onDelete={(sample) => void removeSample(sample, currentBox)}
                  />
                  : <section className="page"><span className="eyebrow">Navigation</span><h1>Élément introuvable.</h1><button className="primary-button compact" type="button" onClick={goHome}>Revenir à l’accueil</button></section>}
    </main>

    {editor && <EntityEditor state={editor} onClose={() => setEditor(undefined)} onSaved={async () => { setEditor(undefined); await loadStorage(); }} />}
    {sampleEditor && snapshot && <SampleEditor state={sampleEditor} snapshot={snapshot} onClose={() => setSampleEditor(undefined)} onSaved={async (boxId, position) => { setSampleEditor(undefined); await loadStorage({ boxId, position }); }} />}

    <dialog ref={searchDialog} className="dialog search-dialog" onClose={() => setSearchOpen(false)}>
      <div className="dialog-shell">
        <div className="dialog-head"><div><span className="eyebrow">Recherche globale</span><h2>Retrouver un échantillon</h2></div><button className="icon-button" type="button" onClick={() => searchDialog.current?.close()} aria-label="Fermer">×</button></div>
        <label className="search-field"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" /></svg><input ref={searchInput} type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, identifiant, projet…" /></label>
        <div className="search-results" aria-live="polite">{searching ? <div className="empty-results">Recherche…</div> : results.length ? results.map((result) => <button className="result" type="button" key={result.sample.recordId ?? `${result.box.id}-${result.sample.position}`} onClick={() => openResult(result)}><span><strong>{result.sample.name}</strong><br /><small>{result.sample.id} · {result.sample.project}</small></span><small>{result.box.name} / {positionLabel(result.sample.position, result.box.columns)}</small></button>) : <div className="empty-results">Aucun échantillon trouvé.</div>}</div>
      </div>
    </dialog>

    <dialog ref={settingsDialog} className="dialog settings-dialog">
      <div className="dialog-shell">
        <div className="dialog-head"><div><span className="eyebrow">Préférences</span><h2>Réglages</h2></div><button className="icon-button" type="button" onClick={() => settingsDialog.current?.close()} aria-label="Fermer">×</button></div>
        {authSession && <div className="account-summary"><strong>{authSession.user.displayName}</strong><span>{authSession.user.email}</span><small>{authSession.workspace.name} · {authSession.workspace.role}</small></div>}
        <fieldset className="theme-options"><legend>Thème</legend>{(["system", "light", "dark"] as const).map((value) => <label key={value}><input type="radio" name="theme" value={value} checked={theme === value} onChange={() => setTheme(value)} /><span>{{ system: "Système", light: "Clair", dark: "Sombre" }[value]}</span></label>)}</fieldset>
        {authSession && <a className="secondary-button export-link" href="/api/export/samples.csv" download>Télécharger l’export CSV</a>}
        {authSession && <button className="secondary-button" type="button" onClick={() => void logout()}>Se déconnecter</button>}
        <div className="about"><strong>cr.io</strong><span>Version 0.6.0 · recherche et export</span></div>
      </div>
    </dialog>
  </>;
}
