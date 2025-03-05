// src/Profile.js
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import './Profile.css'; // CSS specifico per il profilo (opzionale)

function Profile({ session, onClose }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    if (session) {
      getProfile();
    }
    // eslint-disable-next-line
  }, [session]);

  const getProfile = async () => {
    try {
      setLoading(true);
      const { user } = session;
      let { data, error, status } = await supabase
        .from('profiles')
        .select('email, username, avatar_url')
        .eq('id', user.id)
        .single();

      if (error && status !== 406) {
        throw error;
      }
      if (data) {
        setEmail(data.email || '');
        setUsername(data.username || '');
        setAvatarUrl(data.avatar_url || '');
      }
    } catch (error) {
      console.error('Errore nel recupero del profilo:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async () => {
    try {
      setLoading(true);
      const { user } = session;
      // Aggiorna la tabella profiles
      const updates = {
        id: user.id,
        email,
        username,
        avatar_url: avatarUrl,
        updated_at: new Date(),
      };
      let { error } = await supabase.from('profiles').upsert(updates);
      if (error) {
        throw error;
      }
      alert('Profilo aggiornato con successo!');
    } catch (error) {
      console.error('Errore nell’aggiornamento del profilo:', error.message);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="profile-container">
      <h2>Il mio Profilo</h2>
      <div className="profile-field">
        <label>Email:</label>
        <input
          type="email"
          value={email || ''}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="profile-field">
        <label>Username:</label>
        <input
          type="text"
          value={username || ''}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>

      <div className="profile-field">
        <label>Avatar URL:</label>
        <input
          type="text"
          value={avatarUrl || ''}
          onChange={(e) => setAvatarUrl(e.target.value)}
        />
      </div>

      <div className="profile-buttons">
        <button onClick={updateProfile} disabled={loading}>
          {loading ? 'Aggiornamento...' : 'Salva Profilo'}
        </button>
        <button onClick={onClose}>Torna alla chat</button>
      </div>
    </div>
  );
}

export default Profile;
