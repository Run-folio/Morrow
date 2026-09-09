/** Illustrative day ideas, never saved itinerary items or booked activities. */
const mornings: Record<string, string> = {
  Tokyo: "Explore the streets of Ginza", Kanazawa: "Make time for Kenrokuen", Takayama: "Explore the old town", Kyoto: "Take the quieter temple paths", Osaka: "Explore around Osaka Castle",
  Dubrovnik: "Walk the old-town lanes", Kotor: "Take in the bay", "Shkodër": "A slow start in northern Albania", Tirana: "Explore the city on foot",
  Hanoi: "Explore the Old Quarter", "Hoi An": "Cycle beyond the old town", "Ho Chi Minh City": "A neighbourhood and coffee morning", "Siem Reap": "Give Angkor Wat the morning",
  "Reykjavík": "Choose a Þingvellir landscape day", "Vík": "Make time for Skógafoss", "Höfn": "Explore the glacier-lagoon chapter", "Reykjahlíð": "Explore the Mývatn landscape", Akureyri: "A slow northern morning",
};
export function homepageSampleMorning(place: string) { return mornings[place] ?? `Explore ${place} at your own pace`; }
