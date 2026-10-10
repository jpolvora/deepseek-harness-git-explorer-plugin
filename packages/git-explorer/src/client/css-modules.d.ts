/**
 * Ambient declaration for the client build's CSS Modules.
 *
 * The bundler compiles `*.module.css` into a class map (see `tsdown.css-modules.ts`);
 * TypeScript only needs to know the import's shape. Class names are hashed at build
 * time, so they are read from the map rather than written literally.
 */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
