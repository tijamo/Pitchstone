import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { useUiStore, type Theme } from '../store/uiStore'
import { useApprovalStore } from '../store/approvalStore'
import { useVaultStore } from '../store/vaultStore'
import { describeError, fetchAllNotes } from '../lib/notes'
import type { TransferNote } from '../lib/vaultTransfer'
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
        <ImportExport />
        <ClaudeAccess />
        <UserManagement />
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

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** What a chosen zip would do, computed before anything is written — see
 * planImportFromZip. Held here rather than in the store: it's only ever
 * relevant while this dialog is open, unlike lastImport (the undo record). */
type PendingImport = { fileName: string; notes: TransferNote[]; renamed: number }

/**
 * A vault is already just a folder of `.md` files with frontmatter and
 * `[[wikilinks]]` — the same shape Obsidian itself uses — so moving one in or
 * out is a zip, not a bespoke format. Both directions dynamic-`import()` the
 * zip logic (see vaultTransfer.ts) so JSZip never lands in the main bundle for
 * someone who never touches this section.
 *
 * Import never overwrites: a colliding name is renamed, not replaced — see
 * vaultTransfer's uniquePath — so the only real risk is importing the wrong
 * file at all. Reading the plan back before committing, and being able to
 * undo after, are what actually cover that.
 */
function ImportExport() {
  const notes = useVaultStore((s) => s.notes)
  const lastImport = useVaultStore((s) => s.lastImport)
  const commitImport = useVaultStore((s) => s.commitImport)
  const undoLastImport = useVaultStore((s) => s.undoLastImport)
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'export' | 'plan' | 'import' | 'undo' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)

  const runExport = async () => {
    setBusy('export')
    setError(null)
    setResult(null)
    try {
      const all = await fetchAllNotes()
      const { exportVault } = await import('../lib/vaultTransfer')
      const blob = await exportVault(all)
      downloadBlob(blob, `pitchstone-vault-${new Date().toISOString().slice(0, 10)}.zip`)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(null)
    }
  }

  const planImport = async (file: File) => {
    setBusy('plan')
    setError(null)
    setResult(null)
    setPending(null)
    try {
      const { planImportFromZip } = await import('../lib/vaultTransfer')
      const plan = await planImportFromZip(file, new Set(notes.map((n) => n.path)))
      if (plan.notes.length === 0) {
        setError("No markdown notes found in that file — Pitchstone can't carry over attachments.")
        return
      }
      setPending({ fileName: file.name, notes: plan.notes, renamed: plan.renamed })
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(null)
    }
  }

  const confirmImport = async () => {
    if (!pending) return
    setBusy('import')
    setError(null)
    try {
      const count = await commitImport(pending.notes)
      setResult(`Imported ${count} note${count === 1 ? '' : 's'} from ${pending.fileName}.`)
      setPending(null)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(null)
    }
  }

  const runUndo = async () => {
    setBusy('undo')
    setError(null)
    try {
      await undoLastImport()
      setResult('Import undone — the notes it added are gone.')
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="modal__section">
      <h3 className="modal__heading">
        <Icon name="download" size={14} /> Import &amp; export
      </h3>
      <p className="modal__note">
        Export writes every note to a <code>.zip</code> of <code>.md</code> files, laid out the
        way an Obsidian vault folder is. Import reads one of those back in and shows you what it
        would do before touching anything — it only ever adds notes; a name already in use is
        renamed, never overwritten, and the whole import can be undone afterward. Neither
        direction carries attachments or Obsidian's own settings; Pitchstone has nowhere to put
        them.
      </p>

      {error && <p className="gate__error">{error}</p>}
      {result && !error && <p className="modal__note modal__note--faint">{result}</p>}

      {pending ? (
        <div className="transfer-preview">
          <p className="modal__note">
            <strong>{pending.fileName}</strong> adds <strong>{pending.notes.length}</strong> note
            {pending.notes.length === 1 ? '' : 's'} to this vault.
            {pending.renamed > 0 && (
              <>
                {' '}
                {pending.renamed} name{pending.renamed === 1 ? '' : 's'} already in use here{' '}
                {pending.renamed === 1 ? 'was' : 'were'} kept as-is and the incoming note renamed
                instead — nothing existing is touched.
              </>
            )}
          </p>
          <div className="transfer-row">
            <button
              className="gate__ghost transfer-row__button"
              disabled={busy !== null}
              onClick={() => setPending(null)}
            >
              Cancel
            </button>
            <button className="gate__button" disabled={busy !== null} onClick={() => void confirmImport()}>
              {busy === 'import'
                ? 'Importing…'
                : `Import ${pending.notes.length} note${pending.notes.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      ) : (
        <div className="transfer-row">
          <button className="gate__ghost transfer-row__button" disabled={busy !== null} onClick={() => void runExport()}>
            <Icon name="download" size={14} />
            {busy === 'export' ? 'Exporting…' : 'Export vault'}
          </button>
          <button
            className="gate__ghost transfer-row__button"
            disabled={busy !== null}
            onClick={() => fileInput.current?.click()}
          >
            <Icon name="upload" size={14} />
            {busy === 'plan' ? 'Reading…' : 'Import vault'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".zip"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void planImport(file)
            }}
          />
        </div>
      )}

      {lastImport && !pending && (
        <div className="transfer-row">
          <button className="gate__ghost transfer-row__button" disabled={busy !== null} onClick={() => void runUndo()}>
            <Icon name="trash" size={14} />
            {busy === 'undo'
              ? 'Undoing…'
              : `Undo last import (${lastImport.count} note${lastImport.count === 1 ? '' : 's'})`}
          </button>
        </div>
      )}
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

/**
 * Only the owner has anything to see here — `pending` is fetched and kept
 * live only for them (see approvalStore), so a member's list is always
 * empty and this renders nothing rather than an always-empty section.
 */
function UserManagement() {
  const isOwner = useApprovalStore((s) => s.isOwner)
  const pending = useApprovalStore((s) => s.pending)
  const approve = useApprovalStore((s) => s.approve)
  const reject = useApprovalStore((s) => s.reject)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isOwner) return null

  const decide = async (userId: string, action: 'approve' | 'reject') => {
    setBusyId(userId)
    setError(null)
    try {
      await (action === 'approve' ? approve(userId) : reject(userId))
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="modal__section">
      <h3 className="modal__heading">
        <Icon name="users" size={14} /> User management
      </h3>
      <p className="modal__note">
        Approving a sign-up gives it access to Pitchstone, and to every other Tijamo app that
        shares this account.
      </p>

      {error && <p className="gate__error">{error}</p>}

      {pending.length === 0 ? (
        <p className="modal__note modal__note--faint">No sign-ups waiting.</p>
      ) : (
        <ul className="approval-list">
          {pending.map((account) => (
            <li key={account.user_id} className="approval-list__row">
              <span className="approval-list__info">
                <span className="approval-list__email">{account.email}</span>
                <span className="approval-list__when">
                  requested {new Date(account.requested_at).toLocaleDateString()}
                </span>
              </span>
              <span className="approval-list__actions">
                <button
                  className="approval-button approval-button--approve"
                  disabled={busyId === account.user_id}
                  onClick={() => void decide(account.user_id, 'approve')}
                >
                  Approve
                </button>
                <button
                  className="approval-button approval-button--reject"
                  disabled={busyId === account.user_id}
                  onClick={() => void decide(account.user_id, 'reject')}
                >
                  Reject
                </button>
              </span>
            </li>
          ))}
        </ul>
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
 * phone that is misbehaving. Tapping it, here and there, opens the same
 * release notes.
 */
function About() {
  const setChangelogOpen = useUiStore((s) => s.setChangelogOpen)

  return (
    <section className="modal__section">
      <h3 className="modal__heading">About</h3>
      <p className="modal__note modal__note--faint">
        Pitchstone{' '}
        <button
          className="statusbar__version"
          title="What's new"
          onClick={() => setChangelogOpen(true)}
        >
          v{__APP_VERSION__}
        </button>
      </p>
    </section>
  )
}
