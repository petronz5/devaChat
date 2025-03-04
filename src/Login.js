// src/Login.js
import React, { useState } from 'react';
import { supabase } from './supabaseClient';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (type) => {
    if (type === 'login') {
      // Usa signInWithPassword per il login
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
    } else if (type === 'signup') {
      // Per la registrazione, il metodo rimane signUp
      const { data, error } = await supabase.auth.signUp({ email, password });
  
      if (error) {
        alert(error.message);
      } else {
        alert('Controlla la tua email per confermare la registrazione!');
  
        // Se il trigger non ha funzionato, creiamo manualmente il profilo
        if (data.user) {
          const { error: profileError } = await supabase
            .from('profiles')
            .insert([{ id: data.user.id, email: email }]);
  
          if (profileError) {
            console.error("Errore nella creazione del profilo:", profileError.message);
          } else {
            console.log("Profilo creato con successo!");
          }
        }
      }
    }
  };
  

  return (
    <div className="login-container">
      <h2>Accedi / Registrati</h2>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e)=> setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e)=> setPassword(e.target.value)}
      />
      <div className="button-group">
        <button onClick={()=>handleLogin('login')}>Accedi</button>
        <button onClick={()=>handleLogin('signup')}>Registrati</button>
      </div>
    </div>
  );
}

export default Login;
