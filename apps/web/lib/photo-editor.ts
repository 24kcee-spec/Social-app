export const PHOTO_FILTERS = [
  { id: 'original', label: 'Original', value: '' },
  { id: 'vivid', label: 'Vivid', value: 'saturate(1.35) contrast(1.08)' },
  { id: 'warm', label: 'Warm', value: 'sepia(.2) saturate(1.15)' },
  { id: 'cool', label: 'Cool', value: 'saturate(.85) hue-rotate(15deg) contrast(1.05)' },
  { id: 'mono', label: 'Mono', value: 'grayscale(1) contrast(1.08)' },
  { id: 'soft', label: 'Soft', value: 'saturate(.8) contrast(.9) brightness(1.08)' },
] as const;

export type PhotoEdit = {
  zoom: number;
  x: number;
  y: number;
  rotation: number;
  flip: boolean;
  filter: string;
  brightness: number;
};
export const DEFAULT_PHOTO_EDIT: PhotoEdit = {
  zoom: 1,
  x: 0,
  y: 0,
  rotation: 0,
  flip: false,
  filter: 'original',
  brightness: 1,
};

export function photoGeometry(width: number, height: number, size: number, edit: PhotoEdit) {
  const sideways = Math.abs(edit.rotation % 180) === 90;
  const w = sideways ? height : width,
    h = sideways ? width : height;
  const scale = Math.max(size / w, size / h) * edit.zoom;
  return {
    scale,
    offsetX: edit.x * Math.max(0, (w * scale - size) / 2),
    offsetY: edit.y * Math.max(0, (h * scale - size) / 2),
    rangeX: Math.max(0, (w * scale - size) / 2),
    rangeY: Math.max(0, (h * scale - size) / 2),
  };
}

export function renderPhoto(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  edit: PhotoEdit,
  size: number,
) {
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser cannot edit images.');
  const { scale, offsetX, offsetY } = photoGeometry(
    image.naturalWidth,
    image.naturalHeight,
    size,
    edit,
  );
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter =
    `${PHOTO_FILTERS.find((filter) => filter.id === edit.filter)?.value ?? ''} brightness(${edit.brightness})`.trim();
  ctx.translate(size / 2 + offsetX, size / 2 + offsetY);
  ctx.rotate((edit.rotation * Math.PI) / 180);
  ctx.scale(edit.flip ? -scale : scale, scale);
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
}
