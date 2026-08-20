"use client";

import { useEffect, useMemo, useState } from "react";
import { feature } from "topojson-client";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import worldTopology from "world-atlas/countries-50m.json";
import styles from "./stamped.module.css";
import memoryStyles from "./stamped-memory.module.css";
import mediaStyles from "./stamped-media.module.css";

type Status = "visited" | "want";
type StatusFilter = "all" | Status;
type Country = { id: string; name: string; continent: string; aliases?: string[] };
type Props = { userKey?: string; authenticated?: boolean };

const list = (value: string) => value.split("|");
const groups: Record<string, string[]> = {
  Africa: list("Algeria|Angola|Benin|Botswana|Burkina Faso|Burundi|Cabo Verde|Cameroon|Central African Republic|Chad|Comoros|Democratic Republic of the Congo|Djibouti|Egypt|Equatorial Guinea|Eritrea|Eswatini|Ethiopia|Gabon|Gambia|Ghana|Guinea|Guinea-Bissau|Ivory Coast|Kenya|Lesotho|Liberia|Libya|Madagascar|Malawi|Mali|Mauritania|Mauritius|Morocco|Mozambique|Namibia|Niger|Nigeria|Republic of the Congo|Rwanda|Sao Tome and Principe|Senegal|Seychelles|Sierra Leone|Somalia|South Africa|South Sudan|Sudan|Tanzania|Togo|Tunisia|Uganda|Zambia|Zimbabwe"),
  Americas: list("Antigua and Barbuda|Argentina|Bahamas|Barbados|Belize|Bolivia|Brazil|Canada|Chile|Colombia|Costa Rica|Cuba|Dominica|Dominican Republic|Ecuador|El Salvador|Grenada|Guatemala|Guyana|Haiti|Honduras|Jamaica|Mexico|Nicaragua|Panama|Paraguay|Peru|Saint Kitts and Nevis|Saint Lucia|Saint Vincent and the Grenadines|Suriname|Trinidad and Tobago|United States|Uruguay|Venezuela"),
  Asia: list("Afghanistan|Armenia|Azerbaijan|Bahrain|Bangladesh|Bhutan|Brunei|Cambodia|China|Cyprus|Georgia|India|Indonesia|Iran|Iraq|Israel|Japan|Jordan|Kazakhstan|Kuwait|Kyrgyzstan|Laos|Lebanon|Malaysia|Maldives|Mongolia|Myanmar|Nepal|North Korea|Oman|Pakistan|Palestine|Philippines|Qatar|Saudi Arabia|Singapore|South Korea|Sri Lanka|Syria|Taiwan|Tajikistan|Thailand|Timor-Leste|Turkey|Turkmenistan|United Arab Emirates|Uzbekistan|Vietnam|Yemen"),
  Europe: list("Albania|Andorra|Austria|Belarus|Belgium|Bosnia and Herzegovina|Bulgaria|Croatia|Czechia|Denmark|Estonia|Finland|France|Germany|Greece|Hungary|Iceland|Ireland|Italy|Kosovo|Latvia|Liechtenstein|Lithuania|Luxembourg|Malta|Moldova|Monaco|Montenegro|Netherlands|North Macedonia|Norway|Poland|Portugal|Romania|Russia|San Marino|Serbia|Slovakia|Slovenia|Spain|Sweden|Switzerland|Ukraine|United Kingdom|Vatican City"),
  Oceania: list("Australia|Fiji|Kiribati|Marshall Islands|Micronesia|Nauru|New Zealand|Palau|Papua New Guinea|Samoa|Solomon Islands|Tonga|Tuvalu|Vanuatu"),
};
const colors: Record<string, string> = { Africa: "#f4a62a", Americas: "#68bd52", Asia: "#e65a86", Europe: "#6875d9", Oceania: "#36aeb2", Other: "#8d8a9d" };
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const curatedCountries: Country[] = Object.entries(groups).flatMap(([continent, names]) => names.map((name) => ({ id: slug(name), name, continent })));
const aliases: Record<string, string> = { "United States of America": "United States", Korea: "South Korea", "Czech Republic": "Czechia", "Czech Rep.": "Czechia", "Côte d'Ivoire": "Ivory Coast", "Cote d'Ivoire": "Ivory Coast", Swaziland: "Eswatini", eSwatini: "Eswatini", "São Tomé and Príncipe": "Sao Tome and Principe", Congo: "Republic of the Congo", "Dem. Rep. Congo": "Democratic Republic of the Congo", "Russian Federation": "Russia", "Viet Nam": "Vietnam", "The Bahamas": "Bahamas", "The Gambia": "Gambia", "Kyrgyz Republic": "Kyrgyzstan", Macedonia: "North Macedonia", "Bosnia and Herz.": "Bosnia and Herzegovina", "Central African Rep.": "Central African Republic", "Eq. Guinea": "Equatorial Guinea", "S. Sudan": "South Sudan", "Solomon Is.": "Solomon Islands", "United Republic of Tanzania": "Tanzania", "Bolivia (Plurinational State of)": "Bolivia", "Venezuela (Bolivarian Republic of)": "Venezuela", Türkiye: "Turkey" };
const seed: Record<string, Status> = { guatemala: "visited", japan: "visited", "south-korea": "visited", taiwan: "visited", "united-states": "visited", france: "want", italy: "want", indonesia: "want", malaysia: "want", spain: "want" };
const flagCodes: Record<string, string> = { Argentina: "🇦🇷", Australia: "🇦🇺", Austria: "🇦🇹", Bahamas: "🇧🇸", Belgium: "🇧🇪", Brazil: "🇧🇷", Canada: "🇨🇦", Chile: "🇨🇱", China: "🇨🇳", Colombia: "🇨🇴", CostaRica: "🇨🇷", Croatia: "🇭🇷", Cuba: "🇨🇺", Czechia: "🇨🇿", Denmark: "🇩🇰", Ecuador: "🇪🇨", Egypt: "🇪🇬", Fiji: "🇫🇯", Finland: "🇫🇮", France: "🇫🇷", Germany: "🇩🇪", Ghana: "🇬🇭", Greece: "🇬🇷", Guatemala: "🇬🇹", Hungary: "🇭🇺", Iceland: "🇮🇸", India: "🇮🇳", Indonesia: "🇮🇩", Ireland: "🇮🇪", Israel: "🇮🇱", Italy: "🇮🇹", Jamaica: "🇯🇲", Japan: "🇯🇵", Jordan: "🇯🇴", Kenya: "🇰🇪", Laos: "🇱🇦", Malaysia: "🇲🇾", Maldives: "🇲🇻", Mexico: "🇲🇽", Morocco: "🇲🇦", Nepal: "🇳🇵", Netherlands: "🇳🇱", "New Zealand": "🇳🇿", Norway: "🇳🇴", Panama: "🇵🇦", Peru: "🇵🇪", Philippines: "🇵🇭", Poland: "🇵🇱", Portugal: "🇵🇹", Rwanda: "🇷🇼", Senegal: "🇸🇳", Singapore: "🇸🇬", "South Africa": "🇿🇦", "South Korea": "🇰🇷", Spain: "🇪🇸", SriLanka: "🇱🇰", Sweden: "🇸🇪", Switzerland: "🇨🇭", Taiwan: "🇹🇼", Tanzania: "🇹🇿", Thailand: "🇹🇭", Tunisia: "🇹🇳", Turkey: "🇹🇷", Uganda: "🇺🇬", Ukraine: "🇺🇦", "United Kingdom": "🇬🇧", "United States": "🇺🇸", Uruguay: "🇺🇾", Vietnam: "🇻🇳", Zambia: "🇿🇲", Zimbabwe: "🇿🇼" };
const flagIso: Record<string, string> = Object.fromEntries("Algeria:DZ|Angola:AO|Benin:BJ|Botswana:BW|Burkina Faso:BF|Burundi:BI|Cabo Verde:CV|Cameroon:CM|Central African Republic:CF|Chad:TD|Comoros:KM|Democratic Republic of the Congo:CD|Djibouti:DJ|Equatorial Guinea:GQ|Eritrea:ER|Eswatini:SZ|Ethiopia:ET|Gabon:GA|Gambia:GM|Guinea:GN|Guinea-Bissau:GW|Ivory Coast:CI|Lesotho:LS|Liberia:LR|Libya:LY|Madagascar:MG|Malawi:MW|Mali:ML|Mauritania:MR|Mauritius:MU|Mozambique:MZ|Namibia:NA|Niger:NE|Nigeria:NG|Republic of the Congo:CG|Seychelles:SC|Sierra Leone:SL|Somalia:SO|South Sudan:SS|Sudan:SD|Togo:TG|Zambia:ZM|Antigua and Barbuda:AG|Barbados:BB|Belize:BZ|Bolivia:BO|Dominica:DM|Dominican Republic:DO|El Salvador:SV|Grenada:GD|Guyana:GY|Haiti:HT|Honduras:HN|Nicaragua:NI|Paraguay:PY|Saint Kitts and Nevis:KN|Saint Lucia:LC|Saint Vincent and the Grenadines:VC|Suriname:SR|Trinidad and Tobago:TT|Venezuela:VE|Afghanistan:AF|Armenia:AM|Azerbaijan:AZ|Bahrain:BH|Bangladesh:BD|Bhutan:BT|Brunei:BN|Cambodia:KH|Cyprus:CY|Georgia:GE|Iran:IR|Iraq:IQ|Jordan:JO|Kazakhstan:KZ|Kuwait:KW|Kyrgyzstan:KG|Lebanon:LB|Mongolia:MN|Myanmar:MM|North Korea:KP|Oman:OM|Pakistan:PK|Palestine:PS|Qatar:QA|Saudi Arabia:SA|Sri Lanka:LK|Syria:SY|Tajikistan:TJ|Turkmenistan:TM|United Arab Emirates:AE|Uzbekistan:UZ|Yemen:YE|Albania:AL|Andorra:AD|Belarus:BY|Bosnia and Herzegovina:BA|Bulgaria:BG|Estonia:EE|Kosovo:XK|Latvia:LV|Liechtenstein:LI|Lithuania:LT|Luxembourg:LU|Malta:MT|Moldova:MD|Monaco:MC|Montenegro:ME|North Macedonia:MK|Romania:RO|Russia:RU|San Marino:SM|Serbia:RS|Slovakia:SK|Slovenia:SI|Vatican City:VA|Kiribati:KI|Marshall Islands:MH|Micronesia:FM|Nauru:NR|Palau:PW|Papua New Guinea:PG|Samoa:WS|Solomon Islands:SB|Tonga:TO|Tuvalu:TV|Vanuatu:VU".split("|").map((entry) => entry.split(":")));
const flagFor = (name: string) => { const direct = flagCodes[name.replace(/\s+/g, "")] || flagCodes[name]; if (direct) return direct; const code = flagIso[name]; return code ? [...code].map((char) => String.fromCodePoint(char.charCodeAt(0) + 127397)).join("") : "🌐"; };

export default function StampedClient({ userKey, authenticated }: Props) {
  const isAuthenticated = authenticated ?? Boolean(userKey);
  const storageKey = `easyt-stamped-${userKey ?? "guest"}`;
  const [statuses, setStatuses] = useState<Record<string, Status>>(seed);
  const [continent, setContinent] = useState("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dbLoaded, setDbLoaded] = useState(false);
  const [savePrompt, setSavePrompt] = useState(false);
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [memories, setMemories] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [started, setStarted] = useState(false);
  const labels = language === "es"
    ? { eyebrow: "MORROVIA · SELLOS", title: "Tu mundo, marcado.", intro: "Guarda un registro vivo de los lugares donde has estado y de los que aún te esperan.", visited: "países visitados", guest: "Explorando como invitado · tus cambios se quedan en este dispositivo.", signIn: "Inicia sesión", keep: "Guarda tus sellos", keepText: "Crea una cuenta gratis para guardar este mapa en todos tus dispositivos.", create: "Crear cuenta", dismiss: "Cerrar", mapHint: "Toca un país para actualizar tu sello", allLabel: "Todos", visitedLabel: "Visitado", wantLabel: "Quiero ir", statusFilterLabel: "Filtrar sellos por estado", startTitle: "Empieza con un lugar que recuerdes.", startText: "Marca un país visitado o uno al que quieres ir. Puedes añadir una nota o foto después.", startAction: "Empieza a marcar", searchPlaceholder: "Buscar países", noResults: "No encontramos países que coincidan con tu búsqueda.", clearSearch: "Borrar búsqueda" }
    : { eyebrow: "MORROVIA · STAMPED", title: "Your world, marked.", intro: "Keep a living record of where you’ve been, and the places still calling.", visited: "countries visited", guest: "Exploring as a guest · your changes stay on this device.", signIn: "Sign in", keep: "Keep your stamps", keepText: "Create a free account to save this map and use it on every device.", create: "Create account", dismiss: "Dismiss", mapHint: "Tap a country to update its stamp", allLabel: "All", visitedLabel: "Visited", wantLabel: "Want to visit", statusFilterLabel: "Filter stamps by status", startTitle: "Start with a place you remember.", startText: "Mark a country you have visited or one you want to see. You can add a note or photo afterwards.", startAction: "Start marking", searchPlaceholder: "Search countries", noResults: "No countries match that search.", clearSearch: "Clear search" };
  useEffect(() => {
    setLanguage(window.localStorage.getItem("easyt-language") === "es" ? "es" : "en");
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<"en" | "es">).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    let cancelled = false;
    let localGuestStatuses: Record<string, Status> = {};
    try { const saved = window.localStorage.getItem(storageKey); if (saved) setStatuses(JSON.parse(saved)); } catch { /* use defaults */ }
    if (!isAuthenticated) {
      setDbLoaded(true);
      return () => { cancelled = true; window.removeEventListener("easyt-language-change", updateLanguage); };
    }
    try {
      const guestSaved = window.localStorage.getItem("easyt-stamped-guest");
      if (guestSaved) localGuestStatuses = JSON.parse(guestSaved) as Record<string, Status>;
    } catch { /* guest migration remains best effort */ }
    fetch("/api/easyt/stamped", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then(async (data) => {
        if (cancelled || !data?.statuses) return;
        const merged = { ...localGuestStatuses, ...data.statuses };
        setStatuses(merged);
        if (data.memories && typeof data.memories === "object") {
          const remote = data.memories as Record<string, { note?: string; photoData?: string }>;
          setMemories(Object.fromEntries(Object.entries(remote).filter(([, memory]) => memory.note).map(([countryId, memory]) => [countryId, String(memory.note)])));
          setPhotos(Object.fromEntries(Object.entries(remote).filter(([, memory]) => memory.photoData).map(([countryId, memory]) => [countryId, String(memory.photoData)])));
        }
        const migratedKey = `easyt-stamped-migrated-${userKey ?? "account"}`;
        if (Object.keys(localGuestStatuses).length && !window.localStorage.getItem(migratedKey)) {
          await Promise.all(Object.entries(localGuestStatuses).map(([countryId, status]) =>
            data.statuses[countryId] ? Promise.resolve() : fetch("/api/easyt/stamped", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ countryId, status }) }),
          ));
          window.localStorage.setItem(migratedKey, "1");
        }
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setDbLoaded(true); });
    return () => { cancelled = true; window.removeEventListener("easyt-language-change", updateLanguage); };
  }, [storageKey, isAuthenticated]);
  useEffect(() => { if (dbLoaded) window.localStorage.setItem(storageKey, JSON.stringify(statuses)); }, [statuses, storageKey, dbLoaded]);
  useEffect(() => { setStarted(window.localStorage.getItem(`easyt-stamped-started-${userKey ?? "guest"}`) === "1"); }, [userKey]);
  useEffect(() => {
    try { setMemories(JSON.parse(window.localStorage.getItem(`easyt-stamp-memories-${userKey ?? "guest"}`) ?? "{}")); } catch { setMemories({}); }
  }, [userKey]);
  useEffect(() => { window.localStorage.setItem(`easyt-stamp-memories-${userKey ?? "guest"}`, JSON.stringify(memories)); }, [memories, userKey]);
  useEffect(() => {
    try { setPhotos(JSON.parse(window.localStorage.getItem(`easyt-stamp-photos-${userKey ?? "guest"}`) ?? "{}")); } catch { setPhotos({}); }
  }, [userKey]);
  useEffect(() => { window.localStorage.setItem(`easyt-stamp-photos-${userKey ?? "guest"}`, JSON.stringify(photos)); }, [photos, userKey]);
  const topo = useMemo(() => feature(worldTopology as never, worldTopology.objects.countries as never) as unknown as { features: any[] }, []);
  const projection = useMemo(() => geoNaturalEarth1().fitSize([1200, 610], topo as never), [topo]);
  const path = useMemo(() => geoPath(projection), [projection]);
  const countries = useMemo(() => {
    const known = new Map(curatedCountries.map((country) => [country.name, country]));
    return topo.features
      .map((feature) => aliases[feature.properties?.name] || feature.properties?.name)
      .filter((name): name is string => Boolean(name) && name !== "Antarctica")
      .filter((name, index, names) => names.indexOf(name) === index)
      .map((name) => known.get(name) || ({ id: slug(name), name, continent: "Other" } as Country))
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  }, [topo]);
  const groupNames = useMemo(() => [...Object.keys(groups), "Other"], []);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (continent === "All" ? countries : countries.filter((country) => country.continent === continent))
      .filter((country) => statusFilter === "all" || statuses[country.id] === statusFilter)
      .filter((country) => !query || country.name.toLowerCase().includes(query));
  }, [continent, countries, search, statusFilter, statuses]);
  const selectedCountry = countries.find((country) => country.id === selected);
  const selectedFeature = selectedCountry ? topo.features.find((feature) => (aliases[feature.properties?.name] || feature.properties?.name) === selectedCountry.name) : null;
  const selectedPoint = selectedFeature ? path.centroid(selectedFeature) : null;
  const [hovered, setHovered] = useState<string | null>(null);
  const setStatus = (id: string, value: Status) => {
    setStarted(true);
    window.localStorage.setItem(`easyt-stamped-started-${userKey ?? "guest"}`, "1");
    const nextStatus = statuses[id] === value ? null : value;
    setStatuses((current) => {
      if (nextStatus === null) {
        const next = { ...current };
        delete next[id];
        return next;
      }
      return { ...current, [id]: nextStatus };
    });
    if (isAuthenticated) {
      void fetch("/api/easyt/stamped", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ countryId: id, status: nextStatus }) }).catch(() => undefined);
    } else if (nextStatus) {
      setSavePrompt(true);
    }
  };
  const syncMemory = (countryId: string, note: string, photoData: string | null) => {
    if (!isAuthenticated) return;
    void fetch("/api/easyt/stamped", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ countryId, note, photoData }) }).catch(() => undefined);
  };
  const visitedCount = Object.values(statuses).filter((value) => value === "visited").length;
  const changeStatusFilter = (nextFilter: StatusFilter) => {
    setStatusFilter(nextFilter);
    if (selected && nextFilter !== "all" && statuses[selected] !== nextFilter) setSelected(null);
  };
  const calloutWidth = selectedCountry ? Math.min(440, Math.max(300, 176 + selectedCountry.name.length * 7.5)) : 300;
  const calloutHeight = selectedCountry && selectedCountry.name.length > 22 ? 136 : 112;
  const calloutX = selectedPoint ? Math.max(8, Math.min(selectedPoint[0] - calloutWidth / 2, 1200 - calloutWidth - 8)) : 8;

 return <div className={styles.shell}>
    <section className={styles.intro}><div><p className={styles.eyebrow}>{labels.eyebrow}</p><h1>{labels.title}</h1><p>{labels.intro}</p></div><div className={styles.stat}><strong>{visitedCount}</strong><span>{labels.visited}</span></div></section>
    {!isAuthenticated && <p className={styles.guestNote}>{labels.guest} <a href="/journey/login?next=%2Fjourney%2Fstamped">{labels.signIn}</a></p>}
    {!started && <div className={styles.starterPrompt}><div><strong>{labels.startTitle}</strong><span>{labels.startText}</span></div><button type="button" onClick={() => document.querySelector(`.${styles.mapPanel}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>{labels.startAction}</button></div>}
    {!isAuthenticated && savePrompt && <div className={styles.savePrompt} role="status"><div><strong>{labels.keep}</strong><span>{labels.keepText}</span></div><a href="/journey/login?mode=sign-up&next=%2Fjourney%2Fstamped">{labels.create}</a><button type="button" onClick={() => setSavePrompt(false)} aria-label={labels.dismiss}>{labels.dismiss}</button></div>}
    {selectedCountry && <section className={memoryStyles.memoryCard}><p>MEMORY OF {selectedCountry.name.toUpperCase()}</p><strong>{statuses[selectedCountry.id] === "visited" ? "What stayed with you?" : "Why is this calling you?"}</strong><textarea value={memories[selectedCountry.id] ?? ""} onChange={(event) => setMemories((current) => ({ ...current, [selectedCountry.id]: event.target.value }))} onBlur={(event) => syncMemory(selectedCountry.id, event.target.value, photos[selectedCountry.id] ?? null)} placeholder={statuses[selectedCountry.id] === "visited" ? "A meal, a person, a moment…" : "A reason to go, a place to begin…"} /></section>}
    {selectedCountry && <section className={mediaStyles.mediaCard}><div><p>PHOTO STAMP</p><strong>Give {selectedCountry.name} a picture.</strong><span>Choose one photo that holds the feeling of this place.</span><label>Choose photo<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file || file.size > 1_500_000) return; const reader = new FileReader(); reader.onload = () => { const photoData = String(reader.result); setPhotos((current) => ({ ...current, [selectedCountry.id]: photoData })); syncMemory(selectedCountry.id, memories[selectedCountry.id] ?? "", photoData); }; reader.readAsDataURL(file); }} /></label></div>{photos[selectedCountry.id] && <figure><img src={photos[selectedCountry.id]} alt={`Memory from ${selectedCountry.name}`} /><button type="button" onClick={() => { setPhotos((current) => { const next = { ...current }; delete next[selectedCountry.id]; return next; }); syncMemory(selectedCountry.id, memories[selectedCountry.id] ?? "", null); }}>Remove</button></figure>}</section>}
    <div className={styles.workspace}>
      <section className={styles.mapPanel} aria-label="World map">
        <div className={styles.mapHeader}><span>{labels.mapHint}</span><div className={styles.legend}><span><i className={styles.dotVisited} />{labels.visitedLabel}</span><span><i className={styles.dotWant} />{labels.wantLabel}</span></div></div>
        <svg className={styles.map} viewBox="0 0 1200 610" role="img" aria-label="Interactive world map" onClick={() => setSelected(null)}>
          {topo.features.map((feature, index) => { const name = aliases[feature.properties?.name] || feature.properties?.name; const item = countries.find((entry) => entry.name === name); const status = item ? statuses[item.id] : undefined; const isFilteredOut = statusFilter !== "all" && status !== statusFilter; return <path key={feature.id || index} d={path(feature) || ""} onMouseEnter={() => item && !isFilteredOut && setHovered(item.id)} onMouseLeave={() => setHovered(null)} onClick={(event) => { event.stopPropagation(); if (item && !isFilteredOut) setSelected(item.id); }} className={`${styles.country} ${status === "visited" ? styles.visited : ""} ${status === "want" ? styles.want : ""} ${selected === item?.id ? styles.countrySelected : ""} ${isFilteredOut ? styles.countryFilteredOut : ""}`} style={status === "visited" && !isFilteredOut ? { fill: colors[item?.continent || "Other"] } : undefined} />; })}
          {hovered && !selectedCountry ? (() => { const country = countries.find((entry) => entry.id === hovered); const feature = topo.features.find((entry) => (aliases[entry.properties?.name] || entry.properties?.name) === country?.name); const point = feature ? path.centroid(feature) : null; return country && point ? <foreignObject x={Math.max(8, Math.min(point[0] - 92, 980))} y={Math.max(8, Math.min(point[1] - 42, 550))} width="220" height="54" className={styles.svgLabel}><div><span>{flagFor(country.name)}</span> {country.name}<small>{statuses[country.id] === "visited" ? "Visited" : statuses[country.id] === "want" ? "Want to visit" : "Not yet"}</small></div></foreignObject> : null; })() : null}
          {selectedCountry && selectedPoint ? <foreignObject x={calloutX} y={Math.max(8, Math.min(selectedPoint[1] - calloutHeight / 2, 610 - calloutHeight - 8))} width={calloutWidth} height={calloutHeight} className={styles.svgCallout}><div className={styles.mapCallout}><div><b><span>{flagFor(selectedCountry.name)}</span> {selectedCountry.name}</b><span>{statuses[selectedCountry.id] === "visited" ? "Visited" : statuses[selectedCountry.id] === "want" ? "Want to visit" : "Unmarked"}</span></div><div className={styles.calloutActions}><button type="button" className={statuses[selectedCountry.id] === "visited" ? styles.calloutActive : ""} onClick={(event) => { event.stopPropagation(); setStatus(selectedCountry.id, "visited"); }}>Visited</button><button type="button" className={statuses[selectedCountry.id] === "want" ? styles.calloutActive : ""} onClick={(event) => { event.stopPropagation(); setStatus(selectedCountry.id, "want"); }}>Want to visit</button></div></div></foreignObject> : null}
        </svg>
      </section>
      <aside className={styles.listPanel}><div className={styles.listTop}><div><p className={styles.eyebrow}>YOUR STAMPS</p><h2>Countries</h2></div></div><div className={styles.statusFilter} role="group" aria-label={labels.statusFilterLabel}>{(["all", "visited", "want"] as StatusFilter[]).map((filter) => <button key={filter} type="button" aria-pressed={statusFilter === filter} onClick={() => changeStatusFilter(filter)}>{filter === "all" ? labels.allLabel : filter === "visited" ? labels.visitedLabel : labels.wantLabel}</button>)}</div><label className={styles.searchBox}><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={labels.searchPlaceholder} aria-label={labels.searchPlaceholder} /></label><div className={styles.filters}><button className={continent === "All" ? styles.activeFilter : ""} onClick={() => setContinent("All")}>{labels.allLabel}</button>{groupNames.map((name) => <button key={name} className={continent === name ? styles.activeFilter : ""} onClick={() => setContinent(name)}>{name}</button>)}</div>{filtered.length === 0 ? <div className={styles.searchEmpty}><strong>{labels.noResults}</strong><button type="button" onClick={() => { setSearch(""); setContinent("All"); setStatusFilter("all"); }}>{labels.clearSearch}</button></div> : groupNames.filter((name) => continent === "All" || name === continent).map((name) => { const isCollapsed = collapsed[name] === true; const visible = filtered.filter((country) => country.continent === name); if (visible.length === 0) return null; const matchingLabel = statusFilter === "visited" ? labels.visitedLabel : statusFilter === "want" ? labels.wantLabel : labels.visitedLabel; const matchingCount = statusFilter === "all" ? countries.filter((country) => country.continent === name && statuses[country.id] === "visited").length : visible.length; return <section key={name} className={styles.continent}><button type="button" className={styles.continentHeader} style={{ color: colors[name] || "#555563" }} aria-expanded={!isCollapsed} onClick={() => setCollapsed((current) => ({ ...current, [name]: !current[name] }))}><b>{name}</b><span>{matchingCount} {matchingLabel.toLowerCase()} <i aria-hidden="true">{isCollapsed ? "＋" : "−"}</i></span></button>{!isCollapsed && visible.map((country) => <button type="button" key={country.id} className={`${styles.row} ${selected === country.id ? styles.rowSelected : ""}`} onClick={() => setSelected(country.id)}><span className={styles.countryName}><span className={styles.flag}>{flagFor(country.name)}</span>{country.name}</span><span className={statuses[country.id] === "visited" ? styles.visitedLabel : statuses[country.id] === "want" ? styles.wantLabel : styles.unmarkedLabel}>{statuses[country.id] === "visited" ? labels.visitedLabel : statuses[country.id] === "want" ? labels.wantLabel : language === "es" ? "Aún no" : "Not yet"}</span><span className={styles.rowActions}><span onClick={(event) => { event.stopPropagation(); setStatus(country.id, "visited"); }}>✓</span><span onClick={(event) => { event.stopPropagation(); setStatus(country.id, "want"); }}>+</span></span></button>)}</section>; })}</aside>
    </div>
  </div>;
}
