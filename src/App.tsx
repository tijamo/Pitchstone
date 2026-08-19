import { useEffect } from 'react'
import { Ribbon } from './components/Ribbon'
import { LeftSidebar } from './components/LeftSidebar'
import { EditorPane } from './components/EditorPane'
import { RightSidebar } from './components/RightSidebar'
import { StatusBar } from './components/StatusBar'
import { useUiStore } from './store/uiStore'

export function App() {
  const theme = useUiStore((s) => s.theme)

  // No stored preference means "follow the OS", which the CSS handles on its
  // own — so the attribute is removed rather than set to a resolved value.
  useEffect(() => {
    const root = document.documentElement
    if (theme) root.setAttribute('data-theme', theme)
    else root.removeAttribute('data-theme')
  }, [theme])

  return (
    <div className="shell">
      <Ribbon />
      <LeftSidebar />
      <EditorPane />
      <RightSidebar />
      <StatusBar />
    </div>
  )
}
