// src/Login.js
import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import './Login.css';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      alert(error.message);
    }
  };

  const handleSignup = async () => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      alert(error.message);
    } else {
      alert('Controlla la tua email per confermare la registrazione!');
      // Creazione manuale del profilo se non gestito da trigger
      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{ id: data.user.id, email }]);
        if (profileError) {
          console.error('Errore nella creazione del profilo:', profileError.message);
        }
      }
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      alert("Inserisci un'email per il reset della password.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://tua-app.vercel.app/reset-password',
    });
    if (error) {
      alert(error.message);
    } else {
      alert('Email di reset password inviata. Controlla la tua casella di posta!');
    }
  };

  return (
    <div className="login-background">
      <div className="login-container">
        <h2>Benvenuto</h2>
        <p>Effettua l’accesso o registrati per continuare</p>

        <div className="login-form">
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
            <button onClick={handleLogin}>Accedi</button>
            <button onClick={handleSignup}>Registrati</button>
          </div>

          <button className="forgot-password-btn" onClick={handleForgotPassword}>
            Password dimenticata?
          </button>
        </div>
      </div>
    </div>
  );
}

export default Login;
