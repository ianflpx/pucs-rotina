import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Shell } from './components/Shell';
import { useSync } from './lib/sync';
import { DietPage } from './pages/Diet';
import { FinancePage } from './pages/Finance';
import { HomePage } from './pages/Home';
import { AuthScreen, SettingsPage } from './pages/Settings';
import { HabitsPage } from './pages/Habits';
import { CalendarPage, InboxPage, LabelPage, LabelsPage, ProjectPage, ProjectsPage, TodayPage } from './pages/Tasks';
import { WorkoutPage } from './pages/Workout';
import { WorkoutReportPage } from './pages/WorkoutReport';

export default function App() {
  const { ready, session } = useSync();
  const loc = useLocation();

  if (!ready) return null;
  // `?dev` pula o login só no `npm run dev` (para revisar telas); o build de produção remove isso.
  const devBypass = import.meta.env.DEV && new URLSearchParams(loc.search).has('dev');
  if (!session && !devBypass) return <AuthScreen />;

  return (
    <Shell>
      <Routes location={loc}>
        <Route path="/" element={<HomePage />} />
        <Route path="/entrada" element={<InboxPage />} />
        <Route path="/hoje" element={<TodayPage />} />
        <Route path="/em-breve" element={<Navigate to="/calendario" replace />} />
        <Route path="/calendario" element={<CalendarPage />} />
        <Route path="/etiquetas" element={<LabelsPage />} />
        <Route path="/etiqueta/:name" element={<LabelPage />} />
        <Route path="/projetos" element={<ProjectsPage />} />
        <Route path="/projeto/:id" element={<ProjectPage />} />
        <Route path="/dieta" element={<DietPage />} />
        <Route path="/treino" element={<WorkoutPage />} />
        <Route path="/relatorio-treino" element={<WorkoutReportPage />} />
        <Route path="/habitos" element={<HabitsPage />} />
        <Route path="/financeiro" element={<FinancePage />} />
        <Route path="/ajustes" element={<SettingsPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </Shell>
  );
}
