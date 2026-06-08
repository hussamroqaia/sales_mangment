// Plugin registration for the Axios instance.
// The numbered prefix (3) ensures this loads after:
//   1.router → 2.pinia → 3.axios
// Vuexy's registerPlugins() in @core/utils/plugins.js auto-loads
// all files matching src/plugins/*.js in alphabetical order.

// Axios is initialized as a singleton via its own module (axios.js).
// No app-level registration is needed (it's not a Vue plugin).
// This file exists to ensure the module is eagerly evaluated and
// the interceptors are set up before any component mounts.

import '@/plugins/axios.js'

// eslint-disable-next-line no-unused-vars
export default function (_app) {
  // Intentionally empty — Axios does not use app.use()
  // The import above triggers the interceptor setup side-effect.
}
