import "@testing-library/jest-dom";

// react-router's data router builds `new Request(url, { signal })` using the
// global AbortController. Under vitest's jsdom environment the AbortController
// comes from jsdom while Request is Node's (undici), whose brand check rejects
// foreign signals ("Expected signal to be an instanceof AbortSignal"). Wrap
// Request to detach the signal from the init and re-expose it as a plain
// property — tests never rely on real fetch aborts.
const NativeRequest = globalThis.Request;
class JsdomCompatibleRequest extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (init?.signal) {
      const { signal, ...rest } = init;
      super(input, rest);
      Object.defineProperty(this, "signal", { value: signal });
    } else {
      super(input, init);
    }
  }
}
globalThis.Request = JsdomCompatibleRequest;
