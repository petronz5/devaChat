// src/ChatRoom.js
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import './ChatRoom.css';

function ChatRoom({ session, onShowProfile }) {
  // ---------- 1) STATE per STANZE, MESSAGGI, FILE -----------
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [newRoomName, setNewRoomName] = useState('');

  const [messages, setMessages] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  // ---------- 2) PRESENCE & TYPING -----------
  const [typingUsers, setTypingUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const presenceChannelRef = useRef(null);

  // ---------- 3) REAZIONI e MENU -----------
  const [reactionMenu, setReactionMenu] = useState(null);

  // ---------- 4) INVITO UTENTE -----------
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [pendingInvites, setPendingInvites] = useState([]);

  // ---------- 5) INVIO MESSAGGIO -----------
  const [newMessage, setNewMessage] = useState('');

  // ---------- 6) CONTEXT MENU STANZA -----------
  const [contextMenu, setContextMenu] = useState(null);
  const [editRoomName, setEditRoomName] = useState('');

  // ---------- 7) DETTAGLIO CANALE (MODALE) -----------
  const [showChannelDetail, setShowChannelDetail] = useState(false);
  const [channelMembers, setChannelMembers] = useState([]);

  // ---------- 8) REGISTRAZIONE VOCALE -----------
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);

  // ---------- 9) SETTINGS: MULTI-TEMA -----------
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState('light'); // "light" | "dark" | "blue" | "pink" ...

  // ---------- 10) RIFERIMENTI MENU -----------
  const menuRef = useRef();
  const reactionRef = useRef();

  // ---------- 11) EFFETTI INIZIALI -----------
  useEffect(() => {
    if (session) {
      fetchRooms();
      fetchInvitations();
      joinPresenceChannel();
    }
    return () => {
      supabase.removeAllChannels();
    };
    // eslint-disable-next-line
  }, [session]);

  // Chiusura menu cliccando fuori
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setContextMenu(null);
      }
      if (reactionRef.current && !reactionRef.current.contains(e.target)) {
        setReactionMenu(null);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => {
      window.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // ---------- 12) FUNZIONI: STANZE -----------
  const fetchRooms = async () => {
    const { data, error } = await supabase
      .from('room_members')
      .select('room_id, rooms!inner(id, name, created_by)')
      .eq('user_id', session.user.id)
      .eq('status', 'accepted');

    if (!error && data) {
      const r = data.map((item) => item.rooms);
      setRooms(r);
    }
  };

  const handleCreateRoom = async () => {
    if (!newRoomName) return;
    let { data, error } = await supabase
      .from('rooms')
      .insert([{ name: newRoomName, created_by: session.user.id }])
      .select();
    if (error || !data || data.length === 0) return;

    const room = data[0];
    const { error: memErr } = await supabase
      .from('room_members')
      .insert([{ room_id: room.id, user_id: session.user.id, role: 'admin', status: 'accepted' }]);
    if (!memErr) {
      setNewRoomName('');
      fetchRooms();
    }
  };

  // ---------- 13) FUNZIONI: INVITI -----------
  const fetchInvitations = async () => {
    const { data, error } = await supabase
      .from('room_members')
      .select('room_id, rooms!inner(id, name)')
      .eq('user_id', session.user.id)
      .eq('status', 'pending');
    if (!error && data) {
      setPendingInvites(data);
    }
  };

  const handleAcceptInvite = async (invite) => {
    const { data, error } = await supabase
      .from('room_members')
      .update({ status: 'accepted' })
      .eq('room_id', invite.room_id)
      .eq('user_id', session.user.id)
      .select();
    if (!error && data && data.length > 0) {
      alert(`Hai accettato l'invito per la stanza ${invite.rooms.name}`);
      fetchInvitations();
      fetchRooms();
    }
  };

  const handleDeclineInvite = async (invite) => {
    const { error } = await supabase
      .from('room_members')
      .delete()
      .eq('room_id', invite.room_id)
      .eq('user_id', session.user.id);
    if (!error) {
      alert(`Hai rifiutato l'invito per la stanza ${invite.rooms.name}`);
      fetchInvitations();
    }
  };

  // ---------- 14) FUNZIONI: SELEZIONE STANZA + MESSAGGI -----------
  const handleSelectRoom = async (room) => {
    setSelectedRoom(room);
    await loadMessages(room.id);

    // Rimuovo canali precedenti
    supabase.removeAllChannels();

    // Sottoscrizione realtime su messages
    const channel = supabase.channel(`room-${room.id}`, {
      config: { broadcast: { ack: true } },
    });

    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `room_id=eq.${room.id}`,
    }, (payload) => {
      const newMsg = payload.new;
      setMessages((prev) => [...prev, newMsg]);

      // ESEMPIO: NOTIFICA LOCALE
      if (document.hidden) { // se la pagina non è in focus
        new Notification('Nuovo messaggio', {
          body: newMsg.content.slice(0, 40)
        });
      }
    });

    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'reactions',
    }, () => {
      loadMessages(room.id);
    });

    channel.subscribe();
  };

  const loadMessages = async (roomId) => {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id, room_id, user_id, content, attachment_url,
        file_name, file_type, created_at,
        profiles!inner(email)
      `)
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });
    if (!error && data) {
      setMessages(data);
    }
  };

  // ---------- 15) RICERCA + EVIDENZIAZIONE -----------
  const highlightText = (text, term) => {
    if (!term) term = ''; 
    // Menzioni
    text = text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');

    if (!term) return text;
    const regex = new RegExp(`(${term})`, 'gi');
    return text.replace(regex, `<mark>$1</mark>`);
  };

  // ---------- 16) INVIA MESSAGGIO (con menzioni & bot) -----------
  const handleSendMessage = async () => {
    if (!selectedRoom) return;
    if (!newMessage && !selectedFile) return;

    // Se /bot ...
    if (newMessage.startsWith('/bot ')) {
      // Esempio: Chiama un endpoint esterno e lascia che il "bot" re-inserisca il messaggio
      const botText = newMessage.slice(5);
      await fetch('https://mio-endpoint-bot.com/botMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: botText,
          room_id: selectedRoom.id
        })
      });
      setNewMessage('');
      return; // non inserisco localmente
    }

    // Se ci sono menzioni: @pippo
    const mentionRegex = /@(\w+)/g;
    const matches = newMessage.match(mentionRegex);
    if (matches) {
      for (const m of matches) {
        const username = m.slice(1); 
        // Potresti cercare user in 'profiles' e inviare notifica
        // ...
      }
    }

    let attachment_url = null;
    let file_name = null;
    let file_type = null;

    // Carico file se presente
    if (selectedFile) {
      const ext = selectedFile.name.split('.').pop();
      const randomName = `${Math.random().toString(36).substring(2)}.${ext}`;

      let { error: uploadError } = await supabase
        .storage
        .from('attachments')
        .upload(randomName, selectedFile);
      if (uploadError) return;

      const { data: publicData, error: urlError } = supabase
        .storage
        .from('attachments')
        .getPublicUrl(randomName);
      if (urlError) return;

      attachment_url = publicData.publicUrl;
      file_name = selectedFile.name;
      file_type = selectedFile.type;
    }

    // Inserisco messaggio
    await supabase
      .from('messages')
      .insert([{
        room_id: selectedRoom.id,
        user_id: session.user.id,
        content: newMessage,
        attachment_url,
        file_name,
        file_type,
      }]);

    setNewMessage('');
    setSelectedFile(null);
  };

  // ---------- 17) REAZIONI (DOPPIO CLICK) -----------
  const handleMessageDoubleClick = (e, msg) => {
    setReactionMenu({
      x: e.clientX,
      y: e.clientY,
      message: msg,
    });
  };

  const handleReaction = async (msg, symbol) => {
    await supabase
      .from('reactions')
      .insert([{ message_id: msg.id, user_id: session.user.id, reaction: symbol }]);
    setReactionMenu(null);
  };

  // ---------- 18) INVITA UTENTE -----------
  const openInviteModal = () => {
    setInviteModalOpen(true);
  };
  const closeInviteModal = () => {
    setInviteEmail('');
    setInviteModalOpen(false);
  };
  const handleSendInvite = async () => {
    if (!inviteEmail || !selectedRoom) return;
    const { data: profileData, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', inviteEmail)
      .maybeSingle();
    if (error || !profileData) {
      alert('Utente non trovato in profiles');
      return;
    }
    const userId = profileData.id;
    const { error: memError } = await supabase
      .from('room_members')
      .insert([{ room_id: selectedRoom.id, user_id: userId, status: 'pending' }]);
    if (!memError) {
      alert('Invito inviato con successo!');
      closeInviteModal();
      fetchInvitations();
    }
  };

  // ---------- 19) REGISTRAZIONE VOCALE -----------
  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('La registrazione audio non è supportata dal tuo browser.');
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (evt) => {
      if (evt.data.size > 0) {
        setAudioChunks((prev) => [...prev, evt.data]);
      }
    };
    recorder.start();
    setMediaRecorder(recorder);
    setAudioChunks([]);
  };
  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setMediaRecorder(null);
    }
  };
  useEffect(() => {
    if (audioChunks.length > 0 && !mediaRecorder) {
      const blob = new Blob(audioChunks, { type: 'audio/mpeg' });
      const file = new File([blob], `voice_${Date.now()}.mp3`, { type: 'audio/mpeg' });
      setSelectedFile(file);
      setAudioChunks([]);
    }
  }, [audioChunks, mediaRecorder]);

  // ---------- 20) PRESENCE E TYPING -----------
  const joinPresenceChannel = async () => {
    const presenceChannel = supabase.channel('online-users', {
      config: {
        presence: { key: session.user.id },
      },
    });

    presenceChannel.on('presence', { event: 'sync' }, () => {
      const state = presenceChannel.presenceState();
      const online = Object.keys(state);
      setOnlineUsers(online);
    });

    // ascolta broadcast event "typing"
    presenceChannel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      setTypingUsers(payload.typingUsers);
    });

    presenceChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        presenceChannel.track({ online: true });
      }
    });

    presenceChannelRef.current = presenceChannel;
  };
  const handleTyping = (isTyping) => {
    setTypingUsers((prev) => {
      const copy = new Set(prev);
      if (isTyping) copy.add(session.user.id);
      else copy.delete(session.user.id);
      return [...copy];
    });

    const presenceChannel = presenceChannelRef.current;
    if (presenceChannel) {
      presenceChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          typingUsers: isTyping
            ? [...typingUsers, session.user.id]
            : typingUsers.filter(id => id !== session.user.id),
        }
      });
    }
  };

  // ---------- 21) CONTEXT MENU (DETTAGLIO, MODIFICA, ELIMINA) -----------
  const openRoomContextMenu = (room, x, y) => {
    setContextMenu({ room, x, y });
    setEditRoomName(room.name);
  };

  const handleShowChannelDetail = async (room) => {
    const { data, error } = await supabase
      .from('room_members')
      .select('profiles!inner(id, email), role')
      .eq('room_id', room.id)
      .eq('status', 'accepted');
    if (!error && data) {
      const members = data.map(d => ({
        id: d.profiles.id,
        email: d.profiles.email,
        role: d.role,
      }));
      setChannelMembers(members);
      setShowChannelDetail(true);
    }
  };
  const handleEditRoom = async (room, newName) => {
    if (!newName) return;
    const { error } = await supabase
      .from('rooms')
      .update({ name: newName })
      .eq('id', room.id);
    if (!error) {
      if (selectedRoom && selectedRoom.id === room.id) {
        setSelectedRoom({ ...selectedRoom, name: newName });
      }
      fetchRooms();
    }
  };
  const handleDeleteRoom = async (room) => {
    if (!window.confirm('Sei sicuro di voler eliminare questa stanza?')) return;
    await supabase
      .from('rooms')
      .delete()
      .eq('id', room.id);
    if (selectedRoom && selectedRoom.id === room.id) {
      setSelectedRoom(null);
      setMessages([]);
    }
    fetchRooms();
  };

  // ---------- 22) BOZZA CHIAMATE (WEBRTC) -----------
  const pcRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const startCall = async () => {
    // Esempio semplificato
    pcRef.current = new RTCPeerConnection({ 
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setLocalStream(stream);
    stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream));

    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);

    // Invia "offer" via presenceChannel (o un canale dedicato)
    if (presenceChannelRef.current) {
      presenceChannelRef.current.send({
        type: 'broadcast',
        event: 'webrtc-offer',
        payload: { offer }
      });
    }
  };

  // ---------- 23) RENDER -----------
  return (
    <div className={`chat-container theme-${theme}`}>
      <div className="sidebar">
        <h3>Chat Rooms</h3>

        {/* Se vuoi un link "Vai alla sezione Amici" con Router:
           <Link to="/friends">Amici</Link>
        */}

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

        <div style={{ marginTop: '1rem' }}>
          <h4>Utenti online:</h4>
          <ul>
            {onlineUsers.map(uid => (
              <li key={uid}>
                {uid === session.user.id ? 'Tu' : uid}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer: Profilo, Impostazioni, Logout */}
        <div className="sidebar-bottom">
          <button onClick={onShowProfile} className="profile-button">
            Profilo
          </button>
          <button onClick={() => setSettingsOpen(true)} className="settings-button">
            &#9881; {/* icona ingranaggio ingrandita da CSS */}
          </button>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
            }}
            className="logout-button"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="chat-content">
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

            {/* Avvia chiamata WEBRTC */}
            <button onClick={startCall} style={{ marginLeft: '1rem', marginBottom: '0.5rem' }}>
              Avvia Chiamata
            </button>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <button
                style={{ background: '#27ae60', color: '#fff', borderRadius: '6px', padding: '0.5rem 1rem', border: 'none' }}
                onClick={openInviteModal}
              >
                Invita
              </button>
            </div>

            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
              <input
                type="text"
                placeholder="Cerca nei messaggi..."
                style={{ width: '60%', borderRadius: '8px', padding: '0.5rem' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="messages">
              {messages.map((msg) => {
                const rawContent = msg.content || '';
                const highlighted = highlightText(rawContent, searchTerm);
                return (
                  <div
                    key={msg.id}
                    className={`message ${msg.user_id === session.user.id ? 'own' : ''}`}
                    onDoubleClick={(e) => handleMessageDoubleClick(e, msg)}
                  >
                    <p
                      dangerouslySetInnerHTML={{
                        __html: `<strong>${msg.profiles?.email || 'Sconosciuto'}:</strong> ${highlighted}`,
                      }}
                    />
                    {msg.attachment_url && (
                      <div className="attachment">
                        {msg.file_type?.startsWith('audio') ? (
                          <audio controls src={msg.attachment_url}>
                            Audio non supportato
                          </audio>
                        ) : (
                          <>
                            <a
                              href={msg.attachment_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ marginRight: '10px' }}
                            >
                              Visualizza
                            </a>
                            <a
                              href={msg.attachment_url}
                              download={msg.file_name || true}
                            >
                              Scarica
                            </a>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Barra di invio: icona microfono, icona invio */}
            <div className="new-message-bar">
              <input
                type="text"
                className="message-input"
                placeholder="Scrivi un messaggio..."
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  handleTyping(true);
                  if (e.target.value === '') handleTyping(false);
                }}
                onBlur={() => handleTyping(false)}
              />

              {/* Icona microfono per avviare/fermare la registrazione */}
              {mediaRecorder ? (
                <button onClick={stopRecording} className="mic-button" title="Stop Recording">
                  &#128264; {/* o un'icona fontawesome microfono sbarrato */}
                </button>
              ) : (
                <button onClick={startRecording} className="mic-button" title="Inizia registrazione vocale">
                  &#127908; {/* icona microfono */}
                </button>
              )}

              <input
                type="file"
                className="file-input"
                onChange={(e) => setSelectedFile(e.target.files[0])}
              />

              <button className="send-button" onClick={handleSendMessage}>
                Invia
              </button>
            </div>
          </>
        ) : (
          <div className="no-room">
            <p>Seleziona una stanza per iniziare a chattare</p>
          </div>
        )}
      </div>

      {/* Context Menu stanza */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <input
            type="text"
            value={editRoomName}
            onChange={(e) => setEditRoomName(e.target.value)}
            placeholder="Nuovo nome stanza"
          />
          <div>
            <button
              onClick={() => {
                handleShowChannelDetail(contextMenu.room);
                setContextMenu(null);
              }}
            >
              Dettaglio Canale
            </button>
            <button
              onClick={() => {
                handleEditRoom(contextMenu.room, editRoomName);
                setContextMenu(null);
              }}
            >
              Modifica
            </button>
            <button
              onClick={() => {
                handleDeleteRoom(contextMenu.room);
                setContextMenu(null);
              }}
            >
              Elimina
            </button>
          </div>
        </div>
      )}

      {/* Reaction Menu (double-click) */}
      {reactionMenu && (
        <div
          ref={reactionRef}
          className="reaction-menu"
          style={{
            top: reactionMenu.y,
            left: reactionMenu.x,
          }}
        >
          <button onClick={() => handleReaction(reactionMenu.message, '👍')}>👍</button>
          <button onClick={() => handleReaction(reactionMenu.message, '❤️')}>❤️</button>
          <button onClick={() => handleReaction(reactionMenu.message, '😂')}>😂</button>
        </div>
      )}

      {/* Modale Invito */}
      {inviteModalOpen && (
        <div className="invite-modal">
          <div className="invite-modal-content">
            <h3>Invita Utente</h3>
            <input
              type="email"
              placeholder="Email utente"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <div style={{ marginTop: '1rem' }}>
              <button
                style={{
                  marginRight: '0.5rem',
                  background: '#5563DE',
                  color: '#fff',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: 'none'
                }}
                onClick={handleSendInvite}
              >
                Invia Invito
              </button>
              <button
                style={{
                  background: '#aaa',
                  color: '#fff',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: 'none'
                }}
                onClick={closeInviteModal}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dettaglio Canale */}
      {showChannelDetail && (
        <div className="channel-detail-modal">
          <div className="channel-detail-content">
            <h4>Dettaglio Canale</h4>
            <ul>
              {channelMembers.map((m) => (
                <li key={m.id}>
                  {m.email} {m.role === 'admin' && <strong>(Admin)</strong>}
                </li>
              ))}
            </ul>
            <button onClick={() => setShowChannelDetail(false)}>Chiudi</button>
          </div>
        </div>
      )}

      {/* Modale Settings: multi-tema */}
      {settingsOpen && (
        <div className="settings-modal">
          <div className="settings-content">
            <h3>Impostazioni</h3>
            <label>Seleziona tema:</label>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="light">Chiaro</option>
              <option value="dark">Scuro</option>
              <option value="blue">Blu</option>
              <option value="pink">Rosa</option>
            </select>
            <button onClick={() => setSettingsOpen(false)}>Chiudi</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatRoom;
