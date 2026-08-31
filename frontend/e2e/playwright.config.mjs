// long timeout on purpose: a screening run is ~17 model calls against a 253B
// reasoning model, so a couple of minutes is normal, not a hang.
export default {
  testDir: '.',
  timeout: 900_000,
  reporter: [['line']],
  use: { headless: true, viewport: { width: 1440, height: 900 } },
}
