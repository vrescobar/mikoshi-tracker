import { activateMikoshiTrackerOpenClawPlugin } from "./index.js";
import type { OpenClawPluginApi } from "./types.js";
import type { PluginActivationOptions } from "./index.js";

export function register(api: OpenClawPluginApi, options: PluginActivationOptions = {}) {
  return activateMikoshiTrackerOpenClawPlugin(api, options);
}

export function activate(api: OpenClawPluginApi, options: PluginActivationOptions = {}) {
  return register(api, options);
}

export { activateMikoshiTrackerOpenClawPlugin };

export default register;
