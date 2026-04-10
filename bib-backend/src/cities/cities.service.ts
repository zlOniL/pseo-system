import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { slugify } from '../common/slug';

// Localities that require "na" (feminine article) in the URL and display
const PREP_NA = new Set([
  'Amadora', 'Maia', 'Moita', 'Margem Sul', 'Quinta do Conde',
  'Pontinha', 'Odivelas', 'Reboleira', 'Brandoa', 'Damaia', 'Venda Nova',
]);

// Localities that require "no" (masculine article) in the URL and display
const PREP_NO = new Set([
  'Porto', 'Barreiro', 'Seixal', 'Montijo', 'Pinhal Novo',
  'Gavà', 'Alentejo', 'Algarve',
]);

function getPrep(name: string): string {
  if (PREP_NA.has(name)) return 'na';
  if (PREP_NO.has(name)) return 'no';
  return 'em';
}

@Injectable()
export class CitiesService implements OnModuleInit {
  private readonly logger = new Logger(CitiesService.name);

  /** region name → ordered list of locality names */
  private regions: Map<string, string[]> = new Map();

  onModuleInit() {
    const localPath = path.join(process.cwd(), 'CITIES.md');
    const citiesPath = process.env.CITIES_PATH
      ?? (fs.existsSync(localPath) ? localPath : path.join(process.cwd(), '../CITIES.md'));

    try {
      const content = fs.readFileSync(citiesPath, 'utf-8');
      this.regions = this.parseCities(content);
      let total = 0;
      this.regions.forEach((locs) => (total += locs.length));
      this.logger.log(`Loaded ${this.regions.size} regions, ${total} localities from CITIES.md`);
    } catch (err) {
      this.logger.warn(`Could not load CITIES.md from ${citiesPath}: ${(err as Error).message}`);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Returns all regions with their ordered list of localities.
   * Used by the /cities endpoint consumed by the frontend Scale page.
   */
  getAllRegions(): { region: string; cities: string[] }[] {
    return Array.from(this.regions.entries()).map(([region, cities]) => ({
      region,
      cities,
    }));
  }

  /**
   * Returns the region name for a given locality (case-insensitive search).
   * Returns null if not found.
   */
  findRegion(name: string): string | null {
    const lower = name.toLowerCase().trim();
    for (const [region, localities] of this.regions) {
      if (
        region.toLowerCase() === lower ||
        localities.some((l) => l.toLowerCase() === lower)
      ) {
        return region;
      }
    }
    return null;
  }

  /**
   * Returns all localities for a given region, excluding `excludeName`.
   */
  getLocalities(regionName: string, excludeName?: string): string[] {
    const locs = this.regions.get(regionName) ?? [];
    if (!excludeName) return locs;
    const lower = excludeName.toLowerCase();
    return locs.filter((l) => l.toLowerCase() !== lower);
  }

  /**
   * Builds the full "Atendemos Também" HTML block (h2 + ul with anchor links).
   * The links use the pattern: {wpBaseUrl}/{serviceSlug}-{prep}-{localitySlug}/
   */
  buildAtendemosTambem(
    cityName: string,
    service: string,
    serviceSlug: string,
    wpBaseUrl: string,
  ): string {
    const region = this.findRegion(cityName);
    if (!region) {
      this.logger.warn(`City "${cityName}" not found in CITIES.md — "Atendemos Também" will be empty`);
      return `<h2 style="color: #320000;">Atendemos Também</h2>\n<ul>\n</ul>`;
    }

    const localities = this.getLocalities(region, cityName);

    const items = localities.map((loc) => {
      const prep = getPrep(loc);
      const locSlug = slugify(loc);
      const url = `${wpBaseUrl}/${serviceSlug}-${prep}-${locSlug}/`;
      const label = `${service} ${loc}`;
      return `<li><a style="color: #111 !important; font-weight: 600; text-decoration: underline;" href="${url}">${label}</a></li>`;
    });

    const half = Math.ceil(items.length / 2);
    const col1 = items.slice(0, half);
    const col2 = items.slice(half);

    return [
      `<h2 style="color: #320000;">Atendemos Também</h2>`,
      `<div style="display: flex; flex-wrap: wrap; gap: 20px;">`,
      `<div style="flex: 1; min-width: 260px;"><ul style="list-style: none; padding-left: 0;">`,
      ...col1,
      `</ul></div>`,
      `<div style="flex: 1; min-width: 260px;"><ul style="list-style: none; padding-left: 0;">`,
      ...col2,
      `</ul></div>`,
      `</div>`,
    ].join('\n');
  }

  // ── Parser ─────────────────────────────────────────────────────────────────

  private parseCities(content: string): Map<string, string[]> {
    const result: Map<string, string[]> = new Map();
    let currentRegion = '';

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;

      const hasSeparator = line.includes(' - ') || line.includes(' | ') ||
                           line.includes('- ') || line.includes(' -');

      if (!hasSeparator) {
        // This is a region header
        currentRegion = line;
        // Add the region name itself as the first locality
        result.set(currentRegion, [currentRegion]);
        continue;
      }

      if (!currentRegion) continue;

      // Parse locality list — split on " - ", "- ", " | ", "|"
      // Handles edge cases like "Roma- Rato" (no space before dash)
      const localities = line
        .split(/\s*[-|]\s+|\s+[-|]\s*/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const existing = result.get(currentRegion)!;
      const existingLower = new Set(existing.map((l) => l.toLowerCase()));

      for (const loc of localities) {
        if (!existingLower.has(loc.toLowerCase())) {
          existing.push(loc);
          existingLower.add(loc.toLowerCase());
        }
      }
    }

    return result;
  }
}
