// src/ChatRoom.js
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

function ChatRoom({ session }) {
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [newRoomName, setNewRoomName] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');

  // Carica le stanze in cui l'utente è membro
  useEffect(() => {
    fetchRooms();
  }, [session]);

  const fetchRooms = async () => {
    // Seleziona le room tramite la tabella room_members con join su rooms
    let { data, error } = await supabase
      .from('room_members')
      .select('room_id, rooms (id, name)')
      .eq('user_id', session.user.id);
    if (error) {
      console.error(error);
    } else {
      const roomsData = data.map(item => item.rooms);
      setRooms(roomsData);
    }
  };

  // Crea una nuova stanza e aggiunge l'utente creatore come membro
  const handleCreateRoom = async () => {
    if (!newRoomName) return;
    // Inserisci una nuova room
    let { data: room, error } = await supabase
      .from('rooms')
      .insert([{ name: newRoomName, created_by: session.user.id }])
      .single();
    if (error) {
      console.error(error);
      return;
    }
    // Aggiungi l'utente creatore in room_members
    let { error: memError } = await supabase
      .from('room_members')
      .insert([{ room_id: room.id, user_id: session.user.id }]);
    if (memError) {
      console.error(memError);
      return;
    }
    setNewRoomName('');
    fetchRooms();
  };

  // Seleziona una stanza e carica i messaggi
  const handleSelectRoom = async (room) => {
    setSelectedRoom(room);
    fetchMessages(room.id);
    // Abbonati agli aggiornamenti in tempo reale per i nuovi messaggi
    supabase
      .from(`messages:room_id=eq.${room.id}`)
      .on('INSERT', payload => {
        setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();
  };

  const fetchMessages = async (roomId) => {
    let { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });
    if (error) {
      console.error(error);
      return;
    }
    setMessages(data);
  };

  // Invia un nuovo messaggio
  const handleSendMessage = async () => {
    if (!newMessage || !selectedRoom) return;
    let { error } = await supabase
      .from('messages')
      .insert([{ room_id: selectedRoom.id, user_id: session.user.id, content: newMessage }]);
    if (error) {
      console.error(error);
    }
    setNewMessage('');
  };

  // Invita un utente alla stanza (ricerca per email nella tabella profiles)
  const handleInviteUser = async () => {
    if (!inviteEmail || !selectedRoom) return;
    // Cerca l'utente nella tabella "profiles" (che devi aver creato e popolato all'atto della registrazione)
    let { data: profile, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', inviteEmail)
      .single();
    if (error || !profile) {
      alert("Utente non trovato");
      return;
    }
    let userId = profile.id;
    // Inserisci il nuovo membro nella tabella room_members
    let { error: memError } = await supabase
      .from('room_members')
      .insert([{ room_id: selectedRoom.id, user_id: userId }]);
    if (memError) {
      console.error(memError);
    } else {
      alert("Utente invitato");
      setInviteEmail('');
      fetchRooms();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="chat-container">
      <div className="sidebar">
        <h3>Chat Rooms</h3>
        <button onClick={handleLogout}>Logout</button>
        <ul>
          {rooms.map(room => (
            <li key={room.id} onClick={()=>handleSelectRoom(room)}>
              {room.name}
            </li>
          ))}
        </ul>
        <div className="new-room">
          <input
            type="text"
            placeholder="Nuova stanza"
            value={newRoomName}
            onChange={(e)=>setNewRoomName(e.target.value)}
          />
          <button onClick={handleCreateRoom}>Crea</button>
        </div>
      </div>
      <div className="chat-content">
        {selectedRoom ? (
          <>
            <h3>{selectedRoom.name}</h3>
            <div className="invite">
              <input
                type="email"
                placeholder="Invita utente via email"
                value={inviteEmail}
                onChange={(e)=>setInviteEmail(e.target.value)}
              />
              <button onClick={handleInviteUser}>Invita</button>
            </div>
            <div className="messages">
              {messages.map(msg => (
                <div key={msg.id} className={`message ${msg.user_id === session.user.id ? 'own' : ''}`}>
                  <p>{msg.content}</p>
                </div>
              ))}
            </div>
            <div className="new-message">
              <input
                type="text"
                placeholder="Scrivi un messaggio"
                value={newMessage}
                onChange={(e)=>setNewMessage(e.target.value)}
              />
              <button onClick={handleSendMessage}>Invia</button>
            </div>
          </>
        ) : (
          <div className="no-room">
            <p>Seleziona una stanza per iniziare a chattare</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatRoom;
