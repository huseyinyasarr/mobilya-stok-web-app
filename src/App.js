// Ana uygulama komponenti
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CategoriesProvider } from './contexts/CategoriesContext';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './components/Dashboard';
import ReportPage from './components/ReportPage';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <CategoriesProvider>
        <HashRouter>
          <div className="App">
            <ProtectedRoute>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/ozet" element={<ReportPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ProtectedRoute>
          </div>
        </HashRouter>
      </CategoriesProvider>
    </AuthProvider>
  );
}

export default App;
