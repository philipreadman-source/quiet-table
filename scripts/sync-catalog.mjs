// Copies the iOS app's catalog into the web app: node scripts/sync-catalog.mjs
//
// The iOS repo (../quiet-table-ios) builds src/shared/catalog.json from its
// research data (Apple Maps, booking, prices, hours). The web reads that file
// as it is (restaurant data stays the same on both) and never writes to the
// iOS repo. Run it after each iOS catalog change, then commit
// src/data/catalog.json.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, '..', 'quiet-table-ios', 'src', 'shared', 'catalog.json');
const target = join(root, 'src', 'data', 'catalog.json');

const KEEP = [
  'id', 'name', 'city', 'area', 'cuisines', 'diet_tags', 'opening_hours', 'michelin', 'website',
  'description', 'kinds', 'rank', 'apple_maps_id', 'address', 'lat', 'lng', 'mentions',
  'instagram', 'booking', 'new_since', 'price', 'near', 'travel',
];

const places = JSON.parse(readFileSync(source, 'utf8')).map((place) => {
  return Object.fromEntries(KEEP.map((key) => [key, place[key] ?? null]));
});

writeFileSync(target, `${JSON.stringify(places)}\n`);
console.log(`${places.length} places → src/data/catalog.json`);
