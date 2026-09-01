import { docBBox } from './ops';
import { downloadBlob, fileStamp } from './io';
import type { PlanDoc } from '../types';

const PX_PER_CM = 15;

/** SVG-visual properties worth inlining; everything else (layout, interaction,
 * HTML-only props) is noise that bloated exports ~300 props per node. */
const EXPORT_PROPS = new Set([
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'r',
  'paint-order',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant-numeric',
  'letter-spacing',
  'text-anchor',
  'dominant-baseline',
  'white-space',
]);

/** Editor-only elements: invisible hit areas, drag handles, selection/measure
 * overlays — rendered by the clone but meaningless in a standalone drawing. */
const RUNTIME_SELECTOR = [
  '.hit',
  '.label-hit',
  '.outline',
  '.handle',
  '.rot-stem',
  '.joint-dot',
  '.sel-overlay',
  '.wall-dims',
  '.angle-arcs',
  '.gap-hints',
  '.ruler',
].join(',');

/** Copies whitelisted computed style props from `orig` onto `copy`. */
function inlineStyles(orig: Element, copy: Element): void {
  const computed = getComputedStyle(orig);
  const parts: string[] = [];
  for (const prop of EXPORT_PROPS) {
    const value = computed.getPropertyValue(prop);
    if (!value) {
      continue;
    }
    const priority = computed.getPropertyPriority(prop);
    parts.push(`${prop}:${value}${priority ? ` !${priority}` : ''}`);
  }
  copy.setAttribute('style', parts.join(';'));
  copy.removeAttribute('class');
  for (const attr of [...copy.attributes]) {
    if (attr.name.startsWith('data-')) {
      copy.removeAttribute(attr.name);
    }
  }
}

/** Parses an inline `style` value we generated ourselves (`prop:value;…`). */
function parseStyleProps(style: string): Map<string, string> {
  const props = new Map<string, string>();
  for (const part of style.split(';')) {
    const i = part.indexOf(':');
    if (i > 0) {
      props.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
    }
  }
  return props;
}

/** Serializes `props` back into an inline `style` value. */
function stringifyStyleProps(props: Map<string, string>): string {
  return [...props].map(([k, v]) => `${k}:${v}`).join(';');
}

/**
 * Room labels (and any other stroked text) draw a white halo via
 * `paint-order: stroke`. Renderers that don't support paint-order paint the
 * fill first and the wide white stroke OVER it, hiding the glyphs. Splitting
 * each stroked <text> into a stroke-only halo copy behind a fill-only main
 * copy renders identically everywhere, without relying on paint-order.
 */
function splitTextHalos(root: Element): void {
  for (const el of [...root.querySelectorAll('text')]) {
    const style = parseStyleProps(el.getAttribute('style') ?? '');
    const stroke = style.get('stroke');
    if (!stroke || stroke === 'none') {
      continue;
    }
    const halo = el.cloneNode(true) as Element;
    const haloStyle = new Map(style);
    haloStyle.set('fill', 'none');
    halo.setAttribute('style', stringifyStyleProps(haloStyle));
    const mainStyle = new Map(style);
    mainStyle.set('stroke', 'none');
    el.setAttribute('style', stringifyStyleProps(mainStyle));
    el.parentNode?.insertBefore(halo, el);
  }
}

export function downloadSvg(doc: PlanDoc): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }
  const svg = document.querySelector('svg.canvas') as SVGSVGElement | null;
  if (!svg) {
    return;
  }
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  // Parallel walk of original + clone: skip editor-only subtrees (collected
  // and removed afterwards so children indices stay aligned), inline only
  // whitelisted visual styles everywhere else.
  const toRemove: Element[] = [];
  const walk = (orig: Element, copy: Element): void => {
    if (orig.matches(RUNTIME_SELECTOR)) {
      toRemove.push(copy);
      return;
    }
    inlineStyles(orig, copy);
    const oc = orig.children;
    const cc = copy.children;
    for (let i = 0; i < oc.length && i < cc.length; i++) {
      walk(oc[i], cc[i]);
    }
  };
  walk(svg, clone);
  for (const el of toRemove) {
    el.remove();
  }
  splitTextHalos(clone);

  const bbox = docBBox(doc);
  if (bbox) {
    const maxT = Math.max(0, ...Object.values(doc.walls).map((w) => w.thickness));
    const outerPad = 20 + maxT / 2;
    const minX = bbox.minX - outerPad;
    const minY = bbox.minY - outerPad;
    const w = bbox.maxX - bbox.minX + outerPad * 2;
    const h = bbox.maxY - bbox.minY + outerPad * 2;
    clone.setAttribute('viewBox', `${minX} ${minY} ${w} ${h}`);
    clone.setAttribute('width', String(w * PX_PER_CM));
    clone.setAttribute('height', String(h * PX_PER_CM));
    clone.removeAttribute('style');
    const g = clone.querySelector('g');
    if (g) {
      g.removeAttribute('transform');
      for (const el of g.querySelectorAll('line[stroke="#e2e8f0"]')) {
        el.remove();
      }
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('x', String(minX));
      bg.setAttribute('y', String(minY));
      bg.setAttribute('width', String(w));
      bg.setAttribute('height', String(h));
      bg.setAttribute('fill', '#ffffff');
      bg.setAttribute('style', 'fill:#ffffff;');
      g.prepend(bg);
    }
  } else {
    const vb = svg.getAttribute('viewBox');
    if (vb) {
      clone.setAttribute('viewBox', vb);
    }
  }

  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(clone);
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(`floorplan_${fileStamp()}.svg`, blob);
}
