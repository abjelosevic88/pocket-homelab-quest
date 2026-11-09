import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './styles/base.css'
import './styles/art.css'
import './styles/quest.css'
import './styles/game.css'
import './styles/app.css'
import './styles/settings.css'
import { AppProvider, useApp } from './lib/app-context'
import { Loading, ToastProvider } from './components/ui'
import Layout from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import Login from './pages/Login'
import Today from './pages/Today'
import Characters from './pages/Characters'
import Character from './pages/Character'
import Builder from './pages/Builder'
import Campaigns from './pages/Campaigns'
import Campaign from './pages/Campaign'
import Session from './pages/Session'
import CodexEntry from './pages/CodexEntry'
import Encounters, { NewEncounter } from './pages/Encounters'
import Encounter from './pages/Encounter'
import Dice from './pages/Dice'
import Compendium from './pages/Compendium'
import Player from './pages/Player'
import SharedSheet from './pages/SharedSheet'
import Settings from './pages/Settings'
import { RollerProvider } from './lib/dice'

function Gate({ children }: { children: React.ReactNode }) {
  const { status, user } = useApp()
  const loc = useLocation()
  if (!status) return <div className="boot"><img src="/favicon.svg" alt="" /><Loading /></div>
  if (status.needs_setup) return <Navigate to="/setup" replace />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  return <>{children}</>
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login mode="login" />} />
      <Route path="/setup" element={<Login mode="setup" />} />
      <Route path="/p/:token" element={<ErrorBoundary where="player"><RollerProvider><Player /></RollerProvider></ErrorBoundary>} />
      <Route path="/c/:token" element={<ErrorBoundary where="sheet"><RollerProvider><SharedSheet /></RollerProvider></ErrorBoundary>} />
      <Route path="/settings/:tab?" element={<Gate><ErrorBoundary where="settings"><Settings /></ErrorBoundary></Gate>} />
      <Route element={<Gate><ErrorBoundary where="quest"><Layout /></ErrorBoundary></Gate>}>
        <Route path="/" element={<Today />} />
        <Route path="/characters" element={<Characters />} />
        <Route path="/characters/new" element={<Builder />} />
        <Route path="/characters/:id" element={<Character />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/campaigns/:id" element={<Campaign />} />
        <Route path="/campaigns/:id/sessions/:sid" element={<Session />} />
        <Route path="/campaigns/:id/codex/:eid" element={<CodexEntry />} />
        <Route path="/encounters" element={<Encounters />} />
        <Route path="/encounters/new" element={<NewEncounter />} />
        <Route path="/encounters/:id" element={<Encounter />} />
        <Route path="/dice" element={<Dice />} />
        <Route path="/compendium/:kind?/:key?" element={<Compendium />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary where="app"><ToastProvider><AppProvider><App /></AppProvider></ToastProvider></ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
)
