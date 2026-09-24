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
  Pencil,
  Plane,
  Route,
  RotateCcw,
  Ship,
  Sparkles,
  TrainFront,
  Trash2,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { tripIntentForTrip, type EasyTTrip, type ItineraryDayPart, type ItineraryIdea, type PlanItem, type TripBooking, type TripLeg, type TripStop } from "@/lib/easyt/trip";
import { tripDisplayTitle } from "@/lib/easyt/trip-display";
import type { JourneyImage } from "@/lib/journey";
import { itineraryImageFor } from "@/lib/easyt/itinerary-media";
import { itineraryNotesWithSourceIndexesForDisplay, semanticSamePlaceArrival } from "@/lib/easyt/itinerary-presentation";
import {
  addItineraryDayNote,
  assignItineraryActivityDayPart,
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
import { removeStayBooking, stayBookingForStop } from "@/lib/easyt/accommodation";
import { routeEndpointForLeg } from "@/lib/easyt/trip-legs";
import { transferJourneyModeLabel, transferJourneySegmentSummary } from "@/lib/easyt/transfer-journey";
import { exploreWorkspaceHref, itineraryDestinationTrack, mapWorkspaceHref, stayWorkspaceHref, transportWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import { mapResultHandoffForExploreResult, mapResultSelectionId, mapResultSelectionIdForIdea } from "@/lib/easyt/map-result-selection";
import { recommendationDetailForExploreResult } from "@/lib/easyt/recommendation-detail";
import { tripSyncRecoveryPath } from "@/lib/easyt/trip-continuity";
import {
  itineraryDayLegs,
  itineraryDayMapContext,
  itineraryDayMapSelection,
  itinerarySelectionForMapPin,
  itinerarySuggestionCandidates,
  type ItineraryDiscoveryPlace,
} from "@/lib/easyt/itinerary-day-context";
import { createAbortableEffectScope } from "@/lib/easyt/abortable-effect";
import { assignItineraryIdeaDayPart, ideaStateForPlace, itineraryIdeaDayOptions, preferredItineraryIdeaDay, removeItineraryIdea, saveItineraryIdea, type ItineraryIdeaDayOption } from "@/lib/easyt/itinerary-ideas";
import { composeItineraryDay, itineraryDayParts, type ComposedItineraryActivity, type ItineraryDayComposition } from "@/lib/easyt/itinerary-day-composition";
import { itineraryStayPresentation } from "@/lib/easyt/itinerary-stay-presentation";
import {
  addItineraryActivityWithUndo,
  moveItineraryActivityAcrossDays,
  placeItineraryActivity,
  preferredItineraryDayPart,
  scheduleItineraryIdeaAtPositionWithUndo,
  scheduleItineraryIdeaWithUndo,
  undoItineraryItemAction,
  type ItineraryItemUndoReceipt,
} from "@/lib/easyt/itinerary-activity-placement";
import { JourneyPlannerMap } from "@/components/journey-planner-map";
import { EasyTButton, EasyTField, EasyTLinkButton, EasyTSelect, EasyTSegmentedControl } from "@/components/easyt/easyt-controls";
import { MorroviaBriefNotice, MorroviaConfirmationDialog, MorroviaFormDialog, MorroviaRecoveryFeedback } from "@/components/easyt/morrovia-feedback";
import { MorroviaSectionStatus } from "@/components/easyt/morrovia-loading-states";
import ResilientImage from "@/components/easyt/resilient-image";
import { useTripMutationPersistence } from "@/components/easyt/use-trip-mutation-persistence";
import { useOptionalTripShellMutation } from "@/components/easyt/trip-shell-client";
import RichItineraryDayPlanner from "@/components/easyt/rich-itinerary-day-planner";
import ItineraryItemDetail, { type ItineraryItemDetailModel } from "@/components/easyt/itinerary-item-detail";
import ItineraryActivityIdentity from "@/components/easyt/itinerary-activity-identity";
import { affiliateDisclosure, MorroviaAffiliateDisclosure, MorroviaAffiliateLink } from "@/components/easyt/affiliate-link";
import { MorroviaPartnerPromotion } from "@/components/easyt/partner-promotion";
import TripExplicitPlans from "@/components/easyt/trip-explicit-plans";
import { removeExplicitVisitIntent, removeFixedCommitment, scheduleExplicitVisitIntent } from "@/lib/easyt/trip-explicit-plans";
import type { ActivityInventoryItem } from "@/lib/easyt/activity-inventory";
import { dedupeExploreResults, exploreResultForActivity, exploreResultForIdea, exploreResultForPlace, type ExploreResult } from "@/lib/easyt/explore";
import { rankItineraryRecommendations } from "@/lib/easyt/itinerary-recommendations";
import { recommendationDurationMs } from "@/lib/easyt/recommendation-performance";
import { activityAllowsDayPart, activityDayPartFit } from "@/lib/easyt/itinerary-schedule-awareness";
import { itineraryCalendarNightBands, itineraryCalendarWeeks, type ItineraryCalendarDay, type ItineraryCalendarItem, type ItineraryCalendarWeek } from "@/lib/easyt/itinerary-calendar";
import { itineraryTransportAgenda, type ItineraryTransportAgendaLeg } from "@/lib/easyt/itinerary-transport-agenda";
import { useWorkspaceOrientationReady, useWorkspaceOrientationTarget } from "@/components/easyt/workspace-orientation";
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
  /** Storybook/test override; production loads the server-only provider route. */
  initialActivityInventory?: Record<number, ActivityInventoryItem[]>;
};

type AddFlow = {
  dayNumber: number;
  noteIndex: number;
  kind: "activity" | "note";
  dayPart?: ItineraryDayPart;
};

type ActivityTarget = ItineraryActivityLocation & { title: string };
type PlannerDragItem =
  | { kind: "activity"; activity: ComposedItineraryActivity; sourceDayId: string; sourceStopId: string }
  | { kind: "suggestion"; idea: ItineraryIdea };

type MoveFlow = {
  activity: ComposedItineraryActivity;
  sourceDayId: string;
  targetDayId: string;
  targetDayPart: ItineraryDayPart | null;
};

const itineraryDayPartLabels: Record<"en" | "es", Record<ItineraryDayPart, string>> = {
  en: { morning: "Morning", midday: "Midday", afternoon: "Afternoon", evening: "Evening" },
  es: { morning: "Mañana", midday: "Mediodía", afternoon: "Tarde", evening: "Noche" },
};

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
    calendar: "Calendario",
    calendarHeading: "Todo tu viaje, semana a semana",
    calendarIntro: "Una vista continua de los días, traslados, planes y estancias de este viaje.",
    weekOf: "Semana del",
    day: "Día",
    arrival: "Llegada",
    departure: "Salida",
    fullDay: "Día completo",
    timeNotSet: "Hora por decidir",
    accommodation: "Estancia",
    booking: "Reserva",
    noCalendarPlans: "Sin planes guardados todavía",
    details: "Detalles",
    distance: "Distancia",
    confidence: "Confianza",
    planningSource: "Fuente de planificación",
    openBooking: "Abrir reserva",
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
    moveActivity: "Mover actividad",
    moveActivityEyebrow: "MOVER ACTIVIDAD",
    moveActivityDetail: "Elige otro día elegible en esta parada exacta de la ruta. Los planes existentes de ese día se conservarán.",
    moveTo: "Mover a",
    partOfDay: "Momento del día",
    undoActivityAction: "Deshacer acción de actividad",
    activityActionUndone: "Se deshizo la última acción de actividad",
    sameStopMoveError: "Elige un día en la misma parada de la ruta para esta actividad.",
    moveFailed: "Esta actividad no se pudo mover de forma segura.",
    movedToDay: "se movió al día",
    openTransport: "Abrir espacio de Transporte",
    mode: "Modo",
    duration: "Duración",
    confirmation: "Confirmación",
    provider: "Proveedor",
    transportDetails: "Detalles de transporte",
    transferToConfirm: "Traslado por confirmar",
    transportBookingSaved: "Reserva de transporte guardada",
    planningDetailsAvailable: "Detalles de planificación disponibles",
    confirmedTransport: "Transporte confirmado",
    confirmedBooking: "Reserva confirmada",
    savedBookingDetails: "Detalles de reserva guardados",
    unknownTiming: "Desconocida · horario por confirmar",
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
    addSuggestion: "Añadir",
    suggestionAdded: "Sugerencia añadida",
    suggestionsLoading: "Buscando lugares cercanos",
    suggestionsLoadingDetail: "Usando la ubicación guardada de este día sin cambiar tu plan.",
    suggestionsUnavailable: "Las sugerencias no están disponibles ahora.",
    noNewSuggestions: "No hay nuevas sugerencias locales; los lugares ya planificados se han excluido.",
    addDayNote: "Añadir nota del día",
    notePlaceholder: "Añade un recordatorio para este día",
  } : {
    draft: "Draft · editable",
    editBrief: "Edit brief",
    dayByDay: "Day by day",
    calendar: "Calendar",
    calendarHeading: "Your whole trip, week by week",
    calendarIntro: "A continuous view of this trip’s days, transfers, plans and stays.",
    weekOf: "Week of",
    day: "Day",
    arrival: "Arrival",
    departure: "Departure",
    fullDay: "Full day",
    timeNotSet: "Time not set",
    accommodation: "Stay",
    booking: "Booking",
    noCalendarPlans: "No saved plans yet",
    details: "Details",
    distance: "Distance",
    confidence: "Confidence",
    planningSource: "Planning source",
    openBooking: "Open booking",
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
    moveActivity: "Move activity",
    moveActivityEyebrow: "MOVE ACTIVITY",
    moveActivityDetail: "Choose another eligible day in this exact route stop. Existing plans on that day will be kept.",
    moveTo: "Move to",
    partOfDay: "Part of day",
    undoActivityAction: "Undo activity action",
    activityActionUndone: "Last activity action undone",
    sameStopMoveError: "Choose a day in the same route stop for this activity.",
    moveFailed: "This activity could not be moved safely.",
    movedToDay: "moved to Day",
    openTransport: "Open Transport workspace",
    mode: "Mode",
    duration: "Duration",
    confirmation: "Confirmation",
    provider: "Provider",
    transportDetails: "Transport details",
    transferToConfirm: "Transfer to confirm",
    transportBookingSaved: "Transport booking saved",
    planningDetailsAvailable: "Planning details available",
    confirmedTransport: "Confirmed transport",
    confirmedBooking: "Confirmed booking",
    savedBookingDetails: "Saved booking details",
    unknownTiming: "Unknown · timing to confirm",
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
    addSuggestion: "Add",
    suggestionAdded: "Suggestion added",
    suggestionsLoading: "Finding places nearby",
    suggestionsLoadingDetail: "Using this day’s saved location without changing your plan.",
    suggestionsUnavailable: "Suggestions are unavailable just now.",
    noNewSuggestions: "No new local suggestions; places already planned are excluded.",
    addDayNote: "Add day note",
    notePlaceholder: "Add a reminder for this day",
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
  if (mode === "mixed") return Route;
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

function providerDuration(activity: ComposedItineraryActivity) {
  const duration = activity.providerMetadata?.duration;
  if (!duration) return null;
  if (duration.fixedMinutes) return formatTripDuration(duration.fixedMinutes);
  if (duration.fromMinutes && duration.toMinutes) return `${formatTripDuration(duration.fromMinutes)}–${formatTripDuration(duration.toMinutes)}`;
  return duration.fromMinutes ? `From ${formatTripDuration(duration.fromMinutes)}` : duration.toMinutes ? `Up to ${formatTripDuration(duration.toMinutes)}` : null;
}

function providerPrice(activity: ComposedItineraryActivity) {
  const price = activity.providerMetadata?.price;
  if (!price) return null;
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: price.currency, maximumFractionDigits: 0 }).format(price.amount);
  } catch {
    return `${price.amount} ${price.currency}`;
  }
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
  initialActivityInventory,
}: ItineraryWorkspaceProps) {
  const shellMutation = useOptionalTripShellMutation();
  const localMutation = useTripMutationPersistence(trip, presentation === "shell" && !shellMutation);
  const mutation = shellMutation ?? localMutation;
  const workingTrip = mutation.trip;
  const days = useMemo(
    () => [...workingTrip.planItems].sort((left, right) => left.dayNumber - right.dayNumber),
    [workingTrip.planItems],
  );
  const [selectedIndex, updateSelectedIndex] = useState(() => Math.max(0, days.findIndex((day) => day.dayNumber === selectedDayNumber)));
  const [workspaceView, updateWorkspaceView] = useState<"days" | "calendar">("days");
  const writeOrientation = (dayIndex: number, view: "days" | "calendar") => {
    const day = days[dayIndex];
    if (!day || presentation !== "shell") return;
    const url = new URL(window.location.href);
    url.searchParams.set("itineraryDay", day.id);
    url.searchParams.set("itineraryView", view);
    window.history.pushState(window.history.state, "", url);
  };
  const setSelectedIndex = (dayIndex: number) => {
    updateSelectedIndex(dayIndex);
    writeOrientation(dayIndex, workspaceView);
  };
  const setWorkspaceView = (view: "days" | "calendar") => {
    updateWorkspaceView(view);
    writeOrientation(selectedIndex, view);
  };
  const [remoteImages, setRemoteImages] = useState<Record<string, JourneyImage>>({});
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedRecommendation, setSelectedRecommendation] = useState<ExploreResult | null>(null);
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
  const [plannerDrag, setPlannerDrag] = useState<PlannerDragItem | null>(null);
  const plannerDragRef = useRef<PlannerDragItem | null>(null);
  const [nativePlannerDrag, setNativePlannerDrag] = useState(false);
  const [openSavedPickerId, setOpenSavedPickerId] = useState<string | null>(null);
  const [plannerError, setPlannerError] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [undoReceipt, setUndoReceipt] = useState<ItineraryItemUndoReceipt | null>(null);
  const [moveFlow, setMoveFlow] = useState<MoveFlow | null>(null);
  const [moveError, setMoveError] = useState("");
  const moveOriginRef = useRef<HTMLElement | null>(null);
  const [railNoteDraft, setRailNoteDraft] = useState("");
  const [railNoteError, setRailNoteError] = useState("");
  const noteInputRef = useRef<HTMLInputElement>(null);
  const selectedItemOriginRef = useRef<HTMLButtonElement | null>(null);
  const calendarItemRequestRef = useRef<string | null>(null);
  const selectedDayRequestRef = useRef({ tripId: workingTrip.id, dayNumber: selectedDayNumber });
  const tabIdPrefix = useId().replaceAll(":", "");
  const copy = useMemo(() => itineraryCopy(language), [language]);
  const calendarWeeks = useMemo(() => itineraryCalendarWeeks(workingTrip), [workingTrip]);
  const activeDayId = days[Math.min(selectedIndex, Math.max(0, days.length - 1))]?.id ?? null;
  const destinations = useMemo(() => itineraryDestinationTrack(workingTrip, activeDayId), [workingTrip, activeDayId]);
  useEffect(() => {
    if (presentation !== "shell") return;
    const restoreOrientation = () => {
      const params = new URL(window.location.href).searchParams;
      const requested = days.findIndex((day) => day.id === params.get("itineraryDay"));
      updateSelectedIndex(requested >= 0 ? requested : Math.max(0, days.findIndex((day) => day.dayNumber === selectedDayNumber)));
      updateWorkspaceView(params.get("itineraryView") === "calendar" ? "calendar" : "days");
    };
    restoreOrientation();
    window.addEventListener("popstate", restoreOrientation);
    return () => window.removeEventListener("popstate", restoreOrientation);
  }, [workingTrip.id, presentation]);
  const closeSelectedDetail = useCallback(() => {
    setSelectedItemId(null);
    setSelectedRecommendation(null);
    const origin = selectedItemOriginRef.current;
    selectedItemOriginRef.current = null;
    window.requestAnimationFrame(() => origin?.focus());
  }, []);

  useEffect(() => {
    updateSelectedIndex((current) => Math.min(current, Math.max(0, days.length - 1)));
  }, [days.length]);

  useEffect(() => {
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setNativePlannerDrag(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const request = selectedDayRequestRef.current;
    if (request.tripId === workingTrip.id && request.dayNumber === selectedDayNumber) return;
    selectedDayRequestRef.current = { tripId: workingTrip.id, dayNumber: selectedDayNumber };
    if (!selectedDayNumber) return;
    const requestedIndex = days.findIndex((day) => day.dayNumber === selectedDayNumber);
    if (requestedIndex >= 0) setSelectedIndex(requestedIndex);
  }, [days, selectedDayNumber, workingTrip.id]);

  useEffect(() => {
    const requestedCalendarItem = calendarItemRequestRef.current;
    setSelectedItemId(requestedCalendarItem);
    calendarItemRequestRef.current = null;
    setSelectedRecommendation(null);
    if (!requestedCalendarItem) selectedItemOriginRef.current = null;
    setAddFlow(null);
    setAddDraft("");
    setAddError("");
    setEditingActivity(null);
    setEditError("");
    setOpenMenuId(null);
    setRemoveTarget(null);
    setRemoveError("");
    setDraggedActivity(null);
    plannerDragRef.current = null;
    setPlannerDrag(null);
    setOpenSavedPickerId(null);
    setPlannerError("");
    setMoveFlow(null);
    setMoveError("");
    setRailNoteDraft("");
    setRailNoteError("");
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
  const dayComposition = useMemo(
    () => active ? composeItineraryDay(workingTrip, active.id) : null,
    [active, workingTrip],
  );
  const selectedActivity = useMemo(() => {
    if (!dayComposition || !selectedItemId) return null;
    const activities = [...itineraryDayParts.flatMap((part) => dayComposition.planned[part]), ...dayComposition.unslotted];
    const selectedPinId = selectedItemId.startsWith("map-pin:") ? selectedItemId.slice("map-pin:".length) : null;
    return activities.find((activity) => activity.id === selectedItemId || (selectedPinId && activity.mapPinId === selectedPinId)) ?? null;
  }, [dayComposition, selectedItemId]);
  const selectedStayPinId = selectedItemId?.startsWith("stay:")
    ? (workingTrip.brief.mapPins ?? []).find((pin) => pin.dayNumber === active?.dayNumber && pin.category === "stay")?.id ?? null
    : null;
  const mapSelectionItemId = selectedActivity?.mapPinId
    ? `map-pin:${selectedActivity.mapPinId}`
    : selectedStayPinId
      ? `map-pin:${selectedStayPinId}`
      : selectedItemId;
  const mapContext = useMemo(
    () => active && dayMapContext ? itineraryDayMapSelection(dayMapContext, active, mapSelectionItemId) : null,
    [active, dayMapContext, mapSelectionItemId],
  );
  const itineraryDaysOrientationTarget = useWorkspaceOrientationTarget("itinerary", "itinerary-days");
  const itineraryPlannerOrientationTarget = useWorkspaceOrientationTarget("itinerary", "itinerary-planner");
  const itinerarySuggestionsOrientationTarget = useWorkspaceOrientationTarget("itinerary", "itinerary-suggestions");
  useWorkspaceOrientationReady(
    "itinerary",
    Boolean(presentation === "shell" && active && mapContext && dayComposition),
    mutation.saveState === "error" || Boolean(removeTarget),
  );

  if (!active || !mapContext) {
    const emptyState = (
      <div className={styles.empty} aria-live="polite">
        <CalendarDays aria-hidden="true" />
        <h2>Itinerary to confirm</h2>
        <p>{copy.itineraryEmpty}</p>
      </div>
    );
    if (presentation === "legacy") return emptyState;
    return (
      <section className={`${styles.workspace} ${styles.emptyWorkspace}`} aria-label="Trip itinerary">
        <ItinerarySubviewSwitch value={workspaceView} onChange={setWorkspaceView} copy={copy} />
        {emptyState}
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
            <h2>{tripDisplayTitle(trip)}</h2>
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
  const stayBooking = stop ? stayBookingForStop(workingTrip, stop) ?? null : null;
  const dayNotes = workingTrip.brief.dayNotes?.[active.dayNumber] ?? [];
  const customActivities = workingTrip.brief.customActivities?.[active.dayNumber] ?? [];
  const recommendations = workingTrip.recommendations.filter((recommendation) => recommendation.status === "open" && recommendation.affectedDays.includes(active.dayNumber));
  const logisticsLegs = itineraryDayLegs(workingTrip, active);
  const transportAgenda = itineraryTransportAgenda(workingTrip);
  const selectedTransportAgenda = selectedItemId?.startsWith("leg-")
    ? transportAgenda.find((item) => item.leg.id === selectedItemId.slice(4)) ?? null
    : null;
  const representedTransportBookingIds = new Set(logisticsLegs.flatMap((leg) => {
    const bookingId = transportAgenda.find((item) => item.leg.id === leg.id)?.booking?.id;
    return bookingId ? [bookingId] : [];
  }));
  const otherDayBookings = dayBookings.filter((booking) => booking.type !== "stay" && !representedTransportBookingIds.has(booking.id));
  const selectedBooking = selectedItemId?.startsWith("booking:")
    ? (workingTrip.brief.bookings ?? []).find((booking) => booking.id === selectedItemId.slice("booking:".length)) ?? null
    : null;
  const experienceAction = activityAction === undefined ? getCurrentPartnerAction("activities") : activityAction;
  const unscheduledSavedIdeas = (workingTrip.brief.itineraryIdeas ?? []).filter((idea) => idea.stopId === active.stopId && !idea.dayId);
  const mapPlanHref = mapWorkspaceHref(workingTrip.id, active.stopId, "plan", active.dayNumber);
  const mapIdeasHref = mapWorkspaceHref(workingTrip.id, active.stopId, "see", active.dayNumber);
  const selectedItemMapHref = selectedActivity
    ? selectedActivity.mapPinId
      ? mapWorkspaceHref(
        workingTrip.id,
        active.stopId,
        selectedActivity.category === "restaurant" ? "eat" : "see",
        active.dayNumber,
        mapResultSelectionIdForIdea(selectedActivity.id),
      )
      : null
    : selectedStayPinId
      ? mapWorkspaceHref(workingTrip.id, active.stopId, "stay", active.dayNumber, `saved:${selectedStayPinId}`)
      : null;
  const selectedRecommendationState = selectedRecommendation
    ? ideaStateForPlace(workingTrip, selectedRecommendation.stopId, selectedRecommendation.idea.placeId)
    : null;
  const selectedRecommendationPart = selectedRecommendation
    ? activityDayPartFit(selectedRecommendation.idea.providerMetadata?.duration) === "slot"
      ? preferredItineraryDayPart(workingTrip, active.id, selectedRecommendation.idea.category)
      : null
    : null;
  const selectedRecommendationMapDayNumber = selectedRecommendationState?.state === "planned"
    ? selectedRecommendationState.day.dayNumber
    : active.dayNumber;
  const selectedRecommendationMapSelectionId = selectedRecommendation && selectedRecommendationState
    ? selectedRecommendationState.state === "available"
      ? mapResultSelectionId(selectedRecommendation.kind === "restaurant" ? "eat" : "see", selectedRecommendation.sourceId, selectedRecommendation.stopId)
      : mapResultSelectionIdForIdea(selectedRecommendationState.idea.id)
    : null;
  const selectedRecommendationMapHref = selectedRecommendation?.coordinates && selectedRecommendationMapSelectionId
    ? mapWorkspaceHref(
      workingTrip.id,
      selectedRecommendation.stopId,
      selectedRecommendation.kind === "restaurant" ? "eat" : "see",
      selectedRecommendationMapDayNumber,
      selectedRecommendationMapSelectionId,
      mapResultHandoffForExploreResult(selectedRecommendation, selectedRecommendationMapSelectionId, selectedRecommendationMapDayNumber),
    )
    : null;
  const dayPendingKey = `itinerary-day-${active.dayNumber}`;
  const dayPending = mutation.isPending(dayPendingKey);
  const firstVisibleNoteIndex = displayNotes[0]?.sourceIndex ?? active.notes.length;
  const selectedDetail: ItineraryItemDetailModel | null = selectedRecommendation && selectedRecommendationState
    ? recommendationDetailForExploreResult({
      trip: workingTrip,
      result: selectedRecommendation,
      state: selectedRecommendationState,
      context: { surface: "itinerary", activeDayId: active.id, activeDayPart: selectedRecommendationPart },
    })
    : (() => {
    if (selectedActivity) {
      const rating = selectedActivity.providerMetadata?.rating;
      const reviews = selectedActivity.providerMetadata?.reviewCount;
      const booking = selectedActivity.booking;
      return {
        id: selectedActivity.id,
        kind: selectedActivity.category === "restaurant" ? "restaurant" : "activity",
        title: selectedActivity.title,
        location: selectedActivity.area ?? stop?.name ?? null,
        summary: selectedActivity.description ?? null,
        image: selectedActivity.image ?? null,
        category: selectedActivity.placeType ?? (selectedActivity.category === "restaurant" ? "Restaurant" : "Activity"),
        duration: providerDuration(selectedActivity),
        price: providerPrice(selectedActivity),
        dateSummary: `${displayDayDate(active.date, language)}${selectedActivity.dayPart ? ` · ${itineraryDayPartLabels[language][selectedActivity.dayPart]}` : ""}`,
        bookingStatus: booking?.confirmation ? "Confirmed" : booking ? "Saved booking" : null,
        bookingHref: booking?.url ?? selectedActivity.sourceUrl ?? null,
        whyFit: active.reason || null,
        practical: [
          ...(rating ? [{ label: "Rating", value: `${rating}${reviews ? ` · ${reviews.toLocaleString()} reviews` : ""}` }] : []),
          ...(booking?.confirmation ? [{ label: "Booking", value: "Confirmed" }] : []),
          ...(!selectedActivity.mapPinId ? [{ label: "Map", value: "Unavailable · No trustworthy coordinates are attached to this item yet." }] : []),
        ],
        dayPart: selectedActivity.dayPart,
        canMoveTime: selectedActivity.dayPartEditable
          && activityAllowsDayPart(selectedActivity.providerMetadata?.duration, "morning"),
        canRemove: !booking && (selectedActivity.source === "itinerary-idea" || selectedActivity.source === "authored-activity"),
      };
    }
    if (selectedItemId?.startsWith("stay:") && stayBooking && stop) {
      const nights = stop.nights ?? 0;
      return {
        id: stayBooking.id,
        kind: "accommodation",
        title: stayBooking.title,
        location: stayBooking.location ?? stayBooking.importDetails?.location ?? stop.name,
        summary: stayBooking.notes?.join(" ") ?? null,
        category: "Accommodation",
        dateSummary: [stop.arrivalDate ? displayDate(stop.arrivalDate, language, true) : null, stop.departureDate ? displayDate(stop.departureDate, language, true) : null].filter(Boolean).join(" – "),
        duration: nights ? `${nights} ${nights === 1 ? "night" : "nights"}` : null,
        bookingStatus: stayBooking.confirmation ? "Confirmed" : "Saved",
        bookingHref: stayBooking.url,
        practical: [
          ...(stayBooking.importDetails?.provider ? [{ label: "Provider", value: stayBooking.importDetails.provider }] : []),
          ...(stayBooking.confirmation ? [{ label: "Booking", value: "Confirmation saved" }] : []),
          ...(!selectedStayPinId ? [{ label: "Map", value: "Unavailable · No trustworthy coordinates are attached to this stay yet." }] : []),
        ],
        canRemove: true,
      };
    }
    return null;
  })();
  const hasSelectedDetail = Boolean(selectedDetail || selectedTransportAgenda || selectedBooking);
  const hasContextRail = workspaceView === "days" || hasSelectedDetail;
  const selectedCalendarDay = calendarWeeks.flatMap((week) => week.days).find((day) => day?.id === active.id) ?? null;

  const openAddFlow = (noteIndex: number, kind: AddFlow["kind"] = "activity", dayPart?: ItineraryDayPart) => {
    setAddFlow({ dayNumber: active.dayNumber, noteIndex, kind, dayPart });
    setAddDraft("");
    setAddError("");
    setOpenMenuId(null);
  };

  const submitAddFlow = () => {
    if (!addFlow) return;
    let mutationReason = "";
    let receipt: ItineraryItemUndoReceipt | null = null;
    const accepted = mutation.mutateTrip((current) => {
      if (addFlow.kind === "activity") {
        const result = addItineraryActivityWithUndo(current, addFlow.dayNumber, addFlow.noteIndex, addDraft, addFlow.dayPart);
        mutationReason = result.reason ?? "";
        receipt = result.undo ?? null;
        return result.trip;
      }
      const result = addItineraryDayNote(current, addFlow.dayNumber, addDraft);
      mutationReason = result.reason ?? "";
      return result.trip;
    }, `itinerary-day-${addFlow.dayNumber}`);
    if (!accepted) {
      setAddError(mutationReason || "This change could not be stored safely.");
      return;
    }
    setNotice(addFlow.kind === "activity" ? copy.activityAdded : copy.noteAdded);
    setUndoReceipt(receipt);
    setAddFlow(null);
    setAddDraft("");
    setAddError("");
  };

  const submitRailNote = () => {
    if (!railNoteDraft.trim()) {
      setRailNoteError("Add a note before saving.");
      noteInputRef.current?.focus();
      return;
    }
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

  const scheduleIdea = (idea: ItineraryIdea, dayId: string, requestedPart?: ItineraryDayPart | null) => {
    let scheduledPart: ItineraryDayPart | null = requestedPart ?? null;
    let receipt: ItineraryItemUndoReceipt | null = null;
    const accepted = mutation.mutateTrip((current) => {
      const preferredPart = requestedPart === undefined
        ? activityDayPartFit(idea.providerMetadata?.duration) === "slot"
          ? preferredItineraryDayPart(current, dayId, idea.category)
          : null
        : requestedPart;
      scheduledPart = activityAllowsDayPart(idea.providerMetadata?.duration, preferredPart) ? preferredPart : null;
      const result = scheduleItineraryIdeaWithUndo(current, idea, dayId, scheduledPart);
      receipt = result.undo ?? null;
      return result.trip;
    }, `itinerary-suggestion-${idea.stopId}-${idea.placeId}`);
    if (!accepted) return false;
    setUndoReceipt(receipt);
    const target = workingTrip.planItems.find((day) => day.id === dayId);
    const partLabel = scheduledPart ? scheduledPart[0]!.toUpperCase() + scheduledPart.slice(1) : null;
    setNotice(target && partLabel
      ? `${idea.title} added to ${target.id === active.id ? partLabel : `Day ${target.dayNumber} · ${partLabel}`}`
      : copy.suggestionAdded);
    trackEvent("attraction_selected", { trip_id: workingTrip.id, stop_id: active.stopId, source: "itinerary_rail" });
    return true;
  };

  const beginPlannerDrag = (dragged: PlannerDragItem) => {
    plannerDragRef.current = dragged;
    setPlannerDrag(dragged);
  };

  const clearPlannerDrag = () => {
    plannerDragRef.current = null;
    setPlannerDrag(null);
  };

  const dropPlannerItem = (dayPart: ItineraryDayPart, insertionIndex: number) => {
    const dragged = plannerDragRef.current ?? plannerDrag;
    if (!dragged) return;
    clearPlannerDrag();
    setPlannerError("");
    if (dragged.kind === "suggestion") {
      let mutationReason = "";
      let receipt: ItineraryItemUndoReceipt | null = null;
      const accepted = mutation.mutateTrip((current) => {
        const result = scheduleItineraryIdeaAtPositionWithUndo(current, dragged.idea, active.id, dayPart, insertionIndex);
        mutationReason = result.reason ?? "";
        receipt = result.undo ?? null;
        return result.trip;
      }, `itinerary-suggestion-${dragged.idea.stopId}-${dragged.idea.placeId}`);
      if (accepted) { setUndoReceipt(receipt); setNotice(`${dragged.idea.title} added to ${dayPart[0]!.toUpperCase()}${dayPart.slice(1)}`); }
      else if (mutationReason && !mutationReason.includes("already")) setPlannerError(mutationReason);
      return;
    }
    let mutationReason = "";
    const accepted = mutation.mutateTrip((current) => {
      const result = placeItineraryActivity(current, active.id, dragged.activity.id, dayPart, insertionIndex);
      mutationReason = result.reason ?? "";
      return result.trip;
    }, `itinerary-activity-place-${dragged.activity.id}`);
    if (accepted) setNotice(`${dragged.activity.title} moved to ${dayPart[0]!.toUpperCase()}${dayPart.slice(1)}`);
    else if (mutationReason && !mutationReason.includes("already")) setPlannerError(mutationReason);
  };

  const changeActivityDayPart = (activity: ComposedItineraryActivity, dayPart: ItineraryDayPart | null) => {
    let mutationReason = "";
    const accepted = mutation.mutateTrip((current) => {
      if (activity.source === "itinerary-idea") {
        if (!activityAllowsDayPart(activity.providerMetadata?.duration, dayPart)) {
          mutationReason = "This activity needs most of the day and cannot fit in one part of the day.";
          return current;
        }
        return assignItineraryIdeaDayPart(current, activity.id, dayPart);
      }
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
    closeSelectedDetail();
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

  const eligibleMoveDays = (sourceDayId: string) => {
    const sourceDay = workingTrip.planItems.find((day) => day.id === sourceDayId);
    return sourceDay ? days.filter((day) => day.stopId === sourceDay.stopId) : [];
  };

  const openMoveFlow = (activity: ComposedItineraryActivity, sourceDayId: string, origin?: HTMLElement | null) => {
    const options = eligibleMoveDays(sourceDayId);
    if (options.length < 2 || activity.booking || !activity.dayPartEditable) return;
    const targetDay = options.find((day) => day.id !== sourceDayId) ?? options[0]!;
    moveOriginRef.current = origin ?? null;
    setSelectedItemId(null);
    setSelectedRecommendation(null);
    setMoveError("");
    setMoveFlow({ activity, sourceDayId, targetDayId: targetDay.id, targetDayPart: activity.dayPart });
  };

  const closeMoveFlow = () => {
    const origin = moveOriginRef.current;
    setMoveFlow(null);
    setMoveError("");
    moveOriginRef.current = null;
    window.requestAnimationFrame(() => {
      if (origin?.isConnected) origin.focus();
      else document.querySelector<HTMLElement>(`[data-itinerary-activity-id="${CSS.escape(moveFlow?.activity.id ?? "")}"] button`)?.focus();
    });
  };

  const moveCanonicalActivity = (
    activity: ComposedItineraryActivity,
    sourceDayId: string,
    targetDayId: string,
    targetDayPart: ItineraryDayPart | null,
  ) => {
    let mutationReason = "";
    let receipt: ItineraryItemUndoReceipt | null = null;
    const accepted = mutation.mutateTrip((current) => {
      const result = moveItineraryActivityAcrossDays(current, sourceDayId, activity.id, targetDayId, targetDayPart);
      mutationReason = result.reason ?? "";
      receipt = result.undo ?? null;
      return result.trip;
    }, `itinerary-activity-move-${activity.id}`);
    if (!accepted) {
      setMoveError(mutationReason || copy.moveFailed);
      setPlannerError(mutationReason || copy.moveFailed);
      return false;
    }
    const targetIndex = days.findIndex((day) => day.id === targetDayId);
    setUndoReceipt(receipt);
    setNotice(`${activity.title} ${copy.movedToDay} ${days[targetIndex]?.dayNumber ?? ""}`.trim());
    setPlannerError("");
    if (targetIndex >= 0) setSelectedIndex(targetIndex);
    return true;
  };

  const submitMoveFlow = () => {
    if (!moveFlow) return;
    if (moveCanonicalActivity(moveFlow.activity, moveFlow.sourceDayId, moveFlow.targetDayId, moveFlow.targetDayPart)) {
      setMoveFlow(null);
      setMoveError("");
      moveOriginRef.current = null;
    }
  };

  const undoLastItemAction = () => {
    if (!undoReceipt) return;
    let mutationReason = "";
    const accepted = mutation.mutateTrip((current) => {
      const result = undoItineraryItemAction(current, undoReceipt);
      mutationReason = result.reason ?? "";
      return result.trip;
    }, "itinerary-item-undo");
    if (!accepted) {
      setPlannerError(mutationReason || "This item changed after the action and was not undone.");
      return;
    }
    setUndoReceipt(null);
    setNotice(copy.activityActionUndone);
  };

  const dropCalendarItem = (targetDay: ItineraryCalendarDay) => {
    const dragged = plannerDragRef.current ?? plannerDrag;
    if (!dragged) return;
    clearPlannerDrag();
    if (dragged.kind === "suggestion") {
      if (dragged.idea.stopId !== targetDay.day.stopId) {
        setPlannerError(copy.sameStopMoveError);
        return;
      }
      scheduleIdea(dragged.idea, targetDay.id);
      return;
    }
    moveCanonicalActivity(dragged.activity, dragged.sourceDayId, targetDay.id, dragged.activity.dayPart);
  };

  const currentWeekIndex = calendarWeeks.findIndex((week) => week.days.some((day) => day?.id === active.id));
  const navigatePeriod = (direction: -1 | 1) => {
    if (workspaceView === "days") { setSelectedIndex(Math.max(0, Math.min(days.length - 1, index + direction))); return; }
    const next = calendarWeeks[currentWeekIndex + direction]?.days.find((day) => day !== null);
    if (next) setSelectedIndex(days.findIndex((day) => day.id === next.id));
  };
  const now = new Date();
  const todayDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const todayIndex = days.findIndex((day) => day.date === todayDate);

  return (
    <section className={`${styles.workspace} ${workspaceView === "calendar" ? styles.calendarWorkspace : ""} ${hasContextRail ? "" : styles.workspaceWithoutContext}`} aria-label="Trip itinerary">
      <header ref={itineraryDaysOrientationTarget} className={styles.workspaceToolbar}>
        <div><h2>{workspaceView === "calendar" ? copy.calendar : copy.dayByDay}</h2><p>{displayDate(days[0]!.date, language, true)} – {displayDate(days[days.length - 1]!.date, language)} · {days.length} days</p></div>
        <div className={styles.dateNavigation}>
          {todayIndex >= 0 ? <EasyTButton size="small" variant="quiet" onClick={() => setSelectedIndex(todayIndex)}>Today</EasyTButton> : null}
          <EasyTButton icon={ChevronLeft} iconOnly size="small" variant="secondary" disabled={workspaceView === "calendar" ? currentWeekIndex <= 0 : index === 0} onClick={() => navigatePeriod(-1)}>{workspaceView === "calendar" ? "Previous week" : copy.previousDay}</EasyTButton>
          <EasyTSelect label="Jump to date / destination" value={active.id} onChange={(event) => setSelectedIndex(days.findIndex((day) => day.id === event.target.value))}>
            {days.map((day) => <option key={day.id} value={day.id}>{displayDayDate(day.date, language)} · Day {day.dayNumber} · {stopForDay(workingTrip, day)?.name ?? day.title}</option>)}
          </EasyTSelect>
          <EasyTButton icon={ChevronRight} iconOnly size="small" variant="secondary" disabled={workspaceView === "calendar" ? currentWeekIndex === calendarWeeks.length - 1 : index === days.length - 1} onClick={() => navigatePeriod(1)}>{workspaceView === "calendar" ? "Next week" : copy.nextDay}</EasyTButton>
        </div>
        <ItinerarySubviewSwitch value={workspaceView} onChange={setWorkspaceView} copy={copy} />
      </header>
      <nav className={styles.destinationTrack} aria-label={language === "es" ? "Destinos de la ruta" : "Route destinations"}>
        <ol>{destinations.map((destination, destinationIndex) => <li key={destination.stop.id}>
          <EasyTButton
            className={styles.destinationJump}
            variant="quiet"
            aria-current={destination.active ? "step" : undefined}
            aria-label={`${language === "es" ? "Parada" : "Stop"} ${destinationIndex + 1}: ${destination.stop.name}${destination.firstDayNumber === null ? "" : `, ${copy.day} ${destination.firstDayNumber}`}`}
            disabled={destination.firstDayNumber === null}
            onClick={() => {
              const dayIndex = days.findIndex((day) => day.dayNumber === destination.firstDayNumber);
              if (dayIndex >= 0) setSelectedIndex(dayIndex);
            }}
          ><b>{destinationIndex + 1}</b><span>{destination.stop.name}</span></EasyTButton>
        </li>)}</ol>
      </nav>
      {workspaceView === "calendar" ? <ItineraryCalendar
        weeks={calendarWeeks.filter((week) => week.days.some((day) => day?.id === active.id))}
        selectedDayId={active.id}
        copy={copy}
        language={language}
        dragItem={plannerDrag}
        nativeDrag={nativePlannerDrag}
        onDragStart={(day, activity, event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", activity.id);
          beginPlannerDrag({ kind: "activity", activity, sourceDayId: day.id, sourceStopId: day.day.stopId });
        }}
        onDragEnd={clearPlannerDrag}
        onDrop={dropCalendarItem}
        onSelect={(day, item, origin) => {
        const itemId = item?.kind === "activity" ? item.activity.id : item?.kind === "accommodation" ? `stay:${item.booking.id}` : item?.kind === "transfer" ? `leg-${item.agenda.leg.id}` : item?.kind === "booking" ? `booking:${item.booking.id}` : null;
        selectedItemOriginRef.current = origin ?? null;
        if (day.id !== active.id) { calendarItemRequestRef.current = itemId; setSelectedIndex(days.findIndex((candidate) => candidate.id === day.id)); return; }
        setSelectedRecommendation(null);
        setSelectedItemId(itemId);
      }} /> : null}
      {workspaceView === "days" ? <nav className={styles.rail} aria-label={copy.dayByDay}>
        <div className={styles.railHeader}><h2>{copy.dayByDay}</h2><span>{days.length} {copy.days}</span></div>
        <div className={styles.dayList} role="tablist" aria-label={copy.dayByDay}>
          {days.map((day, dayIndex) => {
            const dayStop = stopForDay(workingTrip, day);
            const DayIcon = iconForPlanItem(day.type);
            // morrovia-ui-audit-allow-next-line native-control -- Restored itinerary day tab has its own roving-focus keyboard contract.
            return <button
              type="button"
              role="tab"
              aria-selected={dayIndex === index}
              aria-controls={`${tabIdPrefix}-days-panel`}
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
                    : event.key === "Home" ? 0 : event.key === "End" ? days.length - 1 : null;
                if (nextIndex === null) return;
                event.preventDefault();
                setSelectedIndex(nextIndex);
                window.requestAnimationFrame(() => document.getElementById(`${tabIdPrefix}-tab-${nextIndex}`)?.focus());
              }}
            >
              <b>{pad(day.dayNumber)}</b>
              <span><strong>{dayStop?.name ?? day.title}</strong><small>{day.title}</small></span>
              <span className={styles.dayMeta}><time dateTime={day.date}>{displayDate(day.date, language, true)}</time><DayIcon aria-hidden="true" /></span>
            </button>;
          })}
        </div>
      </nav> : null}
      <div
        className={styles.dayPanel}
        role={workspaceView === "days" ? "tabpanel" : "region"}
        id={`${tabIdPrefix}-days-panel`}
        aria-labelledby={workspaceView === "days" ? `${tabIdPrefix}-tab-${index}` : undefined}
        aria-label={workspaceView === "calendar" ? `${copy.day} ${active.dayNumber}: ${stop?.name ?? active.title}` : undefined}
      >
        <header className={styles.dayHeader}>
          <div>
            <p><span>DAY {pad(active.dayNumber)}</span><i aria-hidden="true">·</i><time dateTime={active.date}>{displayDayDate(active.date, language)}</time></p>
            <h2>{stop?.name ?? active.title}</h2>
            <span className={styles.dayRole}>{active.title}</span>
          </div>
        </header>

        {mutation.saveState === "error" ? <div className={styles.recoveryFeedback}><MorroviaRecoveryFeedback
          title={mutation.failure === "conflict" ? "This trip changed on another device" : mutation.failure === "auth" ? "Sign in to finish saving" : mutation.failure === "recovery" ? "You have newer changes on this device" : "Couldn’t save to your account"}
          detail={mutation.error}
          safety={mutation.failure === "recovery" ? "Both versions remain protected while you review the device changes." : "The account copy was not overwritten. Any durable device edit remains in Morrovia recovery."}
          actions={mutation.failure === "recovery" ? <EasyTLinkButton href={tripSyncRecoveryPath(workingTrip.id)} size="small" variant="secondary">Review device changes</EasyTLinkButton> : undefined}
        /></div> : null}
        {plannerError ? <div className={styles.recoveryFeedback}><MorroviaRecoveryFeedback
          title="Couldn’t move this activity"
          detail={plannerError}
          safety="Your itinerary is unchanged. Try the part-of-day control instead."
        /></div> : null}
        {notice ? <div className={styles.notice}><MorroviaBriefNotice
          title={notice}
          autoDismissMs={undoReceipt ? undefined : 3200}
          action={undoReceipt ? <EasyTButton icon={RotateCcw} size="small" variant="secondary" onClick={undoLastItemAction}>{copy.undoActivityAction}</EasyTButton> : undefined}
          onDismiss={() => { setNotice(null); setUndoReceipt(null); }}
        /></div> : null}

        {workspaceView === "days" && dayComposition ? <SelectedDayStayContext
          composition={dayComposition}
          tripId={workingTrip.id}
          onSelect={stayBooking ? (trigger) => {
            selectedItemOriginRef.current = trigger;
            setSelectedItemId(`stay:${stayBooking.id}`);
          } : undefined}
        /> : null}

        {workspaceView === "calendar" && selectedCalendarDay && dayComposition ? <CalendarSelectedDaySummary
          day={selectedCalendarDay}
          composition={dayComposition}
          tripId={workingTrip.id}
          copy={copy}
          language={language}
          onOpenDay={() => setWorkspaceView("days")}
          onSelect={(item, origin) => {
            selectedItemOriginRef.current = origin;
            setSelectedRecommendation(null);
            setSelectedItemId(item.kind === "activity" ? item.activity.id : item.kind === "transfer" ? `leg-${item.agenda.leg.id}` : item.kind === "booking" ? `booking:${item.booking.id}` : `stay:${item.booking.id}`);
          }}
        /> : null}

        {workspaceView === "days" && dayComposition ? <div ref={itineraryPlannerOrientationTarget} className={styles.details} aria-busy={dayPending || undefined}>
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
            onMoveToDay={(activity, trigger) => openMoveFlow(activity, active.id, trigger)}
            dragActive={workspaceView === "days" && Boolean(plannerDrag)}
            draggedActivityId={plannerDrag?.kind === "activity" ? plannerDrag.activity.id : null}
            onActivityDragStart={nativePlannerDrag && workspaceView === "days" ? (activity, event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", activity.id);
              beginPlannerDrag({ kind: "activity", activity, sourceDayId: active.id, sourceStopId: active.stopId });
            } : undefined}
            onActivityDragEnd={nativePlannerDrag && workspaceView === "days" ? clearPlannerDrag : undefined}
            onActivityDrop={workspaceView === "days" ? dropPlannerItem : undefined}
            selectedActivityId={selectedActivity?.id ?? null}
            onActivitySelect={(activity, trigger) => {
              selectedItemOriginRef.current = trigger;
              setSelectedItemId(activity.id);
            }}
            selectedTransferId={selectedTransportAgenda?.leg.id ?? null}
            onTransferSelect={(transferId, trigger) => {
              selectedItemOriginRef.current = trigger;
              setSelectedRecommendation(null);
              setSelectedItemId(`leg-${transferId}`);
            }}
            onTonightSelect={stayBooking ? (trigger) => {
              selectedItemOriginRef.current = trigger;
              setSelectedItemId(`stay:${stayBooking.id}`);
            } : undefined}
            selectedTonight={Boolean(selectedItemId?.startsWith("stay:"))}
            showHeader={false}
            showTonight={false}
          />
        </div> : null}

        {workspaceView === "days" ? <details className={styles.sequenceEditor}>
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
                onDragStart={nativePlannerDrag ? () => setDraggedActivity(target) : undefined}
                onDragEnd={nativePlannerDrag ? () => setDraggedActivity(null) : undefined}
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
        </details> : null}
      </div>

      {hasContextRail ? <aside className={`${styles.contextRail} ${selectedDetail || selectedTransportAgenda || selectedBooking ? styles.contextRailDetail : ""}`} aria-label={selectedDetail || selectedTransportAgenda || selectedBooking ? "Selected itinerary item details" : "Selected day planning context"}>
        {selectedTransportAgenda ? <ItineraryLogisticsDetail
          trip={workingTrip}
          agenda={selectedTransportAgenda}
          language={language}
          onClose={closeSelectedDetail}
        /> : selectedBooking ? <ItineraryLogisticsDetail
          trip={workingTrip}
          booking={selectedBooking}
          language={language}
          onClose={closeSelectedDetail}
        /> : selectedDetail ? <ItineraryItemDetail
          detail={selectedDetail}
          mapHref={selectedRecommendation ? selectedRecommendationMapHref : selectedItemMapHref}
          pending={selectedRecommendation ? mutation.isPending(`itinerary-suggestion-${selectedRecommendation.stopId}-${selectedRecommendation.idea.placeId}`) : selectedActivity ? mutation.isPending(`itinerary-activity-day-part-${selectedActivity.id}`) : stayBooking ? mutation.isPending(`itinerary-stay-${stop?.id}`) : false}
          onClose={closeSelectedDetail}
          primaryActions={selectedRecommendation && selectedRecommendationState ? <>
            {selectedRecommendationState.state !== "planned" ? <EasyTButton
              icon={CirclePlus}
              fullWidth
              onClick={() => scheduleIdea(selectedRecommendation.idea, active.id, selectedRecommendationPart ?? undefined)}
            >Add to Day {active.dayNumber}</EasyTButton> : null}
            {selectedRecommendationState.state === "available" ? <EasyTButton
              variant="secondary"
              onClick={() => {
                const accepted = mutation.mutateTrip((current) => saveItineraryIdea(current, selectedRecommendation.idea), `itinerary-suggestion-${selectedRecommendation.stopId}-${selectedRecommendation.idea.placeId}`);
                if (accepted) setNotice("Idea saved");
              }}
            >Save for later</EasyTButton> : null}
            {selectedRecommendation.provider === "viator" && selectedRecommendation.providerUrl ? <><MorroviaAffiliateLink
              action={{ provider: "viator", category: "activities", href: selectedRecommendation.providerUrl, cta: "View on Viator", affiliate: true }}
              context={{ placement: "itinerary_day_experiences", tripId: workingTrip.id, stopId: selectedRecommendation.stopId, workspaceView: "itinerary" }}
              variant="secondary"
            /><MorroviaAffiliateDisclosure className={styles.commercialDisclosure} provider="viator" /></> : null}
          </> : selectedActivity && selectedActivity.dayPartEditable && !selectedActivity.booking && eligibleMoveDays(active.id).length > 1 ? <EasyTButton
            fullWidth
            variant="secondary"
            onClick={(event) => openMoveFlow(selectedActivity, active.id, event.currentTarget)}
          >Move to…</EasyTButton> : undefined}
          onDayPartChange={selectedActivity?.dayPartEditable
            && activityAllowsDayPart(selectedActivity.providerMetadata?.duration, "morning")
            ? (part) => changeActivityDayPart(selectedActivity, part)
            : undefined}
          onManage={!selectedActivity && stayBooking && stop ? () => {
            closeSelectedDetail();
            window.location.assign(stayWorkspaceHref(workingTrip.id, stop.id));
          } : undefined}
          manageLabel="Manage stay"
          onRemove={selectedRecommendation && selectedRecommendationState?.state !== "available" ? () => {
            const accepted = mutation.mutateTrip((current) => removeItineraryIdea(current, selectedRecommendationState!.idea.id), `itinerary-suggestion-${selectedRecommendation.stopId}-${selectedRecommendation.idea.placeId}`);
            if (accepted) { closeSelectedDetail(); setNotice("Removed from itinerary"); }
          } : selectedActivity ? () => {
            if (selectedActivity.source === "itinerary-idea" && selectedActivity.placeId) {
              const accepted = mutation.mutateTrip((current) => removeItineraryIdea(current, selectedActivity.id), `itinerary-idea-remove-${selectedActivity.id}`);
              if (accepted) { closeSelectedDetail(); setNotice(copy.activityRemoved); }
              return;
            }
            if (selectedActivity.source === "authored-activity" && selectedActivity.noteIndex !== null) {
              setRemoveTarget({ dayNumber: active.dayNumber, noteIndex: selectedActivity.noteIndex, title: selectedActivity.title });
              setRemoveError("");
            }
          } : stayBooking && stop ? () => {
            const changed = mutation.mutateTrip((current) => removeStayBooking(current, stop.id), `itinerary-stay-${stop.id}`);
            if (changed) { closeSelectedDetail(); setNotice("Stay removed"); }
          } : undefined}
        /> : null}
        {workspaceView === "days" ? <div className={styles.contextRailBody} hidden={Boolean(selectedDetail || selectedTransportAgenda || selectedBooking)}>
        {mapContext.stops.length || mapContext.pins.length ? <details className={styles.contextSection} open>
          <summary><span>{copy.dayMap}</span><MapPin aria-hidden="true" /></summary>
          <div className={styles.mapPreview}>
            {!selectedDetail ? <JourneyPlannerMap
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
              surface={{ variant: "embedded", interaction: "selection-only" }}
              previewLabel={`${copy.mapPreview}: ${stop?.name ?? active.title}`}
              cameraSafeEdge={24}
              onMapPinDrop={() => undefined}
              onPlannerPinSelect={(pin) => setSelectedItemId(itinerarySelectionForMapPin(pin, active))}
              onLegSelect={(leg) => setSelectedItemId(`leg-${leg.id}`)}
              onSelect={() => undefined}
            /> : null}
          </div>
          <EasyTLinkButton className={styles.contextAction} href={mapPlanHref} icon={MapIcon} size="small" variant="quiet" fullWidth>{copy.openFullMap}</EasyTLinkButton>
        </details> : null}

        {logisticsLegs.length || otherDayBookings.length ? <details className={styles.contextSection} open>
          <summary><span>{copy.logistics}</span><span className={styles.sectionCount}>{otherDayBookings.length + logisticsLegs.length}</span></summary>
          <div className={styles.contextList}>
            {logisticsLegs.map((leg) => <LogisticsLeg leg={leg} trip={workingTrip} copy={copy} key={leg.id} selected={selectedItemId === `leg-${leg.id}`} onSelect={(origin) => { selectedItemOriginRef.current = origin; setSelectedItemId(`leg-${leg.id}`); }} />)}
            {otherDayBookings.map((booking) => <BookingCard booking={booking} copy={copy} key={booking.id} selected={selectedItemId === `booking:${booking.id}`} onSelect={(origin) => { selectedItemOriginRef.current = origin; setSelectedItemId(`booking:${booking.id}`); }} />)}
          </div>
        </details> : null}

        <TripExplicitPlans
          trip={workingTrip}
          variant="itinerary"
          pending={(key) => mutation.isPending(key)}
          onSchedule={(mentionId, dayId) => {
            const key = `explicit-visit-${mentionId}`;
            const changed = mutation.mutateTrip((current) => scheduleExplicitVisitIntent(current, mentionId, dayId), key);
            if (changed) setNotice("Requested visit added to the itinerary");
            return changed;
          }}
          onRemoveVisit={(mentionId) => {
            const changed = mutation.mutateTrip((current) => removeExplicitVisitIntent(current, mentionId), `explicit-visit-remove-${mentionId}`);
            if (changed) setNotice("Requested visit removed");
            return changed;
          }}
          onRemoveCommitment={(commitmentId) => {
            const changed = mutation.mutateTrip((current) => removeFixedCommitment(current, commitmentId), `fixed-commitment-remove-${commitmentId}`);
            if (changed) setNotice("Fixed commitment removed");
            return changed;
          }}
        />
        {unscheduledSavedIdeas.length ? <div className={styles.contextSection}>
          <SavedIdeasSection
            ideas={unscheduledSavedIdeas}
            trip={workingTrip}
            stopName={stop?.name ?? active.title}
            language={language}
            copy={copy}
            openPickerId={openSavedPickerId}
            selectedIdeaId={selectedRecommendation?.idea.id ?? null}
            pending={(idea) => mutation.isPending(`itinerary-suggestion-${idea.stopId}-${idea.placeId}`)}
            onPickerOpenChange={(ideaId, open) => setOpenSavedPickerId(open ? ideaId : null)}
            onSchedule={scheduleIdea}
            onRemove={(idea) => mutation.mutateTrip((current) => removeItineraryIdea(current, idea.id), `itinerary-idea-remove-${idea.id}`)}
            onOpenDetail={(idea, origin) => {
              const result = exploreResultForIdea(workingTrip, idea);
              if (!result) return;
              selectedItemOriginRef.current = origin;
              setSelectedItemId(null);
              setSelectedRecommendation(result);
            }}
            draggingIdeaId={plannerDrag?.kind === "suggestion" ? plannerDrag.idea.id : null}
            onDragStart={nativePlannerDrag ? (idea, event) => {
              event.dataTransfer.effectAllowed = "copyMove";
              event.dataTransfer.setData("text/plain", idea.id);
              beginPlannerDrag({ kind: "suggestion", idea });
            } : undefined}
            onDragEnd={nativePlannerDrag ? clearPlannerDrag : undefined}
          />
        </div> : null}
        <details ref={itinerarySuggestionsOrientationTarget} id={`${tabIdPrefix}-ideas`} className={`${styles.contextSection} ${styles.ideasSection}`}>
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
            initialActivityInventory={initialActivityInventory?.[active.dayNumber]}
            experienceAction={stop ? experienceAction : null}
            isPending={(placeId) => mutation.isPending(`itinerary-suggestion-${active.stopId}-${placeId}`)}
            onSave={(idea) => {
              const accepted = mutation.mutateTrip((current) => saveItineraryIdea(current, idea), `itinerary-suggestion-${idea.stopId}-${idea.placeId}`);
              if (accepted) setNotice("Idea saved");
              return accepted;
            }}
            onSchedule={scheduleIdea}
            onRemove={(idea) => removeSuggestion(idea.placeId, idea.id)}
            onOpenDetail={(result, origin) => {
              selectedItemOriginRef.current = origin;
              setSelectedItemId(null);
              setSelectedRecommendation(result);
            }}
            selectedResultId={selectedRecommendation?.identity ?? null}
            onSelectedDetailRefresh={(result) => setSelectedRecommendation((current) => current?.identity === result.identity ? result : current)}
            draggingIdeaId={plannerDrag?.kind === "suggestion" ? plannerDrag.idea.id : null}
            onDragStart={nativePlannerDrag ? (idea, event) => {
              event.dataTransfer.effectAllowed = "copyMove";
              event.dataTransfer.setData("text/plain", idea.id);
              beginPlannerDrag({ kind: "suggestion", idea });
            } : undefined}
            onDragEnd={nativePlannerDrag ? clearPlannerDrag : undefined}
            onInteractionReset={clearPlannerDrag}
          />
          <EasyTLinkButton
            className={styles.contextAction}
            href={exploreWorkspaceHref(workingTrip.id, active.stopId, active.dayNumber)}
            icon={Sparkles}
            size="small"
            variant="quiet"
            fullWidth
          >See more ideas in Explore</EasyTLinkButton>
        </details>

        <details className={styles.contextSection} open>
          <summary><span>{copy.notes}</span><span className={styles.sectionCount}>{dayNotes.length}</span></summary>
          <div className={styles.contextList}>{dayNotes.map((note, noteIndex) => <article className={styles.noteCard} key={`${active.id}-saved-note-${noteIndex}`}><BookOpenText aria-hidden="true" /><p>{note}</p></article>)}</div>
          <form className={styles.railNoteComposer} onSubmit={(event) => { event.preventDefault(); submitRailNote(); }}>
            <EasyTField ref={noteInputRef} label={copy.addDayNote} value={railNoteDraft} error={railNoteError || undefined} placeholder={copy.notePlaceholder} onChange={(event) => { setRailNoteDraft(event.target.value); setRailNoteError(""); }} />
            <EasyTButton type="submit" icon={CirclePlus} size="small" variant="secondary" loading={dayPending}>{copy.addNote}</EasyTButton>
          </form>
        </details>
        </div> : null}
      </aside> : null}

      <MorroviaFormDialog
        open={Boolean(moveFlow)}
        eyebrow={copy.moveActivityEyebrow}
        title={moveFlow ? `${copy.moveActivity}: ${moveFlow.activity.title}` : copy.moveActivity}
        detail={copy.moveActivityDetail}
        submitLabel={copy.moveActivity}
        error={moveError || undefined}
        onCancel={closeMoveFlow}
        onSubmit={submitMoveFlow}
      >
        {moveFlow ? <>
          <EasyTSelect
            autoFocus
            label={copy.moveTo}
            value={moveFlow.targetDayId}
            onChange={(event) => { setMoveError(""); setMoveFlow((current) => current ? { ...current, targetDayId: event.target.value } : current); }}
          >
            {eligibleMoveDays(moveFlow.sourceDayId).filter((day) => day.id !== moveFlow.sourceDayId).map((day) => <option value={day.id} key={day.id}>Day {day.dayNumber} · {displayDayDate(day.date, language)} · {stopForDay(workingTrip, day)?.name ?? day.title}</option>)}
          </EasyTSelect>
          {activityAllowsDayPart(moveFlow.activity.providerMetadata?.duration, "morning") ? <EasyTSelect
            label={copy.partOfDay}
            value={moveFlow.targetDayPart ?? ""}
            onChange={(event) => { setMoveError(""); setMoveFlow((current) => current ? { ...current, targetDayPart: event.target.value ? event.target.value as ItineraryDayPart : null } : current); }}
          >
            <option value="">{copy.timeNotSet}</option>
            {itineraryDayParts.map((part) => <option value={part} key={part}>{itineraryDayPartLabels[language][part]}</option>)}
          </EasyTSelect> : null}
        </> : null}
      </MorroviaFormDialog>

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

function SavedIdeasSection({
  ideas,
  trip,
  stopName,
  language,
  copy,
  mobile = false,
  openPickerId,
  selectedIdeaId,
  pending,
  onPickerOpenChange,
  onSchedule,
  onRemove,
  onOpenDetail,
  draggingIdeaId = null,
  onDragStart,
  onDragEnd,
}: {
  ideas: ItineraryIdea[];
  trip: EasyTTrip;
  stopName: string;
  language: "en" | "es";
  copy: ReturnType<typeof itineraryCopy>;
  mobile?: boolean;
  openPickerId: string | null;
  selectedIdeaId: string | null;
  pending: (idea: ItineraryIdea) => boolean;
  onPickerOpenChange: (ideaId: string, open: boolean) => void;
  onSchedule: (idea: ItineraryIdea, dayId: string, dayPart?: ItineraryDayPart | null) => boolean;
  onRemove: (idea: ItineraryIdea) => boolean;
  onOpenDetail: (idea: ItineraryIdea, origin: HTMLButtonElement) => void;
  draggingIdeaId?: string | null;
  onDragStart?: (idea: ItineraryIdea, event: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
}) {
  if (!ideas.length) return null;
  return <details className={styles.savedIdeasSection} open={mobile ? undefined : true}>
    <summary><span>{copy.savedIdeas}</span><span className={styles.sectionCount}>{ideas.length}</span></summary>
    <div className={styles.savedIdeas} role="list">{ideas.map((idea) => {
      const options = itineraryIdeaDayOptions(trip, idea.stopId);
      const preferredDay = preferredItineraryIdeaDay(trip, idea.stopId);
      const allowsDayPart = activityAllowsDayPart(idea.providerMetadata?.duration, "morning");
      const draggable = !mobile && allowsDayPart && Boolean(onDragStart);
      return <article
        role="listitem"
        key={idea.id}
        className={draggingIdeaId === idea.id ? styles.discoveryCardDragging : undefined}
        draggable={draggable}
        onDragStart={draggable ? (event) => onDragStart?.(idea, event) : undefined}
        onDragEnd={draggable ? onDragEnd : undefined}
      >
        <EasyTButton className={styles.savedIdeaSelect} variant="quiet" aria-label={`Open details for ${idea.title}`} aria-pressed={selectedIdeaId === idea.id} onClick={(event) => onOpenDetail(idea, event.currentTarget)}>
          <ItineraryActivityIdentity title={idea.title} category={idea.category} image={idea.image} meta={`Saved for ${stopName}`} compact />
        </EasyTButton>
        <div className={styles.savedIdeaActions}>
          {preferredDay ? <ItineraryDayPicker
            placeTitle={idea.title}
            language={language}
            options={options}
            preferredDayId={preferredDay.id}
            preferredDayPart={activityDayPartFit(idea.providerMetadata?.duration) === "slot" ? preferredItineraryDayPart(trip, preferredDay.id, idea.category) : null}
            allowsDayPart={allowsDayPart}
            currentDayId={null}
            currentDayPart={null}
            label={`Add to Day ${preferredDay.dayNumber}`}
            open={openPickerId === idea.id}
            pending={pending(idea)}
            onOpenChange={(open) => onPickerOpenChange(idea.id, open)}
            onDefault={() => onSchedule(idea, preferredDay.id)}
            onChoose={(dayId, dayPart) => onSchedule(idea, dayId, dayPart)}
          /> : null}
          <EasyTButton size="small" variant="quiet" disabled={pending(idea)} onClick={() => onRemove(idea)}>{copy.remove}</EasyTButton>
        </div>
      </article>;
    })}</div>
  </details>;
}

function ItinerarySubviewSwitch({ value, onChange, copy }: {
  value: "days" | "calendar";
  onChange: (value: "days" | "calendar") => void;
  copy: ReturnType<typeof itineraryCopy>;
}) {
  return <div className={styles.subviewBar}>
    <EasyTSegmentedControl
      ariaLabel="Itinerary view"
      options={[
        { value: "days", label: copy.dayByDay },
        { value: "calendar", label: copy.calendar },
      ]}
      value={value}
      onChange={onChange}
    />
  </div>;
}

function calendarWeekdayLabels(language: "en" | "es") {
  const formatter = new Intl.DateTimeFormat(language === "es" ? "es" : "en", { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, index) => formatter.format(new Date(Date.UTC(2024, 0, index + 1))));
}

function SelectedDayStayContext({ composition, tripId, onSelect }: {
  composition: ItineraryDayComposition;
  tripId: string;
  onSelect?: (origin: HTMLButtonElement) => void;
}) {
  const stay = itineraryStayPresentation(composition.tonight);
  if (!stay || !composition.tonight.stopId) return null;
  const content = <><strong>{stay.title}</strong><span>{stay.detail}</span></>;
  return <section className={styles.stayContext} data-state={stay.state} aria-label={`Stay: ${stay.title}, ${stay.detail}`}>
    <BedDouble aria-hidden="true" />
    {onSelect ? <EasyTButton className={styles.stayContextSelect} variant="quiet" onClick={(event) => onSelect(event.currentTarget)}>{content}</EasyTButton> : <div className={styles.stayContextCopy}>{content}</div>}
    <EasyTLinkButton href={stayWorkspaceHref(tripId, composition.tonight.stopId)} size="small" variant="quiet">
      {stay.state === "missing" ? "Plan stay" : "Open Stay"}
    </EasyTLinkButton>
  </section>;
}

function CalendarSelectedDaySummary({ day, composition, tripId, copy, language, onOpenDay, onSelect }: {
  day: ItineraryCalendarDay;
  composition: ItineraryDayComposition;
  tripId: string;
  copy: ReturnType<typeof itineraryCopy>;
  language: "en" | "es";
  onOpenDay: () => void;
  onSelect: (item: ItineraryCalendarItem, origin: HTMLButtonElement) => void;
}) {
  const items = day.items.filter((item) => item.kind !== "accommodation");
  return <section className={styles.calendarDaySummary} aria-label={`Selected day summary for Day ${day.day.dayNumber}`}>
    <div className={styles.calendarDaySummaryAction}>
      <EasyTButton variant="secondary" size="small" onClick={onOpenDay}>Open full day</EasyTButton>
    </div>
    {items.length ? <ul className={styles.calendarSummaryItems}>
      {items.map((item) => <li key={item.id}><CalendarItemButton
        item={item}
        day={day}
        copy={copy}
        language={language}
        draggable={false}
        dragging={false}
        onDragStart={() => undefined}
        onDragEnd={() => undefined}
        onSelect={(_day, selected, origin) => { if (selected && origin) onSelect(selected, origin); }}
      /></li>)}
    </ul> : <p className={styles.calendarSummaryEmpty}>{copy.noCalendarPlans}</p>}
    <SelectedDayStayContext composition={composition} tripId={tripId} />
  </section>;
}

function calendarScheduleLabel(item: Extract<ItineraryCalendarItem, { kind: "activity" }>, copy: ReturnType<typeof itineraryCopy>, language: "en" | "es") {
  if (item.schedule.kind === "time") return item.schedule.startsAt;
  if (item.schedule.kind === "day-part") return itineraryDayPartLabels[language][item.schedule.dayPart];
  if (item.schedule.kind === "full-day") return copy.fullDay;
  return copy.flexible;
}

function ItineraryCalendar({ weeks, selectedDayId, copy, language, dragItem, nativeDrag, onDragStart, onDragEnd, onDrop, onSelect }: {
  weeks: ItineraryCalendarWeek[];
  selectedDayId: string | null;
  copy: ReturnType<typeof itineraryCopy>;
  language: "en" | "es";
  dragItem: PlannerDragItem | null;
  nativeDrag: boolean;
  onDragStart: (day: ItineraryCalendarDay, activity: ComposedItineraryActivity, event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onDrop: (day: ItineraryCalendarDay) => void;
  onSelect: (day: ItineraryCalendarDay, item?: ItineraryCalendarItem, origin?: HTMLButtonElement) => void;
}) {
  const weekdayLabels = calendarWeekdayLabels(language);
  const panelId = "itinerary-calendar";
  return <div className={styles.calendarView} id={panelId} role="region" aria-labelledby={`${panelId}-heading`}>
    <h2 className="sr-only" id={`${panelId}-heading`}>{copy.calendarHeading}</h2>
    <div className={styles.calendarWeekdays} aria-hidden="true">
      {weekdayLabels.map((label) => <span key={label}>{label}</span>)}
    </div>
    {weeks.map((week, weekIndex) => <section className={styles.calendarWeek} key={week.id} aria-labelledby={`${panelId}-week-${weekIndex}`}>
      <h3 id={`${panelId}-week-${weekIndex}`}>{copy.weekOf} {week.startDate ? <time dateTime={week.startDate}>{displayDate(week.startDate, language)}</time> : copy.timeNotSet}</h3>
      <div className={styles.calendarBands} aria-label="Overnight destinations">
        {itineraryCalendarNightBands(week).map((band) => <div key={`${band.stop.id}-${band.start}`} style={{ gridColumn: `${band.start + 1} / span ${band.span}` }}><BedDouble aria-hidden="true" /><b>{band.stop.order + 1}</b><span>{band.stop.name} · {band.span} {language === "es" ? (band.span === 1 ? "noche" : "noches") : (band.span === 1 ? "night" : "nights")}{band.continued ? (language === "es" ? " · continúa" : " · continued") : ""}</span></div>)}
      </div>
      <div className={styles.calendarGrid}>
        {week.days.map((day, dayIndex) => day ? <article
          className={styles.calendarDay}
          data-selected={selectedDayId === day.id || undefined}
          data-drop-eligible={Boolean(dragItem && (dragItem.kind === "suggestion" ? dragItem.idea.stopId : dragItem.sourceStopId) === day.day.stopId) || undefined}
          key={day.id}
          onDragOver={(event) => {
            if (dragItem && (dragItem.kind === "suggestion" ? dragItem.idea.stopId : dragItem.sourceStopId) === day.day.stopId) event.preventDefault();
          }}
          onDrop={(event) => { event.preventDefault(); onDrop(day); }}
        >
          <EasyTButton
            className={styles.calendarDaySelect}
            variant="quiet"
            aria-pressed={selectedDayId === day.id}
            aria-label={`${copy.day} ${day.day.dayNumber}, ${day.stop?.name ?? day.day.title}, ${displayDayDate(day.day.date, language)}`}
            onClick={(event) => onSelect(day, undefined, event.currentTarget)}
          >
            <span><time dateTime={day.day.date}>{displayDayDate(day.day.date, language)}</time><i>{pad(day.day.dayNumber)}</i></span>
            <strong>{day.stop?.name ?? day.day.title}</strong>
            <small>{planItemLabel(day.day.type, language)}</small>
            {day.arrival || day.departure ? <em>{[day.arrival ? copy.arrival : null, day.departure ? copy.departure : null].filter(Boolean).join(" · ")}</em> : null}
          </EasyTButton>
          {day.items.length ? <ul className={styles.calendarItems}>
            {day.items.slice(0, 4).map((item) => <li key={item.id}><CalendarItemButton item={item} day={day} copy={copy} language={language} draggable={nativeDrag && item.kind === "activity" && item.activity.dayPartEditable && !item.activity.booking} dragging={dragItem?.kind === "activity" && dragItem.activity.id === (item.kind === "activity" ? item.activity.id : null)} onDragStart={onDragStart} onDragEnd={onDragEnd} onSelect={onSelect} /></li>)}
            {day.items.length > 4 ? <li><EasyTButton size="small" variant="quiet" onClick={() => onSelect(day)} aria-label={`Show all ${day.items.length} items for Day ${day.day.dayNumber}`}>+{day.items.length - 4} more</EasyTButton></li> : null}
          </ul> : <p className={styles.calendarEmptyDay}>{copy.noCalendarPlans}</p>}
        </article> : <span className={styles.calendarBlank} aria-hidden="true" key={`${week.id}-${dayIndex}`} />)}
      </div>
    </section>)}
  </div>;
}

function CalendarItemButton({ item, day, copy, language, draggable, dragging, onDragStart, onDragEnd, onSelect }: {
  item: ItineraryCalendarItem;
  day: ItineraryCalendarDay;
  copy: ReturnType<typeof itineraryCopy>;
  language: "en" | "es";
  draggable: boolean;
  dragging: boolean;
  onDragStart: (day: ItineraryCalendarDay, activity: ComposedItineraryActivity, event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onSelect: (day: ItineraryCalendarDay, item?: ItineraryCalendarItem, origin?: HTMLButtonElement) => void;
}) {
  let Icon: LucideIcon = CalendarDays;
  let title = "";
  let meta = "";
  if (item.kind === "activity") {
    Icon = item.activity.category === "restaurant" ? Utensils : Sparkles;
    title = item.activity.title;
    meta = [calendarScheduleLabel(item, copy, language), providerDuration(item.activity)].filter(Boolean).join(" · ");
  } else if (item.kind === "transfer") {
    Icon = iconForLeg(item.agenda.leg.mode);
    title = `${item.agenda.from.name} → ${item.agenda.to.name}`;
    const durationMinutes = item.agenda.leg.doorToDoorMinutes ?? item.agenda.leg.durationMinutes;
    meta = [copy.transfer, transferJourneyModeLabel(item.agenda.leg), durationMinutes === null ? copy.timeNotSet : `~${formatTripDuration(durationMinutes)}`].join(" · ");
  } else if (item.kind === "accommodation") {
    Icon = BedDouble;
    title = item.booking.title;
    meta = [copy.accommodation, item.destination, item.booking.confirmation ? copy.confirmed : copy.saved].filter(Boolean).join(" · ");
  } else {
    Icon = BookOpenText;
    title = item.booking.title;
    meta = [copy.booking, item.booking.type, item.booking.confirmation ? copy.confirmed : copy.saved].filter(Boolean).join(" · ");
  }
  return <EasyTButton className={`${styles.calendarItem} ${dragging ? styles.calendarItemDragging : ""}`} variant="quiet" aria-label={`${title}, ${meta}`} draggable={draggable} onDragStart={draggable && item.kind === "activity" ? (event) => onDragStart(day, item.activity, event) : undefined} onDragEnd={draggable ? onDragEnd : undefined} onClick={(event) => onSelect(day, item, event.currentTarget)}>
    <Icon aria-hidden="true" />
    <span>{item.kind === "activity" && item.activity.image ? <ResilientImage className={styles.calendarThumbnail} src={item.activity.image} alt="" fallback={null} /> : null}<strong>{title}</strong><small>{meta}</small></span>
    <ChevronRight aria-hidden="true" />
  </EasyTButton>;
}

function OmioTransportAction({ action, trip, leg }: { action: ResolvedAffiliateAction; trip: EasyTTrip; leg: TripLeg }) {
  return <div className={styles.omioAction}>
    <MorroviaAffiliateLink action={action} context={{ placement: "itinerary_transfer", tripId: trip.id, transferId: leg.id, originStopId: leg.fromStopId, destinationStopId: leg.toStopId }} />
    <small>{affiliateDisclosure}</small>
    <MorroviaPartnerPromotion action={action} />
  </div>;
}

function ItineraryDaySuggestions({ trip, day, stop, copy, language, initialPlaces, initialActivityInventory, experienceAction, isPending, onSave, onSchedule, onRemove, onOpenDetail, selectedResultId, onSelectedDetailRefresh, draggingIdeaId, onDragStart, onDragEnd, onInteractionReset }: {
  trip: EasyTTrip;
  day: PlanItem;
  stop: TripStop | null;
  copy: ReturnType<typeof itineraryCopy>;
  language: "en" | "es";
  initialPlaces?: ItineraryDiscoveryPlace[];
  initialActivityInventory?: ActivityInventoryItem[];
  experienceAction?: ResolvedAffiliateAction | null;
  isPending: (placeId: string) => boolean;
  onSave: (idea: ItineraryIdea) => boolean;
  onSchedule: (idea: ItineraryIdea, dayId: string, dayPart?: ItineraryDayPart | null) => boolean;
  onRemove: (idea: ItineraryIdea) => boolean;
  onOpenDetail: (result: ExploreResult, origin: HTMLButtonElement) => void;
  selectedResultId: string | null;
  onSelectedDetailRefresh: (result: ExploreResult) => void;
  draggingIdeaId: string | null;
  onDragStart?: (idea: ItineraryIdea, event: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
  onInteractionReset: () => void;
}) {
  const [places, setPlaces] = useState<ItineraryDiscoveryPlace[]>(initialPlaces ?? []);
  const [organicStatus, setOrganicStatus] = useState<"idle" | "loading" | "ready" | "error">(initialPlaces ? "ready" : "idle");
  const [inventory, setInventory] = useState<ActivityInventoryItem[]>(initialActivityInventory ?? []);
  const [commercialStatus, setCommercialStatus] = useState<"idle" | "loading" | "ready" | "error">(initialActivityInventory ? "ready" : "idle");
  const [retryVersion, setRetryVersion] = useState(0);
  const [error, setError] = useState("");
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const interactionResetRef = useRef(onInteractionReset);
  interactionResetRef.current = onInteractionReset;
  const interests = tripIntentForTrip(trip).preferences.interests;

  useEffect(() => {
    if (initialPlaces) {
      setPlaces(initialPlaces);
      setOrganicStatus("ready");
      return;
    }
    if (!stop || stop.latitude === null || stop.longitude === null) {
      setPlaces([]);
      setOrganicStatus("ready");
      return;
    }
    const scope = createAbortableEffectScope(`Itinerary suggestions for day ${day.dayNumber}`);
    const startedAt = performance.now();
    setPlaces([]);
    setError("");
    setOrganicStatus("loading");
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
          const nextPlaces = payload.places ?? [];
          setPlaces(nextPlaces);
          setOrganicStatus("ready");
          const properties = { surface: "itinerary" as const, recommendation_kind: "activity" as const, lane: "core" as const, duration_ms: recommendationDurationMs(startedAt, performance.now()), result_count: nextPlaces.length, outcome: nextPlaces.length ? "ready" as const : "empty" as const };
          if (nextPlaces.length) trackEvent("recommendation_performance", { ...properties, milestone: "first_useful" });
          trackEvent("recommendation_performance", { ...properties, milestone: "lane_ready" });
        });
      })
      .catch((caught: unknown) => {
        if (scope.isCancellation(caught)) return;
        scope.commit(() => {
          setPlaces([]);
          setOrganicStatus("error");
          trackEvent("recommendation_performance", { surface: "itinerary", recommendation_kind: "activity", lane: "core", milestone: "lane_ready", duration_ms: recommendationDurationMs(startedAt, performance.now()), result_count: 0, outcome: "unavailable" });
        });
      });
    return () => scope.dispose();
  }, [copy.suggestionsUnavailable, initialPlaces, retryVersion, stop?.country, stop?.id, stop?.latitude, stop?.longitude, stop?.name]);

  useEffect(() => {
    if (initialActivityInventory) {
      setInventory(initialActivityInventory);
      setCommercialStatus("ready");
      return;
    }
    if (!stop?.canonicalPlaceId) {
      setInventory([]);
      setCommercialStatus("ready");
      return;
    }
    const scope = createAbortableEffectScope(`Itinerary experiences for day ${day.dayNumber}`);
    const startedAt = performance.now();
    const placeMention = trip.brief.structuredBrief?.placeMentions?.find((mention) => mention.canonicalPlaceId === stop.canonicalPlaceId);
    setCommercialStatus("loading");
    void fetch("/api/journey-activity-inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination: {
        canonicalPlaceId: stop.canonicalPlaceId,
        name: stop.name,
        country: stop.country,
        countryCode: stop.countryCode,
        region: stop.region,
        coordinates: stop.latitude !== null && stop.longitude !== null ? { latitude: stop.latitude, longitude: stop.longitude } : undefined,
        aliases: placeMention?.aliases,
        placeType: placeMention?.placeType,
      }, currency: trip.currency }),
      signal: scope.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Activity inventory unavailable");
      return response.json() as Promise<{ activities?: ActivityInventoryItem[] }>;
    }).then((payload) => scope.commit(() => {
      const items = payload.activities ?? [];
      setInventory(items);
      setCommercialStatus("ready");
      const properties = { surface: "itinerary" as const, recommendation_kind: "activity" as const, lane: "commercial" as const, duration_ms: recommendationDurationMs(startedAt, performance.now()), result_count: items.length, outcome: items.length ? "ready" as const : "empty" as const };
      if (items.length) trackEvent("recommendation_performance", { ...properties, milestone: "first_useful" });
      trackEvent("recommendation_performance", { ...properties, milestone: "lane_ready" });
    })).catch((caught: unknown) => {
      if (scope.isCancellation(caught)) return;
      scope.commit(() => {
        setInventory([]);
        setCommercialStatus("error");
        trackEvent("recommendation_performance", { surface: "itinerary", recommendation_kind: "activity", lane: "commercial", milestone: "lane_ready", duration_ms: recommendationDurationMs(startedAt, performance.now()), result_count: 0, outcome: "unavailable" });
      });
    });
    return () => scope.dispose();
  }, [day.dayNumber, initialActivityInventory, retryVersion, stop?.canonicalPlaceId, stop?.country, stop?.countryCode, stop?.id, stop?.latitude, stop?.longitude, stop?.name, stop?.region, trip.brief.structuredBrief?.placeMentions, trip.currency]);

  const results = useMemo(() => {
    if (!stop) return [];
    const organic = itinerarySuggestionCandidates(trip, day, places).map((place) => exploreResultForPlace(stop, place, interests));
    const commercial = inventory.map((item) => exploreResultForActivity(stop, item, trip));
    return rankItineraryRecommendations(trip, day, dedupeExploreResults([...organic, ...commercial])).slice(0, 8);
  }, [day, interests, inventory, places, stop, trip]);
  useEffect(() => {
    if (!selectedResultId) return;
    const current = results.find((result) => result.identity === selectedResultId);
    if (current) onSelectedDetailRefresh(current);
  }, [onSelectedDetailRefresh, results, selectedResultId]);
  const loading = organicStatus === "loading" || commercialStatus === "loading";
  const unavailable = !results.length && (organicStatus === "error" || commercialStatus === "error");
  useEffect(() => {
    if (unavailable) interactionResetRef.current();
  }, [unavailable]);
  const hasLiveViatorProduct = results.some((result) => result.provider === "viator" && Boolean(result.providerUrl));
  const experienceFallback = stop && experienceAction && commercialStatus !== "loading" && !hasLiveViatorProduct
    ? <CompactExperienceHandoff action={experienceAction} tripId={trip.id} stopId={stop.id} />
    : null;
  if (!results.length && loading) return <div className={styles.suggestionStatus}><MorroviaSectionStatus title={copy.suggestionsLoading} detail={copy.suggestionsLoadingDetail} /></div>;
  if (unavailable) return <><div className={styles.suggestionStatus}><MorroviaSectionStatus compact state="error" title={copy.suggestionsUnavailable} detail="Your saved day is unchanged." retryLabel="Try suggestions again" onRetry={() => { onInteractionReset(); setRetryVersion((current) => current + 1); }} /></div>{experienceFallback}</>;
  if (!results.length) return <><p className={styles.suggestionEmpty}>{copy.noNewSuggestions}</p>{experienceFallback}</>;
  return <><section className={styles.discoveryGroup} aria-label={`Useful ideas for Day ${day.dayNumber}`}>
    <h4>Shortlist for {stop?.name}</h4>
    <div className={styles.discoveryList}>{results.map((result) => {
      const idea = result.idea;
      const pending = isPending(idea.placeId);
      const state = stop ? ideaStateForPlace(trip, stop.id, idea.placeId) : { state: "available" as const, idea: null, day: null };
      const options = stop ? itineraryIdeaDayOptions(trip, stop.id) : [];
      const allowsDayPart = activityAllowsDayPart(idea.providerMetadata?.duration, "morning");
      return <ItineraryRankedSuggestionCard
        key={result.identity}
        result={result}
        tripId={trip.id}
        language={language}
        options={options}
        preferredDayId={day.id}
        preferredDayPart={activityDayPartFit(idea.providerMetadata?.duration) === "slot" ? preferredItineraryDayPart(trip, day.id, idea.category) : null}
        allowsDayPart={allowsDayPart}
        state={state}
        pending={pending}
        dragging={draggingIdeaId === idea.id}
        pickerOpen={openPickerId === result.identity}
        onPickerOpenChange={(open) => setOpenPickerId(open ? result.identity : null)}
        onSave={() => { setError(""); if (!onSave(idea)) setError("This idea could not be stored safely."); }}
        onSchedule={(dayId, dayPart) => {
          setError("");
          const accepted = onSchedule(idea, dayId, dayPart);
          if (!accepted) setError("This activity could not be added safely.");
          return accepted;
        }}
        onRemove={state.idea ? () => { setError(""); if (!onRemove(state.idea!)) setError("This activity could not be removed safely."); } : undefined}
        onOpenDetail={(origin) => onOpenDetail(result, origin)}
        onDragStart={onDragStart ? (event) => onDragStart(idea, event) : undefined}
        onDragEnd={onDragEnd}
      />;
    })}</div>
    {loading ? <p className={styles.suggestionProgress} role="status">More ideas are still loading…</p> : null}
    {error ? <p className={styles.suggestionError} role="alert">{error}</p> : null}
  </section>{experienceFallback}</>;
}

function CompactExperienceHandoff({ action, tripId, stopId }: { action: ResolvedAffiliateAction; tripId: string; stopId: string }) {
  const cta = action.provider === "viator" ? "More tours on Viator" : `More activities on ${affiliateProviderLabel(action.provider)}`;
  const compactAction = { ...action, cta };
  return <section className={styles.experienceHandoff} aria-label={cta}>
    <MorroviaAffiliateLink action={compactAction} context={{ placement: "itinerary_day_experiences", tripId, stopId, workspaceView: "itinerary" }} variant="quiet" fullWidth />
    <MorroviaAffiliateDisclosure provider={action.provider} />
  </section>;
}

function ItineraryRankedSuggestionCard({ result, tripId, language, options, preferredDayId, preferredDayPart, allowsDayPart, state, pending, dragging, pickerOpen, onPickerOpenChange, onSave, onSchedule, onRemove, onOpenDetail, onDragStart, onDragEnd }: {
  result: ExploreResult;
  tripId: string;
  language: "en" | "es";
  options: ItineraryIdeaDayOption[];
  preferredDayId: string;
  preferredDayPart: ItineraryDayPart | null;
  allowsDayPart: boolean;
  state: DiscoveryIdeaState;
  pending: boolean;
  dragging: boolean;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  onSave: () => void;
  onSchedule: (dayId: string, dayPart?: ItineraryDayPart | null) => boolean;
  onRemove?: () => void;
  onOpenDetail: (origin: HTMLButtonElement) => void;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
}) {
  const titleId = useId();
  const commercial = result.idea.source === "live-provider-inventory";
  const currentDayId = state.state === "planned" ? state.day.id : null;
  const preferredDay = options.find((option) => option.day.id === preferredDayId)?.day ?? options[0]?.day ?? null;
  const actionLabel = state.state === "planned" ? `Added to Day ${state.day.dayNumber}` : `Add to Day ${preferredDay?.dayNumber ?? ""}`;
  const meta = [result.location, result.category, result.duration, commercial ? "Viator" : null].filter(Boolean).join(" · ");
  const action = commercial && result.providerUrl ? { provider: "viator", category: "activities", href: result.providerUrl, cta: "View on Viator", affiliate: true } as const : null;
  const draggable = allowsDayPart && !pending && Boolean(onDragStart);
  return <article className={`${styles.discoveryCard} ${dragging ? styles.discoveryCardDragging : ""}`} data-itinerary-suggestion-id={result.sourceId} data-provider-product-id={result.providerProductId} aria-labelledby={titleId} aria-busy={pending || undefined} draggable={draggable} onDragStart={draggable ? onDragStart : undefined} onDragEnd={draggable ? onDragEnd : undefined}>
    <div className={styles.discoveryMedia}>
      <ResilientImage src={result.image} alt="" fallback={<span className={styles.discoveryFallback}><MapPin aria-hidden="true" /></span>} />
      {!commercial && result.providerUrl ? <a href={result.providerUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open source for ${result.title}`}><ExternalLink aria-hidden="true" /></a> : null}
    </div>
    <div className={styles.discoveryCopy}><div id={titleId}><ItineraryActivityIdentity title={result.title} category={result.kind === "restaurant" ? "restaurant" : "activity"} meta={meta} compact /></div></div>
    <div className={styles.discoveryActions}>
      <EasyTButton size="small" variant="quiet" aria-label={`Open details for ${result.title}`} onClick={(event) => onOpenDetail(event.currentTarget)}>Details</EasyTButton>
      {draggable ? <span className={styles.dragHint}><GripVertical aria-hidden="true" />Drag into the day</span> : null}
      {state.state === "planned" ? <span className={styles.plannedState}><CheckCircle2 aria-hidden="true" />Added to Day {state.day.dayNumber}</span> : null}
      {preferredDay ? <ItineraryDayPicker placeTitle={result.title} language={language} options={options} preferredDayId={preferredDayId} preferredDayPart={preferredDayPart} allowsDayPart={allowsDayPart} currentDayId={currentDayId} currentDayPart={state.state === "planned" ? state.idea.dayPart ?? null : null} label={actionLabel} open={pickerOpen} pending={pending} onOpenChange={onPickerOpenChange} onDefault={() => state.state === "planned" ? false : onSchedule(preferredDay.id)} onChoose={(dayId, dayPart) => onSchedule(dayId, dayPart)} /> : null}
      {state.state === "available" ? <EasyTButton size="small" variant="quiet" disabled={pending} onClick={onSave}>{pending ? "Saving…" : "Save"}</EasyTButton> : state.state === "saved" ? <span className={styles.savedIdeaState}>Saved for later</span> : onRemove ? <EasyTButton size="small" variant="quiet" disabled={pending} onClick={onRemove}>Remove</EasyTButton> : null}
      {action ? <><MorroviaAffiliateLink action={action} context={{ placement: "itinerary_day_experiences", tripId, stopId: result.stopId, workspaceView: "itinerary" }} variant="quiet" /><MorroviaAffiliateDisclosure className={styles.commercialDisclosure} provider="viator" /></> : null}
    </div>
  </article>;
}

type DiscoveryIdeaState = ReturnType<typeof ideaStateForPlace>;

function ItineraryDayPicker({ placeTitle, language, options, preferredDayId, preferredDayPart, allowsDayPart, currentDayId, currentDayPart, label, open, pending, onOpenChange, onDefault, onChoose }: {
  placeTitle: string;
  language: "en" | "es";
  options: ItineraryIdeaDayOption[];
  preferredDayId: string | null;
  preferredDayPart: ItineraryDayPart | null;
  allowsDayPart: boolean;
  currentDayId: string | null;
  currentDayPart: ItineraryDayPart | null;
  label: string;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onDefault: () => boolean;
  onChoose: (dayId: string, dayPart: ItineraryDayPart | null) => boolean;
}) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<CSSProperties>({});

  const close = (restoreFocus: boolean) => {
    onOpenChange(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const preferred = menuRef.current?.querySelector<HTMLElement>(`[data-day-id="${currentDayId ?? preferredDayId ?? ""}"]${currentDayPart ? `[data-day-part="${currentDayPart}"]` : ""}`);
    const first = menuRef.current?.querySelector<HTMLElement>("[role='menuitem']");
    window.requestAnimationFrame(() => (preferred ?? first)?.focus());
    const dismiss = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [currentDayId, currentDayPart, open, preferredDayId]);

  useLayoutEffect(() => {
    if (!open) return;
    const positionMenu = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(310, Math.max(220, window.innerWidth - 24));
      const availableBelow = Math.max(0, window.innerHeight - rect.bottom - 12);
      const availableAbove = Math.max(0, rect.top - 12);
      const placeAbove = availableBelow < 240 && availableAbove > availableBelow;
      const availableHeight = placeAbove ? availableAbove : availableBelow;
      const maxHeight = Math.min(360, Math.max(140, availableHeight));
      const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
      const top = placeAbove
        ? Math.max(12, rect.top - maxHeight - 6)
        : Math.min(window.innerHeight - maxHeight - 12, rect.bottom + 6);
      setMenuPosition({ top, left, width, maxHeight });
    };
    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open]);

  const moveFocus = (event: ReactKeyboardEvent<HTMLDivElement>, direction: 1 | -1) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [])];
    const index = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
    items[(index + direction + items.length) % items.length]?.focus();
    event.preventDefault();
  };

  const menu = open ? <div
      className={`${styles.rowMenuPanel} ${styles.dayPickerPanel} ${styles.dayPickerPortal}`}
      id={menuId}
      ref={menuRef}
      role="menu"
      aria-label={`Choose a day for ${placeTitle}`}
      style={menuPosition}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); close(true); }
        else if (event.key === "ArrowDown") moveFocus(event, 1);
        else if (event.key === "ArrowUp") moveFocus(event, -1);
        else if (event.key === "Home") { event.preventDefault(); menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus(); }
        else if (event.key === "End") { event.preventDefault(); [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [])].at(-1)?.focus(); }
        else if (event.key === "Tab") close(false);
      }}
    >
      {options.flatMap(({ day, itemCount, protectedDay }) => {
        const dayKind = day.type === "arrival" ? "Arrival day" : day.type === "transport" ? "Transfer day" : null;
        const placements = allowsDayPart ? itineraryDayParts.map((dayPart) => dayPart) : [null];
        return placements.map((dayPart) => {
          const current = day.id === currentDayId && dayPart === currentDayPart;
          return <EasyTButton
          key={`${day.id}-${dayPart ?? "day-level"}`}
          role="menuitem"
          data-day-id={day.id}
          data-day-part={dayPart ?? undefined}
          className={styles.dayPickerOption}
          size="small"
          variant="quiet"
          aria-current={current ? "true" : undefined}
          onClick={() => {
            if (current || onChoose(day.id, dayPart)) close(true);
          }}
        >
          <span><strong>Day {day.dayNumber}{dayPart ? ` · ${itineraryDayPartLabels[language][dayPart]}` : " · Day level"}</strong><small>{displayDayDate(day.date, language)} · {day.title} · {itemCount} {itemCount === 1 ? "item" : "items"}</small></span>
          {current ? <em>Current</em> : day.id === preferredDayId && dayPart === preferredDayPart ? <em>Suggested</em> : protectedDay && dayKind ? <em>{dayKind}</em> : null}
        </EasyTButton>;
        });
      })}
    </div> : null;

  return <div className={styles.dayPicker}>
    <span className={styles.dayPickerSplit}>
      <EasyTButton
        size="small"
        variant="secondary"
        icon={currentDayId ? CheckCircle2 : CirclePlus}
        disabled={pending || Boolean(currentDayId)}
        onClick={onDefault}
      >{label}</EasyTButton>
      <EasyTButton
      ref={triggerRef}
      className={styles.dayPickerToggle}
      icon={ChevronDown}
      iconOnly
      size="small"
      variant="secondary"
      disabled={pending}
      aria-expanded={open}
      aria-haspopup="menu"
      aria-controls={open ? menuId : undefined}
      aria-label={allowsDayPart ? `Choose day and part of day for ${placeTitle}` : `Choose day for ${placeTitle}`}
      onClick={() => onOpenChange(!open)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); onOpenChange(true); }
        if (event.key === "Escape" && open) { event.preventDefault(); close(true); }
      }}
    >Choose placement for {placeTitle}</EasyTButton>
    </span>
    {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
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
  onDragStart?: () => void;
  onDragEnd?: () => void;
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
        {editable && onDragStart ? <EasyTButton className={styles.dragHandle} icon={GripVertical} iconOnly size="small" variant="quiet" draggable onDragStart={onDragStart} onDragEnd={onDragEnd}>{copy.dragActivity}: {note}</EasyTButton> : null}
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
  const transferLabel = transferJourneyModeLabel(leg);
  return (
    <div className={`${styles.detailRow} ${omioAction ? styles.transferRow : ""} ${selected ? styles.selectedRow : ""}`} data-itinerary-item={`leg-${leg.id}`}>
      <span className={styles.detailIcon}><Icon aria-hidden="true" /></span>
      <EasyTButton className={styles.rowSelect} variant="quiet" aria-pressed={selected} onClick={onSelect}><span className={styles.itemCopy}><strong>{arrivalLabel ?? (from && to ? `${from} → ${to}` : leg.mode)}</strong><span>{arrivalLabel ? "Arrival" : <>{transferLabel}<i aria-hidden="true">·</i>{duration ? (leg.provenance === "planning_estimate" || leg.provenance === "routing_engine" ? copy.estimate : "Saved timing") : copy.unresolved}</>}</span></span></EasyTButton>
      {arrivalLabel ? <span className={styles.duration}>Arrival</span> : duration ? <span className={styles.duration}>~{duration}</span> : <span className={styles.duration}>{copy.unresolved}</span>}
      {omioAction ? <OmioTransportAction action={omioAction} trip={trip} leg={leg} /> : null}
    </div>
  );
}

function LogisticsLeg({ leg, trip, copy, selected, onSelect }: { leg: TripLeg; trip: EasyTTrip; copy: ReturnType<typeof itineraryCopy>; selected: boolean; onSelect: (origin: HTMLButtonElement) => void }) {
  const Icon = iconForLeg(leg.mode);
  const from = routeEndpointForLeg(trip, leg, "from")?.name;
  const to = routeEndpointForLeg(trip, leg, "to")?.name;
  const durationMinutes = leg.doorToDoorMinutes ?? leg.durationMinutes;
  const arrivalLabel = semanticSamePlaceArrival(trip, leg);
  const transferLabel = transferJourneyModeLabel(leg);
  const segmentSummary = transferJourneySegmentSummary(leg);
  return <EasyTButton variant="quiet" className={`${styles.logisticsCard} ${selected ? styles.logisticsSelected : ""}`} aria-pressed={selected} onClick={(event) => onSelect(event.currentTarget)}><Icon aria-hidden="true" /><div><small>{transferLabel}</small><strong>{arrivalLabel ?? (from && to ? `${from} → ${to}` : leg.mode)}</strong><span>{arrivalLabel ? "Arrival into your first overnight destination" : durationMinutes === null ? "Timing needs confirmation" : `~${formatTripDuration(durationMinutes)} total · ${leg.provenance === "planning_estimate" || leg.provenance === "routing_engine" ? copy.estimate : "Saved timing"}`}</span>{segmentSummary ? <span>{segmentSummary}</span> : null}</div><ArrowRight aria-hidden="true" /></EasyTButton>;
}

function BookingCard({ booking, copy, selected, onSelect }: { booking: TripBooking; copy: ReturnType<typeof itineraryCopy>; selected: boolean; onSelect: (origin: HTMLButtonElement) => void }) {
  const Icon = booking.type === "stay" ? BedDouble : booking.type === "transport" ? Route : booking.type === "reservation" ? Utensils : BookOpenText;
  const state = booking.confirmation ? copy.confirmed : booking.type === "reservation" ? copy.reservation : copy.saved;
  return <article className={`${styles.bookingCard} ${selected ? styles.bookingCardSelected : ""}`}><Icon aria-hidden="true" /><EasyTButton className={styles.bookingCardSelect} variant="quiet" aria-pressed={selected} onClick={(event) => onSelect(event.currentTarget)}><span><strong>{booking.title}</strong><small>{state}{booking.confirmation ? ` · ${booking.confirmation}` : ""}{booking.date ? ` · ${booking.date}` : ""}</small></span></EasyTButton>{booking.confirmation ? <CheckCircle2 aria-hidden="true" /> : booking.url ? <a href={booking.url} target="_blank" rel="noopener noreferrer" aria-label={`${copy.bookingLink}: ${booking.title}`}><ExternalLink aria-hidden="true" /></a> : null}</article>;
}

function ItineraryLogisticsDetail({ trip, agenda = null, booking = null, language, onClose }: {
  trip: EasyTTrip;
  agenda?: ItineraryTransportAgendaLeg | null;
  booking?: TripBooking | null;
  language: "en" | "es";
  onClose: () => void;
}) {
  const copy = itineraryCopy(language);
  const shellRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [mobileSheet, setMobileSheet] = useState(false);
  const ownedBooking = agenda?.booking ?? booking;
  const from = agenda?.from.name ?? ownedBooking?.transportDetails?.from ?? null;
  const to = agenda?.to.name ?? ownedBooking?.transportDetails?.to ?? null;
  const title = agenda && from && to ? `${from} → ${to}` : ownedBooking?.title ?? copy.transportDetails;
  const durationMinutes = agenda ? agenda.leg.doorToDoorMinutes ?? agenda.leg.durationMinutes : null;
  const duration = typeof durationMinutes === "number" ? formatTripDuration(durationMinutes) : null;
  const mode = agenda ? transferJourneyModeLabel(agenda.leg) : ownedBooking?.transportDetails?.mode ?? null;
  const status = agenda
    ? agenda.booking?.confirmation ? copy.confirmedTransport
      : agenda.status === "booked" ? copy.transportBookingSaved
        : agenda.status === "confirm" ? copy.transferToConfirm
          : copy.planningDetailsAvailable
    : ownedBooking?.confirmation ? copy.confirmedBooking : copy.savedBookingDetails;
  const partnerAction = agenda ? omioBookingActionForLeg(trip, agenda.leg) : null;

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 900px)").matches;
    setMobileSheet(mobile);
    const previousOverflow = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !mobile || !shellRef.current) return;
      const focusable = [...shellRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      if (mobile) document.body.style.overflow = previousOverflow;
    };
  }, [onClose, title]);

  return <>
    <EasyTButton className={styles.logisticsDetailScrim} iconOnly variant="quiet" aria-label={`${copy.cancel}: ${title}`} onClick={onClose}>{copy.cancel}</EasyTButton>
    <section ref={shellRef} className={styles.logisticsDetail} role={mobileSheet ? "dialog" : "region"} aria-modal={mobileSheet || undefined} aria-label={`${copy.details}: ${title}`}>
      <EasyTButton ref={closeRef} className={styles.logisticsDetailClose} icon={X} iconOnly variant="secondary" aria-label={`${copy.cancel}: ${title}`} onClick={onClose}>{copy.cancel}</EasyTButton>
      <header>
        <span>{agenda ? copy.transfer : copy.booking}</span>
        <h2>{title}</h2>
        <p>{status}</p>
      </header>
      <dl>
        {agenda?.date ? <div><dt>{copy.day}</dt><dd>{displayDate(agenda.date, language)}</dd></div> : ownedBooking?.date ? <div><dt>{copy.day}</dt><dd>{displayDate(ownedBooking.date, language)}</dd></div> : null}
        {mode ? <div><dt>{copy.mode}</dt><dd>{mode}</dd></div> : null}
        {agenda ? <div><dt>{copy.duration}</dt><dd>{duration ? `${agenda.leg.provenance === "planning_estimate" || agenda.leg.provenance === "routing_engine" ? "~" : ""}${duration}` : copy.unknownTiming}</dd></div> : null}
        {agenda?.leg.confidence ? <div><dt>{copy.confidence}</dt><dd>{agenda.leg.confidence}</dd></div> : null}
        {ownedBooking?.confirmation ? <div><dt>{copy.confirmation}</dt><dd>{ownedBooking.confirmation}</dd></div> : null}
        {ownedBooking?.importDetails?.provider ? <div><dt>{copy.provider}</dt><dd>{ownedBooking.importDetails.provider}</dd></div> : null}
      </dl>
      {agenda && transferJourneySegmentSummary(agenda.leg) ? <p className={styles.logisticsDetailSummary}>{transferJourneySegmentSummary(agenda.leg)}</p> : null}
      {agenda?.leg.warnings?.length ? <ul>{agenda.leg.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
      {ownedBooking?.notes?.length ? <ul>{ownedBooking.notes.map((note) => <li key={note}>{note}</li>)}</ul> : null}
      <div className={styles.logisticsDetailActions}>
        {ownedBooking?.url ? <EasyTLinkButton href={ownedBooking.url} target="_blank" rel="noopener noreferrer" icon={ExternalLink}>{copy.openBooking}</EasyTLinkButton> : null}
        {agenda || ownedBooking?.type === "transport" ? <EasyTLinkButton href={transportWorkspaceHref(trip.id)} icon={Route} variant="secondary">{copy.openTransport}</EasyTLinkButton> : null}
        {partnerAction && agenda ? <OmioTransportAction action={partnerAction} trip={trip} leg={agenda.leg} /> : null}
      </div>
    </section>
  </>;
}
