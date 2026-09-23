import {
  MORROVIA_STOP_MARKER_CLASS,
  MORROVIA_STOP_MARKER_NUMBER_CLASS,
} from "./morrovia-map-presentation.ts";

export type MorroviaStopMarkerInput = {
  id: string;
  sequence: number;
  name: string;
  interactive: boolean;
  selected: boolean;
  origin?: boolean;
  journeyEnd?: boolean;
};

export type MorroviaStopMarkerState = {
  selected?: boolean;
  origin?: boolean;
  journeyEnd?: boolean;
};

export function morroviaStopMarkerModel(input: MorroviaStopMarkerInput) {
  return {
    tagName: input.interactive ? "button" : "span",
    text: String(input.sequence),
    label: `Stop ${input.sequence}: ${input.name}`,
    dataset: { mapStopId: input.id },
    classNames: [
      MORROVIA_STOP_MARKER_CLASS,
      !input.interactive && "is-preview",
      input.selected && "is-active",
      input.origin && "is-origin",
      input.journeyEnd && "is-destination",
    ].filter((className): className is string => Boolean(className)),
  };
}

export function createMorroviaStopMarker(
  documentOwner: { createElement: (tagName: string) => unknown },
  input: MorroviaStopMarkerInput,
) {
  const model = morroviaStopMarkerModel(input);
  const element = documentOwner.createElement(model.tagName) as HTMLElement;
  if (model.tagName === "button") (element as HTMLButtonElement).type = "button";
  element.className = model.classNames.join(" ");
  element.dataset.mapStopId = model.dataset.mapStopId;
  if (input.interactive) {
    element.setAttribute("aria-label", model.label);
    element.setAttribute("aria-pressed", String(input.selected));
  } else {
    element.setAttribute("aria-hidden", "true");
  }
  const number = documentOwner.createElement("span") as HTMLElement;
  number.className = MORROVIA_STOP_MARKER_NUMBER_CLASS;
  number.textContent = model.text;
  element.append(number);
  return element;
}

export function setMorroviaStopMarkerState(
  element: {
    classList: { toggle: (name: string, force?: boolean) => unknown };
    setAttribute: (name: string, value: string) => unknown;
  },
  state: MorroviaStopMarkerState,
) {
  if (state.selected !== undefined) {
    element.classList.toggle("is-active", state.selected);
    element.setAttribute("aria-pressed", String(state.selected));
  }
  if (state.origin !== undefined) element.classList.toggle("is-origin", state.origin);
  if (state.journeyEnd !== undefined) element.classList.toggle("is-destination", state.journeyEnd);
}
