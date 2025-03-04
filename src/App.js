// src/App.js
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Login from './Login';
import ChatRoom from './ChatRoom';
import './App.css';

function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    // Recupera la sessione in modo asincrono
    async function loadSession() {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
    }
    loadSession();

    // Ascolta i cambiamenti di autenticazione
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
    });

    // Pulisce il listener quando il componente viene smontato
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="App">
      {!session ? <Login /> : <ChatRoom session={session} />}
    </div>
  );
}

export default App;
