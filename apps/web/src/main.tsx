import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import Landing from './pages/Landing';
import Create from './pages/Create';
import Join from './pages/Join';
import DsLogin from './pages/DsLogin';
import TraineeConsole from './pages/TraineeConsole';

const DsConsole = lazy(() => import('./pages/DsConsole'));
const Aar = lazy(() => import('./pages/Aar'));
const Scenarios = lazy(() => import('./pages/Scenarios'));
const ScenarioEditor = lazy(() => import('./pages/ScenarioEditor'));
const Analytics = lazy(() => import('./pages/Analytics'));

function NotFound() {
  return <div className="p-10 text-center text-sm text-muted">Page not found.</div>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<div className="p-10 text-center text-sm text-muted">Loading…</div>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/create" element={<Create />} />
          <Route path="/join" element={<Join />} />
          <Route path="/ds-login" element={<DsLogin />} />
          <Route path="/play/:code" element={<TraineeConsole />} />
          <Route path="/ds/:code" element={<DsConsole />} />
          <Route path="/aar/:code" element={<Aar />} />
          <Route path="/scenarios" element={<Scenarios />} />
          <Route path="/scenarios/new" element={<ScenarioEditor />} />
          <Route path="/scenarios/edit/:id" element={<ScenarioEditor />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
