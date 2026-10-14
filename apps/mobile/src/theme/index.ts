import { elevation, light, radius, space, touch, type } from "@sp/design-tokens";

/** Mobile view of the shared design tokens (light scheme; dark is wired in Stage D). */
export const colors = light;
export { radius, space, touch, type };
export const shadow = { 1: elevation[1].rn, 2: elevation[2].rn } as const;
