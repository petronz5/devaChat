// src/FriendsPage.js
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Link } from 'react-router-dom';

function FriendsPage({ session }) {
  const [friendsList, setFriendsList] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [addFriendModalOpen, setAddFriendModalOpen] = useState(false);
  const [friendEmail, setFriendEmail] = useState('');

  useEffect(() => {
    if (session) {
      fetchAllFriends();
    }
    // eslint-disable-next-line
  }, [session]);

  const fetchAllFriends = async () => {
    if (!session) return;
    const userId = session.user.id;

    // Carica amici (accepted)
    let { data: accepted, error: accErr } = await supabase
      .from('friends')
      .select(`
        id,
        sender_id,
        receiver_id,
        status,
        profiles_sender:sender_id (id, email),
        profiles_receiver:receiver_id (id, email)
      `)
      .or(`and(status.eq.accepted,sender_id.eq.${userId}),and(status.eq.accepted,receiver_id.eq.${userId})`);

    // Carica richieste pendenti (dove io sono receiver)
    let { data: requests, error: reqErr } = await supabase
      .from('friends')
      .select(`
        id,
        sender_id,
        receiver_id,
        status,
        profiles_sender:sender_id (id, email)
      `)
      .eq('receiver_id', userId)
      .eq('status', 'pending');

    if (!accErr && accepted) {
      const list = accepted.map((f) => {
        let friendEmail = '';
        if (f.sender_id === userId) {
          friendEmail = f.profiles_receiver?.email;
        } else {
          friendEmail = f.profiles_sender?.email;
        }
        return {
          id: f.id,
          friendEmail,
          status: f.status,
        };
      });
      setFriendsList(list);
    }
    if (!reqErr && requests) {
      setFriendRequests(requests);
    }
  };

  const handleAddFriend = async () => {
    if (!friendEmail) return;
    const userId = session.user.id;
    const { data: userFound, error } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', friendEmail)
      .maybeSingle();
    if (error || !userFound) {
      alert('Utente non trovato!');
      return;
    }
    const { error: friendErr } = await supabase
      .from('friends')
      .insert([{
        sender_id: userId,
        receiver_id: userFound.id,
        status: 'pending'
      }]);
    if (!friendErr) {
      alert('Richiesta di amicizia inviata a ' + friendEmail);
      setFriendEmail('');
      setAddFriendModalOpen(false);
      fetchAllFriends();
    } else {
      alert('Errore nell’invio della richiesta (magari già pendente).');
    }
  };

  const handleAcceptFriend = async (friendRecord) => {
    const { error } = await supabase
      .from('friends')
      .update({ status: 'accepted' })
      .eq('id', friendRecord.id);
    if (!error) {
      alert('Richiesta accettata');
      fetchAllFriends();
    }
  };

  const handleDeclineFriend = async (friendRecord) => {
    const { error } = await supabase
      .from('friends')
      .update({ status: 'declined' })
      .eq('id', friendRecord.id);
    if (!error) {
      alert('Richiesta rifiutata');
      fetchAllFriends();
    }
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Gestione Amici</h2>
      <Link
        to="/"
        style={{
          textDecoration: 'none',
          color: 'blue',
          marginBottom: '1rem',
          display: 'inline-block'
        }}
      >
        &larr; Torna alla Chat
      </Link>

      <div style={{ marginTop: '1rem', background: '#f2f2f2', padding: '1rem', borderRadius: '8px' }}>
        <h3>La mia lista amici:</h3>
        <ul>
          {friendsList.map((f) => (
            <li key={f.id}>{f.friendEmail}</li>
          ))}
        </ul>
        <button
          onClick={() => setAddFriendModalOpen(true)}
          style={{ marginTop: '0.5rem' }}
        >
          Aggiungi Amico
        </button>
      </div>

      <div style={{ marginTop: '1rem', background: '#f2f2f2', padding: '1rem', borderRadius: '8px' }}>
        <h3>Richieste in arrivo:</h3>
        <ul>
          {friendRequests.map((req) => (
            <li key={req.id}>
              Da: {req.profiles_sender?.email}{' '}
              <button
                onClick={() => handleAcceptFriend(req)}
                style={{ marginLeft: '0.5rem' }}
              >
                Accetta
              </button>
              <button
                onClick={() => handleDeclineFriend(req)}
                style={{ marginLeft: '0.5rem' }}
              >
                Rifiuta
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Modale aggiungi amico */}
      {addFriendModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: '20%',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#fff',
            padding: '1rem',
            border: '1px solid #ccc',
            borderRadius: '8px',
            zIndex: 3000
          }}
        >
          <h3>Aggiungi un amico</h3>
          <input
            type="email"
            placeholder="Email utente"
            value={friendEmail}
            onChange={(e) => setFriendEmail(e.target.value)}
            style={{ display: 'block', marginBottom: '1rem', padding: '0.4rem' }}
          />
          <button onClick={handleAddFriend} style={{ marginRight: '0.5rem' }}>
            Invia Richiesta
          </button>
          <button onClick={() => setAddFriendModalOpen(false)}>
            Annulla
          </button>
        </div>
      )}
    </div>
  );
}

export default FriendsPage;
