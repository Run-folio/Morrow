"use client";

import Link from "next/link";
import {
  Camera,
  ChevronDown,
  Globe2,
  MapPin,
  Minus,
  NotebookText,
  Pencil,
  Plus,
  Scan,
  Search,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import worldTopology from "world-atlas/countries-50m.json";

import {
  EasyTButton,
  EasyTLinkButton,
  EasyTSegmentedControl,
} from "@/components/easyt/easyt-controls";
import { trackEvent } from "@/lib/analytics";
import {
  STAMP_COUNTRIES,
  STAMP_REGIONS,
  STAMP_TOPOLOGY_ALIASES,
  filterStampCountries,
  normalizeStampCountryId,
  normalizeStampStatuses,
  stampCountryFlag,
  stampCountryFor,
  summarizeStampRecords,
  type StampCountry,
  type StampRegionFilter,
  type StampStatus,
  type StampStatusFilter,
  type StampStatusRecord,
} from "@/lib/easyt/stamps";

import styles from "./stamped.module.css";

type Language = "en" | "es";
type StatusValue = StampStatus | "unmarked";
type StatusSource = "map" | "explorer" | "country_card";
type TextRecord = Record<string, string>;
type FocusableElement = { focus?: () => void };
type AtlasFeature = {
  id?: string | number;
  properties?: { name?: string };
};

export type StampedExperienceProps = {
  authenticated: boolean;
  initialSelectedCountryId?: string | null;
  language?: Language;
  loadError?: string | null;
  memories: TextRecord;
  onClearError?: () => void;
  onDismissSavePrompt?: () => void;
  onMemorySave: (countryId: string, note: string, photoData: string | null) => Promise<boolean>;
  onRetryLoad?: () => void;
  onStatusChange: (countryId: string, status: StampStatus | null, source: StatusSource) => Promise<void> | void;
  photos: TextRecord;
  ready: boolean;
  saveError?: string | null;
  savePrompt?: boolean;
  statuses: StampStatusRecord;
};

type Props = {
  authenticated?: boolean;
  userKey?: string;
};

const copy = {
  en: {
    addMemory: "Add a memory",
    addPhoto: "Add a photo",
    all: "All",
    allRegions: "All regions",
    cancel: "Cancel",
    choosePhoto: "Choose one photo",
    clearFilters: "Clear filters",
    close: "Close country details",
    countries: "Countries",
    countryCount: (count: number) => `${count} ${count === 1 ? "country" : "countries"}`,
    emptyPrimary: "Mark a country",
    emptySecondary: "Save somewhere to go",
    emptyText: "Mark somewhere you’ve been, or save somewhere you want to go.",
    emptyTitle: "Your world starts here.",
    explore: "Explore stamps",
    filterByRegion: "Filter by region",
    guest: "Exploring as a guest · your changes stay on this device.",
    keep: "Keep your stamps",
    keepAction: "Create account",
    keepText: "Sign in to keep this travel record across your devices.",
    loading: "Loading your stamps",
    memory: "Note & memory",
    memoryCount: "Notes & memories",
    memoryPlaceholder: "A meal, a person, a moment…",
    noResults: "No countries match those filters.",
    photoLarge: "Choose an image smaller than 1.5 MB.",
    photoRemove: "Remove photo",
    retry: "Try again",
    save: "Save memory",
    search: "Search countries",
    status: "Status",
    statusFilter: "Filter stamps by status",
    statusFor: (country: string) => `Status for ${country}`,
    statusLabel: { unmarked: "Unmarked", visited: "Visited", want: "Want to visit" } as Record<StatusValue, string>,
    statsVisited: "Countries seen",
    statsWant: "Want to visit",
    subtitle: "A simple way to keep a living record of where you’ve been and the places still calling.",
    title: "Your world, marked.",
    unmarkedMemory: "This memory is preserved even while the country is unmarked.",
    worldMap: "Interactive world map",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    zoomReset: "Fit world",
  },
  es: {
    addMemory: "Añadir un recuerdo",
    addPhoto: "Añadir una foto",
    all: "Todos",
    allRegions: "Todas las regiones",
    cancel: "Cancelar",
    choosePhoto: "Elige una foto",
    clearFilters: "Borrar filtros",
    close: "Cerrar detalles del país",
    countries: "Países",
    countryCount: (count: number) => `${count} ${count === 1 ? "país" : "países"}`,
    emptyPrimary: "Marcar un país",
    emptySecondary: "Guardar un lugar pendiente",
    emptyText: "Marca un lugar que visitaste o guarda uno al que quieres ir.",
    emptyTitle: "Tu mundo empieza aquí.",
    explore: "Explorar sellos",
    filterByRegion: "Filtrar por región",
    guest: "Explorando como invitado · tus cambios se quedan en este dispositivo.",
    keep: "Guarda tus sellos",
    keepAction: "Crear cuenta",
    keepText: "Inicia sesión para conservar este registro en todos tus dispositivos.",
    loading: "Cargando tus sellos",
    memory: "Nota y recuerdo",
    memoryCount: "Notas y recuerdos",
    memoryPlaceholder: "Una comida, una persona, un momento…",
    noResults: "No hay países que coincidan con esos filtros.",
    photoLarge: "Elige una imagen de menos de 1,5 MB.",
    photoRemove: "Quitar foto",
    retry: "Intentar de nuevo",
    save: "Guardar recuerdo",
    search: "Buscar países",
    status: "Estado",
    statusFilter: "Filtrar sellos por estado",
    statusFor: (country: string) => `Estado de ${country}`,
    statusLabel: { unmarked: "Sin marcar", visited: "Visitado", want: "Quiero ir" } as Record<StatusValue, string>,
    statsVisited: "Países visitados",
    statsWant: "Quiero visitar",
    subtitle: "Una forma sencilla de guardar un registro vivo de dónde has estado y de los lugares que aún te llaman.",
    title: "Tu mundo, marcado.",
    unmarkedMemory: "Este recuerdo se conserva aunque el país no esté marcado.",
    worldMap: "Mapa mundial interactivo",
    zoomIn: "Acercar",
    zoomOut: "Alejar",
    zoomReset: "Ver todo el mundo",
  },
} as const;

const safeParse = (value: string | null): unknown => {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const normalizeTextRecord = (value: unknown): TextRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized: TextRecord = {};
  for (const [candidateId, candidateValue] of Object.entries(value as Record<string, unknown>)) {
    const countryId = normalizeStampCountryId(candidateId);
    if (countryId && typeof candidateValue === "string" && candidateValue.trim()) normalized[countryId] = candidateValue;
  }
  return normalized;
};

const statusValue = (status: StampStatus | undefined): StatusValue => status ?? "unmarked";

const statusName = (status: StampStatus | undefined, labels: (typeof copy)[Language]) => labels.statusLabel[statusValue(status)];

function updateTextRecord(record: TextRecord, countryId: string, value: string) {
  if (!value) {
    const next = { ...record };
    delete next[countryId];
    return next;
  }
  return { ...record, [countryId]: value };
}

export function StampedExperience({
  authenticated,
  initialSelectedCountryId = null,
  language = "en",
  loadError,
  memories,
  onClearError,
  onDismissSavePrompt,
  onMemorySave,
  onRetryLoad,
  onStatusChange,
  photos,
  ready,
  saveError,
  savePrompt,
  statuses,
}: StampedExperienceProps) {
  const labels = copy[language];
  const [region, setRegion] = useState<StampRegionFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(() => normalizeStampCountryId(initialSelectedCountryId));
  const [statusFilter, setStatusFilter] = useState<StampStatusFilter>("all");
  const [zoom, setZoom] = useState(1);
  const [editingMemory, setEditingMemory] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const [draftPhoto, setDraftPhoto] = useState<string | null>(null);
  const [editorError, setEditorError] = useState("");
  const [savingMemory, setSavingMemory] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const mapPanelRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<FocusableElement | null>(null);
  const memoryId = useId();

  const topology = useMemo(
    () => feature(worldTopology as never, worldTopology.objects.countries as never) as unknown as { features: AtlasFeature[] },
    [],
  );
  const projection = useMemo(() => geoNaturalEarth1().fitSize([1100, 560], topology as never), [topology]);
  const path = useMemo(() => geoPath(projection), [projection]);
  const mapFeatures = useMemo(() => topology.features.map((atlasFeature, index) => {
    const topologyName = atlasFeature.properties?.name ?? "";
    const country = stampCountryFor(STAMP_TOPOLOGY_ALIASES[topologyName] ?? topologyName);
    return {
      country,
      d: path(atlasFeature as never) ?? "",
      key: `${atlasFeature.id ?? "geometry"}-${index}`,
    };
  }), [path, topology.features]);

  const filteredCountries = useMemo(() => filterStampCountries({
    search,
    region,
    status: statusFilter,
    statuses,
  }), [region, search, statusFilter, statuses]);

  const summary = useMemo(() => summarizeStampRecords({ statuses, memories, photos }), [memories, photos, statuses]);
  const isEmpty = ready && summary.visited === 0 && summary.want === 0 && summary.memories === 0;
  const selectedCountry = selectedCountryId ? stampCountryFor(selectedCountryId) : null;
  const selectedStatus = selectedCountry ? statuses[selectedCountry.id] : undefined;
  const selectedNote = selectedCountry ? memories[selectedCountry.id] ?? "" : "";
  const selectedPhoto = selectedCountry ? photos[selectedCountry.id] ?? "" : "";

  useEffect(() => {
    if (!selectedCountryId) return;
    setEditingMemory(false);
    setDraftNote(memories[selectedCountryId] ?? "");
    setDraftPhoto(photos[selectedCountryId] ?? null);
    setEditorError("");
  }, [memories, photos, selectedCountryId]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !selectedCountryId) return;
      setSelectedCountryId(null);
      setEditingMemory(false);
      window.setTimeout(() => restoreFocusRef.current?.focus?.(), 0);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedCountryId]);

  const chooseCountry = (countryId: string, trigger?: FocusableElement | null, fromExplorer = false) => {
    restoreFocusRef.current = trigger ?? null;
    setSelectedCountryId(countryId);
    if (fromExplorer && window.matchMedia("(max-width: 900px)").matches) {
      window.setTimeout(() => mapPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
    }
  };

  const closeCountry = () => {
    setSelectedCountryId(null);
    setEditingMemory(false);
    window.setTimeout(() => restoreFocusRef.current?.focus?.(), 0);
  };

  const changeFilter = (nextFilter: StampStatusFilter) => {
    setStatusFilter(nextFilter);
    if (selectedCountry && nextFilter !== "all" && statuses[selectedCountry.id] !== nextFilter) closeCountry();
  };

  const beginMemory = () => {
    setDraftNote(selectedNote);
    setDraftPhoto(selectedPhoto || null);
    setEditorError("");
    setEditingMemory(true);
  };

  const choosePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    if (chosen.size > 1_500_000) {
      setEditorError(labels.photoLarge);
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setDraftPhoto(String(reader.result));
      setEditorError("");
    };
    reader.onerror = () => setEditorError(labels.photoLarge);
    reader.readAsDataURL(chosen);
  };

  const saveMemory = async () => {
    if (!selectedCountry) return;
    setSavingMemory(true);
    setEditorError("");
    const saved = await onMemorySave(selectedCountry.id, draftNote.trim(), draftPhoto);
    setSavingMemory(false);
    if (saved) setEditingMemory(false);
  };

  const focusExplorer = () => {
    setStatusFilter("all");
    setRegion("all");
    window.setTimeout(() => {
      searchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      searchRef.current?.focus();
    }, 0);
  };

  return (
    <div className={styles.shell}>
      <section className={styles.hero} data-empty={isEmpty || undefined}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>MORROVIA · {language === "es" ? "SELLOS" : "STAMPED"}</p>
          <h1>{labels.title}</h1>
          <p className={styles.heroIntro}>{labels.subtitle}</p>
        </div>

        {!ready ? (
          <div className={styles.statsLoading} aria-label={labels.loading} aria-busy="true"><span /><span /></div>
        ) : !isEmpty ? (
          <div className={styles.statsPanel} data-count={summary.memories > 0 ? 3 : 2} aria-label={language === "es" ? "Resumen de sellos" : "Stamp summary"}>
            <div className={styles.statItem}>
              <span className={styles.statIcon}><Globe2 aria-hidden="true" /></span>
              <strong>{summary.visited}</strong>
              <span>{labels.statsVisited}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statIcon}><MapPin aria-hidden="true" /></span>
              <strong>{summary.want}</strong>
              <span>{labels.statsWant}</span>
            </div>
            {summary.memories > 0 ? <div className={styles.statItem}>
              <span className={styles.statIcon}><NotebookText aria-hidden="true" /></span>
              <strong>{summary.memories}</strong>
              <span>{labels.memoryCount}</span>
            </div> : null}
          </div>
        ) : null}
      </section>

      {!authenticated ? <p className={styles.guestNote}>{labels.guest}<Link href="/journey/login?next=%2Fjourney%2Fstamped">{language === "es" ? "Iniciar sesión" : "Sign in"}</Link></p> : null}

      {loadError ? <div className={styles.notice} data-tone="error" role="alert">
        <span>{loadError}</span>
        <span className={styles.noticeActions}>
          {onRetryLoad ? <button type="button" onClick={onRetryLoad}>{labels.retry}</button> : null}
          {onClearError ? <button type="button" onClick={onClearError}>{language === "es" ? "Cerrar" : "Dismiss"}</button> : null}
        </span>
      </div> : null}

      {saveError ? <div className={styles.notice} data-tone="error" role="alert">
        <span>{saveError}</span>
        {onClearError ? <button type="button" onClick={onClearError}>{language === "es" ? "Cerrar" : "Dismiss"}</button> : null}
      </div> : null}

      {!authenticated && savePrompt ? <div className={styles.notice} role="status">
        <span><strong>{labels.keep}</strong> · {labels.keepText}</span>
        <span className={styles.noticeActions}>
          <EasyTLinkButton href="/journey/login?mode=sign-up&next=%2Fjourney%2Fstamped" size="small">{labels.keepAction}</EasyTLinkButton>
          {onDismissSavePrompt ? <button type="button" onClick={onDismissSavePrompt}>{language === "es" ? "Ahora no" : "Not now"}</button> : null}
        </span>
      </div> : null}

      <div className={styles.workspace}>
        <section ref={mapPanelRef} className={styles.mapPanel} aria-label={labels.worldMap}>
          <div className={styles.mapViewport}>
            <div className={styles.mapControls} aria-label={language === "es" ? "Controles del mapa" : "Map controls"}>
              <EasyTButton className={styles.mapControl} icon={Plus} iconOnly size="small" variant="secondary" disabled={zoom >= 1.24} onClick={() => setZoom((current) => Math.min(1.24, +(current + .12).toFixed(2)))}>{labels.zoomIn}</EasyTButton>
              <EasyTButton className={styles.mapControl} icon={Minus} iconOnly size="small" variant="secondary" disabled={zoom <= 1} onClick={() => setZoom((current) => Math.max(1, +(current - .12).toFixed(2)))}>{labels.zoomOut}</EasyTButton>
              <EasyTButton className={styles.mapControl} icon={Scan} iconOnly size="small" variant="secondary" onClick={() => setZoom(1)}>{labels.zoomReset}</EasyTButton>
            </div>

            <svg className={styles.map} viewBox="0 0 1100 560" role="group" aria-label={labels.worldMap} onClick={closeCountry}>
              <g className={styles.mapGroup} style={{ transform: `scale(${zoom})` }}>
                {mapFeatures.map(({ country, d, key }) => {
                  const countryStatus = country ? statuses[country.id] : undefined;
                  const muted = Boolean(country && statusFilter !== "all" && countryStatus !== statusFilter);
                  const interactive = Boolean(country && !muted);
                  return (
                    <path
                      key={key}
                      d={d}
                      className={[
                        styles.country,
                        interactive ? styles.countryInteractive : "",
                        countryStatus === "visited" ? styles.countryVisited : "",
                        countryStatus === "want" ? styles.countryWant : "",
                        selectedCountryId === country?.id ? styles.countrySelected : "",
                        muted ? styles.countryMuted : "",
                      ].filter(Boolean).join(" ")}
                      data-country-id={country?.id}
                      role={interactive ? "button" : undefined}
                      tabIndex={interactive ? 0 : -1}
                      aria-hidden={country ? undefined : true}
                      aria-label={country ? `${country.name}: ${statusName(countryStatus, labels)}` : undefined}
                      aria-pressed={country ? selectedCountryId === country.id : undefined}
                      onClick={interactive && country ? (event) => {
                        event.stopPropagation();
                        chooseCountry(country.id, event.currentTarget);
                      } : undefined}
                      onKeyDown={interactive && country ? (event: ReactKeyboardEvent<SVGPathElement>) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        chooseCountry(country.id, event.currentTarget);
                      } : undefined}
                    />
                  );
                })}
              </g>
            </svg>

            {isEmpty && !selectedCountry ? <article className={styles.emptyCard}>
              <h2>{labels.emptyTitle}</h2>
              <p>{labels.emptyText}</p>
              <div className={styles.emptyActions}>
                <EasyTButton size="small" onClick={focusExplorer}>{labels.emptyPrimary}</EasyTButton>
                <EasyTButton size="small" variant="secondary" onClick={focusExplorer}>{labels.emptySecondary}</EasyTButton>
              </div>
            </article> : null}

            {selectedCountry ? <article className={styles.countryCard} id="selected-stamp-country" aria-live="polite">
              <header className={styles.countryCardHeader}>
                <div className={styles.countryIdentity}>
                  <span className={styles.flag} aria-hidden="true">{stampCountryFlag(selectedCountry.id)}</span>
                  <div>
                    <h3>{selectedCountry.name}</h3>
                    <p>{statusName(selectedStatus, labels)}</p>
                  </div>
                </div>
                <button type="button" className={styles.closeButton} aria-label={labels.close} onClick={closeCountry}><X aria-hidden="true" /></button>
              </header>

              <div className={styles.cardBody}>
                <EasyTSegmentedControl<StatusValue>
                  ariaLabel={`${labels.status}: ${selectedCountry.name}`}
                  className={styles.statusControl}
                  value={statusValue(selectedStatus)}
                  options={([
                    { value: "unmarked", label: labels.statusLabel.unmarked },
                    { value: "visited", label: labels.statusLabel.visited },
                    { value: "want", label: labels.statusLabel.want },
                  ] as const)}
                  onChange={(next) => void onStatusChange(selectedCountry.id, next === "unmarked" ? null : next, "country_card")}
                />

                {editingMemory ? <div className={styles.memoryEditor}>
                  <label htmlFor={memoryId}>
                    <span>{labels.memory}</span>
                    <textarea id={memoryId} maxLength={2000} value={draftNote} placeholder={labels.memoryPlaceholder} onChange={(event) => setDraftNote(event.target.value)} />
                  </label>
                  <div className={styles.editorMeta}><span>{draftNote.length} / 2000</span><span>{labels.choosePhoto}</span></div>
                  {draftPhoto ? <figure className={styles.photoDraft}>
                    <img src={draftPhoto} alt={language === "es" ? `Recuerdo de ${selectedCountry.name}` : `Memory from ${selectedCountry.name}`} />
                    <button type="button" onClick={() => setDraftPhoto(null)}>{labels.photoRemove}</button>
                  </figure> : <label className={styles.photoPicker}><Camera aria-hidden="true" />{labels.addPhoto}<input type="file" accept="image/*" onChange={choosePhoto} /></label>}
                  {editorError ? <p className={styles.editorError} role="alert">{editorError}</p> : null}
                  <div className={styles.editorActions}>
                    <EasyTButton size="small" variant="secondary" onClick={() => setEditingMemory(false)}>{labels.cancel}</EasyTButton>
                    <EasyTButton size="small" loading={savingMemory} onClick={() => void saveMemory()}>{labels.save}</EasyTButton>
                  </div>
                </div> : selectedNote || selectedPhoto ? <div className={styles.memoryBlock}>
                  <div className={styles.memoryHeading}><span>{labels.memory}</span><button type="button" className={styles.editMemory} onClick={beginMemory}><Pencil aria-hidden="true" />{language === "es" ? "Editar" : "Edit"}</button></div>
                  {selectedNote ? <p className={styles.memoryText}>{selectedNote}</p> : null}
                  {selectedPhoto ? <figure className={styles.memoryPhoto}><img src={selectedPhoto} alt={language === "es" ? `Recuerdo de ${selectedCountry.name}` : `Memory from ${selectedCountry.name}`} /></figure> : null}
                  {!selectedStatus ? <p className={styles.editorMeta}>{labels.unmarkedMemory}</p> : null}
                </div> : selectedStatus ? <EasyTButton className={styles.addMemory} icon={NotebookText} size="small" variant="secondary" onClick={beginMemory}>{labels.addMemory}</EasyTButton> : null}
              </div>
            </article> : null}
          </div>

          <footer className={styles.mapLegend}>
            <span><i className={styles.legendDot} data-status="visited" />{labels.statusLabel.visited}</span>
            <span><i className={styles.legendDot} data-status="want" />{labels.statusLabel.want}</span>
          </footer>
        </section>

        <aside className={styles.explorerPanel} aria-labelledby="stamp-explorer-title">
          <div className={styles.explorerHeader}>
            <h2 id="stamp-explorer-title">{labels.explore}</h2>
            <EasyTSegmentedControl<StampStatusFilter>
              ariaLabel={labels.statusFilter}
              className={styles.statusTabs}
              value={statusFilter}
              options={[
                { value: "all", label: labels.all },
                { value: "visited", label: labels.statusLabel.visited },
                { value: "want", label: labels.statusLabel.want },
              ]}
              onChange={changeFilter}
            />
            <label className={styles.searchBox}>
              <span className={styles.srOnly}>{labels.search}</span>
              <Search aria-hidden="true" />
              <input ref={searchRef} type="search" value={search} placeholder={labels.search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <div className={styles.filterRow}>
              <label className={styles.regionSelect}>
                <span>{labels.filterByRegion}</span>
                <select value={region} onChange={(event) => setRegion(event.target.value as StampRegionFilter)}>
                  <option value="all">{labels.allRegions}</option>
                  {STAMP_REGIONS.map((stampRegion) => <option key={stampRegion} value={stampRegion}>{stampRegion}</option>)}
                </select>
                <ChevronDown aria-hidden="true" />
              </label>
              <span>{labels.countryCount(filteredCountries.length)}</span>
            </div>
          </div>

          <div className={styles.countryList}>
            <p className={styles.listMeta}>{labels.countries}</p>
            {filteredCountries.length ? <ul className={styles.countryRows}>
              {filteredCountries.map((country: StampCountry) => {
                const countryStatus = statuses[country.id];
                const value = statusValue(countryStatus);
                return <li key={country.id} className={styles.countryRow} data-selected={selectedCountryId === country.id || undefined}>
                  <button type="button" className={styles.rowCountry} aria-controls="selected-stamp-country" aria-pressed={selectedCountryId === country.id} onClick={(event) => chooseCountry(country.id, event.currentTarget, true)}>
                    <span className={styles.flag} aria-hidden="true">{stampCountryFlag(country.id)}</span>
                    <strong>{country.name}</strong>
                  </button>
                  <label className={styles.rowStatus} data-status={value}>
                    <span className={styles.srOnly}>{labels.statusFor(country.name)}</span>
                    <select value={value} onChange={(event) => {
                      const next = event.target.value as StatusValue;
                      restoreFocusRef.current = event.currentTarget;
                      setSelectedCountryId(country.id);
                      void onStatusChange(country.id, next === "unmarked" ? null : next, "explorer");
                    }}>
                      <option value="unmarked">{labels.statusLabel.unmarked}</option>
                      <option value="visited">{labels.statusLabel.visited}</option>
                      <option value="want">{labels.statusLabel.want}</option>
                    </select>
                    <ChevronDown aria-hidden="true" />
                  </label>
                </li>;
              })}
            </ul> : <div className={styles.noResults}>
              <strong>{labels.noResults}</strong>
              <button type="button" onClick={() => { setSearch(""); setRegion("all"); setStatusFilter("all"); }}>{labels.clearFilters}</button>
            </div>}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function StampedClient({ userKey, authenticated }: Props) {
  const isAuthenticated = authenticated ?? Boolean(userKey);
  const [language, setLanguage] = useState<Language>("en");
  const [statuses, setStatuses] = useState<Record<string, StampStatus>>({});
  const [memories, setMemories] = useState<TextRecord>({});
  const [photos, setPhotos] = useState<TextRecord>({});
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savePrompt, setSavePrompt] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const statusStorageKey = `easyt-stamped-${userKey ?? "guest"}`;
  const memoryStorageKey = `easyt-stamp-memories-${userKey ?? "guest"}`;
  const photoStorageKey = `easyt-stamp-photos-${userKey ?? "guest"}`;

  useEffect(() => {
    const saved = window.localStorage.getItem("easyt-language");
    setLanguage(saved === "es" ? "es" : "en");
    const update = (event: Event) => setLanguage((event as CustomEvent<Language>).detail === "es" ? "es" : "en");
    window.addEventListener("easyt-language-change", update);
    return () => window.removeEventListener("easyt-language-change", update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setLoadError(null);

    const cachedStatuses = normalizeStampStatuses(safeParse(window.localStorage.getItem(statusStorageKey)));
    const cachedMemories = normalizeTextRecord(safeParse(window.localStorage.getItem(memoryStorageKey)));
    const cachedPhotos = normalizeTextRecord(safeParse(window.localStorage.getItem(photoStorageKey)));
    setStatuses(cachedStatuses);
    setMemories(cachedMemories);
    setPhotos(cachedPhotos);

    if (!isAuthenticated) {
      setReady(true);
      return () => { cancelled = true; };
    }

    const load = async () => {
      try {
        const response = await fetch("/api/easyt/stamped", { cache: "no-store" });
        const data = await response.json() as { error?: string; statuses?: unknown; memories?: Record<string, { note?: string; photoData?: string }> };
        if (!response.ok) throw new Error(data.error || "Unable to load your stamps.");
        if (cancelled) return;

        const remoteStatuses = normalizeStampStatuses(data.statuses);
        const remoteMemories = normalizeTextRecord(Object.fromEntries(Object.entries(data.memories ?? {}).map(([id, memory]) => [id, memory.note ?? ""])));
        const remotePhotos = normalizeTextRecord(Object.fromEntries(Object.entries(data.memories ?? {}).map(([id, memory]) => [id, memory.photoData ?? ""])));
        const guestStatuses = normalizeStampStatuses(safeParse(window.localStorage.getItem("easyt-stamped-guest")));
        const claimedBy = window.localStorage.getItem("easyt-stamped-guest-claimed-by");
        const canClaimGuest = Boolean(userKey && Object.keys(guestStatuses).length && (!claimedBy || claimedBy === userKey));
        const mergedStatuses = canClaimGuest ? { ...guestStatuses, ...remoteStatuses } : remoteStatuses;

        if (canClaimGuest) {
          const missingGuestRows = Object.entries(guestStatuses).filter(([countryId]) => !remoteStatuses[countryId]);
          const migrated = await Promise.all(missingGuestRows.map(async ([countryId, status]) => {
            const migration = await fetch("/api/easyt/stamped", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ countryId, status }),
            });
            return migration.ok;
          }));
          if (migrated.every(Boolean) && userKey) {
            window.localStorage.setItem("easyt-stamped-guest-claimed-by", userKey);
            window.localStorage.removeItem("easyt-stamped-guest");
          } else if (!migrated.every(Boolean)) {
            setSaveError(language === "es"
              ? "Algunos sellos de este dispositivo aún no se han sincronizado con tu cuenta."
              : "Some stamps from this device have not synced to your account yet.");
          }
        }

        if (cancelled) return;
        setStatuses(mergedStatuses);
        setMemories(remoteMemories);
        setPhotos(remotePhotos);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load your stamps.");
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [isAuthenticated, language, memoryStorageKey, photoStorageKey, reloadToken, statusStorageKey, userKey]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(statusStorageKey, JSON.stringify(statuses));
      window.localStorage.setItem(memoryStorageKey, JSON.stringify(memories));
      window.localStorage.setItem(photoStorageKey, JSON.stringify(photos));
    } catch {
      setSaveError(language === "es" ? "Este dispositivo no pudo guardar el último cambio." : "This device could not save the latest change.");
    }
  }, [language, memories, memoryStorageKey, photos, photoStorageKey, ready, statuses, statusStorageKey]);

  const changeStatus = async (countryId: string, nextStatus: StampStatus | null, source: StatusSource) => {
    const previousStatus = statuses[countryId] ?? null;
    if (previousStatus === nextStatus) return;
    setSaveError(null);
    setStatuses((current) => {
      if (nextStatus) return { ...current, [countryId]: nextStatus };
      const next = { ...current };
      delete next[countryId];
      return next;
    });

    if (!isAuthenticated) {
      setSavePrompt(true);
      trackEvent("stamp_status_changed", {
        previous_status: previousStatus ?? "unmarked",
        next_status: nextStatus ?? "unmarked",
        source,
        is_authenticated: false,
      });
      return;
    }

    try {
      const response = await fetch("/api/easyt/stamped", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryId, status: nextStatus }),
      });
      if (!response.ok) throw new Error("Unable to save this stamp.");
      trackEvent("stamp_status_changed", {
        previous_status: previousStatus ?? "unmarked",
        next_status: nextStatus ?? "unmarked",
        source,
        is_authenticated: true,
      });
    } catch {
      setSaveError(language === "es" ? "No pudimos guardar este sello en tu cuenta. El cambio sigue en este dispositivo." : "We could not save this stamp to your account. The change is still on this device.");
    }
  };

  const saveMemory = async (countryId: string, note: string, photoData: string | null) => {
    const previousNote = memories[countryId]?.trim() ?? "";
    setSaveError(null);
    setMemories((current) => updateTextRecord(current, countryId, note));
    setPhotos((current) => updateTextRecord(current, countryId, photoData ?? ""));

    if (!isAuthenticated) {
      setSavePrompt(true);
      if (!previousNote && note) trackEvent("stamp_note_added", { source: "country_card", is_authenticated: false });
      return true;
    }

    try {
      const response = await fetch("/api/easyt/stamped", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryId, note, photoData }),
      });
      if (!response.ok) throw new Error("Unable to save this memory.");
      if (!previousNote && note) trackEvent("stamp_note_added", { source: "country_card", is_authenticated: true });
      return true;
    } catch {
      setSaveError(language === "es" ? "No pudimos guardar este recuerdo en tu cuenta. El cambio sigue en este dispositivo." : "We could not save this memory to your account. The change is still on this device.");
      return false;
    }
  };

  return <StampedExperience
    authenticated={isAuthenticated}
    language={language}
    loadError={loadError}
    memories={memories}
    onClearError={() => { setLoadError(null); setSaveError(null); }}
    onDismissSavePrompt={() => setSavePrompt(false)}
    onMemorySave={saveMemory}
    onRetryLoad={() => setReloadToken((current) => current + 1)}
    onStatusChange={changeStatus}
    photos={photos}
    ready={ready}
    saveError={saveError}
    savePrompt={savePrompt}
    statuses={statuses}
  />;
}
