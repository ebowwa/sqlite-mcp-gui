// Polyfill for import.meta.url
// @ts-ignore
export const meta = {
  // @ts-ignore
  url: typeof process !== 'undefined' ? `file://${process.cwd()}/index.js` : 'file:///index.js'
};

// Export a compatibility shim
export const importMeta = meta;
