export const SPEECH_DISCLOSURE_ACKNOWLEDGEMENT_KEY = "morrovia-speech-disclosure-acknowledged-v1";

type DisclosureStorage = Pick<Storage, "getItem" | "setItem">;

export function speechDisclosureAcknowledged(storage: DisclosureStorage) {
  try {
    return storage.getItem(SPEECH_DISCLOSURE_ACKNOWLEDGEMENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function acknowledgeSpeechDisclosure(storage: DisclosureStorage) {
  try {
    storage.setItem(SPEECH_DISCLOSURE_ACKNOWLEDGEMENT_KEY, "1");
  } catch {
    // Recognition can still begin when storage is unavailable.
  }
}
