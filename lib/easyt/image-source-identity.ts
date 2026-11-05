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
