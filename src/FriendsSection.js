// src/FriendsSection.js
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

function FriendsSection({ session }) {
  const [showFriends, setShowFriends] = useState(false);
  const [friendsList, setFriendsList] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [addFriendModalOpen, setAddFriendModalOpen] = useState(false);
  const [friendEmail, setFriendEmail] = useState('');

  useEffect(() => {
    if (session) {
      fetchAllFriends();
    }
  }, [session]);

  const fetchAllFriends = async () => {
    if (!session) return;
    const userId = session.user.id;

    // 1) accepted
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

    // 2) pending (dove io sono receiver)
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
        let friendId = '';
        if (f.sender_id === userId) {
          friendEmail = f.profiles_receiver?.email;
          friendId = f.profiles_receiver?.id;
        } else {
          friendEmail = f.profiles_sender?.email;
          friendId = f.profiles_sender?.id;
        }
        return {
          id: f.id,
          friendId,
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
      alert('Errore nell\'invio della richiesta.');
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

  const toggleFriends = () => {
    setShowFriends((prev) => !prev);
  };

  return (
    <div style={{ marginBottom: '1rem' }}>
      {/* Pulsante per mostra/nascondi sezione amici */}
      <button
        style={{
          width: '100%',
          padding: '0.6rem',
          borderRadius: '6px',
          border: 'none',
          background: '#3498db',
          color: '#fff',
          marginBottom: '0.5rem',
          cursor: 'pointer',
        }}
        onClick={toggleFriends}
      >
        {showFriends ? 'Nascondi Amici' : 'Amici'}
      </button>

      {/* Se showFriends=true => mostro la sezione */}
      {showFriends && (
        <div
          style={{
            background: '#f0f0f0',
            padding: '0.5rem',
            borderRadius: '6px',
          }}
        >
          <h4>La mia lista amici:</h4>
          <ul style={{ marginBottom: '1rem' }}>
            {friendsList.map((f) => (
              <li key={f.id}>{f.friendEmail}</li>
            ))}
          </ul>

          <h4>Richieste in arrivo:</h4>
          <ul>
            {friendRequests.map((req) => (
              <li key={req.id}>
                Da: {req.profiles_sender?.email}
                <button
                  style={{ marginLeft: '0.5rem' }}
                  onClick={() => handleAcceptFriend(req)}
                >
                  Accetta
                </button>
                <button
                  style={{ marginLeft: '0.5rem' }}
                  onClick={() => handleDeclineFriend(req)}
                >
                  Rifiuta
                </button>
              </li>
            ))}
          </ul>

          <button
            style={{
              background: '#2ecc71',
              color: '#fff',
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              border: 'none',
              marginTop: '0.5rem',
              cursor: 'pointer',
            }}
            onClick={() => setAddFriendModalOpen(true)}
          >
            Aggiungi Amico
          </button>

          {/* Modale per aggiungere amico */}
          {addFriendModalOpen && (
            <div
              style={{
                position: 'fixed',
                top: '20%',
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#fff',
                border: '1px solid #ccc',
                borderRadius: '8px',
                padding: '1rem',
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
              <div>
                <button
                  style={{
                    marginRight: '0.5rem',
                    background: '#5563DE',
                    color: '#fff',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                  onClick={handleAddFriend}
                >
                  Invia Richiesta
                </button>
                <button
                  style={{
                    background: '#aaa',
                    color: '#fff',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                  onClick={() => setAddFriendModalOpen(false)}
                >
                  Annulla
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FriendsSection;
