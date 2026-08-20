import { registerSW } from 'virtual:pwa-register'
import { useVaultStore } from './store/vaultStore'

/**
 * Service worker registration.
 *
 * The worker is registered in 'prompt' mode and then updated immediately
 * anyway — not because anyone is prompted, but because taking the update by
 * hand is the only way to get a word in before the page reloads. Pitchstone
 * autosaves 0.7s after the last keystroke, so an unannounced reload can land
 * inside that window and lose the sentence being typed. Flushing first costs
 * one round trip and makes the update safe at any moment.
 */
export function registerServiceWorker(): void {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      void useVaultStore
        .getState()
        .flush()
        .catch(() => {
          // A vault that cannot be reached is no reason to stay on stale code;
          // the queued write survives in the store either way.
        })
        .finally(() => updateSW(true))
    },
  })
}
