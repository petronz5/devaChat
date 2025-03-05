// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { supabase } from './supabaseClient';
import ChatRoom from './ChatRoom';
import FriendsPage from './FriendsPage';
import Login from './Login';

function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    // Carico la session da Supabase
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });
    // Ascolta i cambiamenti di auth
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
      }
    );
    // Ritorno cleanup
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Richiesta permesso Notifiche + registra service worker
  useEffect(() => {
    if ('Notification' in window) {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          console.log('Notifiche consentite dal browser.');
        } else {
          console.log('Notifiche negate/ignorate.');
        }
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
      <Routes>
        <Route path="/" element={<ChatRoom session={session} />} />
        <Route path="/friends" element={<FriendsPage session={session} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
