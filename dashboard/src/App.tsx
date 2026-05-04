import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.js';
import AppLayout from './components/AppLayout.js';
import ProtectedRoute from './components/ProtectedRoute.js';
import LandingPage from './pages/LandingPage.js';
import LoginPage from './pages/LoginPage.js';
import RegisterPage from './pages/RegisterPage.js';
import InboxPage from './pages/InboxPage.js';
import AnalyticsPage from './pages/AnalyticsPage.js';
import ContactsPage from './pages/ContactsPage.js';
import SettingsPage from './pages/SettingsPage.js';

function AppRoutes() {
    const { token, rehydrate } = useAuthStore();

    useEffect(() => {
        rehydrate();
    }, [rehydrate]);

    return (
        <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={token ? <Navigate to="/inbox" replace /> : <LoginPage />} />
            <Route path="/register" element={token ? <Navigate to="/inbox" replace /> : <RegisterPage />} />

            <Route
                path="/inbox"
                element={
                    <ProtectedRoute>
                        <AppLayout><InboxPage /></AppLayout>
                    </ProtectedRoute>
                }
            />
            <Route
                path="/analytics"
                element={
                    <ProtectedRoute>
                        <AppLayout><AnalyticsPage /></AppLayout>
                    </ProtectedRoute>
                }
            />
            <Route
                path="/contacts"
                element={
                    <ProtectedRoute>
                        <AppLayout><ContactsPage /></AppLayout>
                    </ProtectedRoute>
                }
            />
            <Route
                path="/settings"
                element={
                    <ProtectedRoute>
                        <AppLayout><SettingsPage /></AppLayout>
                    </ProtectedRoute>
                }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <AppRoutes />
        </BrowserRouter>
    );
}
