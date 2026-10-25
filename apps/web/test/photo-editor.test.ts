import { expect, it } from 'vitest';
import { DEFAULT_PHOTO_EDIT, photoGeometry } from '../lib/photo-editor';

it('covers the crop with wide and tall images without exposing an empty edge', () => {
  expect(photoGeometry(1200, 600, 600, DEFAULT_PHOTO_EDIT)).toMatchObject({ scale: 1, rangeX: 300, rangeY: 0 });
  expect(photoGeometry(600, 1200, 600, DEFAULT_PHOTO_EDIT)).toMatchObject({ scale: 1, rangeX: 0, rangeY: 300 });
});
it('accounts for rotation, zoom and keyboard-controlled pan in output coordinates', () => {
  const rotated = photoGeometry(1200, 600, 600, { ...DEFAULT_PHOTO_EDIT, rotation: 90, zoom: 2, x: -1, y: 1 });
  expect(rotated).toEqual({ scale: 2, offsetX: -300, offsetY: 900, rangeX: 300, rangeY: 900 });
});
