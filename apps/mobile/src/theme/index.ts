import { dark, elevation, light, radius, space, touch, type } from "@sp/design-tokens";

export { dark, light, radius, space, touch, type };
/** Static default for backwards compatibility with non-hook callers */
export const colors = light;
export const shadow = { 1: elevation[1].rn, 2: elevation[2].rn } as const;

export * from "./ThemeContext";
