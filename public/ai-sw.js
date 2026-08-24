/* Intentionally empty compatibility service worker.
 * Some embedded AI/browser tooling probes this root URL. Serving a valid
 * script prevents a noisy 404 without registering caches or intercepting
 * application requests.
 */
