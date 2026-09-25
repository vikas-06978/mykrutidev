/**
 * A minimal XML scanner that keeps OFFSETS into the original string.
 *
 * Why not DOMParser + XMLSerializer: re-serialising a Word document rewrites
 * everything - quoting, namespace declarations, entity spelling - even in the
 * parts nobody touched. The document converter changes a handful of runs and
 * must leave every other byte exactly as Word wrote it, so it needs to know
 * WHERE each element is and splice replacements in. That is all this does.
 *
 * It is not a validating parser. It handles what Office Open XML contains:
 * elements, attributes (quoted values may contain `>`), the XML declaration,
 * comments, CDATA and other `<!...>` constructs, which are skipped.
 *
 * Works the same in the browser and in Node - no DOM needed.
 */

/**
 * @typedef {{
 *   name: string,
 *   start: number,      // offset of '<'
 *   openEnd: number,    // offset just after the start tag's '>'
 *   closeStart: number, // offset of the closing '</', or openEnd if self-closing
 *   end: number,        // offset just after the element
 *   selfClosing: boolean,
 *   parent: XmlNode | null,
 *   children: XmlNode[],
 * }} XmlNode
 */

/**
 * @param {string} xml
 * @returns {XmlNode} a synthetic root whose children are the top-level elements
 */
export function parseXml(xml) {
  /** @type {XmlNode} */
  const root = {
    name: '#root', start: 0, openEnd: 0, closeStart: xml.length, end: xml.length,
    selfClosing: false, parent: null, children: [],
  };
  const stack = [root];
  const n = xml.length;
  let i = 0;

  const skipTo = (from, token) => {
    const at = xml.indexOf(token, from);
    if (at === -1) throw new Error(`Malformed XML: unterminated construct at ${from}`);
    return at + token.length;
  };

  while (i < n) {
    const lt = xml.indexOf('<', i);
    if (lt === -1) break;

    if (xml.startsWith('<?', lt)) { i = skipTo(lt, '?>'); continue; }
    if (xml.startsWith('<!--', lt)) { i = skipTo(lt, '-->'); continue; }
    if (xml.startsWith('<![CDATA[', lt)) { i = skipTo(lt, ']]>'); continue; }
    if (xml.startsWith('<!', lt)) { i = skipTo(lt, '>'); continue; }

    if (xml[lt + 1] === '/') {
      const gt = xml.indexOf('>', lt);
      if (gt === -1) throw new Error(`Malformed XML: unterminated end tag at ${lt}`);
      const node = stack.pop();
      const name = xml.slice(lt + 2, gt).trim();
      if (!node || node === root || node.name !== name) {
        throw new Error(`Malformed XML: </${name}> does not close <${node?.name}>`);
      }
      node.closeStart = lt;
      node.end = gt + 1;
      i = gt + 1;
      continue;
    }

    // A start tag. Scan to its '>' while honouring quoted attribute values,
    // which may legally contain '>'.
    let j = lt + 1;
    let quote = '';
    for (; j < n; j += 1) {
      const c = xml[j];
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        break;
      }
    }
    if (j >= n) throw new Error(`Malformed XML: unterminated start tag at ${lt}`);

    let k = lt + 1;
    while (k < j && !/[\s/>]/.test(xml[k])) k += 1;
    const selfClosing = xml[j - 1] === '/';
    const parent = stack[stack.length - 1];
    /** @type {XmlNode} */
    const node = {
      name: xml.slice(lt + 1, k),
      start: lt,
      openEnd: j + 1,
      closeStart: j + 1,
      end: j + 1,
      selfClosing,
      parent,
      children: [],
    };
    parent.children.push(node);
    if (!selfClosing) stack.push(node);
    i = j + 1;
  }

  if (stack.length !== 1) {
    throw new Error(`Malformed XML: <${stack[stack.length - 1].name}> is never closed`);
  }
  return root;
}

/** The start tag's attributes, as a name -> raw (still escaped) value map. */
export function attrs(xml, node) {
  const out = {};
  const tag = xml.slice(node.start, node.openEnd);
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    out[m[1]] = m[2] ?? m[3];
  }
  return out;
}

/** The raw text between an element's tags (empty when self-closing). */
export const inner = (xml, node) => xml.slice(node.openEnd, node.closeStart);

/** The element's full source. */
export const outer = (xml, node) => xml.slice(node.start, node.end);

/** First direct child with this name. */
export const child = (node, name) => node.children.find((c) => c.name === name) ?? null;

/** Every descendant (depth first), optionally filtered by name. */
export function* descendants(node, name) {
  for (const c of node.children) {
    if (!name || c.name === name) yield c;
    yield* descendants(c, name);
  }
}

/** Nearest ancestor with this name. */
export function ancestor(node, name) {
  for (let p = node.parent; p; p = p.parent) if (p.name === name) return p;
  return null;
}

/** Text content of an element whose content is character data (w:t). */
export function decodeText(raw) {
  if (!raw.includes('&')) return raw;
  return raw.replace(/&(#\d+|#x[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (whole, e) => {
    if (e === 'amp') return '&';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(cp) ? String.fromCodePoint(cp) : whole;
  });
}

/** Escape text for element content. */
export const encodeText = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Escape text for a double-quoted attribute value. */
export const encodeAttr = (s) => encodeText(s).replace(/"/g, '&quot;');

/**
 * Apply non-overlapping replacements to a string in one pass.
 *
 * @param {string} xml
 * @param {{ start: number, end: number, text: string }[]} edits
 */
export function applyEdits(xml, edits) {
  if (edits.length === 0) return xml;
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  let out = '';
  let at = 0;
  for (const e of sorted) {
    if (e.start < at) throw new Error('Overlapping XML edits');
    out += xml.slice(at, e.start) + e.text;
    at = e.end;
  }
  return out + xml.slice(at);
}
