export type WorldCountry = { rank: number; name: string; visitors: string };

// Baseline discovery coverage follows Visitors Per Year's 100 most-visited countries.
// A live discovery route enriches these entry points with current, destination-specific results.
const rawCountries = [
  ["France", "104.0M"], ["Spain", "97.0M"], ["United States", "78.5M"], ["China", "73.3M"], ["Italy", "59.5M"], ["Turkey", "58.9M"], ["Hong Kong", "50.9M"], ["Mexico", "45.5M"], ["United Kingdom", "43.9M"], ["Japan", "42.7M"],
  ["Germany", "39.4M"], ["Macau", "39.4M"], ["Greece", "38.6M"], ["Thailand", "37.6M"], ["Austria", "33.8M"], ["Portugal", "33.4M"], ["Saudi Arabia", "30.6M"], ["Malaysia", "26.5M"], ["Russia", "25.4M"], ["Poland", "23.7M"],
  ["Croatia", "22.7M"], ["Canada", "22.3M"], ["Netherlands", "22.3M"], ["Czech Republic", "22.1M"], ["India", "20.0M"], ["Morocco", "19.8M"], ["Hungary", "19.3M"], ["United Arab Emirates", "19.3M"], ["Egypt", "18.8M"], ["Vietnam", "18.6M"],
  ["South Korea", "18.5M"], ["Singapore", "17.5M"], ["Romania", "15.2M"], ["Switzerland", "13.1M"], ["Indonesia", "12.4M"], ["Ireland", "11.7M"], ["Tunisia", "11.4M"], ["South Africa", "10.6M"], ["Albania", "10.6M"], ["Australia", "10.1M"],
  ["Belgium", "10.1M"], ["Bulgaria", "9.8M"], ["Denmark", "9.7M"], ["Brazil", "9.2M"], ["Dominican Republic", "8.5M"], ["Sweden", "8.1M"], ["Georgia", "7.5M"], ["Norway", "7.4M"], ["Taiwan", "7.3M"], ["Bahamas", "7.2M"],
  ["Argentina", "7.1M"], ["Uzbekistan", "7.0M"], ["Colombia", "7.0M"], ["Slovenia", "6.8M"], ["Bahrain", "6.0M"], ["Cambodia", "5.8M"], ["Philippines", "5.8M"], ["Slovakia", "5.7M"], ["Puerto Rico", "5.6M"], ["Chile", "5.6M"],
  ["Jordan", "5.5M"], ["Iran", "4.8M"], ["Kazakhstan", "4.8M"], ["Serbia", "4.6M"], ["Estonia", "4.5M"], ["Lithuania", "4.2M"], ["Qatar", "4.1M"], ["Jamaica", "4.0M"], ["Cyprus", "4.0M"], ["Algeria", "3.9M"],
  ["Uruguay", "3.8M"], ["Oman", "3.7M"], ["New Zealand", "3.7M"], ["Malta", "3.6M"], ["Laos", "3.6M"], ["Finland", "3.5M"], ["Peru", "3.4M"], ["Costa Rica", "3.4M"], ["Azerbaijan", "3.3M"], ["Andorra", "3.2M"],
  ["Israel", "3.1M"], ["Montenegro", "3.0M"], ["Iceland", "3.0M"], ["Ukraine", "2.6M"], ["Kenya", "2.6M"], ["Panama", "2.5M"], ["El Salvador", "2.5M"], ["Guatemala", "2.5M"], ["Ivory Coast", "2.4M"], ["Bosnia and Herzegovina", "2.3M"],
  ["Tanzania", "2.3M"], ["Armenia", "2.2M"], ["Sri Lanka", "2.2M"], ["Latvia", "2.2M"], ["Maldives", "2.2M"], ["Honduras", "2.1M"], ["Nigeria", "2.1M"], ["Senegal", "2.0M"], ["Botswana", "1.9M"], ["Ecuador", "1.8M"],
] as const;

export const worldCountries: WorldCountry[] = rawCountries.map(([name, visitors], index) => ({ rank: index + 1, name, visitors }));

export const editorialStartingPoints: Record<string, string[]> = {
  france: ["Paris · Eiffel Tower & Louvre", "Provence · villages & markets", "French Riviera · Nice & coastal towns"],
  spain: ["Barcelona · Gaudí & old city", "Andalusia · Seville, Granada & Córdoba", "Madrid · art museums & food"],
  "united states": ["New York City · neighbourhoods & museums", "National parks · a landscape chapter", "California · coast, cities & desert"],
  italy: ["Rome · ancient city & food", "Florence · art & Tuscan day trips", "Venice · lagoon & canals"],
  turkey: ["Istanbul · Bosphorus & old city", "Cappadocia · valleys & cave towns", "Turquoise Coast · beaches & ruins"],
  mexico: ["Mexico City · food & museums", "Yucatán · cenotes & Maya sites", "Oaxaca · markets & culture"],
  "united kingdom": ["London · culture & neighbourhoods", "Edinburgh · history & hills", "Lake District or Highlands · landscape"],
  thailand: ["Bangkok · food & temples", "Chiang Mai · markets & mountains", "Southern islands · coast time"],
  germany: ["Berlin · culture & contemporary history", "Bavaria · Munich & Alps", "Rhine or Black Forest · slower landscapes"],
  greece: ["Athens · ancient sites & food", "Cyclades · island architecture", "Crete · coast & mountain villages"],
  portugal: ["Lisbon · hills, tiles & food", "Porto · river & wine country", "Algarve · cliffs & beaches"],
  morocco: ["Marrakech · medina & food", "Atlas Mountains · village landscape", "Fes · old city craft"],
  "united arab emirates": ["Dubai · contemporary city", "Abu Dhabi · architecture & museums", "Desert · a slower contrast"],
  egypt: ["Cairo · pyramids & museums", "Luxor · temples & Nile", "Red Sea · coast & diving"],
  vietnam: ["Hanoi · food & old quarter", "Ha Long or Ninh Binh · karst landscapes", "Hoi An · heritage & coast"],
  "south korea": ["Seoul · food, design & palaces", "Busan · coast & seafood", "Gyeongju · historic Korea"],
  singapore: ["Hawker centres · food-first city", "Gardens & waterfront", "Neighbourhoods · Katong, Tiong Bahru & Joo Chiat"],
  indonesia: ["Bali · temples, rice terraces & coast", "Komodo · dragons & islands", "Java · volcanoes & heritage"],
  australia: ["Sydney · harbour & beaches", "Great Barrier Reef · coast", "Red Centre · desert landscape"],
  brazil: ["Rio · mountains, beach & city", "Iguaçu · waterfall landscape", "Salvador · music & heritage"],
  peru: ["Cusco & Machu Picchu", "Sacred Valley · landscapes & villages", "Lima · food"],
  "costa rica": ["Arenal · volcano & hot springs", "Manuel Antonio · coast & wildlife", "Monteverde · cloud forest"],
  iceland: ["Reykjavík · food & design", "South Coast · waterfalls & black sand", "Golden Circle · geothermal landscape"],
  "new zealand": ["South Island · mountains & lakes", "Queenstown · outdoor base", "North Island · geothermal landscapes"],
};

export type AttractionSeed = { title: string; area: string; type: string; duration: string; description: string };

// Country-level destination signals adapted from the Visitors Per Year country pages.
// These are deliberately specific places, not generic tourism categories.
export const rankedCountryPlaces: Record<string, AttractionSeed[]> = {
  peru: [
    { title: "Cusco", area: "Cusco", type: "Historic city", duration: "2 days", description: "The essential acclimatisation base for Inca history, food and the Sacred Valley route." },
    { title: "Machu Picchu", area: "Cusco Region", type: "World heritage", duration: "1 day", description: "A protected, timed-ticket day best reached from Cusco or the Sacred Valley." },
    { title: "Sacred Valley", area: "Cusco Region", type: "Landscape + culture", duration: "1–2 days", description: "Inca sites, villages and mountain landscapes that sit naturally between Cusco and Machu Picchu." },
    { title: "Lake Titicaca", area: "Puno", type: "Landscape + culture", duration: "1–2 days", description: "A high-altitude lake chapter for island communities and big Andean light." },
    { title: "Colca Canyon", area: "Arequipa", type: "Landscape", duration: "2 days", description: "A deep-canyon route with condors, highland scenery and a natural Arequipa base." },
    { title: "Arequipa", area: "Arequipa", type: "Historic city", duration: "1–2 days", description: "White volcanic-stone architecture, excellent food and the best springboard for Colca." },
    { title: "Lima", area: "Lima", type: "Food + city", duration: "2 days", description: "A Pacific food capital that works best as a deliberate city chapter rather than a layover." },
    { title: "Paracas & Ballestas Islands", area: "Ica", type: "Coast + wildlife", duration: "1 day", description: "Desert coast, sea birds and a manageable nature detour south of Lima." },
    { title: "Huacachina", area: "Ica", type: "Desert", duration: "Half day", description: "A small oasis-and-dunes stop that combines well with a Paracas or Nazca leg." },
    { title: "Huaraz & Cordillera Blanca", area: "Ancash", type: "Mountains", duration: "3–4 days", description: "A proper hiking chapter for glacial lakes and big Andean trails." },
  ],
  guatemala: [
    { title: "Antigua Guatemala", area: "Sacatepéquez", type: "Historic city", duration: "2–3 days", description: "A colonial base for volcano views, food and nearby hikes." },
    { title: "Tikal National Park", area: "Petén", type: "Maya heritage", duration: "1–2 days", description: "Towering Maya temples in rainforest, usually based from Flores." },
    { title: "Flores", area: "Petén", type: "Lake town", duration: "1 day", description: "The compact island base for Tikal and the wider Petén region." },
    { title: "Lake Atitlán", area: "Sololá", type: "Lake + villages", duration: "2–3 days", description: "Volcanic lake scenery, village walks and slow café days." },
    { title: "Acatenango Volcano", area: "Antigua", type: "Hike", duration: "2 days", description: "An overnight volcano hike with Fuego views; weather and fitness dependent." },
    { title: "Semuc Champey", area: "Alta Verapaz", type: "Nature", duration: "1–2 days", description: "Limestone pools and forest landscapes that need a dedicated transfer day." },
    { title: "Quetzaltenango", area: "Western Highlands", type: "Highland city", duration: "2 days", description: "A cooler base for markets, hot springs and indigenous highland culture." },
    { title: "Chichicastenango Market", area: "El Quiché", type: "Market", duration: "Half day", description: "A colourful market day best timed to market days and linked with the highlands." },
    { title: "Rio Dulce", area: "Izabal", type: "River + coast", duration: "1–2 days", description: "A river journey towards the Caribbean and Garifuna coast." },
    { title: "El Mirador", area: "Petén", type: "Remote Maya site", duration: "5 days", description: "A true expedition for travellers wanting a multi-day jungle archaeology trek." },
  ],
  jamaica: [
    { title: "Kingston & the Bob Marley Museum", area: "Kingston", type: "Culture + music", duration: "1–2 days", description: "Jamaica’s capital for music history, galleries and a food-led city chapter." },
    { title: "Blue Mountains", area: "Portland · St Andrew", type: "Mountains + coffee", duration: "1–2 days", description: "A cooler mountain chapter for coffee estates, ridge views and early hiking." },
    { title: "Dunn’s River Falls", area: "Ocho Rios", type: "Waterfall + coast", duration: "Half day", description: "Jamaica’s signature waterfall stop, easy to combine with an Ocho Rios coast day." },
    { title: "Negril Seven Mile Beach", area: "Negril", type: "Beach", duration: "2–3 days", description: "A west-coast base for long beach days, sunset and the cliffs around Negril." },
    { title: "Port Antonio & Blue Lagoon", area: "Portland", type: "Coast + nature", duration: "2–3 days", description: "A quieter east-coast chapter of coves, rainforest and striking blue water." },
    { title: "Rick’s Cafe and Negril cliffs", area: "Negril", type: "Coast + sunset", duration: "Evening", description: "A sunset-focused addition to a Negril base rather than a separate cross-island stop." },
    { title: "Martha Brae River", area: "Trelawny", type: "River", duration: "Half day", description: "A gentle rafting-style river pause that combines naturally with the north coast." },
    { title: "Luminous Lagoon", area: "Falmouth", type: "Nature", duration: "Evening", description: "A bioluminescent-water evening excursion best planned from the north coast." },
    { title: "Reach Falls", area: "Portland", type: "Waterfall + hike", duration: "Half day", description: "A less commercial waterfall and river stop for a Port Antonio or Portland stay." },
    { title: "Treasure Beach", area: "South coast", type: "Slow coast", duration: "2 days", description: "A low-key fishing-village alternative for travellers who want a quieter coastal finish." },
  ],
  colombia: [
    { title: "Bogotá", area: "Bogotá", type: "City + culture", duration: "2 days", description: "Museums, food and a high-altitude city base before heading elsewhere." },
    { title: "Medellín", area: "Antioquia", type: "City + neighbourhoods", duration: "2–3 days", description: "A mild-climate city chapter with cable cars, design and food." },
    { title: "Cartagena", area: "Caribbean coast", type: "Historic city", duration: "2 days", description: "Walled-city streets, Caribbean food and an easy coast finale." },
    { title: "Coffee Region", area: "Salento · Pereira", type: "Landscape + food", duration: "2–3 days", description: "Coffee farms, wax palms and small-town mountain scenery." },
    { title: "Tayrona National Park", area: "Santa Marta", type: "Coast + hike", duration: "1–2 days", description: "A coastal walking and beach chapter, best planned around access and conditions." },
    { title: "Villa de Leyva", area: "Boyacá", type: "Historic town", duration: "1–2 days", description: "A calm whitewashed colonial pause from Bogotá." },
    { title: "Guatapé", area: "Antioquia", type: "Lake + viewpoint", duration: "1 day", description: "A colourful day trip or overnight from Medellín centred on El Peñol." },
    { title: "San Andrés", area: "Caribbean", type: "Island", duration: "2–3 days", description: "A Caribbean island add-on for sea time and snorkelling." },
    { title: "Cali", area: "Valle del Cauca", type: "Music + food", duration: "1–2 days", description: "Salsa culture, warm evenings and a different Colombian rhythm." },
    { title: "Los Nevados National Park", area: "Coffee Region", type: "Mountains", duration: "1 day", description: "High-altitude páramo trails and volcanic landscapes from the coffee region." },
  ],
};

// The high-traffic countries get an editorially selected first layer. Live search then broadens
// each country rather than asking an unranked source to decide the whole itinerary on its own.
export const featuredAttractions: Record<string, AttractionSeed[]> = {
  france: [
    { title: "Eiffel Tower & the Seine", area: "Paris", type: "Landmark", duration: "Half day", description: "A classic first Paris chapter, best paired with one walkable bank of the Seine rather than a whole-city dash." },
    { title: "Louvre or Musée d’Orsay", area: "Paris", type: "Art", duration: "Half day", description: "Choose one major museum and let the rest of the day stay in the surrounding neighbourhood." },
    { title: "Mont-Saint-Michel", area: "Normandy", type: "Landscape + heritage", duration: "1 day", description: "A distinct tide-and-architecture day that deserves a dedicated overnight or well-planned excursion." },
    { title: "Provence villages & markets", area: "Provence", type: "Food + culture", duration: "2 days", description: "Build around a regional base rather than trying to tick off every hill town." },
  ],
  spain: [
    { title: "Sagrada Família & Modernisme", area: "Barcelona", type: "Architecture", duration: "Half day", description: "Use a timed Sagrada Família visit as the anchor for an Eixample and Gràcia day." },
    { title: "Alhambra", area: "Granada", type: "Heritage", duration: "Half day", description: "A booked-in-advance palace and gardens visit that should shape the day around it." },
    { title: "Seville old city", area: "Seville", type: "Culture", duration: "1 day", description: "Cathedral, Alcázar and evening tapas work best as one slow, shaded city day." },
    { title: "Camino or northern coast", area: "Galicia & Basque Country", type: "Landscape", duration: "2–4 days", description: "A weather-led, food-rich alternative to the main southern-city circuit." },
  ],
  "united states": [
    { title: "New York City neighbourhoods", area: "New York", type: "City", duration: "2–3 days", description: "Use a small number of walkable neighbourhood clusters, not one giant city checklist." },
    { title: "Grand Canyon", area: "Arizona", type: "Landscape", duration: "1–2 days", description: "A true destination in its own right, best protected from the start rather than squeezed into a road trip." },
    { title: "Yosemite Valley", area: "California", type: "National park", duration: "2–3 days", description: "Build enough time for the valley, viewpoints and one trail instead of treating it as a scenic drive." },
    { title: "New Orleans food & music", area: "Louisiana", type: "Food + culture", duration: "2 days", description: "A place-led city chapter where a looser plan is part of the appeal." },
  ],
  italy: [
    { title: "Colosseum & Roman Forum", area: "Rome", type: "Heritage", duration: "Half day", description: "Book the archaeological core, then let the rest of the day stay in central Rome." },
    { title: "Florence Renaissance core", area: "Florence", type: "Art + culture", duration: "1–2 days", description: "The Uffizi, Duomo and Oltrarno make sense as a dense, walkable art chapter." },
    { title: "Venice canals & lagoon", area: "Venice", type: "City", duration: "1–2 days", description: "Give Venice an early morning and an evening, when the city feels least like a queue." },
    { title: "Amalfi Coast or Dolomites", area: "South or north", type: "Landscape", duration: "2–3 days", description: "Choose one landscape chapter to keep the route coherent." },
  ],
  japan: [
    { title: "Tokyo food & neighbourhoods", area: "Tokyo", type: "City", duration: "2–3 days", description: "Use food-led neighbourhood clusters instead of crossing Tokyo repeatedly for isolated sights." },
    { title: "Kyoto temples & old quarters", area: "Kyoto", type: "Heritage", duration: "2–3 days", description: "Pick a small number of temple districts and protect early mornings from the biggest crowds." },
    { title: "Japanese Alps", area: "Takayama · Okuhida · Matsumoto", type: "Mountains", duration: "3–4 days", description: "A mountain-and-onsen chapter that gives the trip a striking contrast to the cities." },
    { title: "Miyajima & Hiroshima", area: "Chūgoku", type: "History + coast", duration: "2 days", description: "A meaningful history-and-island pairing that works best as one southbound leg." },
    { title: "Fushimi Inari after dawn", area: "Kyoto", type: "Heritage + walk", duration: "Half day", description: "The torii-gate trail is strongest as an early, lightly paced Kyoto morning." },
    { title: "Nara’s temples and deer park", area: "Nara", type: "Heritage + park", duration: "Half day", description: "An easy cultural day from Kyoto or Osaka, centred on Tōdai-ji and the surrounding park." },
    { title: "Osaka food neighbourhoods", area: "Osaka", type: "Food + city", duration: "1 day", description: "Build one bright, food-led city day around Dōtonbori, Kuromon and a looser evening." },
    { title: "Hakone art, lake and onsen", area: "Fuji-Hakone", type: "Landscape + onsen", duration: "1–2 days", description: "A restorative volcanic-lake and hot-spring chapter within reach of Tokyo." },
    { title: "Himeji Castle", area: "Hyōgo", type: "Heritage", duration: "Half day", description: "Japan’s defining original castle works naturally on a westbound rail day." },
    { title: "Naoshima art islands", area: "Seto Inland Sea", type: "Art + island", duration: "1–2 days", description: "A deliberately slower island chapter of architecture, galleries and sea views." },
  ],
  "hong kong": [
    { title: "Victoria Peak", area: "Central", type: "Viewpoint", duration: "Half day", description: "Pair the Peak Tram with Central and a harbour evening rather than making it a standalone sight." },
    { title: "Star Ferry at dusk", area: "Victoria Harbour", type: "City ritual", duration: "Evening", description: "The simplest skyline crossing, especially useful as a low-effort arrival-night plan." },
    { title: "Dragon’s Back", area: "Shek O", type: "Hike", duration: "Half day", description: "A ridge walk with an easy coast finish at Big Wave Bay or Shek O." },
    { title: "Tai Kwun & old Central", area: "Central", type: "Design + culture", duration: "Half day", description: "A compact culture cluster with galleries, heritage and steep city streets." },
    { title: "Man Mo Temple & Sheung Wan", area: "Sheung Wan", type: "Heritage + neighbourhood", duration: "Half day", description: "A textured walk through old shops, coffee, street markets and one of the city’s most atmospheric temples." },
    { title: "Big Buddha & Po Lin Monastery", area: "Lantau Island", type: "Landscape + heritage", duration: "Half day", description: "Take the cable car or ferry route for a very different, greener Hong Kong chapter." },
    { title: "M+ and West Kowloon", area: "West Kowloon", type: "Contemporary art", duration: "Half day", description: "A strong architecture-and-art counterpoint to the historic neighbourhoods and skyline." },
    { title: "Temple Street and Kowloon night", area: "Jordan · Yau Ma Tei", type: "Food + street life", duration: "Evening", description: "An unpolished, food-first evening with markets and easy access from the harbour." },
    { title: "Sai Kung coast and islands", area: "New Territories", type: "Coast + hiking", duration: "1 day", description: "A calmer landscape day of fishing villages, trails and island water away from the skyline." },
    { title: "Lantau Peak sunrise", area: "Lantau Island", type: "Hike", duration: "Half day", description: "A more ambitious mountain option for travellers who want a genuine dawn hike over the islands." },
  ],
  thailand: [
    { title: "Grand Palace & Wat Pho", area: "Bangkok", type: "Heritage", duration: "Half day", description: "Go early, then let the day move naturally along the river and old city." },
    { title: "Bangkok food night", area: "Bangkok", type: "Food", duration: "Evening", description: "Keep one evening flexible for a neighbourhood food crawl instead of booking every meal." },
    { title: "Chiang Mai temples & hills", area: "Northern Thailand", type: "Culture + nature", duration: "2 days", description: "A cooler, slower counterpoint to Bangkok that benefits from a proper base." },
    { title: "Andaman coast", area: "Krabi or Phuket", type: "Coast", duration: "2–3 days", description: "Choose a single island or coast base and avoid wasting days in repeated transfers." },
  ],
  china: [
    { title: "Great Wall", area: "Beijing", type: "Heritage", duration: "1 day", description: "A dedicated, weather-aware day trip; avoid pairing it with another major city attraction." },
    { title: "Terracotta Army", area: "Xi’an", type: "Heritage", duration: "Half day", description: "A focused visit that works naturally with the old city walls and Muslim Quarter." },
    { title: "Zhangjiajie National Forest Park", area: "Wulingyuan", type: "Landscape", duration: "2 days", description: "The sandstone pillars deserve time for both high viewpoints and forest-level routes." },
    { title: "Chengdu pandas & Sichuan food", area: "Chengdu", type: "Wildlife + food", duration: "1–2 days", description: "Go early for the pandas, then keep the city day intentionally loose and food-led." },
    { title: "Forbidden City & Temple of Heaven", area: "Beijing", type: "Imperial heritage", duration: "1 day", description: "A city day with enough scale to deserve one major palace axis and one calmer park chapter." },
    { title: "Li River and Yangshuo karsts", area: "Guilin · Guangxi", type: "Landscape", duration: "2 days", description: "A river-and-countryside chapter built around limestone peaks, cycling and a quieter base." },
    { title: "Huangshan mountain trails", area: "Anhui", type: "Mountain", duration: "2 days", description: "Granite peaks, cloud seas and old villages: a distinct hiking chapter rather than a quick viewpoint stop." },
    { title: "Potala Palace and Lhasa", area: "Tibet", type: "Heritage + altitude", duration: "2–3 days", description: "A high-altitude cultural chapter that needs its own pacing and acclimatisation time." },
    { title: "West Lake and Hangzhou", area: "Hangzhou", type: "Lake + culture", duration: "1–2 days", description: "A gentler water-and-garden pause that contrasts beautifully with the bigger cities." },
    { title: "Yunnan old towns and mountains", area: "Dali · Lijiang", type: "Culture + landscape", duration: "3–4 days", description: "A slower south-west route through mountain landscapes, minority cultures and historic lanes." },
  ],
  mexico: [
    { title: "Historic centre & museums", area: "Mexico City", type: "City", duration: "1–2 days", description: "Pair the Centro Histórico with one museum or neighbourhood rather than stacking every landmark." },
    { title: "Teotihuacan", area: "Mexico State", type: "Heritage", duration: "Half day", description: "An early-start excursion that needs a light city evening afterward." },
    { title: "Oaxaca food & craft", area: "Oaxaca", type: "Food + culture", duration: "2 days", description: "Markets, mezcal and nearby craft villages form a stronger chapter than a quick stop." },
    { title: "Yucatán cenotes & Maya sites", area: "Yucatán", type: "Landscape + heritage", duration: "2–3 days", description: "Choose one regional base for cenotes, ruins and coast rather than zig-zagging the peninsula." },
  ],
  "united kingdom": [
    { title: "London museums & neighbourhoods", area: "London", type: "City", duration: "2–3 days", description: "Use small geographic clusters and leave room for food, parks and a less scripted evening." },
    { title: "Edinburgh Old Town", area: "Edinburgh", type: "Heritage", duration: "1–2 days", description: "A compact historic core with a natural hill walk and food scene built in." },
    { title: "Lake District", area: "Cumbria", type: "Landscape", duration: "2 days", description: "A proper walking base, not an out-and-back day from a city." },
  ],
  "south korea": [
    { title: "Gyeongbokgung & Bukchon", area: "Seoul", type: "Culture", duration: "Half day", description: "A palace-and-old-neighbourhood cluster that works best early before the crowds build." },
    { title: "Busan coast & seafood", area: "Busan", type: "Coast + food", duration: "2 days", description: "A low-friction change of pace from Seoul with temples, walks and fish markets." },
    { title: "Gyeongju heritage", area: "Gyeongju", type: "Heritage", duration: "1 day", description: "Korea’s historic capital works well as a day from Busan or a one-night pause." },
  ],
};
