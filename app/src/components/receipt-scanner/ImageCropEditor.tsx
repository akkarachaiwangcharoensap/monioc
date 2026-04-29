/**
 * ImageCropEditor — Tauri-native image editor (no external dependencies).
 *
 * Architecture:
 *   Two stacked <canvas> elements share the same display area:
 *     1. imgCanvas   — draws the transformed image preview.
 *                      Brightness / contrast / grayscale are applied by mutating
 *                      preview pixels directly so the result is visible live in
 *                      WebKit/Tauri without triggering MiniLED EDR behavior.
 *     2. overlayCanvas — transparent except for the dim region, crop border,
 *                        rule-of-thirds grid and drag handles. Receives all pointer events.
 *
 *   On "Apply":
 *     All edit parameters are forwarded to the Tauri `edit_image` Rust command,
 *     which uses the `image` crate for pixel-accurate processing. The canvas is
 *     only used for the interactive preview.
 */

import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import type React from 'react';
import { TauriApi } from '../../services/api';
import {
	type CropRect,
	type HandleId,
	type Layout,
	HANDLE_RADIUS,
	computeLayout,
	handlePositions,
	hitTestHandle,
	hitTestInterior,
	applyCropHandleDelta,
	normaliseCrop,
	clamp,
} from '../../utils/imageEditorMath';

// ─── local types ──────────────────────────────────────────────────────────────

interface DragState {
	kind: 'move' | 'handle';
	handle?: HandleId;
	startX: number;
	startY: number;
	startCrop: CropRect;
}

// ─── constants ───────────────────────────────────────────────────────────────

const MIN_CROP_PX = 32;

// ─── canvas draw functions ────────────────────────────────────────────────────

/** Apply preview-only tonal adjustments directly to canvas pixels.
 *  Uses a 256-entry lookup table so the inner loop does only integer array
 *  reads rather than per-pixel float arithmetic. ~5× faster than the naive
 *  approach on a typical receipt-sized canvas.
 */
function applyPreviewAdjustments(
	canvas: HTMLCanvasElement,
	brightness: number,
	contrast: number,
	grayscale: boolean,
): void {
	if (brightness === 0 && contrast === 0 && !grayscale) {
		return;
	}

	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) {
		return;
	}

	const { width, height } = canvas;
	const imageData = ctx.getImageData(0, 0, width, height);
	const pixels = imageData.data; // Uint8ClampedArray — writes auto-clamp to [0,255]

	// Pre-compute all 256 tone-adjusted output values once.
	const lut = new Uint8ClampedArray(256);
	const bf = 1 + brightness / 100;
	const cf = 1 + contrast / 100;
	for (let v = 0; v < 256; v++) {
		let out = brightness !== 0 ? v * bf : v;
		if (contrast !== 0) out = ((out / 255 - 0.5) * cf + 0.5) * 255;
		lut[v] = out; // auto-clamped by Uint8ClampedArray
	}

	const len = pixels.length;
	if (grayscale) {
		for (let i = 0; i < len; i += 4) {
			// Luma uses the tone-adjusted channel values.
			const luma = lut[pixels[i]] * 0.299 + lut[pixels[i + 1]] * 0.587 + lut[pixels[i + 2]] * 0.114;
			pixels[i] = luma;
			pixels[i + 1] = luma;
			pixels[i + 2] = luma;
		}
	} else {
		for (let i = 0; i < len; i += 4) {
			pixels[i] = lut[pixels[i]];
			pixels[i + 1] = lut[pixels[i + 1]];
			pixels[i + 2] = lut[pixels[i + 2]];
		}
	}

	ctx.putImageData(imageData, 0, 0);
}

/** Draws the image (with rotation, flip, and live filter adjustments) onto `canvas`. */
function drawImage(
	canvas: HTMLCanvasElement,
	img: HTMLImageElement,
	rotation: number,
	flipH: boolean,
	brightness: number,
	contrast: number,
	grayscale: boolean,
): Layout {
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
	const cw = canvas.width;
	const ch = canvas.height;
	ctx.clearRect(0, 0, cw, ch);

	const layout = computeLayout(cw, ch, img, rotation);
	const { imgX, imgY, imgW, imgH } = layout;
	const rotated = rotation % 2 !== 0;
	const drawW = rotated ? imgH : imgW;
	const drawH = rotated ? imgW : imgH;

	ctx.save();
	ctx.translate(imgX + imgW / 2, imgY + imgH / 2);
	if (flipH) ctx.scale(-1, 1);
	ctx.rotate((rotation * Math.PI) / 2);
	ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
	ctx.restore();

	applyPreviewAdjustments(canvas, brightness, contrast, grayscale);

	return layout;
}

/** Draws the crop overlay (dim + border + grid + handles) onto `canvas`. */
function drawOverlay(
	canvas: HTMLCanvasElement,
	layout: Layout,
	crop: CropRect,
): void {
	const ctx = canvas.getContext('2d')!;
	const cw = canvas.width;
	const ch = canvas.height;
	ctx.clearRect(0, 0, cw, ch);

	const { imgX, imgY, imgW, imgH } = layout;
	const cl = imgX + crop.x * imgW;
	const ct = imgY + crop.y * imgH;
	const cw2 = crop.w * imgW;
	const ch2 = crop.h * imgH;

	// Dim overlay with a transparent hole for the crop area
	ctx.save();
	ctx.fillStyle = 'rgba(0,0,0,0.55)';
	ctx.fillRect(0, 0, cw, ch);
	ctx.globalCompositeOperation = 'destination-out';
	ctx.fillStyle = 'rgba(0,0,0,1)';
	ctx.fillRect(cl, ct, cw2, ch2);
	ctx.restore();

	// Crop border
	ctx.strokeStyle = '#ffffff';
	ctx.lineWidth = 1.5;
	ctx.strokeRect(cl + 0.75, ct + 0.75, cw2 - 1.5, ch2 - 1.5);

	// Rule-of-thirds grid
	ctx.strokeStyle = 'rgba(255,255,255,0.30)';
	ctx.lineWidth = 0.8;
	for (let i = 1; i <= 2; i++) {
		ctx.beginPath(); ctx.moveTo(cl + i * cw2 / 3, ct); ctx.lineTo(cl + i * cw2 / 3, ct + ch2); ctx.stroke();
		ctx.beginPath(); ctx.moveTo(cl, ct + i * ch2 / 3); ctx.lineTo(cl + cw2, ct + i * ch2 / 3); ctx.stroke();
	}

	// Handles
	for (const { cx, cy } of Object.values(handlePositions(layout, crop))) {
		ctx.beginPath();
		ctx.arc(cx, cy, HANDLE_RADIUS, 0, Math.PI * 2);
		ctx.fillStyle = '#ffffff';
		ctx.fill();
		ctx.strokeStyle = 'rgba(0,0,0,0.40)';
		ctx.lineWidth = 1;
		ctx.stroke();
	}
}

// ─── component ───────────────────────────────────────────────────────────────

interface Props {
	/** Blob object-URL for canvas display */
	imageSrc: string;
	/** Original disk path — sent to Tauri for pixel-accurate processing */
	imagePath: string;
	/** Called with the new file path written by Tauri after Apply */
	onApply: (newPath: string) => void;
	onCancel: () => void;
	/** If provided, an "Original" button appears that discards all
	 *  previously-applied edits and restores the base source image. */
	onRevertToOriginal?: () => void;
}

export default function ImageCropEditor({
	imageSrc, imagePath, onApply, onCancel, onRevertToOriginal,
}: Props): React.ReactElement {
	const imgCanvasRef = useRef<HTMLCanvasElement>(null);
	const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const imgRef = useRef<HTMLImageElement | null>(null);
	const layoutRef = useRef<Layout>({ imgX: 0, imgY: 0, imgW: 1, imgH: 1 });
	const dragRef = useRef<DragState | null>(null);

	const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 1, h: 1 });
	const [rotation, setRotation] = useState(0);
	const [flipH, setFlipH] = useState(false);
	const [brightness, setBrightness] = useState(0);
	const [contrast, setContrast] = useState(0);
	const [grayscale, setGrayscale] = useState(false);
	const [imgLoaded, setImgLoaded] = useState(false);
	const [applying, setApplying] = useState(false);
	const [cursor, setCursor] = useState('default');

	// Load image from imageSrc (blob URL)
	// image-orientation: from-image ensures ctx.drawImage() respects EXIF
	// rotation metadata in WebKit (used by Tauri on macOS).
	useEffect(() => {
		setImgLoaded(false);
		const img = new Image();
		img.style.imageOrientation = 'from-image';
		img.onload = () => { imgRef.current = img; setImgLoaded(true); };
		img.onerror = () => { /* leave imgLoaded false */ };
		img.src = imageSrc;
	}, [imageSrc]);

	// ── draw ──────────────────────────────────────────────────────────────────
	// Separate image redraw from overlay redraw so crop drags only repaint the overlay.
	const redrawImageRef = useRef<() => void>(() => { });
	const redrawOverlayRef = useRef<() => void>(() => { });

	useLayoutEffect(() => {
		redrawImageRef.current = () => {
			const imgCanvas = imgCanvasRef.current;
			const img = imgRef.current;
			if (!imgCanvas || !img || !imgLoaded) return;

			const layout = drawImage(imgCanvas, img, rotation, flipH, brightness, contrast, grayscale);
			layoutRef.current = layout;
			redrawOverlayRef.current();
		};

		redrawOverlayRef.current = () => {
			const overlayCanvas = overlayCanvasRef.current;
			if (!overlayCanvas || !imgLoaded) return;
			drawOverlay(overlayCanvas, layoutRef.current, crop);
		};
	});

	useEffect(() => { redrawImageRef.current(); }, [rotation, flipH, brightness, contrast, grayscale, imgLoaded]);
	useEffect(() => { redrawOverlayRef.current(); }, [crop, imgLoaded]);

	// Resize both canvases when the container changes size, then redraw
	useEffect(() => {
		const resize = () => {
			const container = containerRef.current;
			const imgCanvas = imgCanvasRef.current;
			const overlayCanvas = overlayCanvasRef.current;
			if (!container || !imgCanvas || !overlayCanvas) return;
			const { width, height } = container.getBoundingClientRect();
			const w = Math.max(1, Math.floor(width));
			const h = Math.max(1, Math.floor(height));
			imgCanvas.width = w; imgCanvas.height = h;
			overlayCanvas.width = w; overlayCanvas.height = h;
			redrawImageRef.current();
		};
		resize();
		const ro = new ResizeObserver(resize);
		if (containerRef.current) ro.observe(containerRef.current);
		return () => ro.disconnect();
	}, []); // stable — uses redraw refs

	// ── pointer helpers ───────────────────────────────────────────────────────
	function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
		const el = overlayCanvasRef.current!;
		const rect = el.getBoundingClientRect();
		const scaleX = el.width / rect.width;
		const scaleY = el.height / rect.height;
		return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
	}

	const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
		e.currentTarget.setPointerCapture(e.pointerId);
		const { x, y } = canvasPoint(e);
		const layout = layoutRef.current;

		// Capture state at drag start (use callback form to get latest state)
		setCrop((crop) => {
			const handle = hitTestHandle(x, y, layout, crop);
			if (handle) {
				dragRef.current = { kind: 'handle', handle, startX: x, startY: y, startCrop: { ...crop } };
			} else if (hitTestInterior(x, y, layout, crop)) {
				dragRef.current = { kind: 'move', startX: x, startY: y, startCrop: { ...crop } };
			}
			return crop; // no change
		});
	}, []);

	const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
		const drag = dragRef.current;
		const { x, y } = canvasPoint(e);
		const { imgW, imgH } = layoutRef.current;

		if (drag) {
			const dx = (x - drag.startX) / imgW;
			const dy = (y - drag.startY) / imgH;

			if (drag.kind === 'move') {
				setCrop(normaliseCrop({
					x: clamp(drag.startCrop.x + dx, 0, 1 - drag.startCrop.w),
					y: clamp(drag.startCrop.y + dy, 0, 1 - drag.startCrop.h),
					w: drag.startCrop.w,
					h: drag.startCrop.h,
				}));
			} else if (drag.kind === 'handle' && drag.handle) {
				setCrop(applyCropHandleDelta(
					drag.handle, dx, dy, drag.startCrop,
					MIN_CROP_PX / imgW, MIN_CROP_PX / imgH,
				));
			}
		} else {
			// Update cursor without reading state (use layout ref)
			setCrop((crop) => {
				const layout = layoutRef.current;
				const handle = hitTestHandle(x, y, layout, crop);
				if (handle) {
					const c: Record<HandleId, string> = {
						tl: 'nw-resize', tc: 'n-resize', tr: 'ne-resize',
						ml: 'w-resize', mr: 'e-resize',
						bl: 'sw-resize', bc: 's-resize', br: 'se-resize',
					};
					setCursor(c[handle]);
				} else if (hitTestInterior(x, y, layout, crop)) {
					setCursor('move');
				} else {
					setCursor('default');
				}
				return crop;
			});
		}
	}, []);

	const onPointerUp = useCallback(() => { dragRef.current = null; }, []);

	// ── toolbar callbacks ─────────────────────────────────────────────────────
	const rotate90CW = useCallback(() => setRotation((r) => (r + 1) % 4), []);
	const rotate90CCW = useCallback(() => setRotation((r) => (r + 3) % 4), []);
	const toggleFlipH = useCallback(() => setFlipH((f) => !f), []);
	const toggleGrayscale = useCallback(() => setGrayscale((g) => !g), []);
	// Vivid: boost brightness and contrast to make receipt text pop for OCR.
	const VIVID_BRIGHTNESS = 100;
	const VIVID_CONTRAST = 100;
	const vivid = brightness === VIVID_BRIGHTNESS && contrast === VIVID_CONTRAST;
	const toggleVivid = useCallback(() => {
		if (vivid) {
			setBrightness(0);
			setContrast(0);
		} else {
			setBrightness(VIVID_BRIGHTNESS);
			setContrast(VIVID_CONTRAST);
		}
	}, [vivid]);
	const resetAll = useCallback(() => {
		setCrop({ x: 0, y: 0, w: 1, h: 1 });
		setRotation(0); setFlipH(false); setBrightness(0); setContrast(0); setGrayscale(false);
	}, []);

	// ── apply via Tauri ───────────────────────────────────────────────────────
	const apply = useCallback(async () => {
		setApplying(true);
		try {
			const newPath = await TauriApi.editImage({
				sourcePath: imagePath,
				params: {
					cropX: crop.x,
					cropY: crop.y,
					cropW: crop.w,
					cropH: crop.h,
					rotation,
					flipH,
					brightness,
					contrast,
					grayscale,
				},
			});
			onApply(newPath);
		} finally {
			setApplying(false);
		}
	}, [imagePath, crop, rotation, flipH, brightness, contrast, grayscale, onApply]);

	// Preview adjustments are baked into the image canvas pixels directly.

	// ── render ────────────────────────────────────────────────────────────────
	return (
		<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', zIndex: 9999, userSelect: 'none', WebkitUserSelect: 'none' }}>
			{/* Header */}
			<div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '12px 16px', flexShrink: 0 }}>
				<span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', color: '#f8fafc', fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>Edit Photo</span>
				<div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
					<button onClick={onCancel} style={btnStyle('ghost')}>Cancel</button>
					<button
						onClick={() => { void apply(); }}
						disabled={!imgLoaded || applying}
						style={btnStyle('primary', !imgLoaded || applying)}
					>
						{applying ? 'Applying…' : 'Apply'}
					</button>
				</div>
			</div>

			{/* Canvas area */}
			<div ref={containerRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
				{/* Layer 1: image (brightness/contrast/grayscale applied via ctx.filter at draw time) */}
				<canvas
					ref={imgCanvasRef}
					style={{
						position: 'absolute', inset: 0,
						width: '100%', height: '100%',
						display: 'block',
					}}
				/>
				{/* Layer 2: crop overlay + pointer events */}
				<canvas
					ref={overlayCanvasRef}
					style={{
						position: 'absolute', inset: 0,
						width: '100%', height: '100%',
						display: 'block',
						cursor,
						touchAction: 'none',
					}}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerUp}
				/>
				{!imgLoaded && (
					<div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '0.875rem' }}>
						Loading…
					</div>
				)}
			</div>

			{/* Toolbar */}
			<div style={{ flexShrink: 0, padding: '12px 16px 24px', background: '#0f172a' }}>
				{/* Row 1 — transform */}
				<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
					<ToolBtn icon="fa-rotate-left" label="Rotate CCW" onClick={rotate90CCW} />
					<ToolBtn icon="fa-rotate-right" label="Rotate CW" onClick={rotate90CW} />
					<ToolBtn icon="fa-arrows-left-right" label="Flip H" onClick={toggleFlipH} active={flipH} />
				</div>
				{/* Row 2 — filters + resets */}
				<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
					<ToolBtn icon="fa-circle-half-stroke" label="B&amp;W" onClick={toggleGrayscale} active={grayscale} />
					<ToolBtn icon="fa-bolt" label="Vivid" onClick={toggleVivid} active={vivid} />
					<ToolBtn icon="fa-undo" label="Reset" onClick={resetAll} />
					{onRevertToOriginal && (
						<ToolBtn icon="fa-image" label="Original" onClick={onRevertToOriginal} />
					)}
				</div>

				<SliderRow label="Brightness" icon="fa-sun" value={brightness} onChange={setBrightness} />
				<SliderRow label="Contrast" icon="fa-circle-half-stroke" value={contrast} onChange={setContrast} />
			</div>
		</div>
	);
}

// ─── sub-components ───────────────────────────────────────────────────────────

function btnStyle(variant: 'ghost' | 'primary', disabled = false): React.CSSProperties {
	return {
		background: variant === 'primary'
			? disabled ? '#334155' : '#7c3aed'
			: 'none',
		border: variant === 'primary' ? 'none' : 'none',
		color: disabled ? '#64748b' : variant === 'primary' ? '#f8fafc' : '#94a3b8',
		fontWeight: 600,
		fontSize: '0.875rem',
		padding: variant === 'primary' ? '6px 18px' : '6px 10px',
		borderRadius: '8px',
		cursor: disabled ? 'not-allowed' : 'pointer',
	};
}

function ToolBtn({ icon, label, onClick, active = false }: {
	icon: string; label: string; onClick: () => void; active?: boolean;
}): React.ReactElement {
	return (
		<button
			title={label}
			aria-label={label}
			onClick={onClick}
			style={{
				display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
				background: active ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.07)',
				border: `1px solid ${active ? 'rgba(124,58,237,0.7)' : 'rgba(255,255,255,0.12)'}`,
				borderRadius: '10px',
				padding: '8px 14px',
				cursor: 'pointer',
				color: active ? '#c4b5fd' : '#cbd5e1',
				minWidth: '60px',
				transition: 'background 0.15s, box-shadow 0.15s',
			}}
			onMouseEnter={(e) => {
				(e.currentTarget as HTMLButtonElement).style.boxShadow = active
					? '0 0 0 2px rgba(124,58,237,0.6)'
					: '0 0 0 2px rgba(255,255,255,0.25)';
			}}
			onMouseLeave={(e) => {
				(e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
			}}
		>
			<i className={`fas ${icon}`} aria-hidden="true" style={{ fontSize: '1rem' }} />
			<span style={{ fontSize: '0.62rem', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
				{label}
			</span>
		</button>
	);
}

function SliderRow({ label, icon, value, onChange }: {
	label: string; icon: string; value: number; onChange: (v: number) => void;
}): React.ReactElement {
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
			<i className={`fas ${icon}`} aria-hidden="true"
				style={{ color: '#64748b', width: '16px', textAlign: 'center', fontSize: '0.85rem' }} />
			<span style={{ color: '#94a3b8', fontSize: '0.75rem', width: '76px', flexShrink: 0 }}>
				{label}
			</span>
			<input
				type="range" min={-100} max={100} value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				style={{ flex: 1, accentColor: '#7c3aed', cursor: 'pointer' }}
			/>
			<span style={{ color: value !== 0 ? '#c4b5fd' : '#94a3b8', fontSize: '0.75rem', width: '36px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
				{value > 0 ? `+${value}` : value}
			</span>
		</div>
	);
}

