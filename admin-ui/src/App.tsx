import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { LayoutDashboard, ScrollText, Settings, Bot } from 'lucide-react';
import DashboardPage from './pages/DashboardPage';
import LogsPage from './pages/LogsPage';
import ConfigsPage from './pages/ConfigsPage';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-slate-50 flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-sm hidden md:flex">
          <div className="h-16 flex items-center px-6 border-b border-slate-200">
            <Bot className="text-primary w-8 h-8 mr-3" />
            <span className="text-lg font-bold text-slate-800 tracking-tight">Aha Mind Agents</span>
          </div>
          <nav className="flex-1 px-4 py-6 space-y-2">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `flex items-center px-4 py-3 rounded-lg transition-colors font-medium ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <LayoutDashboard className="w-5 h-5 mr-3" />
              Dashboard
            </NavLink>
            <NavLink
              to="/logs"
              className={({ isActive }) =>
                `flex items-center px-4 py-3 rounded-lg transition-colors font-medium ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <ScrollText className="w-5 h-5 mr-3" />
              Execution Logs
            </NavLink>
            <NavLink
              to="/configs"
              className={({ isActive }) =>
                `flex items-center px-4 py-3 rounded-lg transition-colors font-medium ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Settings className="w-5 h-5 mr-3" />
              Agent Configs
            </NavLink>
          </nav>
          <div className="p-4 border-t border-slate-200 text-sm text-slate-500 text-center">
            v2.0 Pragmatic Hybrid
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          <header className="h-16 bg-white border-b border-slate-200 flex items-center px-8 shadow-sm">
            <h1 className="text-xl font-semibold text-slate-800">Workspace</h1>
          </header>
          <div className="flex-1 overflow-auto p-8">
            <div className="max-w-6xl mx-auto">
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/logs" element={<LogsPage />} />
                <Route path="/configs" element={<ConfigsPage />} />
              </Routes>
            </div>
          </div>
        </main>
      </div>
    </Router>
  );
}

export default App;
