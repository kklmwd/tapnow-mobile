import { AREAS } from '../config.mjs';

function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function inGeo(area, lat, lng) {
  if (area.circle) return haversineKm(area.circle, { lat, lng }) <= area.circle.km;
  if (area.box) return lng >= area.box.minLng && lat <= area.box.maxLat && lat >= area.box.minLat;
  return false;
}

// Whole-word match, so 'ubi' does not hit 'rubik' and 'expo' not 'exposure'.
function hasWord(text, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z])${escaped}(?![a-z])`).test(text);
}

// Returns the area name for a venue, or null when it is outside every area.
// `text` is any venue name/address text; lat/lng are optional.
export function matchArea({ text = '', lat, lng } = {}, areas = AREAS) {
  const t = text.toLowerCase();
  for (const area of areas) {
    if (area.keywords.some((k) => hasWord(t, k))) return area.name;
  }
  // Singapore postal codes are six digits; the first two give the sector.
  const code = t.match(/\b(\d{6})\b/)?.[1];
  if (code) {
    for (const area of areas) {
      if (area.postalSectors.includes(code.slice(0, 2))) return area.name;
    }
  }
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    for (const area of areas) {
      if (inGeo(area, lat, lng)) return area.name;
    }
  }
  return null;
}
