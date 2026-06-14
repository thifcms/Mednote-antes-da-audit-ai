import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './store/AppContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Invoices } from './pages/Invoices';
import { Surgeries } from './pages/Surgeries';
import { ElectiveSurgeries } from './pages/ElectiveSurgeries';
import { Settings } from './pages/Settings';
import { Payments } from './pages/Payments';
import { Preferences } from './pages/Preferences';
import { ZeroFeesSurgeries } from './pages/ZeroFeesSurgeries';
import { ParticularPendingSurgeries } from './pages/ParticularPendingSurgeries';
import { PaymentReconciliation } from './pages/PaymentReconciliation';
import { LoginPage } from './pages/LoginPage';
import { SplashScreen } from './components/SplashScreen';
import { SecurityWall } from './components/SecurityWall';
import { AnimatePresence } from 'motion/react';
import { Toaster } from 'sonner';

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/notas" element={<Invoices />} />
        <Route path="/cirurgias" element={<Surgeries />} />
        <Route path="/eletivas" element={<ElectiveSurgeries />} />
        <Route path="/recebimentos" element={<Payments />} />
        <Route path="/cadastros" element={<Settings />} />
        <Route path="/preferencias" element={<Preferences />} />
        <Route path="/honorarios-zero" element={<ZeroFeesSurgeries />} />
        <Route path="/particulares-pendentes" element={<ParticularPendingSurgeries />} />
        <Route path="/conciliacao" element={<PaymentReconciliation />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}


function AppRoutes() {
  const { user, loading } = useApp();

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#0B1628] flex items-center justify-center">
        <div className="text-white opacity-50 font-bold uppercase tracking-widest text-xs">Aguarde...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <SecurityWall>
      <Layout>
        <AnimatedRoutes />
      </Layout>
    </SecurityWall>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Toaster position="top-center" richColors theme="light" />
        <Router>
          <AppRoutes />
        </Router>
      </AppProvider>
    </ErrorBoundary>
  );
}

