// Checks every Find search path keeps to the city picked. Run after changing
// search or ranking: npx tsx --tsconfig tsconfig.json scripts/city-audit.mts

import {buildFallbackResponse} from '@/lib/fallback-response';
import {searchCatalogForAgent, findVenueOption, venueInCity, getVenueOptionsForIntent} from '@/lib/venue-options';
import {catalogPlace, catalogCity} from '@/lib/catalog';
import {zonesOf} from '@/lib/zones';

let checks = 0;
const failures: string[] = [];
const ok = (id: string, city: string, label: string) => {
  checks++;
  const p = catalogPlace(id);
  if (p == null) return; // not a catalog place
  if (p.city !== city && p.near !== city) failures.push(`${label}: ${p.name} is ${p.city}`);
};

const INTENTS = ['Something casual, nothing fussy.', "I'm looking for a date night table.", 'Find me a Michelin star table.', 'group'];
const TERMS = ['wine', 'pizza', 'sushi', 'steak', 'seafood', 'vegan', 'Known for wine', 'Great cocktails', 'Cheaper', 'Good for groups', 'Show more restaurants'];

for (const city of ['Amsterdam', 'London'] as const) {
  const zoneSets = [[], ...zonesOf(city).map((z) => [z.id]), zonesOf(city).slice(0, 2).map((z) => z.id)];
  // 1. The agent's catalog tool
  for (const vibe of ['casual', 'date night', 'michelin star', 'group', '']) {
    for (const zones of zoneSets) {
      for (const r of searchCatalogForAgent({vibe, city, zones, limit: 24})) ok(r.id, city, `agent ${city} ${vibe} ${zones}`);
    }
  }
  for (const query of ['wine', 'pizza', 'sushi', 'Dishoom', 'De Kas', 'cocktail', 'bar']) {
    for (const r of searchCatalogForAgent({query, city, limit: 24})) ok(r.id, city, `agent ${city} query ${query}`);
    for (const r of searchCatalogForAgent({vibe: 'casual', near: 'Soho', city})) ok(r.id, city, `agent ${city} near Soho`);
    for (const r of searchCatalogForAgent({vibe: 'casual', near: 'De Pijp', city})) ok(r.id, city, `agent ${city} near De Pijp`);
  }
  // 2. The catalog fallback, whole flow
  for (const intent of INTENTS) {
    for (const zones of zoneSets) {
      for (const meal of [['2026-11-27', '12:30pm'], ['2026-11-28', '7:30pm']]) {
        for (const term of [undefined, ...TERMS]) {
          for (const page of [0, 1, 2]) {
            const draft = {intent, partySize: '4', location: city, zones, date: meal[0], time: meal[1], dietaryNeeds: 'none' as const, searchQuery: term, venueResultsPage: page};
            const message = term == null ? 'No restrictions' : page > 0 ? 'Show more restaurants' : term;
            const res = (await buildFallbackResponse(message, draft as never)) as {ui?: {interactive?: {options?: {id: string}[]}}};
            for (const o of res.ui?.interactive?.options ?? []) ok(o.id, city, `fallback ${city} ${intent.slice(0, 12)} zones=${zones} ${meal[1]} "${term}" p${page}`);
          }
        }
      }
    }
  }
  // Every zone's own list stays in the city
  for (const zones of zoneSets) for (const v of getVenueOptionsForIntent('casual', city, zones)) ok(v.id, city, `intent list ${city} ${zones}`);
}

// 3. The server's last check
const ams = findVenueOption('De Kas')!, lon = findVenueOption('Dishoom Covent Garden')!;
if (venueInCity(ams, 'London')) failures.push('venueInCity let De Kas into London');
if (!venueInCity(lon, 'London')) failures.push('venueInCity dropped Dishoom from London');
if (!venueInCity({id: 'web:x', title: 'Some new place'}, 'London')) failures.push('venueInCity dropped an unknown web venue');
if (venueInCity({id: 'web:x', title: 'de kas'}, 'London')) failures.push('venueInCity let an Amsterdam name in by title');

checks += 4;




// 4. Exact matching only
checks += 2;
if (findVenueOption('Kas') != null) failures.push('findVenueOption still matches part of a name');
if (findVenueOption('') != null) failures.push('findVenueOption matched an empty name');
// 5. City words
for (const [text, want] of [['Soho', 'London'], ['Shoreditch', 'London'], ['De Pijp', 'Amsterdam'], ['london', 'London'], ['Amsterdam Noord', 'Amsterdam'], ['Covent Garden', 'London'], ['Jordaan', 'Amsterdam']] as const) {
  checks++;
  if (catalogCity(text) !== want) failures.push(`catalogCity("${text}") = ${catalogCity(text)}, want ${want}`);
}
console.log(`${checks} checks, ${failures.length} failures`);
for (const f of [...new Set(failures)].slice(0, 30)) console.log(' -', f);
