"use client";

import {
  ArrowRight,
  BedDouble,
  BookOpenText,
  CalendarDays,
  CarFront,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CirclePlus,
  Clock3,
  ExternalLink,
  GripVertical,
  Lightbulb,
  Map as MapIcon,
  MapPin,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Plane,
  Route,
  Ship,
  Sparkles,
  TrainFront,
  Trash2,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { tripIntentForTrip, type EasyTTrip, type ItineraryDayPart, type PlanItem, type TripBooking, type TripLeg, type TripStop } from "@/lib/easyt/trip";
import type { JourneyImage } from "@/lib/journey";
import { itineraryImageFor } from "@/lib/easyt/itinerary-media";
import { itineraryNotesWithSourceIndexesForDisplay, semanticSamePlaceArrival } from "@/lib/easyt/itinerary-presentation";
import {
  addItineraryDayNote,
  assignItineraryActivityDayPart,
  insertItineraryActivity,
  itineraryActivityProtection,
  moveItineraryActivity,
  moveItineraryIdeaActivity,
  removeItineraryActivity,
  renameItineraryActivity,
  type ItineraryActivityLocation,
} from "@/lib/easyt/itinerary-mutations";
import { formatTripDuration, incomingLegForPlanItem } from "@/lib/easyt/trip-facts";
import { formatIsoDate } from "@/lib/easyt/trip-lifecycle";
import { trackEvent } from "@/lib/analytics";
import { affiliateProviderLabel, getCurrentPartnerAction, omioBookingActionForLeg, type ResolvedAffiliateAction } from "@/lib/easyt/booking-readiness";
import { removeStayBooking, stayBookingForStop, upsertStayBooking } from "@/lib/easyt/accommodation";
import { routeEndpointForLeg, tripLegClassificationLabel } from "@/lib/easyt/trip-legs";
import { mapWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import {
  itineraryDayLegs,
  itineraryDayMapContext,
  itineraryDayMapSelection,
  itineraryInterestReason,
  itinerarySelectionForMapPin,
  itinerarySuggestionCandidates,
  destinationHighlightCandidates,
  personalisedItineraryCandidates,
  type ItineraryDiscoveryPlace,
} from "@/lib/easyt/itinerary-day-context";
import { createAbortableEffectScope } from "@/lib/easyt/abortable-effect";
import { assignItineraryIdeaDayPart, ideaStateForPlace, itineraryIdeaDayOptions, itineraryIdeaForPlace, preferredItineraryIdeaDay, removeItineraryIdea, saveItineraryIdea, scheduleItineraryIdea, type IdeaDiscoveryReason, type ItineraryIdeaDayOption } from "@/lib/easyt/itinerary-ideas";
import { composeItineraryDay, type ComposedItineraryActivity } from "@/lib/easyt/itinerary-day-composition";
import { JourneyPlannerMap } from "@/components/journey-planner-map";
import EasyTTripCopilot from "@/components/easyt/easyt-trip-copilot";
import { EasyTButton, EasyTField, EasyTLinkButton, EasyTSegmentedControl } from "@/components/easyt/easyt-controls";
import { MorroviaBriefNotice, MorroviaConfirmationDialog, MorroviaRecoveryFeedback, MorroviaSaveStatus } from "@/components/easyt/morrovia-feedback";
import { MorroviaSectionStatus } from "@/components/easyt/morrovia-loading-states";
import ResilientImage from "@/components/easyt/resilient-image";
import DestinationAccommodationModule from "@/components/easyt/destination-accommodation-module";
import { useTripMutationPersistence } from "@/components/easyt/use-trip-mutation-persistence";
import RichItineraryDayPlanner from "@/components/easyt/rich-itinerary-day-planner";
import { affiliateDisclosure, MorroviaAffiliateLink } from "@/components/easyt/affiliate-link";
import legacyStyles from "@/app/journey/new/trip-builder.module.css";
import legacyMobile from "@/app/journey/new/trip-builder-mobile.module.css";
import styles from "./trip-itinerary-workspace.module.css";

type ItineraryWorkspaceProps = {
  trip: EasyTTrip;
  presentation?: "shell" | "legacy";
  language?: "en" | "es";
  selectedPlaceCount?: number;
  onEditBrief?: () => void;
  onOpenMap?: () => void;
  selectedDayNumber?: number | null;
  /** Deterministic Storybook/test discovery payloads; production uses the shared discovery endpoint. */
  initialSuggestions?: Record<number, ItineraryDiscoveryPlace[]>;
  /** Storybook/test override; production resolves the current approved activity partner centrally. */
  activityAction?: ResolvedAffiliateAction | null;
};

type AddFlow = {
  dayNumber: number;
  noteIndex: number;
  kind: "activity" | "note";
  dayPart?: ItineraryDayPart;
};

type ActivityTarget = ItineraryActivityLocation & { title: string };

const pad = (value: number) => String(value).padStart(2, "0");

function displayDate(value: string, language: "en" | "es", compact = false) {
  return formatIsoDate(value, language === "es" ? "es" : "en", compact
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" }) ?? (language === "es" ? "Fecha por confirmar" : "Date to confirm");
}

function displayDayDate(value: string, language: "en" | "es") {
  return formatIsoDate(value, language === "es" ? "es" : "en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }) ?? (language === "es" ? "Fecha por confirmar" : "Date to confirm");
}

function stopForDay(trip: EasyTTrip, day: PlanItem) {
  return trip.stops.find((stop) => stop.id === day.stopId) ?? null;
}

function imageFromPlanItem(day: PlanItem, stop: TripStop | null, index: number): JourneyImage | null {
  if (day.image) {
    return {
      src: day.image,
      alt: day.title,
      caption: stop?.name ?? day.title,
      sourceUrl: day.sourceUrl ?? "",
    };
  }
  return itineraryImageFor({
    title: day.title,
    destination: stop?.name ?? "",
    items: day.notes,
  }, index);
}

function itineraryCopy(language: "en" | "es") {
  return language === "es" ? {
    draft: "Borrador · editable",
    editBrief: "Editar resumen",
    dayByDay: "Día a día",
    days: "DÍAS",
    destinations: "destinos · reparto personalizado",
    placesSelected: "lugares seleccionados",
    previousDay: "Día anterior",
    nextDay: "Día siguiente",
    openMap: "Abrir mapa →",
    source: "Fuente ↗",
    itineraryEmpty: "Este itinerario aún no tiene días planificados.",
    transfer: "Traslado",
    estimate: "Estimación puerta a puerta",
    items: "elementos",
    shapeDay: "Organizar el día",
    findIdeas: "Buscar ideas",
    addNote: "Añadir nota",
    addActivity: "Añadir actividad",
    addActivityHere: "Añadir una actividad aquí",
    flexible: "Flexible",
    openFullMap: "Abrir mapa completo",
    dayMap: "Mapa del día",
    logistics: "Logística y reservas",
    suggestions: "Sugerencias para este día",
    notes: "Notas",
    savedIdeas: "Ideas guardadas",
    confirmed: "Confirmado",
    saved: "Guardado",
    yours: "Tuyo",
    bookingLink: "Abrir reserva",
    editOnMap: "Editar en el mapa",
    edit: "Editar",
    remove: "Eliminar",
    removeActivity: "Eliminar actividad",
    removeDetail: "Esta actividad se eliminará de este día cuando se guarde el cambio.",
    keepActivity: "Mantener actividad",
    activity: "Actividad",
    note: "Nota del día",
    activityName: "Nombre de la actividad",
    noteText: "Nota",
    noteHint: "Aparecerá en Notas para este día; las notas no tienen una posición horaria.",
    addHere: "Añadir aquí",
    save: "Guardar",
    cancel: "Cancelar",
    moveEarlier: "Mover antes",
    moveLater: "Mover después",
    dragActivity: "Arrastrar para reordenar",
    reservation: "Reserva",
    unresolved: "Sin resolver",
    protectedItem: "Este elemento tiene datos conectados y se edita desde su flujo original.",
    activityAdded: "Actividad añadida",
    activityUpdated: "Actividad actualizada",
    activityRemoved: "Actividad eliminada",
    activityMoved: "Orden actualizado",
    editActivityOrder: "Editar actividades y orden",
    noteAdded: "Nota añadida",
    dayPlan: "Plan del día",
    noDetails: "Este día aún no tiene actividades detalladas.",
    mapPreview: "Vista previa del mapa del día",
    askMorrovia: "Preguntar a Luna · IA",
    addSuggestion: "Añadir",
    suggestionAdded: "Sugerencia añadida",
    suggestionsLoading: "Buscando lugares cercanos",
    suggestionsLoadingDetail: "Usando la ubicación guardada de este día sin cambiar tu plan.",
    suggestionsUnavailable: "Las sugerencias no están disponibles ahora.",
    noNewSuggestions: "No hay nuevas sugerencias locales; los lugares ya planificados se han excluido.",
    addDayNote: "Añadir nota del día",
    notePlaceholder: "Añade un recordatorio para este día",
    aiPlanning: "Luna · asistente de viaje con IA",
  } : {
    draft: "Draft · editable",
    editBrief: "Edit brief",
    dayByDay: "Day by day",
    days: "DAYS",
    destinations: "destinations · custom split",
    placesSelected: "places selected",
    previousDay: "Previous day",
    nextDay: "Next day",
    openMap: "Open map view →",
    source: "Source ↗",
    itineraryEmpty: "This itinerary does not have any planned days yet.",
    transfer: "Transfer",
    estimate: "Door-to-door estimate",
    items: "items",
    shapeDay: "Shape day",
    findIdeas: "Find ideas",
    addNote: "Add note",
    addActivity: "Add activity",
    addActivityHere: "Add an activity here",
    flexible: "Flexible",
    openFullMap: "Open full map",
    dayMap: "Day map",
    logistics: "Logistics & bookings",
    suggestions: "Suggestions for this day",
    notes: "Notes",
    savedIdeas: "Saved ideas",
    confirmed: "Confirmed",
    saved: "Saved",
    yours: "Yours",
    bookingLink: "Open booking",
    editOnMap: "Edit on map",
    edit: "Edit",
    remove: "Remove",
    removeActivity: "Remove activity",
    removeDetail: "This activity will be removed from this day when the change is saved.",
    keepActivity: "Keep activity",
    activity: "Activity",
    note: "Day note",
    activityName: "Activity name",
    noteText: "Note",
    noteHint: "This appears in Notes for the day; notes do not have a scheduled position.",
    addHere: "Add here",
    save: "Save",
    cancel: "Cancel",
    moveEarlier: "Move earlier",
    moveLater: "Move later",
    dragActivity: "Drag to reorder",
    reservation: "Reservation",
    unresolved: "Unresolved",
    protectedItem: "This item has connected data and stays with its existing editing flow.",
    activityAdded: "Activity added",
    activityUpdated: "Activity updated",
    activityRemoved: "Activity removed",
    activityMoved: "Order updated",
    editActivityOrder: "Edit activities and order",
    noteAdded: "Note added",
    dayPlan: "Day plan",
    noDetails: "This day does not have detailed activities yet.",
    mapPreview: "Selected-day map preview",
    askMorrovia: "Ask Luna · AI",
    addSuggestion: "Add",
    suggestionAdded: "Suggestion added",
    suggestionsLoading: "Finding places nearby",
    suggestionsLoadingDetail: "Using this day’s saved location without changing your plan.",
    suggestionsUnavailable: "Suggestions are unavailable just now.",
    noNewSuggestions: "No new local suggestions; places already planned are excluded.",
    addDayNote: "Add day note",
    notePlaceholder: "Add a reminder for this day",
    aiPlanning: "Luna · AI travel assistant",
  };
}

function planItemLabel(type: PlanItem["type"], language: "en" | "es") {
  const labels = language === "es" ? {
    arrival: "Llegada",
    activity: "Actividad",
    food: "Comida",
    stay: "Estancia",
    transport: "Traslado",
    open: "Plan abierto",
  } : {
    arrival: "Arrival",
    activity: "Activity",
    food: "Food",
    stay: "Stay",
    transport: "Travel",
    open: "Open plan",
  };
  return labels[type];
}

function iconForPlanItem(type: PlanItem["type"]): LucideIcon {
  if (type === "arrival") return Plane;
  if (type === "food") return Utensils;
  if (type === "stay") return BedDouble;
  if (type === "transport") return Route;
  if (type === "open") return CircleHelp;
  return Sparkles;
}

function iconForLeg(mode: TripLeg["mode"]): LucideIcon {
  if (mode === "flight") return Plane;
  if (mode === "train") return TrainFront;
  if (mode === "road") return CarFront;
  if (mode === "ferry") return Ship;
  return Route;
}

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function timelineActivityId(day: PlanItem, note: string, sourceIndex: number, editable: boolean) {
  return editable
    ? `${day.id}-activity-${normalized(note)}`
    : `${day.id}-note-${sourceIndex}`;
}

function bookingForText(bookings: TripBooking[], text: string) {
  const candidate = normalized(text);
  return bookings.find((booking) => {
    const title = normalized(booking.title);
    return title === candidate || (Math.min(title.length, candidate.length) > 6 && (title.includes(candidate) || candidate.includes(title)));
  });
}

function bookingsForDay(trip: EasyTTrip, day: PlanItem, stop: TripStop | null) {
  const bookings = (trip.brief.bookings ?? []).filter((booking) => booking.date === day.date);
  const stay = stop ? stayBookingForStop(trip, stop) : undefined;
  return [...new Map([...(stay ? [stay] : []), ...bookings].map((booking) => [booking.id, booking])).values()];
}

export default function TripItineraryWorkspace({
  trip,
  presentation = "shell",
  language = "en",
  selectedPlaceCount,
  onEditBrief,
  onOpenMap,
  selectedDayNumber,
  initialSuggestions,
  activityAction,
}: ItineraryWorkspaceProps) {
  const mutation = useTripMutationPersistence(trip, presentation === "shell");
  const workingTrip = mutation.trip;
  const days = useMemo(
    () => [...workingTrip.planItems].sort((left, right) => left.dayNumber - right.dayNumber),
    [workingTrip.planItems],
  );
  const [selectedIndex, setSelectedIndex] = useState(() => Math.max(0, days.findIndex((day) => day.dayNumber === selectedDayNumber)));
  const [remoteImages, setRemoteImages] = useState<Record<string, JourneyImage>>({});
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [addFlow, setAddFlow] = useState<AddFlow | null>(null);
  const [addDraft, setAddDraft] = useState("");
  const [addError, setAddError] = useState("");
  const [editingActivity, setEditingActivity] = useState<ActivityTarget | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editError, setEditError] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ActivityTarget | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [draggedActivity, setDraggedActivity] = useState<ActivityTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [railNoteDraft, setRailNoteDraft] = useState("");
  const [railNoteError, setRailNoteError] = useState("");
  const [copilotOpen, setCopilotOpen] = useState(false);
  const selectedDayRequestRef = useRef({ tripId: workingTrip.id, dayNumber: selectedDayNumber });
  const tabIdPrefix = useId().replaceAll(":", "");
  const copy = useMemo(() => itineraryCopy(language), [language]);
  const activeDayId = days[Math.min(selectedIndex, Math.max(0, days.length - 1))]?.id ?? null;

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(0, days.length - 1)));
  }, [days.length]);

  useEffect(() => {
    const request = selectedDayRequestRef.current;
    if (request.tripId === workingTrip.id && request.dayNumber === selectedDayNumber) return;
    selectedDayRequestRef.current = { tripId: workingTrip.id, dayNumber: selectedDayNumber };
    if (!selectedDayNumber) return;
    const requestedIndex = days.findIndex((day) => day.dayNumber === selectedDayNumber);
    if (requestedIndex >= 0) setSelectedIndex(requestedIndex);
  }, [days, selectedDayNumber, workingTrip.id]);

  useEffect(() => {
    setSelectedItemId(null);
    setAddFlow(null);
    setAddDraft("");
    setAddError("");
    setEditingActivity(null);
    setEditError("");
    setOpenMenuId(null);
    setRemoveTarget(null);
    setRemoveError("");
    setDraggedActivity(null);
    setRailNoteDraft("");
    setRailNoteError("");
    setCopilotOpen(false);
  }, [activeDayId]);

  useEffect(() => {
    if (!activeDayId) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`${tabIdPrefix}-tab-${selectedIndex}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeDayId, selectedIndex, tabIdPrefix]);

  useEffect(() => {
    if (presentation !== "legacy" || !days.length) return;
    const missing = days.filter((day, index) => !imageFromPlanItem(day, stopForDay(workingTrip, day), index));
    if (!missing.length) return;
    let active = true;
    const controller = new AbortController();
    void Promise.all(missing.map(async (day) => {
      const stop = stopForDay(workingTrip, day);
      const response = await fetch(`/api/journey-place?title=${encodeURIComponent(day.title)}&area=${encodeURIComponent(stop?.name ?? "")}&country=${encodeURIComponent(stop?.country ?? "")}`, { signal: controller.signal });
      if (!response.ok) return null;
      const payload = await response.json() as { place?: { image?: string; alt?: string; sourceUrl?: string; sourceLabel?: string } | null };
      if (!payload.place?.image) return null;
      return [day.id, {
        src: payload.place.image,
        alt: payload.place.alt ?? day.title,
        caption: stop?.name ?? day.title,
        sourceUrl: payload.place.sourceUrl ?? payload.place.image,
        sourceLabel: payload.place.sourceLabel,
      } satisfies JourneyImage] as const;
    })).then((results) => {
      if (!active) return;
      const resolved = results.reduce<Record<string, JourneyImage>>((images, result) => {
        if (result) images[result[0]] = result[1];
        return images;
      }, {});
      setRemoteImages((current) => ({
        ...current,
        ...resolved,
      }));
    }).catch(() => undefined);
    return () => { active = false; controller.abort(); };
  }, [days, presentation, workingTrip]);

  const index = Math.min(selectedIndex, Math.max(0, days.length - 1));
  const active = days[index] ?? null;
  const dayMapContext = useMemo(
    () => active ? itineraryDayMapContext(workingTrip, active, null) : null,
    [active, workingTrip],
  );
  const mapContext = useMemo(
    () => active && dayMapContext ? itineraryDayMapSelection(dayMapContext, active, selectedItemId) : null,
    [active, dayMapContext, selectedItemId],
  );
  const dayComposition = useMemo(
    () => active ? composeItineraryDay(workingTrip, active.id) : null,
    [active, workingTrip],
  );

  if (!active || !mapContext) {
    return (
      <section className={styles.empty} aria-live="polite">
        <CalendarDays aria-hidden="true" />
        <h2>Itinerary to confirm</h2>
        <p>{copy.itineraryEmpty}</p>
      </section>
    );
  }

  const stop = stopForDay(workingTrip, active);
  const image = imageFromPlanItem(active, stop, index) ?? remoteImages[active.id] ?? null;
  const incomingLeg = incomingLegForPlanItem(workingTrip, active);
  const scheduledIdeaTitles = new Set((workingTrip.brief.itineraryIdeas ?? [])
    .filter((idea) => idea.dayId === active.id)
    .map((idea) => normalized(idea.title)));
  const displayNotes = itineraryNotesWithSourceIndexesForDisplay(active, incomingLeg, workingTrip)
    .filter(({ note }) => !scheduledIdeaTitles.has(normalized(note)));

  if (presentation === "legacy") {
    return (
      <div className={`${legacyStyles.shellWide} ${legacyMobile.builder}`}>
        <div className={legacyStyles.draftHead}>
          <div>
            <p className={legacyStyles.eyebrow}>{copy.draft}</p>
            <h2>{trip.title}</h2>
          </div>
          {onEditBrief ? <button type="button" className={legacyStyles.primary} onClick={onEditBrief}>{copy.editBrief}</button> : null}
        </div>
        <div className={legacyStyles.draftSummary}>
          <span><CalendarDays /> {days.length} days</span>
          <span><Clock3 /> {workingTrip.stops.length} {copy.destinations}</span>
          <span><MapPin /> {selectedPlaceCount ?? days.reduce((sum, day) => sum + day.notes.length, 0)} {copy.placesSelected}</span>
        </div>
        <div className={legacyStyles.draftBody}>
          <LegacyDayRail days={days} trip={workingTrip} selectedIndex={index} setSelectedIndex={setSelectedIndex} copy={copy} language={language} />
          <section className={legacyStyles.dayDetail}>
            <LegacyDayContent day={active} stop={stop} image={image} index={index} days={days} setSelectedIndex={setSelectedIndex} copy={copy} language={language} />
          </section>
        </div>
        {onOpenMap ? <div className={legacyStyles.draftFoot}><button type="button" className={legacyStyles.primary} onClick={onOpenMap}>{copy.openMap}</button></div> : null}
      </div>
    );
  }

  const dayBookings = bookingsForDay(workingTrip, active, stop);
  const otherDayBookings = dayBookings.filter((booking) => booking.type !== "stay");
  const dayNotes = workingTrip.brief.dayNotes?.[active.dayNumber] ?? [];
  const customActivities = workingTrip.brief.customActivities?.[active.dayNumber] ?? [];
  const recommendations = workingTrip.recommendations.filter((recommendation) => recommendation.status === "open" && recommendation.affectedDays.includes(active.dayNumber));
  const logisticsLegs = itineraryDayLegs(workingTrip, active);
  const selectedPlaces = stop ? workingTrip.brief.selectedPlaces[stop.id] ?? [] : [];
  const experienceAction = activityAction === undefined ? getCurrentPartnerAction("activities") : activityAction;
  const savedPins = (workingTrip.brief.mapPins ?? []).filter((pin) => pin.dayNumber === active.dayNumber);
  const savedIdeas = [...new Map<string, { id: string; title: string; meta: string; pinId?: string }>([
    ...selectedPlaces.map((title) => ({ id: `place-${title}`, title, meta: stop?.name ?? copy.dayPlan })),
    ...savedPins.map((pin) => ({ id: pin.id, pinId: pin.id, title: pin.title, meta: planItemLabel(pin.category === "restaurant" ? "food" : pin.category === "stay" ? "stay" : "activity", language) })),
  ].map((idea) => [normalized(idea.title), idea])).values()];
  const hasContextRail = true;
  const mapPlanHref = mapWorkspaceHref(workingTrip.id, active.stopId, "plan", active.dayNumber);
  const mapIdeasHref = mapWorkspaceHref(workingTrip.id, active.stopId, "see", active.dayNumber);
  const itemCount = displayNotes.length + (dayComposition?.ideas.scheduledHereCount ?? 0) + (incomingLeg ? 1 : 0);
  const ActiveDayIcon = iconForPlanItem(active.type);
  const dayPendingKey = `itinerary-day-${active.dayNumber}`;
  const dayPending = mutation.isPending(dayPendingKey);
  const firstVisibleNoteIndex = displayNotes[0]?.sourceIndex ?? active.notes.length;

  const openAddFlow = (noteIndex: number, kind: AddFlow["kind"] = "activity", dayPart?: ItineraryDayPart) => {
    setAddFlow({ dayNumber: active.dayNumber, noteIndex, kind, dayPart });
    setAddDraft("");
    setAddError("");
    setOpenMenuId(null);
  };

  const submitAddFlow = () => {
    if (!addFlow) return;
    let mutationReason = "";
    const accepted = mutation.mutateTrip((current) => {
      const result = addFlow.kind === "activity"
        ? insertItineraryActivity(current, addFlow.dayNumber, addFlow.noteIndex, addDraft, addFlow.dayPart)
        : addItineraryDayNote(current, addFlow.dayNumber, addDraft);
      mutationReason = result.reason ?? "";
      return result.trip;
    }, `itinerary-day-${addFlow.dayNumber}`);
    if (!accepted) {
      setAddError(mutationReason || "This change could not be stored safely.");
      return;
    }
    setNotice(addFlow.kind === "activity" ? copy.activityAdded : copy.noteAdded);
    setAddFlow(null);
    setAddDraft("");
    setAddError("");
  };

  const submitRailNote = () => {
    let mutationReason = "";
    const accepted = mutation.mutateTrip((current) => {
      const result = addItineraryDayNote(current, active.dayNumber, railNoteDraft);
      mutationReason = result.reason ?? "";
      return result.trip;
    }, `itinerary-day-${active.dayNumber}`);
    if (!accepted) {
      setRailNoteError(mutationReason || "This note could not be stored safely.");
      return;
    }
    setRailNoteDraft("");
    setRailNoteError("");
    setNotice(copy.noteAdded);
  };

  const saveSuggestion = (place: ItineraryDiscoveryPlace, reasons: IdeaDiscoveryReason[]) => {
    const idea = itineraryIdeaForPlace({ stopId: active.stopId, place, reasons });
    const accepted = mutation.mutateTrip((current) => saveItineraryIdea(current, idea), `itinerary-suggestion-${active.stopId}-${place.id}`);
    if (!accepted) return false;
    setNotice("Idea saved");
    return true;
  };

  const scheduleSuggestion = (place: ItineraryDiscoveryPlace, reasons: IdeaDiscoveryReason[], dayId: string) => {
    const idea = itineraryIdeaForPlace({ stopId: active.stopId, place, reasons });
    const accepted = mutation.mutateTrip((current) => scheduleItineraryIdea(current, idea, dayId), `itinerary-suggestion-${active.stopId}-${place.id}`);
    if (!accepted) return false;
    const target = workingTrip.planItems.find((day) => day.id === dayId);
    setNotice(target ? `Added to Day ${target.dayNumber}` : copy.suggestionAdded);
    trackEvent("attraction_selected", { trip_id: workingTrip.id, stop_id: active.stopId, source: "itinerary_rail" });
    return true;
  };

  const changeActivityDayPart = (activity: ComposedItineraryActivity, dayPart: ItineraryDayPart | null) => {
    let mutationReason = "";
    const accepted = mutation.mutateTrip((current) => {
      if (activity.source === "itinerary-idea") return assignItineraryIdeaDayPart(current, activity.id, dayPart);
      if (activity.source !== "authored-activity" || activity.noteIndex === null) return current;
      const result = assignItineraryActivityDayPart(current, {
        dayNumber: active.dayNumber,
        noteIndex: activity.noteIndex,
        title: activity.title,
      }, dayPart);
      mutationReason = result.reason ?? "";
      return result.trip;
    }, `itinerary-activity-day-part-${activity.id}`);
    if (accepted) setNotice(dayPart ? `Moved to ${dayPart}` : "Time of day cleared");
    else if (mutationReason) setEditError(mutationReason);
  };

  const moveComposedActivity = (activity: ComposedItineraryActivity, direction: "earlier" | "later") => {
    if (!dayComposition || activity.noteIndex === null || activity.dayPart === null) return;
    const peers = dayComposition.planned[activity.dayPart];
    const indexInPart = peers.findIndex((candidate) => candidate.id === activity.id);
    const neighbour = peers[indexInPart + (direction === "earlier" ? -1 : 1)];
    if (!neighbour || neighbour.noteIndex === null) return;
    const targetNoteIndex = direction === "earlier" ? neighbour.noteIndex : neighbour.noteIndex + 1;
    let mutationReason = "";
    const accepted = mutation.mutateTrip((current) => {
      const result = activity.source === "itinerary-idea"
        ? moveItineraryIdeaActivity(current, activity.id, targetNoteIndex)
        : moveItineraryActivity(current, {
          dayNumber: active.dayNumber,
          noteIndex: activity.noteIndex!,
          title: activity.title,
        }, targetNoteIndex);
      mutationReason = result.reason ?? "";
      return result.trip;
    }, `itinerary-activity-order-${activity.id}`);
    if (accepted) setNotice(copy.activityMoved);
    else if (mutationReason && !mutationReason.includes("already in that position")) setEditError(mutationReason);
  };

  const removeSuggestion = (placeId: string, ideaId: string) => {
    const accepted = mutation.mutateTrip((current) => removeItineraryIdea(current, ideaId), `itinerary-suggestion-${active.stopId}-${placeId}`);
    if (!accepted) return false;
    setNotice("Removed from itinerary");
    return true;
  };

  const beginActivityEdit = (target: ActivityTarget) => {
    setSelectedItemId(timelineActivityId(active, target.title, target.noteIndex, true));
    setEditingActivity(target);
    setEditDraft(target.title);
    setEditError("");
    setOpenMenuId(null);
  };

  const saveActivityEdit = () => {
    if (!editingActivity) return;
    let mutationReason = "";
    const accepted = mutation.mutateTrip((current) => {
      const result = renameItineraryActivity(current, editingActivity, editDraft);
      mutationReason = result.reason ?? "";
      return result.trip;
    }, `itinerary-day-${editingActivity.dayNumber}`);
    if (!accepted) {
      setEditError(mutationReason || "This change could not be stored safely.");
      return;
    }
    setSelectedItemId(`${active.id}-activity-${normalized(editDraft)}`);
    setEditingActivity(null);
    setEditDraft("");
    setEditError("");
    setNotice(copy.activityUpdated);
  };

  const confirmRemoveActivity = () => {
    if (!removeTarget) return;
    let mutationReason = "";
    const accepted = mutation.mutateTrip((current) => {
      const result = removeItineraryActivity(current, removeTarget);
      mutationReason = result.reason ?? "";
      return result.trip;
    }, `itinerary-day-${removeTarget.dayNumber}`);
    if (!accepted) {
      setRemoveError(mutationReason || "This item could not be removed safely.");
      return;
    }
    setSelectedItemId(null);
    setRemoveTarget(null);
    setRemoveError("");
    setNotice(copy.activityRemoved);
  };

  const moveActivityTo = (target: ActivityTarget, targetNoteIndex: number) => {
    let mutationReason = "";
    const accepted = mutation.mutateTrip((current) => {
      const result = moveItineraryActivity(current, target, targetNoteIndex);
      mutationReason = result.reason ?? "";
      return result.trip;
    }, `itinerary-day-${target.dayNumber}`);
    setDraggedActivity(null);
    setOpenMenuId(null);
    if (!accepted) {
      if (mutationReason && !mutationReason.includes("already in that position")) setEditError(mutationReason);
      return;
    }
    setSelectedItemId(`${active.id}-activity-${normalized(target.title)}`);
    setNotice(copy.activityMoved);
  };

  const selectPreviewPin = (target: EventTarget | null) => {
    const pinId = (target as HTMLElement | null)?.closest<HTMLElement>("[data-planner-pin-id]")?.dataset.plannerPinId;
    const pin = pinId ? mapContext.pins.find((candidate) => candidate.id === pinId) : null;
    if (pin) setSelectedItemId(itinerarySelectionForMapPin(pin, active));
  };

  return (
    <section className={`${styles.workspace} ${hasContextRail ? "" : styles.workspaceWithoutContext}`} aria-label="Trip itinerary">
      <div className={styles.rail}>
        <div className={styles.railHeader}>
          <h2>{copy.dayByDay}</h2>
          <span>{days.length} {copy.days}</span>
        </div>
        <div className={styles.dayList} role="tablist" aria-label={copy.dayByDay}>
          {days.map((day, dayIndex) => {
            const dayStop = stopForDay(workingTrip, day);
            const DayIcon = iconForPlanItem(day.type);
            return (
              <button
                type="button"
                role="tab"
                aria-selected={dayIndex === index}
                aria-controls={`${tabIdPrefix}-panel`}
                id={`${tabIdPrefix}-tab-${dayIndex}`}
                tabIndex={dayIndex === index ? 0 : -1}
                className={dayIndex === index ? styles.dayButtonActive : styles.dayButton}
                key={day.id}
                onClick={() => setSelectedIndex(dayIndex)}
                onKeyDown={(event) => {
                  const nextIndex = event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? Math.min(days.length - 1, dayIndex + 1)
                    : event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? Math.max(0, dayIndex - 1)
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? days.length - 1
                          : null;
                  if (nextIndex === null) return;
                  event.preventDefault();
                  setSelectedIndex(nextIndex);
                  window.requestAnimationFrame(() => document.getElementById(`${tabIdPrefix}-tab-${nextIndex}`)?.focus());
                }}
              >
                <b>{pad(day.dayNumber)}</b>
                <span><strong>{dayStop?.name ?? day.title}</strong><small>{day.title}</small></span>
                <span className={styles.dayMeta}><time dateTime={day.date}>{displayDate(day.date, language, true)}</time><DayIcon aria-hidden="true" /></span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={styles.dayPanel}
        role="tabpanel"
        id={`${tabIdPrefix}-panel`}
        aria-labelledby={`${tabIdPrefix}-tab-${index}`}
      >
        <header className={styles.dayHeader}>
          <div>
            <p><span>DAY {pad(active.dayNumber)}</span><i aria-hidden="true">·</i><time dateTime={active.date}>{displayDayDate(active.date, language)}</time></p>
            <h2>{stop?.name ?? active.title}</h2>
            <span className={styles.daySummary}><ActiveDayIcon aria-hidden="true" />{active.title}{active.reason ? <i aria-hidden="true">·</i> : null}{active.reason ? <em>{active.reason}</em> : null}</span>
          </div>
          <span className={styles.dayCount}>{itemCount} {copy.items}</span>
        </header>

        <div className={styles.actions} aria-label="Selected day actions">
          <EasyTButton icon={Sparkles} size="small" variant="secondary" aria-expanded={copilotOpen} onClick={() => setCopilotOpen(true)}>{copy.askMorrovia}</EasyTButton>
          <EasyTButton icon={NotebookPen} size="small" variant="secondary" onClick={() => openAddFlow(active.notes.length, "note")}>{copy.addNote}</EasyTButton>
          <EasyTLinkButton href={mapIdeasHref} icon={Lightbulb} size="small" variant="secondary">{copy.findIdeas}</EasyTLinkButton>
          <EasyTLinkButton href={mapPlanHref} icon={MapIcon} size="small" variant="quiet">{copy.shapeDay}</EasyTLinkButton>
          {mutation.saveState !== "idle" && mutation.saveState !== "error" ? <span className={styles.saveStatus}><MorroviaSaveStatus state={mutation.saveState} /></span> : null}
        </div>

        {mutation.saveState === "error" ? <div className={styles.recoveryFeedback}><MorroviaRecoveryFeedback
          title={mutation.failure === "conflict" ? "This trip changed on another device" : mutation.failure === "auth" ? "Sign in to finish saving" : mutation.failure === "recovery" ? "Open the preserved device copy" : "Couldn’t save to your account"}
          detail={mutation.error}
          safety="The account copy was not overwritten. Any durable device edit remains in Morrovia recovery."
        /></div> : null}
        {notice ? <div className={styles.notice}><MorroviaBriefNotice title={notice} autoDismissMs={3200} onDismiss={() => setNotice(null)} /></div> : null}

        {dayComposition ? <div className={styles.details} aria-busy={dayPending || undefined}>
          <RichItineraryDayPlanner
            composition={dayComposition}
            addComposerDayPart={addFlow?.dayNumber === active.dayNumber && addFlow.kind === "activity" ? addFlow.dayPart ?? null : null}
            addDraft={addDraft}
            addError={addError}
            ideasHref={mapIdeasHref}
            language={language}
            onAddOpen={(dayPart) => openAddFlow(active.notes.length, "activity", dayPart)}
            onAddDraftChange={(value) => { setAddDraft(value); setAddError(""); }}
            onAddCancel={() => { setAddFlow(null); setAddDraft(""); setAddError(""); }}
            onAddSubmit={submitAddFlow}
            onDayPartChange={changeActivityDayPart}
            onMoveActivity={moveComposedActivity}
            showHeader={false}
          />
        </div> : null}

        <details className={styles.sequenceEditor}>
          <summary>{copy.editActivityOrder}</summary>
        <div className={styles.details} aria-label={`${stop?.name ?? active.title} activity editing controls`} aria-busy={dayPending || undefined} data-selected-item={selectedItemId ?? undefined}>
          {!incomingLeg ? <InsertionControl
            addFlow={addFlow?.dayNumber === active.dayNumber && addFlow.noteIndex === firstVisibleNoteIndex ? addFlow : null}
            copy={copy}
            draft={addDraft}
            error={addError}
            onDraftChange={(value) => { setAddDraft(value); setAddError(""); }}
            onKindChange={(kind) => setAddFlow((flow) => flow ? { ...flow, kind } : flow)}
            onOpen={() => openAddFlow(firstVisibleNoteIndex)}
            onCancel={() => { setAddFlow(null); setAddDraft(""); setAddError(""); }}
            onSubmit={submitAddFlow}
            draggedActivity={draggedActivity}
            onDrop={(event) => { event.preventDefault(); if (draggedActivity) moveActivityTo(draggedActivity, firstVisibleNoteIndex); }}
          /> : null}
          {incomingLeg ? <>
            {dayComposition ? null : <TransferRow leg={incomingLeg} copy={copy} trip={workingTrip} selected={selectedItemId === `leg-${incomingLeg.id}`} onSelect={() => setSelectedItemId(`leg-${incomingLeg.id}`)} />}
            <InsertionControl
              addFlow={addFlow?.dayNumber === active.dayNumber && addFlow.noteIndex === firstVisibleNoteIndex ? addFlow : null}
              copy={copy}
              draft={addDraft}
              error={addError}
              onDraftChange={(value) => { setAddDraft(value); setAddError(""); }}
              onKindChange={(kind) => setAddFlow((flow) => flow ? { ...flow, kind } : flow)}
              onOpen={() => openAddFlow(firstVisibleNoteIndex)}
              onCancel={() => { setAddFlow(null); setAddDraft(""); setAddError(""); }}
              onSubmit={submitAddFlow}
              draggedActivity={draggedActivity}
              onDrop={(event) => { event.preventDefault(); if (draggedActivity) moveActivityTo(draggedActivity, firstVisibleNoteIndex); }}
            />
          </> : null}
          {displayNotes.map(({ note, sourceIndex }, noteIndex) => {
            const booking = bookingForText(dayBookings, note);
            const protection = itineraryActivityProtection(workingTrip, { dayNumber: active.dayNumber, noteIndex: sourceIndex });
            const custom = customActivities.some((activity) => normalized(activity) === normalized(note));
            const itemId = timelineActivityId(active, note, sourceIndex, protection.editable);
            const target = { dayNumber: active.dayNumber, noteIndex: sourceIndex, title: note };
            const previous = displayNotes[noteIndex - 1];
            const next = displayNotes[noteIndex + 1];
            return <div className={styles.timelineGroup} key={`${active.id}-note-${sourceIndex}`}>
              <TimelineRow
                day={active}
                note={note}
                stop={stop}
                booking={booking}
                custom={custom}
                editable={protection.editable}
                protectedReason={protection.reason}
                itemId={itemId}
                selected={selectedItemId === itemId}
                editing={editingActivity?.dayNumber === active.dayNumber && editingActivity.noteIndex === sourceIndex}
                editDraft={editDraft}
                editError={editError}
                menuOpen={openMenuId === itemId}
                copy={copy}
                language={language}
                canMoveEarlier={protection.editable && Boolean(previous)}
                canMoveLater={protection.editable && Boolean(next)}
                onSelect={() => setSelectedItemId(itemId)}
                onBeginEdit={() => beginActivityEdit(target)}
                onEditDraftChange={(value) => { setEditDraft(value); setEditError(""); }}
                onSaveEdit={saveActivityEdit}
                onCancelEdit={() => { setEditingActivity(null); setEditDraft(""); setEditError(""); }}
                onToggleMenu={() => setOpenMenuId((current) => current === itemId ? null : itemId)}
                onRemove={() => { setRemoveTarget(target); setRemoveError(""); setOpenMenuId(null); }}
                onMoveEarlier={() => moveActivityTo(target, previous?.sourceIndex ?? sourceIndex)}
                onMoveLater={() => moveActivityTo(target, next ? next.sourceIndex + 1 : active.notes.length)}
                onDragStart={() => setDraggedActivity(target)}
                onDragEnd={() => setDraggedActivity(null)}
              />
              <InsertionControl
                addFlow={addFlow?.dayNumber === active.dayNumber && addFlow.noteIndex === sourceIndex + 1 ? addFlow : null}
                copy={copy}
                draft={addDraft}
                error={addError}
                onDraftChange={(value) => { setAddDraft(value); setAddError(""); }}
                onKindChange={(kind) => setAddFlow((flow) => flow ? { ...flow, kind } : flow)}
                onOpen={() => openAddFlow(sourceIndex + 1)}
                onCancel={() => { setAddFlow(null); setAddDraft(""); setAddError(""); }}
                onSubmit={submitAddFlow}
                draggedActivity={draggedActivity}
                onDrop={(event) => { event.preventDefault(); if (draggedActivity) moveActivityTo(draggedActivity, sourceIndex + 1); }}
              />
            </div>;
          })}
          {!displayNotes.length && !incomingLeg ? <div className={styles.timelineEmpty}><CirclePlus aria-hidden="true" /><p>{copy.noDetails}</p><EasyTButton icon={CirclePlus} size="small" variant="secondary" onClick={() => openAddFlow(active.notes.length)}>{copy.addActivity}</EasyTButton></div> : null}
        </div>
        </details>

        <DayNavigation index={index} count={days.length} setSelectedIndex={setSelectedIndex} copy={copy} />
      </div>

      {hasContextRail ? <aside className={styles.contextRail} aria-label="Selected day planning context">
        {mapContext.stops.length || mapContext.pins.length ? <details className={styles.contextSection} open>
          <summary><span>{copy.dayMap}</span><MapPin aria-hidden="true" /></summary>
          <div
            className={styles.mapPreview}
            onPointerDownCapture={(event) => selectPreviewPin(event.target)}
            onMouseDownCapture={(event) => selectPreviewPin(event.target)}
            onClickCapture={(event) => selectPreviewPin(event.target)}
          >
            <JourneyPlannerMap
              stops={mapContext.stops}
              legs={mapContext.legs}
              selectedId={mapContext.selectedStopId}
              selectedLegId={mapContext.selectedLegId}
              plannerPins={mapContext.pins}
              selectedPlannerPinId={mapContext.selectedPlannerPinId}
              focusCoordinates={mapContext.focusCoordinates}
              focusZoom={12}
              draftPinCoordinates={null}
              pinPlacementMode={false}
              overviewMode={mapContext.stops.length > 1}
              previewMode
              previewLabel={`${copy.mapPreview}: ${stop?.name ?? active.title}`}
              overviewPadding={{ top: 24, right: 24, bottom: 24, left: 24 }}
              onMapPinDrop={() => undefined}
              onPlannerPinSelect={(pin) => setSelectedItemId(itinerarySelectionForMapPin(pin, active))}
              onLegSelect={(leg) => setSelectedItemId(`leg-${leg.id}`)}
              onSelect={() => undefined}
            />
          </div>
          <EasyTLinkButton className={styles.contextAction} href={mapPlanHref} icon={MapIcon} size="small" variant="quiet" fullWidth>{copy.openFullMap}</EasyTLinkButton>
        </details> : null}

        {logisticsLegs.length || dayBookings.length || (stop?.nights ?? 0) > 0 ? <details className={styles.contextSection} open>
          <summary><span>{copy.logistics}</span><span className={styles.sectionCount}>{otherDayBookings.length + logisticsLegs.length + ((stop?.nights ?? 0) > 0 ? 1 : 0)}</span></summary>
          <div className={styles.contextList}>
            {logisticsLegs.map((leg) => <LogisticsLeg leg={leg} trip={workingTrip} copy={copy} key={leg.id} selected={selectedItemId === `leg-${leg.id}`} onSelect={() => setSelectedItemId(`leg-${leg.id}`)} />)}
            {stop && (stop.nights ?? 0) > 0 ? <DestinationAccommodationModule
              trip={workingTrip}
              stop={stop}
              pending={mutation.isPending(`itinerary-stay-${stop.id}`)}
              onCanonicalTrip={mutation.acceptCanonicalTrip}
              onSave={(draft) => {
                const changed = mutation.mutateTrip((current) => upsertStayBooking(current, stop.id, draft), `itinerary-stay-${stop.id}`);
                if (changed) setNotice(stayBookingForStop(workingTrip, stop) ? "Stay updated" : "Stay added");
                return changed;
              }}
              onRemove={() => {
                const changed = mutation.mutateTrip((current) => removeStayBooking(current, stop.id), `itinerary-stay-${stop.id}`);
                if (changed) setNotice("Stay removed");
                return changed;
              }}
            /> : null}
            {otherDayBookings.map((booking) => <BookingCard booking={booking} copy={copy} key={booking.id} />)}
          </div>
        </details> : null}

        <details className={styles.contextSection} open>
          <summary><span>{copy.suggestions}</span><Lightbulb aria-hidden="true" /></summary>
          {recommendations.length ? <div className={styles.contextList}>{recommendations.map((recommendation) => <article className={styles.suggestionCard} key={recommendation.id}><Lightbulb aria-hidden="true" /><div><strong>{recommendation.message}</strong><p>{recommendation.evidence}</p></div></article>)}</div> : null}
          <ItineraryDaySuggestions
            key={`${workingTrip.id}-${active.id}`}
            trip={workingTrip}
            day={active}
            stop={stop}
            copy={copy}
            language={language}
            initialPlaces={initialSuggestions?.[active.dayNumber]}
            isPending={(placeId) => mutation.isPending(`itinerary-suggestion-${active.stopId}-${placeId}`)}
            onSave={saveSuggestion}
            onSchedule={scheduleSuggestion}
            onRemove={removeSuggestion}
          />
          {experienceAction && stop ? <section className={styles.experienceHandoff} aria-labelledby={`${active.id}-experience-handoff`}>
            <div>
              <strong id={`${active.id}-experience-handoff`}>{language === "es" ? "¿Quieres más opciones?" : "Want more options?"}</strong>
              <p>{language === "es" ? `Explora tours y actividades cerca de ${stop.name} sin cambiar este día.` : `Browse tours and activities around ${stop.name} without changing this day.`}</p>
              <span>{language === "es" ? "Opciones de reserva de" : "Booking options from"} {affiliateProviderLabel(experienceAction.provider)}</span>
            </div>
            <MorroviaAffiliateLink action={experienceAction} context={{ placement: "itinerary_day_experiences", tripId: workingTrip.id, stopId: stop.id, workspaceView: "itinerary" }} fullWidth />
            <small>{affiliateDisclosure}</small>
          </section> : null}
        </details>

        <details className={`${styles.contextSection} ${styles.copilotSection}`} open={copilotOpen}>
          <summary onClick={(event) => { event.preventDefault(); setCopilotOpen((current) => !current); }}><span>{copy.aiPlanning}</span><Sparkles aria-hidden="true" /></summary>
          <div className={styles.contextCopilot}>
            <EasyTTripCopilot
              surface="map"
              dayCount={days.length}
              destination={stop?.name}
              contextLabel={`Day ${active.dayNumber} · ${stop?.name ?? active.title}`}
              scope="selected-day"
              tripId={workingTrip.ownerId ? workingTrip.id : undefined}
              stopId={stop?.id}
              dayNumber={active.dayNumber}
              open={copilotOpen}
              suggestedPrompts={language === "es" ? ["¿Cómo se ve este día?", "¿Es demasiado apresurado?", "¿Qué encaja cerca?"] : ["How does this day look?", "Is this too rushed?", "What fits nearby?"]}
              canApplyChanges={Boolean(workingTrip.ownerId) && (mutation.saveState === "idle" || mutation.saveState === "saved")}
              onTripApplied={mutation.acceptCanonicalTrip}
              onOpenChange={setCopilotOpen}
            />
          </div>
        </details>

        <details className={styles.contextSection} open>
          <summary><span>{copy.notes}</span><span className={styles.sectionCount}>{dayNotes.length}</span></summary>
          <div className={styles.contextList}>{dayNotes.map((note, noteIndex) => <article className={styles.noteCard} key={`${active.id}-saved-note-${noteIndex}`}><BookOpenText aria-hidden="true" /><p>{note}</p></article>)}</div>
          <form className={styles.railNoteComposer} onSubmit={(event) => { event.preventDefault(); submitRailNote(); }}>
            <EasyTField label={copy.addDayNote} value={railNoteDraft} error={railNoteError || undefined} placeholder={copy.notePlaceholder} onChange={(event) => { setRailNoteDraft(event.target.value); setRailNoteError(""); }} />
            <EasyTButton type="submit" icon={CirclePlus} size="small" variant="secondary" disabled={!railNoteDraft.trim() || dayPending}>{copy.addNote}</EasyTButton>
          </form>
        </details>

        {(workingTrip.brief.itineraryIdeas ?? []).some((idea) => idea.stopId === active.stopId && !idea.dayId) || savedIdeas.length ? <details className={styles.contextSection} open>
          <summary><span>{copy.savedIdeas}</span><span className={styles.sectionCount}>{(workingTrip.brief.itineraryIdeas ?? []).filter((idea) => idea.stopId === active.stopId && !idea.dayId).length}</span></summary>
          <div className={styles.savedIdeas}>{(workingTrip.brief.itineraryIdeas ?? []).filter((idea) => idea.stopId === active.stopId && !idea.dayId).map((idea) => <article key={idea.id}><MapPin aria-hidden="true" /><span><strong>{idea.title}</strong><small>Saved for {stop?.name}</small></span><EasyTButton size="small" variant="quiet" onClick={() => mutation.mutateTrip((current) => removeItineraryIdea(current, idea.id), `itinerary-idea-remove-${idea.id}`)}>{copy.remove}</EasyTButton></article>)}</div>
        </details> : null}
      </aside> : null}

      <MorroviaConfirmationDialog
        open={Boolean(removeTarget)}
        title={removeTarget ? `${copy.removeActivity}: ${removeTarget.title}?` : copy.removeActivity}
        detail={copy.removeDetail}
        consequences={["It will be removed from this day’s authored activities.", "Linked bookings and mapped places are protected and cannot be removed here."]}
        cancelLabel={copy.keepActivity}
        confirmLabel={copy.removeActivity}
        error={removeError || undefined}
        onCancel={() => { setRemoveTarget(null); setRemoveError(""); }}
        onConfirm={confirmRemoveActivity}
      />
    </section>
  );
}

function ItineraryDaySuggestions({ trip, day, stop, copy, language, initialPlaces, isPending, onSave, onSchedule, onRemove }: {
  trip: EasyTTrip;
  day: PlanItem;
  stop: TripStop | null;
  copy: ReturnType<typeof itineraryCopy>;
  language: "en" | "es";
  initialPlaces?: ItineraryDiscoveryPlace[];
  isPending: (placeId: string) => boolean;
  onSave: (place: ItineraryDiscoveryPlace, reasons: IdeaDiscoveryReason[]) => boolean;
  onSchedule: (place: ItineraryDiscoveryPlace, reasons: IdeaDiscoveryReason[], dayId: string) => boolean;
  onRemove: (placeId: string, ideaId: string) => boolean;
}) {
  const [places, setPlaces] = useState<ItineraryDiscoveryPlace[]>(initialPlaces ?? []);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(initialPlaces ? "ready" : "idle");
  const [retryVersion, setRetryVersion] = useState(0);
  const [error, setError] = useState("");
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);

  useEffect(() => {
    if (initialPlaces) {
      setPlaces(initialPlaces);
      setStatus("ready");
      return;
    }
    if (!stop || stop.latitude === null || stop.longitude === null) {
      setPlaces([]);
      setStatus("ready");
      return;
    }
    const scope = createAbortableEffectScope(`Itinerary suggestions for day ${day.dayNumber}`);
    setPlaces([]);
    setError("");
    setStatus("loading");
    void fetch(`/api/journey-discover?${new URLSearchParams({
      destination: stop.name,
      country: stop.country,
      lat: String(stop.latitude),
      lon: String(stop.longitude),
    })}`, { signal: scope.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(copy.suggestionsUnavailable);
        return response.json() as Promise<{ places?: ItineraryDiscoveryPlace[] }>;
      })
      .then((payload) => {
        scope.commit(() => {
          setPlaces(payload.places ?? []);
          setStatus("ready");
        });
      })
      .catch((caught: unknown) => {
        if (scope.isCancellation(caught)) return;
        scope.commit(() => {
          setPlaces([]);
          setStatus("error");
        });
      });
    return () => scope.dispose();
  }, [copy.suggestionsUnavailable, initialPlaces, retryVersion, stop?.country, stop?.id, stop?.latitude, stop?.longitude, stop?.name]);

  const eligible = itinerarySuggestionCandidates(trip, day, places);
  const highlights = destinationHighlightCandidates(eligible).slice(0, 4);
  const highlightIds = new Set(highlights.map((place) => place.id));
  const recommended = personalisedItineraryCandidates(eligible, tripIntentForTrip(trip).preferences.interests)
    .filter((place) => !highlightIds.has(place.id))
    .slice(0, 4);
  if (status === "loading") return <div className={styles.suggestionStatus}><MorroviaSectionStatus title={copy.suggestionsLoading} detail={copy.suggestionsLoadingDetail} /></div>;
  if (status === "error") return <div className={styles.suggestionStatus}><MorroviaSectionStatus state="error" title={copy.suggestionsUnavailable} detail="Your saved day is unchanged." retryLabel="Try places again" onRetry={() => setRetryVersion((current) => current + 1)} /></div>;
  if (!highlights.length && !recommended.length) return <p className={styles.suggestionEmpty}>{copy.noNewSuggestions}</p>;
  const renderPlaces = (items: ItineraryDiscoveryPlace[], reason: IdeaDiscoveryReason) => <div className={styles.discoveryList}>{items.map((place) => {
    const pending = isPending(place.id);
    const interestReason = itineraryInterestReason(place, tripIntentForTrip(trip).preferences.interests, language);
    const state = stop ? ideaStateForPlace(trip, stop.id, place.id) : { state: "available" as const, idea: null, day: null };
    const reasons: IdeaDiscoveryReason[] = [...new Set<IdeaDiscoveryReason>([reason, ...(interestReason ? ["interest-relevance" as const] : [])])];
    const options = stop ? itineraryIdeaDayOptions(trip, stop.id) : [];
    const preferredDay = stop ? preferredItineraryIdeaDay(trip, stop.id) : null;
    return <RecommendationDiscoveryCard
      key={place.id}
      place={place}
      interestReason={interestReason}
      language={language}
      options={options}
      preferredDayId={preferredDay?.id ?? null}
      state={state}
      pending={pending}
      pickerOpen={openPickerId === place.id}
      onPickerOpenChange={(open) => setOpenPickerId(open ? place.id : null)}
      onSave={() => { setError(""); if (!onSave(place, reasons)) setError("This idea could not be stored safely."); }}
      onSchedule={(dayId) => {
        setError("");
        const accepted = onSchedule(place, reasons, dayId);
        if (!accepted) setError("This activity could not be added safely.");
        return accepted;
      }}
      onRemove={state.idea ? () => {
        setError("");
        if (!onRemove(place.id, state.idea!.id)) setError("This activity could not be removed safely.");
      } : undefined}
    />;
  })}</div>;
  return <>{highlights.length ? <section className={styles.discoveryGroup}><h4>Highlights in {stop?.name}</h4>{renderPlaces(highlights, "destination-significance")}</section> : null}{recommended.length ? <section className={styles.discoveryGroup}><h4>Recommended for you</h4>{renderPlaces(recommended, "interest-relevance")}</section> : null}{error ? <p className={styles.suggestionError} role="alert">{error}</p> : null}</>;
}

type DiscoveryIdeaState = ReturnType<typeof ideaStateForPlace>;

function RecommendationDiscoveryCard({ place, interestReason, language, options, preferredDayId, state, pending, pickerOpen, onPickerOpenChange, onSave, onSchedule, onRemove }: {
  place: ItineraryDiscoveryPlace;
  interestReason: string | null;
  language: "en" | "es";
  options: ItineraryIdeaDayOption[];
  preferredDayId: string | null;
  state: DiscoveryIdeaState;
  pending: boolean;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  onSave: () => void;
  onSchedule: (dayId: string) => boolean;
  onRemove?: () => void;
}) {
  const titleId = useId();
  const currentDayId = state.state === "planned" ? state.day.id : null;
  const singleDay = options.length === 1 ? options[0]!.day : null;
  const actionLabel = state.state === "planned" ? "Move day" : `Add to Day ${options.find((option) => option.day.id === preferredDayId)?.day.dayNumber ?? options[0]?.day.dayNumber ?? ""}`;
  return <article className={styles.discoveryCard} aria-labelledby={titleId} aria-busy={pending || undefined}>
    <div className={styles.discoveryMedia}>
      <ResilientImage src={place.image} alt="" fallback={<span className={styles.discoveryFallback}><MapPin aria-hidden="true" /></span>} />
      {place.sourceUrl ? <a href={place.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open source for ${place.title}`}><ExternalLink aria-hidden="true" /></a> : null}
    </div>
    <div className={styles.discoveryCopy}>
      <small>{place.area} · {place.type}</small>
      <strong id={titleId}>{place.title}</strong>
      {interestReason ? <p className={styles.interestReason}>{interestReason}</p> : null}
      <p>{place.description}</p>
    </div>
    <div className={styles.discoveryActions}>
      {state.state === "planned" ? <span className={styles.plannedState}><CheckCircle2 aria-hidden="true" />Added to Day {state.day.dayNumber}</span> : null}
      {options.length > 1 ? <ItineraryDayPicker
        placeTitle={place.title}
        language={language}
        options={options}
        preferredDayId={preferredDayId}
        currentDayId={currentDayId}
        label={actionLabel}
        open={pickerOpen}
        pending={pending}
        onOpenChange={onPickerOpenChange}
        onChoose={onSchedule}
      /> : singleDay && state.state !== "planned" ? <EasyTButton size="small" variant="secondary" icon={CirclePlus} disabled={pending} onClick={() => onSchedule(singleDay.id)}>Add to Day {singleDay.dayNumber}</EasyTButton> : null}
      {state.state === "available" ? <EasyTButton size="small" variant="quiet" disabled={pending} onClick={onSave}>{pending ? "Saving…" : "Save"}</EasyTButton> : state.state === "saved" ? <span className={styles.savedIdeaState}>Saved</span> : onRemove ? <EasyTButton size="small" variant="quiet" disabled={pending} onClick={onRemove}>Remove</EasyTButton> : null}
    </div>
  </article>;
}

function ItineraryDayPicker({ placeTitle, language, options, preferredDayId, currentDayId, label, open, pending, onOpenChange, onChoose }: {
  placeTitle: string;
  language: "en" | "es";
  options: ItineraryIdeaDayOption[];
  preferredDayId: string | null;
  currentDayId: string | null;
  label: string;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (dayId: string) => boolean;
}) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = (restoreFocus: boolean) => {
    onOpenChange(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const preferred = menuRef.current?.querySelector<HTMLElement>(`[data-day-id="${currentDayId ?? preferredDayId ?? ""}"]`);
    const first = menuRef.current?.querySelector<HTMLElement>("[role='menuitem']");
    window.requestAnimationFrame(() => (preferred ?? first)?.focus());
    const dismiss = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [currentDayId, open, preferredDayId]);

  const moveFocus = (event: ReactKeyboardEvent<HTMLDivElement>, direction: 1 | -1) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [])];
    const index = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
    items[(index + direction + items.length) % items.length]?.focus();
    event.preventDefault();
  };

  return <div className={styles.dayPicker}>
    <EasyTButton
      ref={triggerRef}
      size="small"
      variant="secondary"
      disabled={pending}
      aria-expanded={open}
      aria-haspopup="menu"
      aria-controls={open ? menuId : undefined}
      onClick={() => onOpenChange(!open)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); onOpenChange(true); }
        if (event.key === "Escape" && open) { event.preventDefault(); close(true); }
      }}
    >
      <span>{label}</span><ChevronDown aria-hidden="true" />
    </EasyTButton>
    {open ? <div
      className={`${styles.rowMenuPanel} ${styles.dayPickerPanel}`}
      id={menuId}
      ref={menuRef}
      role="menu"
      aria-label={`Choose a day for ${placeTitle}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); close(true); }
        else if (event.key === "ArrowDown") moveFocus(event, 1);
        else if (event.key === "ArrowUp") moveFocus(event, -1);
        else if (event.key === "Home") { event.preventDefault(); menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus(); }
        else if (event.key === "End") { event.preventDefault(); [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [])].at(-1)?.focus(); }
        else if (event.key === "Tab") close(false);
      }}
    >
      {options.map(({ day, itemCount, protectedDay }) => {
        const current = day.id === currentDayId;
        const dayKind = day.type === "arrival" ? "Arrival day" : day.type === "transport" ? "Transfer day" : null;
        return <EasyTButton
          key={day.id}
          role="menuitem"
          data-day-id={day.id}
          className={styles.dayPickerOption}
          size="small"
          variant="quiet"
          aria-current={current ? "true" : undefined}
          onClick={() => {
            if (current || onChoose(day.id)) close(true);
          }}
        >
          <span><strong>Day {day.dayNumber} · {displayDayDate(day.date, language)}</strong><small>{day.title} · {itemCount} {itemCount === 1 ? "item" : "items"}</small></span>
          {current ? <em>Current</em> : day.id === preferredDayId ? <em>Suggested</em> : protectedDay && dayKind ? <em>{dayKind}</em> : null}
        </EasyTButton>;
      })}
    </div> : null}
  </div>;
}

function LegacyDayRail({ days, trip, selectedIndex, setSelectedIndex, copy, language }: {
  days: PlanItem[]; trip: EasyTTrip; selectedIndex: number; setSelectedIndex: (index: number) => void;
  copy: ReturnType<typeof itineraryCopy>; language: "en" | "es";
}) {
  return (
    <div className={legacyStyles.timeline}>
      <div className={legacyStyles.timelineHead}><strong>{copy.dayByDay}</strong><small>{days.length} {copy.days}</small></div>
      {days.map((day, index) => (
        <button type="button" key={day.id} className={`${legacyStyles.timelineRow} ${index === selectedIndex ? legacyStyles.timelineRowOn : ""}`} onClick={() => setSelectedIndex(index)}>
          <b>{pad(day.dayNumber)}</b>
          <span><em>{stopForDay(trip, day)?.name ?? "Route"}</em><strong>{day.title}</strong></span>
          <small>{displayDate(day.date, language, true)}</small>
        </button>
      ))}
    </div>
  );
}

function LegacyDayContent({ day, stop, image, index, days, setSelectedIndex, copy, language }: {
  day: PlanItem; stop: TripStop | null; image: JourneyImage | null; index: number; days: PlanItem[];
  setSelectedIndex: (index: number) => void; copy: ReturnType<typeof itineraryCopy>; language: "en" | "es";
}) {
  return <>
    <div className={legacyStyles.dayMeta}>
      <p><span>{displayDate(day.date, language, true)}</span> · DAY {pad(day.dayNumber)}</p>
      {stop ? <span><MapPin /> {stop.name}</span> : null}
    </div>
    <h3>{day.title}</h3>
    <p className={legacyStyles.dayReason}>{day.reason}</p>
    <DayImage image={image} day={day} stop={stop} sourceLabel={copy.source} className={legacyStyles.dayImage} fallbackClassName={legacyStyles.dayImageFallback} />
    <ul className={legacyStyles.dayItems}>{day.notes.map((text, noteIndex) => <li key={noteIndex}>{text}</li>)}</ul>
    <div className={legacyStyles.dayNav}>
      <button type="button" disabled={index === 0} onClick={() => setSelectedIndex(index - 1)}>← {copy.previousDay}</button>
      <button type="button" disabled={index >= days.length - 1} onClick={() => setSelectedIndex(index + 1)}>{copy.nextDay} →</button>
    </div>
  </>;
}

function DayImage({ image, day, stop, sourceLabel, className, fallbackClassName }: {
  image: JourneyImage | null; day: PlanItem; stop: TripStop | null; sourceLabel: string; className: string; fallbackClassName: string;
}) {
  const fallback = <div className={`${className} ${fallbackClassName}`} role="img" aria-label={`Image unavailable for ${day.title}`}><span>{stop?.name ?? day.title}</span></div>;
  if (!image) return fallback;
  return (
    <figure className={className}>
      <ResilientImage src={image.src} alt={image.alt || day.title} fallback={<div className={fallbackClassName} role="img" aria-label={`Image unavailable for ${day.title}`}><span>{stop?.name ?? day.title}</span></div>} />
      <figcaption>
        <span>{image.caption || stop?.name || day.title}</span>
        {image.sourceUrl ? <a href={image.sourceUrl} target="_blank" rel="noreferrer">{image.sourceLabel ?? sourceLabel}</a> : null}
      </figcaption>
    </figure>
  );
}

function TimelineRow({
  day,
  note,
  stop,
  booking,
  custom,
  editable,
  protectedReason,
  itemId,
  selected,
  editing,
  editDraft,
  editError,
  menuOpen,
  copy,
  language,
  canMoveEarlier,
  canMoveLater,
  onSelect,
  onBeginEdit,
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  onToggleMenu,
  onRemove,
  onMoveEarlier,
  onMoveLater,
  onDragStart,
  onDragEnd,
}: {
  day: PlanItem;
  note: string;
  stop: TripStop | null;
  booking?: TripBooking;
  custom: boolean;
  editable: boolean;
  protectedReason?: ReturnType<typeof itineraryActivityProtection>["reason"];
  itemId: string;
  selected: boolean;
  editing: boolean;
  editDraft: string;
  editError: string;
  menuOpen: boolean;
  copy: ReturnType<typeof itineraryCopy>;
  language: "en" | "es";
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  onSelect: () => void;
  onBeginEdit: () => void;
  onEditDraftChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onToggleMenu: () => void;
  onRemove: () => void;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const Icon = iconForPlanItem(day.type);
  const status = booking
    ? booking.confirmation ? copy.confirmed : booking.type === "reservation" ? copy.reservation : copy.saved
    : custom ? copy.yours : null;
  const externalHref = booking?.url ?? null;

  if (editing) {
    return (
      <article className={`${styles.detailRow} ${styles.customRow} ${styles.editingRow} ${selected ? styles.selectedRow : ""}`} data-itinerary-item={itemId}>
        <span className={styles.detailIcon}><Icon aria-hidden="true" /></span>
        <form className={styles.rowEditor} onSubmit={(event) => { event.preventDefault(); onSaveEdit(); }}>
          <EasyTField autoFocus label={copy.activityName} value={editDraft} error={editError || undefined} onChange={(event) => onEditDraftChange(event.target.value)} />
          <span><EasyTButton type="submit" size="small" disabled={!editDraft.trim()}>{copy.save}</EasyTButton><EasyTButton size="small" variant="quiet" onClick={onCancelEdit}>{copy.cancel}</EasyTButton></span>
        </form>
      </article>
    );
  }

  return (
    <article className={`${styles.detailRow} ${booking ? styles.bookingRow : custom ? styles.customRow : ""} ${selected ? styles.selectedRow : ""}`} data-itinerary-item={itemId}>
      <span className={styles.detailIcon}><Icon aria-hidden="true" /></span>
      <EasyTButton className={styles.rowSelect} variant="quiet" aria-pressed={selected} onClick={() => { onSelect(); if (editable) onBeginEdit(); }} title={!editable && custom && protectedReason ? copy.protectedItem : undefined}>
        <span className={styles.itemCopy}>
        <strong>{note}</strong>
        <span>{stop?.name ?? copy.dayPlan}<i aria-hidden="true">·</i>{planItemLabel(day.type, language)}</span>
        </span>
      </EasyTButton>
      <div className={styles.itemActions}>
        {status ? <span className={booking?.confirmation ? styles.confirmedStatus : styles.savedStatus}>{status}</span> : null}
        {editable ? <EasyTButton className={styles.dragHandle} icon={GripVertical} iconOnly size="small" variant="quiet" draggable onDragStart={onDragStart} onDragEnd={onDragEnd}>{copy.dragActivity}: {note}</EasyTButton> : null}
        {externalHref ? <a className={styles.rowExternal} href={externalHref} target="_blank" rel="noopener noreferrer" aria-label={`${copy.bookingLink}: ${note}`}><ExternalLink aria-hidden="true" /></a> : null}
        {editable ? <div className={styles.rowMenu}>
          <EasyTButton aria-expanded={menuOpen} aria-haspopup="menu" className={styles.rowEdit} icon={MoreHorizontal} iconOnly size="small" variant="quiet" onClick={onToggleMenu}>{copy.edit}: {note}</EasyTButton>
          {menuOpen ? <div className={styles.rowMenuPanel} role="menu">
            <EasyTButton role="menuitem" icon={Pencil} size="small" variant="quiet" onClick={onBeginEdit}>{copy.edit}</EasyTButton>
            <EasyTButton role="menuitem" size="small" variant="quiet" disabled={!canMoveEarlier} onClick={onMoveEarlier}>{copy.moveEarlier}</EasyTButton>
            <EasyTButton role="menuitem" size="small" variant="quiet" disabled={!canMoveLater} onClick={onMoveLater}>{copy.moveLater}</EasyTButton>
            <EasyTButton role="menuitem" icon={Trash2} size="small" variant="danger" onClick={onRemove}>{copy.remove}</EasyTButton>
          </div> : null}
        </div> : null}
      </div>
    </article>
  );
}

function InsertionControl({
  addFlow,
  copy,
  draft,
  error,
  onDraftChange,
  onKindChange,
  onOpen,
  onCancel,
  onSubmit,
  draggedActivity,
  onDrop,
}: {
  addFlow: AddFlow | null;
  copy: ReturnType<typeof itineraryCopy>;
  draft: string;
  error: string;
  onDraftChange: (value: string) => void;
  onKindChange: (kind: AddFlow["kind"]) => void;
  onOpen: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  draggedActivity: ActivityTarget | null;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className={`${styles.insertionGroup} ${draggedActivity ? styles.insertionDropReady : ""}`} onDragOver={(event) => { if (draggedActivity) event.preventDefault(); }} onDrop={onDrop}>
      <div className={styles.insertion}><span aria-hidden="true" /><EasyTButton icon={CirclePlus} size="small" variant="quiet" onClick={onOpen}>{copy.addHere}</EasyTButton><span aria-hidden="true" /></div>
      {addFlow ? <form className={styles.addComposer} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <EasyTSegmentedControl
          ariaLabel="Itinerary item type"
          options={[{ value: "activity", label: copy.activity }, { value: "note", label: copy.note }]}
          value={addFlow.kind}
          onChange={onKindChange}
        />
        <EasyTField
          autoFocus
          label={addFlow.kind === "activity" ? copy.activityName : copy.noteText}
          hint={addFlow.kind === "note" ? copy.noteHint : undefined}
          error={error || undefined}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
        />
        <div className={styles.addComposerActions}><EasyTButton type="submit" icon={CirclePlus} size="small" disabled={!draft.trim()}>{addFlow.kind === "activity" ? copy.addActivity : copy.addNote}</EasyTButton><EasyTButton size="small" variant="quiet" onClick={onCancel}>{copy.cancel}</EasyTButton></div>
      </form> : null}
    </div>
  );
}

function TransferRow({ leg, copy, trip, selected, onSelect }: { leg: TripLeg; copy: ReturnType<typeof itineraryCopy>; trip: EasyTTrip; selected: boolean; onSelect: () => void }) {
  const from = routeEndpointForLeg(trip, leg, "from")?.name;
  const to = routeEndpointForLeg(trip, leg, "to")?.name;
  const arrivalLabel = semanticSamePlaceArrival(trip, leg);
  const durationMinutes = leg.doorToDoorMinutes ?? leg.durationMinutes;
  const duration = durationMinutes === null ? null : formatTripDuration(durationMinutes);
  const omioAction = omioBookingActionForLeg(trip, leg);
  const Icon = iconForLeg(leg.mode);
  return (
    <div className={`${styles.detailRow} ${omioAction ? styles.transferRow : ""} ${selected ? styles.selectedRow : ""}`} data-itinerary-item={`leg-${leg.id}`}>
      <span className={styles.detailIcon}><Icon aria-hidden="true" /></span>
      <EasyTButton className={styles.rowSelect} variant="quiet" aria-pressed={selected} onClick={onSelect}><span className={styles.itemCopy}><strong>{arrivalLabel ?? (from && to ? `${from} → ${to}` : leg.mode)}</strong><span>{arrivalLabel ? "Arrival" : <>{tripLegClassificationLabel(leg.classification)}<i aria-hidden="true">·</i>{duration ? (leg.provenance === "planning_estimate" ? copy.estimate : "Saved timing") : copy.unresolved}</>}</span></span></EasyTButton>
      {arrivalLabel ? <span className={styles.duration}>Arrival</span> : duration ? <span className={styles.duration}>~{duration}</span> : <span className={styles.duration}>{copy.unresolved}</span>}
      {omioAction ? <span className={styles.omioAction}><a href={omioAction.href} target="_blank" rel="sponsored noopener noreferrer" aria-label={`${omioAction.cta}, opens Omio in a new tab`} onClick={() => trackEvent("affiliate_link_clicked", { partner: "omio", placement: "itinerary_transfer", tripId: trip.id, transferId: leg.id, originStopId: leg.fromStopId, destinationStopId: leg.toStopId })}>{omioAction.cta}<ExternalLink aria-hidden="true" /></a><small>Partner link · Morrovia may earn a commission at no extra cost to you.</small></span> : null}
    </div>
  );
}

function LogisticsLeg({ leg, trip, copy, selected, onSelect }: { leg: TripLeg; trip: EasyTTrip; copy: ReturnType<typeof itineraryCopy>; selected: boolean; onSelect: () => void }) {
  const Icon = iconForLeg(leg.mode);
  const from = routeEndpointForLeg(trip, leg, "from")?.name;
  const to = routeEndpointForLeg(trip, leg, "to")?.name;
  const durationMinutes = leg.doorToDoorMinutes ?? leg.durationMinutes;
  const arrivalLabel = semanticSamePlaceArrival(trip, leg);
  return <EasyTButton variant="quiet" className={`${styles.logisticsCard} ${selected ? styles.logisticsSelected : ""}`} aria-pressed={selected} onClick={onSelect}><Icon aria-hidden="true" /><div><small>{tripLegClassificationLabel(leg.classification)}</small><strong>{arrivalLabel ?? (from && to ? `${from} → ${to}` : leg.mode)}</strong><span>{arrivalLabel ? "Arrival into your first overnight destination" : durationMinutes === null ? "Timing needs confirmation" : `~${formatTripDuration(durationMinutes)} · ${leg.provider?.trim() || copy.transfer}`}</span></div><ArrowRight aria-hidden="true" /></EasyTButton>;
}

function BookingCard({ booking, copy }: { booking: TripBooking; copy: ReturnType<typeof itineraryCopy> }) {
  const Icon = booking.type === "stay" ? BedDouble : booking.type === "transport" ? Route : booking.type === "reservation" ? Utensils : BookOpenText;
  const state = booking.confirmation ? copy.confirmed : booking.type === "reservation" ? copy.reservation : copy.saved;
  return <article className={styles.bookingCard}><Icon aria-hidden="true" /><div><strong>{booking.title}</strong><span>{state}{booking.confirmation ? ` · ${booking.confirmation}` : ""}{booking.date ? ` · ${booking.date}` : ""}</span></div>{booking.confirmation ? <CheckCircle2 aria-hidden="true" /> : booking.url ? <a href={booking.url} target="_blank" rel="noopener noreferrer" aria-label={`${copy.bookingLink}: ${booking.title}`}><ExternalLink aria-hidden="true" /></a> : null}</article>;
}

function DayNavigation({ index, count, setSelectedIndex, copy }: {
  index: number; count: number; setSelectedIndex: (index: number) => void; copy: ReturnType<typeof itineraryCopy>;
}) {
  return (
    <nav className={styles.dayNavigation} aria-label="Day navigation">
      <button type="button" disabled={index === 0} onClick={() => setSelectedIndex(index - 1)}><ChevronLeft aria-hidden="true" />{copy.previousDay}</button>
      <span>Day {index + 1} of {count}</span>
      <button type="button" disabled={index === count - 1} onClick={() => setSelectedIndex(index + 1)}>{copy.nextDay}<ChevronRight aria-hidden="true" /></button>
    </nav>
  );
}
