// The live agent's catalog search tool (search_quiet_table_catalog).

import {searchCatalogForAgent} from '@/lib/venue-options';

export function searchTables(args: {
  vibe?: string;
  near?: string;
  party_size?: number;
  time_window?: string;
  dietary_restrictions?: string[];
  query?: string;
  limit?: number;
  city?: string;
  zones?: string[];
  exclude?: string[];
  wider?: boolean;
}) {
  // Catalog places only: the part of town searched, the places there not
  // shown yet, and how many more match close by.
  return searchCatalogForAgent({
    vibe: args.vibe,
    near: args.near,
    query: args.query,
    limit: args.limit ?? 12,
    city: args.city,
    zones: args.zones,
    exclude: args.exclude,
    wider: args.wider,
  });
}
