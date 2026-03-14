/**
 * CJS shim for the ESM-only "until-async" package.
 * msw's CJS bundle (lib/core/utils/handleRequest.js) does
 *   require("until-async")
 * but until-async@3 ships only ESM, so Jest (CJS mode) can't load it.
 * This shim is identical to the original implementation.
 */
async function until(callback) {
  try {
    return [null, await callback().catch((error) => { throw error; })];
  } catch (error) {
    return [error, null];
  }
}
module.exports = { until };
