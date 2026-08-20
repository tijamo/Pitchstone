import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { useUiStore, type Theme } from '../store/uiStore'
import { describeError } from '../lib/notes'
import { createToken, listTokens, revokeToken, type ApiToken } from '../lib/tokens'

/**
 * Settings: appearance, and the tokens that let Claude reach this vault
 * through the MCP server at /mcp.
 *
 * The token section is the reason this dialog exists. A token is shown exactly
 * once, at the moment it is created, because only its hash is ever stored —
 * so the whole flow is built around that one moment being useful: the full
 * `claude mcp add` command is assembled with the token already in it, ready to
 * paste into a terminal.
 */
export function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen)
  const close = useUiStore((s) => s.setSettingsOpen)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  return (
    <div
      className="modal"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) close(false)
      }}
    >
      <div className="modal__card" role="dialog" aria-modal="true" aria-label="Settings">
        <header className="modal__head">
          <h2 className="modal__title">Settings</h2>
          <button className="modal__close" aria-label="Close settings" onClick={() => close(false)}>
            ×
          </button>
        </header>

        <Appearance />
        <ClaudeAccess />
        <About />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

const THEMES: { value: Theme | null; label: string }[] = [
  { value: null, label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
]

function Appearance() {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)

  return (
    <section className="modal__section">
      <h3 className="modal__heading">Appearance</h3>
      <div className="segmented" role="group" aria-label="Theme">
        {THEMES.map(({ value, label }) => (
          <button
            key={label}
            className={`segmented__option${theme === value ? ' segmented__option--on' : ''}`}
            aria-pressed={theme === value}
            onClick={() => setTheme(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

/** Where the MCP server answers. Same origin as the app, always. */
const endpoint = () => `${window.location.origin}/mcp`

const addCommand = (secret: string) =>
  `claude mcp add --transport http pitchstone ${endpoint()} --header "Authorization: Bearer ${secret}"`

function ClaudeAccess() {
  const [tokens, setTokens] = useState<ApiToken[] | null>(null)
  const [name, setName] = useState('Claude')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** The one and only sighting of a newly created token. */
  const [secret, setSecret] = useState<string | null>(null)

  useEffect(() => {
    listTokens()
      .then(setTokens)
      .catch((e: unknown) => {
        setTokens([])
        setError(describeError(e))
      })
  }, [])

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const created = await createToken(name)
      setSecret(created.secret)
      setTokens((current) => [created.token, ...(current ?? [])])
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (token: ApiToken) => {
    setError(null)
    try {
      await revokeToken(token.id)
      setTokens((current) => (current ?? []).filter((t) => t.id !== token.id))
    } catch (e) {
      setError(describeError(e))
    }
  }

  return (
    <section className="modal__section">
      <h3 className="modal__heading">
        <Icon name="key" size={14} /> Claude access
      </h3>
      <p className="modal__note">
        Pitchstone speaks MCP at <code>{endpoint()}</code>, so Claude can read and write this
        vault the way you do. Create a token, then run the command it gives you.
      </p>

      {secret ? (
        <div className="token-new">
          <p className="modal__note">
            Copy this now — it is stored only as a hash, so this is the one time it can be
            shown.
          </p>
          <Copyable value={addCommand(secret)} label="Copy the command" />
          <Copyable value={secret} label="Copy the token on its own" mono />
          <button className="gate__ghost" onClick={() => setSecret(null)}>
            Done
          </button>
        </div>
      ) : (
        <div className="token-new">
          <input
            className="gate__input"
            value={name}
            aria-label="Token name"
            placeholder="What is this token for?"
            maxLength={64}
            onChange={(event) => setName(event.target.value)}
          />
          <button className="gate__button" disabled={busy} onClick={() => void create()}>
            {busy ? 'Creating…' : 'Create token'}
          </button>
        </div>
      )}

      {error && <p className="gate__error">{error}</p>}

      {tokens && tokens.length > 0 && (
        <ul className="token-list">
          {tokens.map((token) => (
            <li key={token.id} className="token-list__row">
              <span className="token-list__name">
                {token.name}
                <span className="token-list__hint">…{token.token_hint}</span>
              </span>
              <span className="token-list__used">
                {token.last_used_at
                  ? `used ${new Date(token.last_used_at).toLocaleDateString()}`
                  : 'never used'}
              </span>
              <button
                className="tree__action tree__action--danger"
                aria-label={`Revoke ${token.name}`}
                title="Revoke"
                onClick={() => void revoke(token)}
              >
                <Icon name="trash" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {tokens?.length === 0 && !secret && (
        <p className="modal__note modal__note--faint">No tokens yet.</p>
      )}
    </section>
  )
}

/** A read-only value with a copy button, and a moment of feedback after. */
function Copyable({ value, label, mono }: { value: string; label: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard access can be refused; the value is on screen to select.
    }
  }

  return (
    <div className="copyable">
      <code className={`copyable__value${mono ? ' copyable__value--mono' : ''}`}>{value}</code>
      <button className="copyable__button" title={label} aria-label={label} onClick={() => void copy()}>
        {copied ? 'Copied' : <Icon name="copy" size={14} />}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------

/**
 * The version is otherwise only in the status bar, which the mobile layout
 * hides — and "which version am I on" is exactly the question you have on the
 * phone that is misbehaving.
 */
function About() {
  return (
    <section className="modal__section">
      <h3 className="modal__heading">About</h3>
      <p className="modal__note modal__note--faint">
        Pitchstone <span className="statusbar__version">v{__APP_VERSION__}</span>
      </p>
    </section>
  )
}
