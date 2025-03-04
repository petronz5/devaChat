// src/ChatRoom.js
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

function ChatRoom({ session }) {
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [newRoomName, setNewRoomName] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [roomMembers, setRoomMembers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [contextMenu, setContextMenu] = useState(null); // { room, x, y }
  const [editRoomName, setEditRoomName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  
  const menuRef = useRef();

  // Chiude il menu contestuale se si clicca fuori
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setContextMenu(null);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Carica stanze e inviti
  useEffect(() => {
    if (session) {
      fetchRooms();
      fetchInvitations();
    }
  }, [session]);

  const fetchRooms = async () => {
    let { data, error } = await supabase
      .from('room_members')
      .select('room_id, rooms!inner(id, name, created_by)')
      .eq('user_id', session.user.id)
      .eq('status', 'accepted');
    if (error) {
      console.error(error);
    } else if (data) {
      const roomsData = data.map((item) => item.rooms);
      console.log("Rooms fetched:", roomsData);
      setRooms(roomsData);
    }
  };

  const fetchInvitations = async () => {
    let { data, error } = await supabase
      .from('room_members')
      .select('room_id, rooms!inner(id, name)')
      .eq('user_id', session.user.id)
      .eq('status', 'pending');
    if (error) {
      console.error("fetchInvitations:", error);
    } else {
      console.log("Invitations fetched:", data);
      setPendingInvites(data || []);
    }
  };

  // Crea una nuova stanza e inserisce il creatore in room_members con ruolo "admin" e status "accepted"
  const handleCreateRoom = async () => {
    if (!newRoomName) return;
    let { data, error } = await supabase
      .from('rooms')
      .insert([{ name: newRoomName, created_by: session.user.id }])
      .select('*');
    console.log("Data returned:", data);
    if (error) {
      console.error(error);
      return;
    }
    if (!data || data.length === 0) {
      console.error("Nessun record restituito");
      return;
    }
    const room = data[0];
    let { error: memError } = await supabase
      .from('room_members')
      .insert([{ room_id: room.id, user_id: session.user.id, role: 'admin', status: 'accepted' }], { returning: 'minimal' });
    if (memError) {
      console.error(memError);
      return;
    }
    setNewRoomName('');
    fetchRooms();
  };

  // Recupera i messaggi con join sulla tabella profiles per mostrare l'email del mittente e allegati
  const fetchMessages = async (roomId) => {
    let { data, error } = await supabase
      .from('messages')
      .select('id, room_id, user_id, content, attachment_url, created_at, profiles!inner(email)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });
    if (error) {
      console.error(error);
      return;
    }
    setMessages(data);
  };

  // Recupera i membri della stanza con join sulla tabella profiles
  const fetchRoomMembers = async (roomId) => {
    let { data, error } = await supabase
      .from('room_members')
      .select('user_id, role, status, profiles!inner(id, email)')
      .eq('room_id', roomId)
      .eq('status', 'accepted');
    if (error) {
      console.error(error);
      return;
    }
    const members = data.map((item) => ({ ...item.profiles, role: item.role }));
    setRoomMembers(members);
  };

  // Verifica se l'utente corrente è admin nella stanza selezionata
  const isAdmin = () => {
    return roomMembers.some(member => member.id === session.user.id && member.role === 'admin');
  };

  // Seleziona una stanza, carica messaggi, membri e si iscrive al canale realtime
  const handleSelectRoom = async (room) => {
    setSelectedRoom(room);
    fetchMessages(room.id);
    fetchRoomMembers(room.id);

    const channel = supabase.channel(`room-${room.id}`, {
      config: { broadcast: { ack: true } },
    });
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${room.id}`,
      },
      (payload) => {
        setMessages((prev) => [...prev, payload.new]);
      }
    );
    channel.subscribe();
  };

  // Invia un nuovo messaggio (se è presente un file allegato, lo gestisce)
  const handleSendMessage = async () => {
    // Se non c'è né un testo né un file, non fare nulla
    if (!newMessage && !selectedFile) return;
  
    let attachment_url = null;
    let file_type = null;
    let file_name = null;
  
    // Se è stato selezionato un file, caricalo nello storage
    if (selectedFile) {
      // Crea un nome casuale per il file (puoi personalizzarlo)
      const fileExt = selectedFile.name.split('.').pop();
      const randomFileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = randomFileName;
  
      // Carica il file nel bucket "attachments"
      let { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('attachments')
        .upload(filePath, selectedFile);
      if (uploadError) {
        console.error("Upload error:", uploadError.message);
        return;
      }
  
      // Ottieni l'URL pubblico del file
      const { publicURL, error: urlError } = supabase
        .storage
        .from('attachments')
        .getPublicUrl(filePath);
      if (urlError) {
        console.error("URL error:", urlError.message);
        return;
      }
      attachment_url = publicURL;
      file_type = selectedFile.type;
      file_name = selectedFile.name;
    }
  
    // Inserisci il messaggio nella tabella messages.
    // Se non c'è testo, inserisci una stringa vuota.
    let { error } = await supabase
      .from('messages')
      .insert([
        {
          room_id: selectedRoom.id,
          user_id: session.user.id,
          content: newMessage || '',
          attachment_url,
          file_type,
          file_name,
        },
      ]);
    if (error) {
      console.error("Errore nell'inserimento del messaggio:", error);
    }
    setNewMessage('');
    setSelectedFile(null);
  };
  

  // Invita un utente alla stanza: inserisce un record in room_members con status "pending"
  const handleInviteUser = async () => {
    if (!inviteEmail || !selectedRoom) return;
    let { data: profileData, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', inviteEmail)
      .maybeSingle();
    console.log("Profile found:", profileData, error);
    if (error || !profileData) {
      alert("Utente non trovato nella tabella profiles.");
      return;
    }
    let userId = profileData.id;
    let { error: memError } = await supabase
      .from('room_members')
      .insert([{ room_id: selectedRoom.id, user_id: userId, status: 'pending' }]);
    if (memError) {
      console.error("Errore nell'invito:", memError);
    } else {
      alert("Invito inviato con successo!");
      setInviteEmail('');
      fetchInvitations();
    }
  };

  // Gestione degli inviti pendenti: l'utente invitato può accettare o rifiutare
  const handleAcceptInvite = async (invite) => {
    let { data, error } = await supabase
      .from('room_members')
      .update({ status: 'accepted' })
      .eq('room_id', invite.room_id)
      .eq('user_id', session.user.id)
      .select();
    console.log("Accept invite result:", data, error);
    if (error || !data || data.length === 0) {
      alert("Errore nell'accettazione dell'invito");
      return;
    } else {
      alert(`Hai accettato l'invito per la stanza ${invite.rooms.name}`);
      fetchInvitations();
      fetchRooms();
    }
  };

  const handleDeclineInvite = async (invite) => {
    let { error } = await supabase
      .from('room_members')
      .delete()
      .eq('room_id', invite.room_id)
      .eq('user_id', session.user.id);
    if (error) {
      console.error("Errore nel rifiuto:", error);
    } else {
      alert(`Hai rifiutato l'invito per la stanza ${invite.rooms.name}`);
      fetchInvitations();
    }
  };

  // Solo admin può modificare il nome della stanza
  const handleEditRoom = async (room, newName) => {
    if (!newName) return;
    if (!isAdmin()) {
      alert("Solo l'admin può modificare la stanza!");
      return;
    }
    let { error } = await supabase
      .from('rooms')
      .update({ name: newName })
      .eq('id', room.id);
    if (error) {
      console.error("Errore nell'aggiornamento della stanza:", error);
    } else {
      alert("Stanza modificata con successo!");
      fetchRooms();
      if (selectedRoom && selectedRoom.id === room.id) {
        setSelectedRoom({ ...selectedRoom, name: newName });
      }
    }
  };

  // Solo admin può eliminare la stanza
  const handleDeleteRoom = async (room) => {
    if (!isAdmin()) {
      alert("Solo l'admin può eliminare la stanza!");
      return;
    }
    if (!window.confirm("Sei sicuro di voler eliminare questa stanza?")) return;
    let { error } = await supabase
      .from('rooms')
      .delete()
      .eq('id', room.id);
    if (error) {
      console.error("Errore nell'eliminazione della stanza:", error);
    } else {
      alert("Stanza eliminata con successo!");
      if (selectedRoom && selectedRoom.id === room.id) {
        setSelectedRoom(null);
        setMessages([]);
        setRoomMembers([]);
      }
      fetchRooms();
    }
  };

  // Solo admin può rimuovere un utente dalla stanza (non se stesso)
  const handleRemoveUser = async (userId) => {
    if (!isAdmin()) {
      alert("Solo l'admin può rimuovere utenti!");
      return;
    }
    if (userId === session.user.id) {
      alert("Non puoi rimuovere te stesso!");
      return;
    }
    let { error } = await supabase
      .from('room_members')
      .delete()
      .eq('room_id', selectedRoom.id)
      .eq('user_id', userId);
    if (error) {
      console.error("Errore nella rimozione dell'utente:", error);
    } else {
      alert("Utente rimosso con successo!");
      fetchRoomMembers(selectedRoom.id);
    }
  };

  // Gestisce il menu contestuale (tasto destro) sulle stanze
  const openRoomContextMenu = (room, x, y) => {
    setContextMenu({ room, x, y });
    setEditRoomName(room.name);
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
          {rooms.map((room) => (
            <li
              key={room.id}
              onClick={() => handleSelectRoom(room)}
              onContextMenu={(e) => {
                e.preventDefault();
                openRoomContextMenu(room, e.clientX, e.clientY);
              }}
            >
              {room.name}
            </li>
          ))}
        </ul>
        <div className="new-room">
          <input
            type="text"
            placeholder="Nuova stanza"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
          />
          <button onClick={handleCreateRoom}>Crea</button>
        </div>
      </div>
      <div className="chat-content">
        {/* Se ci sono inviti pendenti, mostra una modale */}
        {pendingInvites.length > 0 && (
          <div className="invites-modal">
            <h4>Inviti pendenti</h4>
            <ul>
              {pendingInvites.map((invite) => (
                <li key={invite.room_id}>
                  {invite.rooms.name}
                  <button onClick={() => handleAcceptInvite(invite)}>Accetta</button>
                  <button onClick={() => handleDeclineInvite(invite)}>Rifiuta</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {selectedRoom ? (
          <>
            <h3>{selectedRoom.name}</h3>
            <div className="room-members">
              <h4>Utenti nella stanza:</h4>
              <ul>
                {roomMembers.map((member) => (
                  <li key={member.id}>
                    {member.email} {member.role === 'admin' && <strong>(Admin)</strong>}
                    {isAdmin() && member.id !== session.user.id && (
                      <button onClick={() => handleRemoveUser(member.id)}>Rimuovi</button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="invite">
              <input
                type="email"
                placeholder="Invita utente via email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <button onClick={handleInviteUser}>Invita</button>
            </div>
            <div className="messages">
              {messages.map((msg) => (
                <div key={msg.id} className={`message ${msg.user_id === session.user.id ? 'own' : ''}`}>
                  <p>
                    <strong>
                      {msg.profiles && msg.profiles.email ? msg.profiles.email : 'Sconosciuto'}:
                    </strong> {msg.content}
                  </p>
                  {msg.attachment_url && (
                    <div className="attachment">
                      <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer">Visualizza allegato</a>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="new-message">
              <input
                type="text"
                placeholder="Scrivi un messaggio"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
              />
              <input
                type="file"
                onChange={(e) => setSelectedFile(e.target.files[0])}
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
      {contextMenu && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            top: contextMenu.y,
            left: contextMenu.x,
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: '4px',
            zIndex: 1000,
            padding: '0.5rem',
          }}
        >
          <div style={{ marginBottom: '0.5rem' }}>
            <input
              type="text"
              value={editRoomName}
              onChange={(e) => setEditRoomName(e.target.value)}
              placeholder="Nuovo nome stanza"
            />
          </div>
          <div>
            <button onClick={() => {
              handleEditRoom(contextMenu.room, editRoomName);
              setContextMenu(null);
            }}>
              Modifica
            </button>
            <button onClick={() => {
              handleDeleteRoom(contextMenu.room);
              setContextMenu(null);
            }}>
              Elimina
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatRoom;
