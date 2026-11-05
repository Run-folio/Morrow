/** Underlying file identity, independent of Commons thumbnail size or tracking query. */
export function commonsImageIdentity(source: string): string | null {
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:') return null;
    let filename: string | undefined;
    if (url.hostname === 'commons.wikimedia.org') {
      const path = decodeURIComponent(url.pathname);
      filename = path.startsWith('/wiki/File:') ? path.slice('/wiki/File:'.length) : url.searchParams.get('title')?.replace(/^File:/, '');
    } else if (['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(url.hostname)) {
      const path = decodeURIComponent(url.pathname);
      filename = path.match(/^\/wikipedia\/commons\/thumb\/[^/]+\/[^/]+\/([^/]+)\//)?.[1]
        ?? path.match(/^\/wikipedia\/commons\/[^/]+\/[^/]+\/([^/]+)$/)?.[1];
    }
    return filename ? `commons:${filename.replaceAll('_', ' ').normalize('NFC')}` : null;
  } catch { return null; }
}

const viatorImageHosts = new Set(['media.tacdn.com', 'hare-media-cdn.tripadvisor.com', 'dynamic-media-cdn.tripadvisor.com']);
export function viatorImageIdentity(source: string): string | null {
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || !viatorImageHosts.has(url.hostname) || url.username || url.password) return null;
    const asset = url.pathname.match(/^\/media\/attractions-splice-spp-\d+x\d+\/(.+)$/)?.[1];
    return asset ? `viator-photo:${decodeURIComponent(asset)}` : null;
  } catch { return null; }
}

const firstPartyHosts = new Set(['morrovia.com', 'www.morrovia.com', 'staging.morrovia.com', 'localhost', '127.0.0.1']);
const cacheModifier = /^(?:_|t|ts|timestamp|cb|cachebust(?:er)?|cache[-_]?(?:bust|key|version)|v|ver|version|rev|revision|w|width|h|height|q|quality|dpr|auto|fit|crop|format)$/i;

/** Normalize transport/resize modifiers without discarding content identifiers. */
export function canonicalImageSource(source: string, depth = 0): string {
  try {
    const relative = source.startsWith('/') && !source.startsWith('//');
    const url = new URL(source, relative ? 'https://morrovia.com' : undefined);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return source;
    const firstParty = relative || (firstPartyHosts.has(url.hostname) && (url.protocol === 'https:' || ['localhost','127.0.0.1'].includes(url.hostname)));
    if (firstParty && depth < 3 && ['/_next/image','/.netlify/images'].includes(url.pathname)) {
      const nested = url.searchParams.get('url');
      if (nested) return canonicalImageSource(nested, depth + 1);
    }
    if (firstParty && !url.pathname.startsWith('/api/') && /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(url.pathname)) return decodeURIComponent(url.pathname);
    url.hash = '';
    if (url.hostname === 'images.unsplash.com' && /^\/photo-[^/]+$/.test(url.pathname)) { url.search = ''; return url.href; }
    for (const key of [...url.searchParams.keys()]) if (cacheModifier.test(key) || key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  } catch { return source; }
}
