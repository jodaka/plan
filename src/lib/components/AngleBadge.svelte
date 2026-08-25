<script lang="ts">
	interface Badge {
		x: number;
		y: number;
		text: string;
		kind: 'deg' | 'axis' | 'pair';
	}

	let { badge }: { badge: Badge } = $props();
</script>

<span
	class="badge"
	class:axis={badge.kind === 'axis'}
	class:pair={badge.kind === 'pair'}
	style:left="{badge.x}px"
	style:top="{badge.y}px"
>
	{badge.text}
</span>

<style>
	.badge {
		position: absolute;
		transform: translate(-50%, -50%);
		background: rgba(255, 255, 255, 0.92);
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		padding: 1px 6px;
		font-size: 12px;
		font-weight: 600;
		line-height: 1.4;
		color: #0f172a;
		white-space: nowrap;
		user-select: none;
	}
	.badge.axis {
		border-color: #16a34a;
		color: #16a34a;
	}
	.badge.pair {
		border-color: #7c3aed;
		color: #7c3aed;
	}
</style>
