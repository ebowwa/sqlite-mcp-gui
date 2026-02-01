// Polyfill for import.meta.url
export const meta = {
  url: `file://${process.cwd()}/index.js`
};

// Export a compatibility shim
export const importMeta = meta;
