import { itemCorners } from '../geometry';
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

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const j of Object.values(doc.joints)) {
    if (j.x < minX) minX = j.x;
    if (j.y < minY) minY = j.y;
    if (j.x > maxX) maxX = j.x;
    if (j.y > maxY) maxY = j.y;
  }
  for (const obj of Object.values(doc.roomObjects)) {
    const corners = itemCorners(obj.x, obj.y, obj.w, obj.d, obj.rotation);
    for (const p of corners) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const hasContent = Number.isFinite(minX) && Number.isFinite(minY);
  if (hasContent) {
    const maxT = Math.max(0, ...Object.values(doc.walls).map((w) => w.thickness));
    const outerPad = 20 + maxT / 2;
    minX -= outerPad;
    minY -= outerPad;
    maxX += outerPad;
    maxY += outerPad;
    const w = maxX - minX;
    const h = maxY - minY;
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  a.download = `floorplan_${stamp}.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
