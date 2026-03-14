/**
 * Jest polyfills for jest-environment-jsdom (jsdom 20) + MSW v2.
 *
 * jsdom 20 does not implement TextEncoder/TextDecoder, the Fetch API,
 * or the Streams API. MSW v2 and @mswjs/interceptors require all of
 * these at module-load time, so they must be in place before
 * jest.setup.ts imports msw/node.
 *
 * This file is listed under jest.config.ts `setupFiles` (runs after the
 * jsdom environment is created but before setupFilesAfterEnv).
 */

// ── Text Encoding API ──────────────────────────────────────────────────────
const { TextDecoder, TextEncoder } = require('util');
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}

// ── Streams API (ReadableStream, WritableStream, TransformStream, …) ───────
// @mswjs/interceptors uses these for response body streaming and
// brotli decompression. All are available from Node.js 18+ via stream/web.
const streamWeb = require('stream/web');
const streamGlobals = [
  'ReadableStream',
  'WritableStream',
  'TransformStream',
  'TransformStreamDefaultController',
  'ReadableStreamDefaultController',
  'ByteLengthQueuingStrategy',
  'CountQueuingStrategy',
  'CompressionStream',
  'DecompressionStream',
];
for (const name of streamGlobals) {
  if (typeof global[name] === 'undefined' && streamWeb[name]) {
    global[name] = streamWeb[name];
  }
}

// ── Fetch API (Response, Request, Headers, fetch) ─────────────────────────
// whatwg-fetch is a browser-compatible polyfill that sets these on globalThis.
require('whatwg-fetch');

// ── BroadcastChannel ───────────────────────────────────────────────────────
// Available in Node.js 15.4+ and browsers, but not in jsdom 20.
// MSW v2 (core/ws.ts) uses it at module-load time.
if (typeof global.BroadcastChannel === 'undefined') {
  const { BroadcastChannel } = require('worker_threads');
  global.BroadcastChannel = BroadcastChannel;
}
