import { normalizePartnerCategories, partnerCategoriesByType } from "./partner-categories"

type Bilingual = readonly [de: string, en: string]
type Theme = {
  name: string
  description: Bilingual
  accent: string
  secondary: string
  layout: "editorial" | "panorama" | "dynamic" | "practical"
  icon: string
  label: Bilingual
  slogan: Bilingual
  headline: Bilingual
  introduction: Bilingual
  action: Bilingual
  planning: readonly [Bilingual, Bilingual, Bilingual]
  schema: string
}

// Stable IDs are persisted in microsite versions. Keep the food ID unchanged.
export const categoryMicrositeThemes = {
  "salon-studio": {
    name: "Salon & Beauty", accent: "#93634e", secondary: "#332923", layout: "editorial", icon: "scissors",
    description: ["Editorialer Look für Friseur, Barber, Nagel- und Kosmetikstudio.", "An editorial setting for hair, barber, nail and beauty studios."],
    label: ["Leistungen", "Services"], slogan: ["Zeit für deinen eigenen Look.", "Time for a look that feels like you."],
    headline: ["Dein Stil. Deine nächste Auszeit.", "Your style. Your next moment."],
    introduction: ["Entdecke die Leistungen und besprich deine Wünsche direkt mit dem Studio. Preise und verfügbare Termine erfährst du beim Team.", "Explore the services and discuss your ideas directly with the studio. Contact the team for prices and available appointments."],
    action: ["Termin anfragen", "Ask for an appointment"],
    planning: [["Wünsche besprechen", "Discuss your ideas"], ["Leistung und Preis klären", "Confirm service and price"], ["Termin vereinbaren", "Arrange your appointment"]], schema: "BeautySalon",
  },
  "wellness-retreat": {
    name: "Spa & Massage", accent: "#4e7769", secondary: "#263d36", layout: "editorial", icon: "leaf",
    description: ["Ruhige Bildsprache und Raum für Behandlungen und persönliche Auszeiten.", "Calm imagery with room for treatments and time to unwind."],
    label: ["Behandlungen", "Treatments"], slogan: ["Nimm dir Zeit für dich.", "Make a little time for yourself."],
    headline: ["Eine Pause, die dir gehört.", "A pause that belongs to you."],
    introduction: ["Finde eine Behandlung, die zu deiner Auszeit passt. Das Team informiert dich zu Ablauf, Dauer und verfügbaren Terminen.", "Find a treatment that suits your time out. Ask the team about the experience, duration and available appointments."],
    action: ["Auszeit anfragen", "Enquire about a visit"],
    planning: [["Behandlung auswählen", "Choose a treatment"], ["Dauer und Wünsche klären", "Discuss duration and preferences"], ["Auszeit vereinbaren", "Arrange your visit"]], schema: "DaySpa",
  },
  "hotel-stay": {
    name: "Hotel & Stay", accent: "#896b39", secondary: "#34352e", layout: "panorama", icon: "bed",
    description: ["Großzügiges Hotelporträt mit Aufenthalt, Anreise und direkter Anfrage.", "A spacious hotel story with stays, arrival details and direct enquiries."],
    label: ["Aufenthalt", "Your stay"], slogan: ["Ankommen. Bleiben. Wohlfühlen.", "Arrive. Settle in. Feel at home."],
    headline: ["Dein nächster Aufenthalt beginnt hier.", "Your next stay starts here."],
    introduction: ["Informiere dich über deinen Aufenthalt. Zimmerkategorien, Ausstattung und Verfügbarkeit bestätigt dir das Hotel direkt.", "Start planning your stay. The hotel can confirm room types, amenities and availability directly."],
    action: ["Aufenthalt anfragen", "Enquire about a stay"],
    planning: [["Reisezeitraum wählen", "Choose your travel dates"], ["Zimmer und Verfügbarkeit anfragen", "Ask about rooms and availability"], ["Anreise und Check-in klären", "Check arrival and check-in details"]], schema: "Hotel",
  },
  "car-care": {
    name: "Car Wash", accent: "#287a91", secondary: "#183741", layout: "practical", icon: "car",
    description: ["Klare Serviceübersicht für Fahrzeugpflege mit Preisen und Anfahrt.", "A clear car-care service overview with prices and directions."],
    label: ["Waschprogramme", "Wash programmes"], slogan: ["Frisch gepflegt. Bereit für die Straße.", "Freshly cared for. Ready for the road."],
    headline: ["Die passende Pflege für dein Fahrzeug.", "The right care for your vehicle."],
    introduction: ["Vergleiche die verfügbaren Programme und frage nach Fahrzeugmaßen, Preisen und dem Ablauf vor Ort.", "Explore the available programmes and ask about vehicle sizes, prices and how your visit works."],
    action: ["Fahrzeugpflege anfragen", "Ask about car care"],
    planning: [["Programm auswählen", "Choose a programme"], ["Fahrzeugmaße prüfen", "Check vehicle dimensions"], ["Öffnungszeiten und Anfahrt prüfen", "Check hours and directions"]], schema: "AutoWash",
  },
  "mobility-service": {
    name: "Taxi & Parking", accent: "#79702b", secondary: "#34372c", layout: "practical", icon: "route",
    description: ["Direkter Zugang zu Fahrtanfrage, Parkinformationen und Standort.", "Direct access to ride enquiries, parking information and location."],
    label: ["Mobilität", "Getting around"], slogan: ["Dein nächster Weg, einfach geplant.", "Make plans for your next journey."],
    headline: ["Gut unterwegs in deiner Stadt.", "Find your way around the city."],
    introduction: ["Kläre Verfügbarkeit, Preise und die Details deiner Fahrt oder deines Parkplatzes direkt beim Anbieter.", "Check availability, pricing and the details of your ride or parking directly with the provider."],
    action: ["Verfügbarkeit anfragen", "Check availability"],
    planning: [["Ort und Zeit festlegen", "Choose a place and time"], ["Verfügbarkeit und Tarif klären", "Check availability and rates"], ["Weg zum Standort planen", "Plan your route"]], schema: "LocalBusiness",
  },
  "cinema-showcase": {
    name: "Cinema", accent: "#ac4f43", secondary: "#34272c", layout: "panorama", icon: "film",
    description: ["Kinofeeling mit Programm, Vorstellung und Ticketinformationen.", "A cinematic setting for programmes, screenings and ticket information."],
    label: ["Kinoprogramm", "What's on"], slogan: ["Licht aus. Vorfreude an.", "Lights down. Something to look forward to."],
    headline: ["Dein nächster Kinoabend.", "Your next night at the movies."],
    introduction: ["Entdecke das Programm. Aktuelle Spielzeiten, Altersfreigaben, Sprachfassungen und Tickets findest du direkt beim Kino.", "Explore the programme. Check with the cinema for current showtimes, age ratings, language versions and tickets."],
    action: ["Programm & Tickets", "Programme & tickets"],
    planning: [["Film und Sprachfassung wählen", "Choose a film and language"], ["Spielzeit und Altersfreigabe prüfen", "Check showtime and age rating"], ["Tickets beim Kino buchen", "Book tickets with the cinema"]], schema: "MovieTheater",
  },
  "fitness-club": {
    name: "Fitness & Training", accent: "#60752e", secondary: "#293324", layout: "dynamic", icon: "dumbbell",
    description: ["Sportlicher Auftritt für Gym und CrossFit mit Training und Einstieg.", "An energetic setting for gyms and CrossFit, training and getting started."],
    label: ["Training", "Training"], slogan: ["Dein Tempo. Dein nächstes Ziel.", "Your pace. Your next goal."],
    headline: ["Mach Platz für Bewegung.", "Make room for movement."],
    introduction: ["Lerne die Trainingsmöglichkeiten kennen. Frage nach Einstieg, Kurszeiten und Mitgliedschaft, bevor du dein erstes Training planst.", "Explore the training options. Ask about getting started, class times and membership before planning your first session."],
    action: ["Training anfragen", "Enquire about training"],
    planning: [["Trainingsziel besprechen", "Discuss your training goals"], ["Einstieg und Kurszeiten klären", "Check induction and class times"], ["Erstes Training planen", "Plan your first session"]], schema: "ExerciseGym",
  },
  "adventure-play": {
    name: "Adventure & Games", accent: "#b15e30", secondary: "#3b3027", layout: "dynamic", icon: "mountain",
    description: ["Aktiver Auftritt für Klettern, Escape Room, Kart und gemeinsame Challenges.", "An active setting for climbing, escape rooms, karting and shared challenges."],
    label: ["Erlebnisse", "Experiences"], slogan: ["Raus aus dem Alltag. Rein ins Erlebnis.", "Out of the everyday. Into the experience."],
    headline: ["Das nächste Abenteuer wartet.", "Your next adventure awaits."],
    introduction: ["Plane dein Erlebnis mit Freunden oder als Gruppe. Kläre Dauer, Altersgrenzen, Ausrüstung und freie Zeiten direkt beim Team.", "Plan an experience with friends or a group. Check duration, age limits, equipment and available times with the team."],
    action: ["Erlebnis anfragen", "Enquire about an experience"],
    planning: [["Erlebnis und Gruppengröße wählen", "Choose an experience and group size"], ["Voraussetzungen und Dauer prüfen", "Check requirements and duration"], ["Termin beim Anbieter buchen", "Book a time with the venue"]], schema: "SportsActivityLocation",
  },
  "family-days": {
    name: "Family & Leisure", accent: "#378378", secondary: "#2c453f", layout: "dynamic", icon: "sun",
    description: ["Einladende Ausflugsseite für Schwimmbad, Zoo und Spielpark.", "An inviting day-out page for swimming pools, zoos and play parks."],
    label: ["Ausflugsziele", "Your day out"], slogan: ["Mehr Zeit zusammen. Mehr zu entdecken.", "More time together. More to discover."],
    headline: ["Ein Tag voller gemeinsamer Momente.", "A day of moments together."],
    introduction: ["Plane euren nächsten Ausflug. Informationen zu Eintritt, Altersgruppen und Besuchsbedingungen erhältst du direkt beim Anbieter.", "Plan your next day out. Contact the venue for admission, age groups and visitor information."],
    action: ["Besuch planen", "Plan a visit"],
    planning: [["Ausflugstag auswählen", "Choose a day to visit"], ["Eintritt und Besuchsregeln prüfen", "Check admission and visitor rules"], ["Anreise gemeinsam planen", "Plan your journey together"]], schema: "TouristAttraction",
  },
  "culture-discovery": {
    name: "Culture & Attractions", accent: "#89734d", secondary: "#39362c", layout: "panorama", icon: "landmark",
    description: ["Bildstarke Entdeckungsseite für Burgen und Sehenswürdigkeiten.", "An image-led discovery page for castles and local attractions."],
    label: ["Entdecken", "Discover"], slogan: ["Besondere Orte. Neue Perspektiven.", "Special places. Fresh perspectives."],
    headline: ["Entdecke die Geschichten vor deiner Tür.", "Discover the stories on your doorstep."],
    introduction: ["Lerne den Ort kennen und plane deinen Besuch. Frage nach Eintritt, Führungen, Zugänglichkeit und saisonalen Öffnungszeiten.", "Get to know the place and plan your visit. Ask about admission, guided visits, accessibility and seasonal opening hours."],
    action: ["Besuch planen", "Plan a visit"],
    planning: [["Ort entdecken", "Discover the place"], ["Eintritt und Führungen anfragen", "Ask about admission and tours"], ["Besuchszeit und Anreise planen", "Plan your visit and journey"]], schema: "TouristAttraction",
  },
  "services-local": {
    name: "Local Services", accent: "#487789", secondary: "#2c4049", layout: "practical", icon: "handshake",
    description: ["Flexible Servicevorlage für weitere lokale Dienstleister.", "A flexible service template for other local providers."],
    label: ["Leistungen", "Services"], slogan: ["Guter Service beginnt in deiner Nähe.", "Good service starts close to home."],
    headline: ["Persönlich anfragen. Einfach weiterkommen.", "Get in touch. Take the next step."],
    introduction: ["Informiere dich über die Leistungen und kläre Preise, Verfügbarkeit und deine Wünsche direkt mit dem Team.", "Explore the services and discuss prices, availability and your needs directly with the team."],
    action: ["Service anfragen", "Enquire about a service"],
    planning: [["Leistung auswählen", "Choose a service"], ["Details und Preis klären", "Discuss details and price"], ["Nächsten Schritt vereinbaren", "Arrange the next step"]], schema: "LocalBusiness",
  },
  "activities-explore": {
    name: "Local Experiences", accent: "#96633f", secondary: "#3b322d", layout: "dynamic", icon: "compass",
    description: ["Flexible Erlebnisvorlage für weitere Freizeitpartner.", "A flexible experience template for other activity partners."],
    label: ["Erlebnisse", "Experiences"], slogan: ["Mach etwas aus deiner freien Zeit.", "Make something of your free time."],
    headline: ["Dein nächstes Erlebnis beginnt hier.", "Your next experience starts here."],
    introduction: ["Entdecke die Möglichkeiten vor Ort. Frage das Team nach Ablauf, freien Zeiten und allem, was du für deinen Besuch wissen möchtest.", "Explore what is on offer. Ask the team about the experience, available times and anything you need to know before your visit."],
    action: ["Erlebnis anfragen", "Enquire about an experience"],
    planning: [["Erlebnis entdecken", "Explore the experience"], ["Details und Verfügbarkeit klären", "Check details and availability"], ["Besuch planen", "Plan your visit"]], schema: "LocalBusiness",
  },
} as const satisfies Record<string, Theme>

export type CategoryMicrositeTemplateId = keyof typeof categoryMicrositeThemes
export type PartnerTemplateId = "restaurant-premium" | CategoryMicrositeTemplateId
export type CategoryPartnerSeed = { type?: string | null; category?: string[] | null }

export const categoryTemplateIds: Record<string, CategoryMicrositeTemplateId> = {
  Hotel: "hotel-stay", "Car Wash": "car-care", "Parking Garage": "mobility-service", Taxi: "mobility-service",
  Hairdresser: "salon-studio", Barber: "salon-studio", "Nail Salon": "salon-studio", "Beauty Salon": "salon-studio",
  Massage: "wellness-retreat", Spa: "wellness-retreat", Cinema: "cinema-showcase",
  Gym: "fitness-club", CrossFit: "fitness-club",
  "Swimming Pool": "family-days", Zoo: "family-days", "Leisure Center": "family-days", "Play Park": "family-days",
  "Climbing Gym": "adventure-play", "Laser Tag": "adventure-play", "Trampoline Park": "adventure-play",
  "Escape Room": "adventure-play", "Mini Golf": "adventure-play", "Go-Karting": "adventure-play", Bowling: "adventure-play", Adventure: "adventure-play",
  Castle: "culture-discovery", Attraction: "culture-discovery", Experiences: "activities-explore",
}

export function categoryTemplateForPartner(partner: CategoryPartnerSeed): PartnerTemplateId | undefined {
  const type = partner.type?.trim().toLowerCase()
  if (["food & drink", "restaurant", "restuarant", "gastronomie"].includes(type || "")) return "restaurant-premium"
  const categories = normalizePartnerCategories(partner.category)
  // Within a known type, ignore stale categories left over from another type.
  const canonicalType = Object.keys(partnerCategoriesByType).find((key) => key.toLowerCase() === type)
  const allowed = canonicalType ? partnerCategoriesByType[canonicalType as keyof typeof partnerCategoriesByType] : undefined
  for (const category of categories) {
    if (allowed && !allowed.includes(category)) continue
    if (categoryTemplateIds[category]) return categoryTemplateIds[category]
    if (partnerCategoriesByType["Food & Drink"].includes(category)) return "restaurant-premium"
  }
  if (type === "wellness") return "wellness-retreat"
  if (type === "services") return "services-local"
  if (type === "activities") return "activities-explore"
  return undefined
}

export function themeText(value: Bilingual, language: "de" | "en") {
  return value[language === "en" ? 1 : 0]
}

// Category details specialize shared layouts without inventing partner services.
const categoryDetails: Record<string, { label: Bilingual; action?: Bilingual; note: Bilingual }> = {
  Hairdresser: { label: ["Schnitt & Styling", "Cut & styling"], note: ["Besprich Schnitt, Haarlänge und Stylingwünsche vor deinem Termin.", "Discuss your cut, hair length and styling preferences before your appointment."] },
  Barber: { label: ["Hair & Beard", "Hair & beard"], note: ["Frage nach Haarschnitt, Bartpflege und der passenden Terminlänge.", "Ask about haircuts, beard care and appointment duration."] },
  "Nail Salon": { label: ["Nägel & Pflege", "Nails & care"], note: ["Kläre Wunschdesign, Material und eine mögliche Entfernung vor deinem Termin.", "Discuss your design, materials and any removal needed before your appointment."] },
  "Beauty Salon": { label: ["Beauty & Pflege", "Beauty & care"], note: ["Besprich deine Pflegewünsche und die passende Behandlung mit dem Studio.", "Discuss your care preferences and treatment options with the studio."] },
  Massage: { label: ["Massagen", "Massages"], note: ["Frage nach Massageart, Dauer und dem Ablauf deines Termins.", "Ask about massage styles, duration and what to expect at your appointment."] },
  "Parking Garage": { label: ["Parken & Tarife", "Parking & rates"], action: ["Parkinformationen", "Parking information"], note: ["Prüfe Einfahrtshöhe, Tarife sowie Ein- und Ausfahrtszeiten vor deiner Anreise.", "Check height clearance, rates and entry and exit hours before arriving."] },
  Taxi: { label: ["Fahrten & Transfer", "Rides & transfers"], action: ["Fahrt anfragen", "Request a ride"], note: ["Nenne Abholort, Ziel, Uhrzeit und Personenzahl bei deiner Fahrtanfrage.", "Include your pickup location, destination, time and passenger count when requesting a ride."] },
  "Swimming Pool": { label: ["Schwimmen & Freizeit", "Swimming & leisure"], note: ["Prüfe Badezeiten, Eintritt und die geltenden Bade- und Aufsichtsregeln.", "Check swimming hours, admission and pool supervision rules."] },
  Zoo: { label: ["Dein Zoobesuch", "Your zoo visit"], note: ["Informiere dich über Eintritt, Rundwege und die Besuchsregeln des Zoos.", "Check admission, walking routes and the zoo's visitor guidelines."] },
  "Climbing Gym": { label: ["Klettern & Bouldern", "Climbing & bouldering"], note: ["Kläre Einweisung, Sicherungskenntnisse und benötigte Ausrüstung mit der Halle.", "Check induction, belaying requirements and equipment with the climbing venue."] },
  "Laser Tag": { label: ["Laser-Tag-Sessions", "Laser tag sessions"], note: ["Frage nach Gruppengröße, Mindestalter, Spieldauer und freien Sessions.", "Ask about group size, minimum age, game duration and available sessions."] },
  "Trampoline Park": { label: ["Sprungzeiten", "Jump sessions"], note: ["Prüfe Altersgrenzen, Sprungzeiten und Vorgaben zu Socken und Einweisung.", "Check age limits, jump times and requirements for socks and induction."] },
  "Play Park": { label: ["Spielen & Entdecken", "Play & discover"], note: ["Frage nach geeigneten Altersgruppen, Begleitpersonen und Eintritt.", "Ask about suitable ages, accompanying adults and admission."] },
  "Escape Room": { label: ["Räume & Missionen", "Rooms & missions"], note: ["Kläre Teamgröße, Sprache, Schwierigkeitsgrad und Spieldauer vor der Buchung.", "Check team size, language, difficulty and game duration before booking."] },
  "Mini Golf": { label: ["Deine nächste Runde", "Your next round"], note: ["Frage nach Spielzeiten, Gruppengröße und der Dauer einer Runde.", "Ask about playing times, group sizes and how long a round takes."] },
  "Go-Karting": { label: ["Rennen & Fahrzeiten", "Races & track times"], note: ["Prüfe Mindestgröße, Altersgrenzen, Einweisung und verfügbare Fahrzeiten.", "Check minimum height, age limits, briefing and available track times."] },
  Bowling: { label: ["Bahnen & Spielzeiten", "Lanes & game times"], note: ["Frage nach freien Bahnen, Personenzahl und Leihschuhen.", "Ask about available lanes, group size and shoe hire."] },
  CrossFit: { label: ["Workouts & Einstieg", "Workouts & getting started"], note: ["Besprich deinen Trainingsstand, Einführungskurse und die aktuellen Kurszeiten.", "Discuss your experience, introductory sessions and current class times."] },
  Castle: { label: ["Burg & Geschichte", "Castle & history"], note: ["Informiere dich über Führungen, Wege, Zugänglichkeit und saisonale Öffnungszeiten.", "Ask about tours, walking routes, accessibility and seasonal opening hours."] },
}

export function categoryThemeContent(partner: CategoryPartnerSeed, template: CategoryMicrositeTemplateId, language: "de" | "en") {
  const theme = categoryMicrositeThemes[template]
  const category = normalizePartnerCategories(partner.category).find((item) => categoryTemplateIds[item] === template)
  const detail = category ? categoryDetails[category] : undefined
  return {
    theme, category,
    label: themeText(detail?.label ?? theme.label, language),
    action: themeText(detail?.action ?? theme.action, language),
    note: themeText(detail?.note ?? theme.introduction, language),
    slogan: themeText(theme.slogan, language),
    headline: themeText(theme.headline, language),
    introduction: themeText(theme.introduction, language),
    planning: theme.planning.map((step) => themeText(step, language)),
  }
}
