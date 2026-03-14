/**
 * Custom Jest transformer that pre-processes TypeScript source files
 * to replace `import.meta.env` with `process.env` before ts-jest compiles.
 *
 * This is needed because Jest runs in CommonJS mode where `import.meta`
 * is not allowed, but Vite uses `import.meta.env` for environment variables.
 * In tests, `process.env.VITE_API_URL` is undefined, falling back to the
 * hardcoded default in each consuming file.
 */
const { TsJestTransformer } = require("ts-jest");

// TsJestTransformer expects its config via the jestConfig passed to process(),
// but we can instantiate it with custom options.
// We use a lazy singleton to avoid re-reading tsconfig on every file.
let _transformer = null;

function getTransformer() {
  if (!_transformer) {
    _transformer = new TsJestTransformer({
      tsconfig: "tsconfig.jest.json",
      diagnostics: false,
    });
  }
  return _transformer;
}

function preprocess(source) {
  // Replace `import.meta.env.KEY` → `process.env.KEY`
  // Also replace bare `import.meta.env` → `process.env`
  return source.replace(/\bimport\.meta\.env\b/g, "process.env");
}

module.exports = {
  process(source, filename, options) {
    return getTransformer().process(preprocess(source), filename, options);
  },

  processAsync(source, filename, options) {
    const transformer = getTransformer();
    if (typeof transformer.processAsync === "function") {
      return transformer.processAsync(preprocess(source), filename, options);
    }
    return Promise.resolve(
      getTransformer().process(preprocess(source), filename, options)
    );
  },

  getCacheKey(source, filename, options) {
    const transformer = getTransformer();
    if (typeof transformer.getCacheKey === "function") {
      return transformer.getCacheKey(preprocess(source), filename, options);
    }
    return require("crypto")
      .createHash("sha256")
      .update(preprocess(source) + filename)
      .digest("hex");
  },

  getCacheKeyAsync(source, filename, options) {
    return Promise.resolve(
      module.exports.getCacheKey(source, filename, options)
    );
  },
};
