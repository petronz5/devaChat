// src/App.js
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Login from './Login';
import ChatRoom from './ChatRoom';
import Profile from './Profile';
import './App.css';

function App() {
  const [session, setSession] = useState(null);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    async function loadSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSession(session);
    }
    loadSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleShowProfile = () => {
    setShowProfile(true);
  };

  const handleCloseProfile = () => {
    setShowProfile(false);
  };

  if (!session) {
    return <Login />;
  }

  if (showProfile) {
    return <Profile session={session} onClose={handleCloseProfile} />;
  }

  return (
    <ChatRoom session={session} onShowProfile={handleShowProfile} />
  );
}

export default App;
