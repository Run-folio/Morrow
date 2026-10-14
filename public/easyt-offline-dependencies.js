/* Shared by the worker and manifest generator. Parse data; never execute HTML
 * or Next scripts. RSC type-1 strings form one ordered stream, whose transport
 * script boundaries may split an asset path or its JSON escaping. */
(function (root) {
  function extract(html) {
    const chunks = [], dependencies = [];
    const collect = text => {
      for (const match of text.matchAll(/\/_next\/static\/[^"'\\\s<>]+/g)) dependencies.push(match[0].replaceAll('&amp;', '&').split(/[?#]/)[0]);
    };
    const markup = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (_, attributes, body) => {
      const text = body.trim();
      if (/^(?:self\.__next_f|\(self\.__next_f)/.test(text)) {
        const call = /^(?:self\.__next_f|\(self\.__next_f\s*=\s*self\.__next_f\s*\|\|\s*\[\]\))\.push\(([\s\S]*)\)\s*;?$/.exec(text);
        if (!call) throw new Error('Unsupported offline Next stream');
        let value;
        try { value = JSON.parse(call[1]); } catch { throw new Error('Malformed offline Next stream'); }
        if (!Array.isArray(value)) throw new Error('Malformed offline Next stream');
        if (value[0] === 1 && value.length === 2 && typeof value[1] === 'string') chunks.push(value[1]);
        else if (value[0] === 2 && value.length === 2) collect(JSON.stringify(value[1]));
        else if (!(value[0] === 0 && value.length === 1)) throw new Error('Unsupported offline Next stream');
      } else collect(body);
      return '<script' + attributes + '></script>';
    });
    // Resource references in actual markup are complete independently of RSC.
    for (const tag of markup.matchAll(/<[a-z][^>]*>/gi)) {
      for (const attribute of tag[0].matchAll(/\b(?:src|href|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) collect(attribute[1] ?? attribute[2] ?? attribute[3]);
    }
    collect(chunks.join(''));
    return [...new Set(dependencies)];
  }
  const api = Object.freeze({ extract });
  root.MORROVIA_OFFLINE_DEPENDENCIES = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof self === 'object' ? self : globalThis);
