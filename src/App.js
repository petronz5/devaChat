// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import ChatRoom from './ChatRoom';
import FriendsPage from './FriendsPage';
import Profile from './Profile';
import Login from './Login';

function AppRoutes({ session }) {
  // useNavigate viene usato qui, che è un discendente di BrowserRouter
  const navigate = useNavigate();

  const handleShowProfile = () => {
    navigate('/profile');
  };

  return (
    <Routes>
      <Route path="/" element={<ChatRoom session={session} onShowProfile={handleShowProfile} />} />
      <Route path="/friends" element={<FriendsPage session={session} />} />
      <Route path="/profile" element={<Profile session={session} onClose={() => navigate('/')} />} />
    </Routes>
  );
}

function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    // Carico la sessione da Supabase
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });
    // Ascolto i cambiamenti di autenticazione
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
      }
    );
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Richiesta permesso notifiche + registrazione service worker
  useEffect(() => {
    if ('Notification' in window) {
      Notification.requestPermission().then((permission) => {
        console.log(permission === 'granted' ? 'Notifiche consentite.' : 'Notifiche negate.');
      });
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-push.js')
        .then(reg => console.log('SW registrato con successo:', reg))
        .catch(err => console.error('SW registration error:', err));
    }
  }, []);

  if (!session) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <AppRoutes session={session} />
    </BrowserRouter>
  );
}

export default App;
