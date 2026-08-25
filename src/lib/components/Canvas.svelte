<script lang="ts">
	import AngleBadge from '$lib/components/AngleBadge.svelte';
	import WallView from '$lib/components/WallView.svelte';
	import {
		angleBetweenDeg,
		axisAlign,
		dist,
		fmtCm,
		snap,
		snapPt,
		sub,
		vectorAngleDeg,
		wallAngleDeg,
		type Pt
	} from '$lib/geometry';
	import {
		addWall,
		docBBox,
		findJointNear,
		MIN_WALL_LENGTH,
		moveJoint,
		translateWall,
		wallsAtJoint
	} from '$lib/model/ops';
	import { plan } from '$lib/stores/plan.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { viewport } from '$lib/stores/viewport.svelte';
	import { DEFAULT_THICKNESS, type Joint, type JointId } from '$lib/types';

	const ATTACH_PX = 12;
	const ZOOM_WHEEL_SENSITIVITY = 0.0015;
	const ZOOM_PINCH_SENSITIVITY = 0.01;

	let svgEl: SVGSVGElement | undefined = $state();
	let wrapW = $state(0);
	let wrapH = $state(0);

	// gesture state that rendering depends on
	let spaceHeld = $state(false);
	let panning = $state(false);
	let panLast: Pt | null = null;

	let drawActive = $state(false);
	let anchor = $state<Pt | null>(null);
	let cursorWorld = $state<Pt>({ x: 0, y: 0 });

	type Drafts = Record<JointId, Pt>;
	let drafts = $state.raw<Drafts>({});
	let dragJointId = $state<JointId | null>(null);
	let dragWallId = $state<string | null>(null);

	// gesture state NOT used by rendering
	let dragMoved = false;
	let downWorld: Pt | null = null;
	let dragOrigins: Drafts = {};
	let fitted = false;

	function endDraw() {
		drawActive = false;
		anchor = null;
	}

	function finishDrag() {
		dragJointId = null;
		dragWallId = null;
		dragMoved = false;
		downWorld = null;
		dragOrigins = {};
		drafts = {};
	}

	// reset an active wall chain whenever the tool changes away from draw
	$effect(() => {
		if (ui.tool !== 'draw') endDraw();
	});

	$effect(() => {
		viewport.setViewSize(wrapW, wrapH);
		if (!fitted && wrapW > 0 && wrapH > 0) {
			fitted = true;
			viewport.fit(docBBox(plan.doc));
		}
	});

	// wheel must be a non-passive listener for preventDefault to work
	$effect(() => {
		const el = svgEl;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const r = el.getBoundingClientRect();
			const factor = Math.exp(-e.deltaY * (e.ctrlKey ? ZOOM_PINCH_SENSITIVITY : ZOOM_WHEEL_SENSITIVITY));
			viewport.zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
		};
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => el.removeEventListener('wheel', onWheel);
	});

	const renderJoints = $derived.by<Record<string, Joint>>(() => {
		const r: Record<string, Joint> = { ...plan.doc.joints };
		for (const [id, p] of Object.entries(drafts)) {
			const j = r[id];
			if (j) r[id] = { ...j, x: p.x, y: p.y };
		}
		return r;
	});

	const visibleRect = $derived.by(() => {
		const tl = viewport.toWorld(0, 0);
		const br = viewport.toWorld(wrapW, wrapH);
		return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
	});

	const grid = $derived.by(() => {
		if (!ui.showGrid) return null;
		const steps = [1, 5, 10, 50, 100, 500];
		const step = steps.find((s) => s * viewport.scale >= 8) ?? 1000;
		const r = visibleRect;
		const xs: number[] = [];
		const ys: number[] = [];
		for (let x = Math.floor(r.x / step) * step; x <= r.x + r.w; x += step) xs.push(x);
		for (let y = Math.floor(r.y / step) * step; y <= r.y + r.h; y += step) ys.push(y);
		return { xs, ys, r };
	});

	function resolveDrawPoint(raw: Pt): { p: Pt; attach: JointId | null } {
		const doc = plan.doc;
		if (!ui.snapEnabled) return { p: raw, attach: null };
		const near = findJointNear(doc, raw, ATTACH_PX / viewport.scale);
		if (near) return { p: { x: near.x, y: near.y }, attach: near.id };
		let p = snapPt(raw);
		if (anchor) {
			const align = axisAlign(anchor, p);
			if (align === 'h') p = { x: p.x, y: anchor.y };
			else if (align === 'v') p = { x: anchor.x, y: p.y };
		}
		return { p, attach: null };
	}

	const previewEnd = $derived.by(() => {
		if (!drawActive || !anchor) return null;
		return resolveDrawPoint(cursorWorld);
	});

	const previewLabel = $derived.by(() => {
		if (!drawActive || !anchor || !previewEnd) return null;
		const mid = viewport.toScreen(
			(anchor.x + previewEnd.p.x) / 2,
			(anchor.y + previewEnd.p.y) / 2
		);
		return { x: mid.x, y: mid.y - 14, text: `${fmtCm(dist(anchor, previewEnd.p))} cm` };
	});

	interface BadgeInfo {
		x: number;
		y: number;
		text: string;
		kind: 'deg' | 'axis' | 'pair';
	}

	const angleInfos = $derived.by<BadgeInfo[]>(() => {
		if (!dragJointId) return [];
		const doc = plan.doc;
		const p = drafts[dragJointId];
		if (!p) return [];
		const sp = viewport.toScreen(p.x, p.y);
		const R = 64;
		const out: BadgeInfo[] = [];
		const dirs: number[] = [];

		for (const w of wallsAtJoint(doc, dragJointId)) {
			const otherId = w.startJointId === dragJointId ? w.endJointId : w.startJointId;
			const o = doc.joints[otherId];
			if (!o) continue;
			const ang = vectorAngleDeg(sub(p, o));
			dirs.push(ang);
			const rad = (ang * Math.PI) / 180;
			const align = axisAlign(o, p);
			out.push({
				x: sp.x + Math.cos(rad) * R,
				y: sp.y + Math.sin(rad) * R,
				text: align === 'h' ? 'H' : align === 'v' ? 'V' : `${fmtCm(wallAngleDeg(o, p))}°`,
				kind: align ? 'axis' : 'deg'
			});
		}

		if (dirs.length === 2) {
			const between = angleBetweenDeg(dirs[0], dirs[1]);
			let bis = (dirs[0] + dirs[1]) / 2;
			if (Math.abs(bis - dirs[0]) > 90) bis += 180;
			const rad = (bis * Math.PI) / 180;
			out.push({
				x: sp.x + Math.cos(rad) * (R + 34),
				y: sp.y + Math.sin(rad) * (R + 34),
				text: `${fmtCm(between)}°`,
				kind: 'pair'
			});
		}
		return out;
	});

	function resolveDragPoint(jointId: JointId, raw: Pt): Pt {
		const doc = plan.doc;
		if (!ui.snapEnabled) return raw;
		const near = findJointNear(doc, raw, ATTACH_PX / viewport.scale);
		if (near && near.id !== jointId) return { x: near.x, y: near.y };
		let p = snapPt(raw);
		for (const w of wallsAtJoint(doc, jointId)) {
			const otherId = w.startJointId === jointId ? w.endJointId : w.startJointId;
			const o = doc.joints[otherId];
			if (!o) continue;
			const align = axisAlign(o, p);
			if (align === 'h') p = { x: p.x, y: o.y };
			else if (align === 'v') p = { x: o.x, y: p.y };
		}
		return p;
	}

	function localPt(e: PointerEvent): Pt {
		if (!svgEl) return { x: 0, y: 0 };
		const r = svgEl.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}

	function onPointerDown(e: PointerEvent) {
		if (!svgEl || (panning && spaceHeld)) return;
		try {
			svgEl.setPointerCapture(e.pointerId);
		} catch {
			// no active pointer with this id (e.g. synthetic events) — safe to ignore
		}
		const lp = localPt(e);
		const world = viewport.toWorld(lp.x, lp.y);

		if (spaceHeld || e.button === 1) {
			panning = true;
			panLast = lp;
			return;
		}
		if (e.button !== 0) return;

		const target = e.target as Element;
		const jointHit = target.closest('[data-joint-id]')?.getAttribute('data-joint-id') ?? null;
		const wallHit = target.closest('[data-wall-id]')?.getAttribute('data-wall-id') ?? null;

		if (ui.tool === 'draw') {
			const res = resolveDrawPoint(world);
			if (!drawActive || !anchor) {
				drawActive = true;
				anchor = res.p;
				return;
			}
			if (dist(res.p, anchor) >= MIN_WALL_LENGTH) {
				const added = addWall(plan.doc, anchor, res.p, { attachTolCm: 0.01 });
				if (added.wallId) plan.commit('Add wall', added.doc);
				anchor = res.p;
			} else {
				endDraw(); // clicked back onto the chain start — close the chain
			}
			return;
		}

		if (jointHit && plan.doc.joints[jointHit]) {
			dragJointId = jointHit;
			dragMoved = false;
			downWorld = world;
			dragOrigins = { [jointHit]: { ...plan.doc.joints[jointHit] } };
			return;
		}
		if (wallHit && plan.doc.walls[wallHit]) {
			ui.select(wallHit);
			const w = plan.doc.walls[wallHit];
			dragWallId = wallHit;
			dragMoved = false;
			downWorld = world;
			dragOrigins = {
				[w.startJointId]: { ...plan.doc.joints[w.startJointId] },
				[w.endJointId]: { ...plan.doc.joints[w.endJointId] }
			};
			return;
		}
		ui.select(null);
		endDraw();
	}

	function onPointerMove(e: PointerEvent) {
		const lp = localPt(e);
		cursorWorld = viewport.toWorld(lp.x, lp.y);

		if (panning && panLast) {
			viewport.panBy(lp.x - panLast.x, lp.y - panLast.y);
			panLast = lp;
			return;
		}
		if (dragJointId && downWorld) {
			dragMoved = true;
			drafts = { ...drafts, [dragJointId]: resolveDragPoint(dragJointId, cursorWorld) };
		} else if (dragWallId && downWorld) {
			dragMoved = true;
			const dx = ui.snapEnabled ? snap(cursorWorld.x - downWorld.x) : cursorWorld.x - downWorld.x;
			const dy = ui.snapEnabled ? snap(cursorWorld.y - downWorld.y) : cursorWorld.y - downWorld.y;
			const nd: Drafts = {};
			for (const id of Object.keys(dragOrigins)) {
				nd[id] = { x: dragOrigins[id].x + dx, y: dragOrigins[id].y + dy };
			}
			drafts = nd;
		}
	}

	function onPointerUp(e: PointerEvent) {
		try {
			svgEl?.releasePointerCapture?.(e.pointerId);
		} catch {
			// pointer not captured — nothing to release
		}
		panning = false;
		panLast = null;

		if (dragJointId) {
			const p = drafts[dragJointId];
			if (dragMoved && p) plan.commit('Move joint', moveJoint(plan.doc, dragJointId, p));
		} else if (dragWallId) {
			const ids = Object.keys(dragOrigins);
			const d = ids.length > 0 ? drafts[ids[0]] : undefined;
			const o = ids.length > 0 ? dragOrigins[ids[0]] : undefined;
			if (dragMoved && d && o) {
				plan.commit('Move wall', translateWall(plan.doc, dragWallId, d.x - o.x, d.y - o.y));
			}
		}
		finishDrag();
	}

	function onContextMenu(e: MouseEvent) {
		e.preventDefault();
		endDraw();
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		if (e.code === 'Space') {
			e.preventDefault();
			spaceHeld = true;
		} else if (e.key === 'Escape') {
			endDraw();
		}
	}

	function onKeyUp(e: KeyboardEvent) {
		if (e.code === 'Space') spaceHeld = false;
	}

	const cursorClass = $derived.by(() => {
		if (panning) return 'cursor-grabbing';
		if (spaceHeld) return 'cursor-grab';
		if (ui.tool === 'draw') return 'cursor-crosshair';
		return '';
	});
</script>

<svelte:window onkeydown={onKeyDown} onkeyup={onKeyUp} />

<div class="canvas-wrap" bind:clientWidth={wrapW} bind:clientHeight={wrapH}>
	<svg
		bind:this={svgEl}
		class="canvas {cursorClass}"
		role="application"
		aria-label="Floor plan canvas"
		width={wrapW}
		height={wrapH}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		oncontextmenu={onContextMenu}
	>
		<g transform="translate({viewport.tx} {viewport.ty}) scale({viewport.scale})">
			{#if grid}
				{#each grid.xs as x (x)}
					<line
						x1={x}
						y1={grid.r.y}
						x2={x}
						y2={grid.r.y + grid.r.h}
						stroke="#e2e8f0"
						stroke-width={1 / viewport.scale}
					/>
				{/each}
				{#each grid.ys as y (y)}
					<line
						x1={grid.r.x}
						y1={y}
						x2={grid.r.x + grid.r.w}
						y2={y}
						stroke="#e2e8f0"
						stroke-width={1 / viewport.scale}
					/>
				{/each}
			{/if}

			{#each Object.values(plan.doc.walls) as wall (wall.id)}
				<WallView
					{wall}
					joints={renderJoints}
					selected={wall.id === ui.selectedWallId}
					scale={viewport.scale}
				/>
			{/each}

			{#if drawActive && anchor && previewEnd}
				<line
					x1={anchor.x}
					y1={anchor.y}
					x2={previewEnd.p.x}
					y2={previewEnd.p.y}
					stroke="#64748b"
					stroke-width={DEFAULT_THICKNESS}
					stroke-dasharray="{10 / viewport.scale} {8 / viewport.scale}"
					opacity="0.65"
				/>
				{#if previewEnd.attach}
					<circle
						cx={previewEnd.p.x}
						cy={previewEnd.p.y}
						r={9 / viewport.scale}
						fill="none"
						stroke="#16a34a"
						stroke-width={2 / viewport.scale}
					/>
				{/if}
			{/if}
		</g>
	</svg>

	<div class="overlay" aria-hidden="true">
		{#each angleInfos as badge, i (i)}
			<AngleBadge {badge} />
		{/each}
		{#if previewLabel}
			<span class="length-label" style:left="{previewLabel.x}px" style:top="{previewLabel.y}px">
				{previewLabel.text}
			</span>
		{/if}
	</div>

	{#if drawActive}
		<div class="banner">
			Click to place next corner · click same point, right-click or Esc to finish
		</div>
	{:else if Object.keys(plan.doc.walls).length === 0}
		<div class="banner">Press “Draw wall”, then click to place the first corner</div>
	{/if}

	<div class="status">
		{Math.round(cursorWorld.x)} · {Math.round(cursorWorld.y)} cm &nbsp;|&nbsp;
		{Math.round(viewport.zoomPct)}%
	</div>
</div>

<style>
	.canvas-wrap {
		position: relative;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		background: #ffffff;
		user-select: none;
	}
	svg.canvas {
		display: block;
		touch-action: none;
	}
	svg.canvas.cursor-crosshair {
		cursor: crosshair;
	}
	svg.canvas.cursor-grab {
		cursor: grab;
	}
	svg.canvas.cursor-grabbing {
		cursor: grabbing;
	}
	.overlay {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.length-label {
		position: absolute;
		transform: translate(-50%, -50%);
		background: #1e293b;
		color: #ffffff;
		font-size: 12px;
		font-weight: 600;
		border-radius: 6px;
		padding: 2px 7px;
		white-space: nowrap;
	}
	.banner {
		position: absolute;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(30, 41, 59, 0.92);
		color: #ffffff;
		font-size: 13px;
		border-radius: 8px;
		padding: 6px 12px;
		white-space: nowrap;
	}
	.status {
		position: absolute;
		left: 12px;
		bottom: 10px;
		font-size: 12px;
		color: #94a3b8;
		background: rgba(255, 255, 255, 0.85);
		padding: 2px 6px;
		border-radius: 6px;
		font-variant-numeric: tabular-nums;
	}
</style>
