// src/App.js
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Login from './Login';
import ChatRoom from './ChatRoom';
import './App.css';

function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    // Controlla se esiste già una sessione
    const currentSession = supabase.auth.session();
    setSession(currentSession);

    // Ascolta i cambiamenti di autenticazione
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      authListener.unsubscribe();
    };
  }, []);

  return (
    <div className="App">
      {!session ? <Login /> : <ChatRoom session={session} />}
    </div>
  );
}

export default App;
