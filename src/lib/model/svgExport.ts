import { docBBox } from './ops';
import { downloadBlob, fileStamp } from './io';
import type { PlanDoc } from '../types';

const PX_PER_CM = 15;

export function downloadSvg(doc: PlanDoc): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const svg = document.querySelector('svg.canvas') as SVGSVGElement | null;
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  const origStack: Element[] = [svg];
  const cloneStack: Element[] = [clone];
  while (origStack.length > 0) {
    const orig = origStack.pop();
    const copy = cloneStack.pop();
    if (!orig || !copy) continue;
    const computed = getComputedStyle(orig);
    const parts: string[] = [];
    for (let i = 0; i < computed.length; i++) {
      const prop = computed[i];
      if (!prop) continue;
      if (
        prop === 'transform' ||
        prop === 'translate' ||
        prop === 'scale' ||
        prop === 'rotate' ||
        prop === 'transform-origin'
      )
        continue;
      const value = computed.getPropertyValue(prop);
      const priority = computed.getPropertyPriority(prop);
      parts.push(`${prop}:${value}${priority ? ` !${priority}` : ''}`);
    }
    if (parts.length > 0) copy.setAttribute('style', parts.join(';'));
    for (let i = orig.children.length - 1; i >= 0; i--) {
      const oc = orig.children[i];
      const cc = copy.children[i];
      if (oc && cc) {
        origStack.push(oc);
        cloneStack.push(cc);
      }
    }
  }

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
      for (const el of g.querySelectorAll('line[stroke="#e2e8f0"]')) el.remove();
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
    if (vb) clone.setAttribute('viewBox', vb);
  }

  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(clone);
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(`floorplan_${fileStamp()}.svg`, blob);
}
