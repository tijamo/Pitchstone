export function StatusBar() {
  return (
    <footer className="statusbar">
      <span className="statusbar__item">0 notes</span>
      <span className="statusbar__item">0 words</span>
      <span className="statusbar__item statusbar__version" title="Pitchstone version">
        v{__APP_VERSION__}
      </span>
    </footer>
  )
}
