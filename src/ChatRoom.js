// src/ChatRoom.js
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { Link } from 'react-router-dom';  // Per il pulsante Amici
import './ChatRoom.css';

function ChatRoom({ session, onShowProfile }) {
  // ---------- STATO PRINCIPALE -----------
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [newRoomName, setNewRoomName] = useState('');

  const [messages, setMessages] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const [typingUsers, setTypingUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const presenceChannelRef = useRef(null);

  // Menu Reazioni
  const [reactionMenu, setReactionMenu] = useState(null);

  // Invito utente
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [pendingInvites, setPendingInvites] = useState([]);

  // Invio messaggio
  const [newMessage, setNewMessage] = useState('');

  // Context menu stanza
  const [contextMenu, setContextMenu] = useState(null);
  const [editRoomName, setEditRoomName] = useState('');

  // Dettaglio canale
  const [showChannelDetail, setShowChannelDetail] = useState(false);
  const [channelMembers, setChannelMembers] = useState([]);

  // Registrazione vocale
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);

  // Settings (multi-tema)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState('light'); // "light" | "dark" | "blue" | "pink" ...

  // Riferimenti per menu
  const menuRef = useRef();
  const reactionRef = useRef();

  // ---------- CHIAMATA DI GRUPPO -----------
  const [callActive, setCallActive] = useState(false); // se è in corso una chiamata
  const [callHostId, setCallHostId] = useState(null); // chi ha avviato la chiamata
  const [localStream, setLocalStream] = useState(null);
  const pcMapRef = useRef({}); // Mappa peerID -> RTCPeerConnection (grezzo per demoy)

  // Lista ID dei partecipanti nella call
  const [callParticipants, setCallParticipants] = useState([]);

  // Al mount, carica stanze, inviti, presence
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

  // Chiude menu su click esterno
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

  // 1) STANZE
  const fetchRooms = async () => {
    const { data, error } = await supabase
      .from('room_members')
      .select('room_id, rooms!inner(id, name, created_by)')
      .eq('user_id', session.user.id)
      .eq('status', 'accepted');
    if (!error && data) {
      const r = data.map(item => item.rooms);
      setRooms(r);
    }
  };
  const handleCreateRoom = async () => {
    if (!newRoomName) return;
    const { data, error } = await supabase
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

  // 2) INVITI
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
      alert(`Accettato invito per ${invite.rooms.name}`);
      fetchInvitations();
      fetchRooms();
    }
  };
  const handleDeclineInvite = async (invite) => {
    await supabase
      .from('room_members')
      .delete()
      .eq('room_id', invite.room_id)
      .eq('user_id', session.user.id);
    alert(`Rifiutato invito per ${invite.rooms.name}`);
    fetchInvitations();
  };

  // 3) SELECT ROOM + load messages + webrtc events
  const handleSelectRoom = async (room) => {
    setSelectedRoom(room);
    await loadMessages(room.id);

    supabase.removeAllChannels();

    // Sottoscrizione messaggi
    const channel = supabase.channel(`room-${room.id}`, {
      config: { broadcast: { ack: true } },
    });

    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `room_id=eq.${room.id}`
    }, (payload) => {
      const newMsg = payload.new;
      setMessages(prev => [...prev, newMsg]);
      if (document.hidden) {
        new Notification('Nuovo messaggio', { body: newMsg.content.slice(0, 40) });
      }
    });

    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'reactions',
    }, () => {
      loadMessages(room.id);
    });

    // *** CHIAMATE: call-started, call-join, webrtc-offer, webrtc-answer, webrtc-ice
    channel.on('broadcast', { event: 'call-started' }, ({ payload }) => {
      if (!callActive) {
        setCallActive(true);
        setCallHostId(payload.hostId);
        setCallParticipants([payload.hostId]);
        alert(`Chiamata avviata da ${payload.hostId}. Puoi "Unirti".`);
      }
    });

    channel.on('broadcast', { event: 'call-join' }, ({ payload }) => {
      console.log('Utente si unisce alla call:', payload.userId);
      // Aggiungiamo a callParticipants
      setCallParticipants(prev => {
        const setNew = new Set(prev);
        setNew.add(payload.userId);
        return [...setNew];
      });
      // Creiamo una connessione con quell'utente (host o peer)
      createPeerConnection(payload.userId, channel);
      if (localStream) {
        // Aggiungiamo tracce
        localStream.getTracks().forEach(track => {
          pcMapRef.current[payload.userId].addTrack(track, localStream);
        });
      }

      // Se noi siamo "host" o comunque già nella call, generiamo un Offer
      if (callHostId === session.user.id || callParticipants.length > 0) {
        makeOffer(payload.userId, channel);
      }
    });

    channel.on('broadcast', { event: 'webrtc-offer' }, ({ payload }) => {
      handleOffer(payload, channel);
    });
    channel.on('broadcast', { event: 'webrtc-answer' }, ({ payload }) => {
      handleAnswer(payload);
    });
    channel.on('broadcast', { event: 'webrtc-ice' }, ({ payload }) => {
      handleIceCandidate(payload);
    });

    channel.subscribe();
  };

  const loadMessages = async (roomId) => {
    const { data } = await supabase
      .from('messages')
      .select(`
        id, room_id, user_id, content, attachment_url,
        file_name, file_type, created_at,
        profiles!inner(email)
      `)
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data);
  };

  // ========== 4) RICERCA e Menzioni ===============
  const highlightText = (text, term) => {
    // Menzioni
    text = text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
    if (!term) return text;
    const regex = new RegExp(`(${term})`, 'gi');
    return text.replace(regex, `<mark>$1</mark>`);
  };

  // ========== 5) INVIA MESSAGGIO ===============
  const handleSendMessage = async () => {
    if (!selectedRoom || (!newMessage && !selectedFile)) return;

    // Se /bot ...
    if (newMessage.startsWith('/bot ')) {
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
      return;
    }

    // Menzioni
    const mentionRegex = /@(\w+)/g;
    const matches = newMessage.match(mentionRegex);
    if (matches) {
      for (const m of matches) {
        const username = m.slice(1);
        // Esempio: potresti cercare in 'profiles' e avvisare quell'utente
      }
    }

    let attachment_url = null;
    let file_name = null;
    let file_type = null;

    // Upload file
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

    // Inserisci messaggio
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

  // ========== 6) REAZIONI (doppio click) ===============
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

  // ========== 7) INVITA UTENTE ===============
  const openInviteModal = () => setInviteModalOpen(true);
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
      alert('Utente non trovato.');
      return;
    }
    let { error: memError } = await supabase
      .from('room_members')
      .insert([{ room_id: selectedRoom.id, user_id: profileData.id, status: 'pending' }]);
    if (!memError) {
      alert('Invito inviato con successo!');
      closeInviteModal();
      fetchInvitations();
    }
  };

  // ========== 8) REGISTRAZIONE VOCALE ===============
  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Registrazione non supportata.');
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (evt) => {
      if (evt.data.size > 0) {
        setAudioChunks(prev => [...prev, evt.data]);
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

  // ========== 9) PRESENCE & TYPING ===============
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
    presenceChannel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      setTypingUsers(payload.typingUsers);
    });
    // Ascoltiamo anche "call-started" o "call-join" se vuoi
    presenceChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        presenceChannel.track({ online: true });
      }
    });
    presenceChannelRef.current = presenceChannel;
  };
  const handleTyping = (isTyping) => {
    setTypingUsers(prev => {
      const copy = new Set(prev);
      if (isTyping) copy.add(session.user.id);
      else copy.delete(session.user.id);
      return [...copy];
    });
    const channel = presenceChannelRef.current;
    if (channel) {
      channel.send({
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

  // ========== 10) CONTEXT MENU STANZA (dettaglio, etc) ===============
  const menuRefS = useRef();
  const reactionRefS = useRef();
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
    if (!window.confirm('Eliminare questa stanza?')) return;
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

   // ========== CHIAMATE DI GRUPPO ===========
  // Avvia la call => broadcast "call-started"
  const handleStartGroupCall = async () => {
    if (!selectedRoom || !presenceChannelRef.current) return;

    setCallActive(true);
    setCallHostId(session.user.id);
    setCallParticipants([session.user.id]); // l'host partecipa

    // Ottieni localStream
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    setLocalStream(stream);

    presenceChannelRef.current.send({
      type: 'broadcast',
      event: 'call-started',
      payload: { hostId: session.user.id, roomId: selectedRoom.id }
    });
    alert('Hai avviato la call. Gli altri possono unirsi.');
  };

  // “Unisciti” => broadcast call-join
  const handleJoinGroupCall = async () => {
    if (!selectedRoom || !presenceChannelRef.current) return;

    setCallActive(true);
    setCallParticipants(prev => {
      const setNew = new Set(prev);
      setNew.add(session.user.id);
      return [...setNew];
    });

    // ottieni localStream
    if (!localStream) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      setLocalStream(stream);
    }

    presenceChannelRef.current.send({
      type: 'broadcast',
      event: 'call-join',
      payload: { userId: session.user.id, roomId: selectedRoom.id }
    });
    alert('Ti sei unito alla call. Scambio offer/answer...');
  };

  // Crea una RTCPeerConnection con “peerId”
  function createPeerConnection(peerId, channel) {
    if (pcMapRef.current[peerId]) {
      return pcMapRef.current[peerId];
    }
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    pcMapRef.current[peerId] = pc;

    // On icecandidate => broadcast "webrtc-ice"
    pc.onicecandidate = (evt) => {
      if (evt.candidate) {
        channel.send({
          type: 'broadcast',
          event: 'webrtc-ice',
          payload: {
            from: session.user.id,
            to: peerId,
            candidate: evt.candidate
          }
        });
      }
    };

    // On track => mostra video remoto
    pc.ontrack = (evt) => {
      console.log(`Ricevuto track da ${peerId}`, evt.streams);
      // Potresti creare un <video> e riprodurre “evt.streams[0]”
    };

    return pc;
  }

  // Genera un Offer verso peerId
  async function makeOffer(peerId, channel) {
    const pc = pcMapRef.current[peerId];
    if (!pc) return;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    channel.send({
      type: 'broadcast',
      event: 'webrtc-offer',
      payload: {
        from: session.user.id,
        to: peerId,
        sdp: offer
      }
    });
  }

  // Gestisci l’arrivo di un “offer”
  async function handleOffer(payload, channel) {
    // Se non è per me, ignoro
    if (payload.to !== session.user.id) return;

    const { from, sdp } = payload;
    // Creo pc se non esiste
    createPeerConnection(from, channel);

    const pc = pcMapRef.current[from];
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));

    // Aggiungo track locali
    if (!localStream) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      setLocalStream(stream);
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
    } else {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    // Creo answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    channel.send({
      type: 'broadcast',
      event: 'webrtc-answer',
      payload: {
        from: session.user.id,
        to: from,
        sdp: answer
      }
    });
  }

  // Gestisci arrivo di “answer”
  async function handleAnswer(payload) {
    if (payload.to !== session.user.id) return;
    const { from, sdp } = payload;
    const pc = pcMapRef.current[from];
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  // Gestisci arrivo di “ice”
  async function handleIceCandidate(payload) {
    if (payload.to !== session.user.id) return;
    const { from, candidate } = payload;
    const pc = pcMapRef.current[from];
    if (!pc) return;
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  // RENDER
  return (
    <div className={`chat-container ${theme}-theme`}>
      <div className="sidebar">
        <h3 style={{ marginBottom: '0.5rem' }}>Chat Rooms</h3>
        
        {/* Pulsante "Amici" */}
        <Link
          to="/friends"
          style={{
            display: 'inline-block',
            textDecoration: 'none',
            background: '#3498db',
            color: '#fff',
            padding: '0.4rem 0.7rem',
            borderRadius: '4px',
            marginBottom: '0.5rem',
            fontSize: '0.85rem',
            textAlign: 'center'
          }}
        >
          &#128101; Amici
        </Link>

        <ul style={{ marginBottom: '0.5rem' }}>
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

        <div style={{ marginTop: '0.5rem' }}>
          <h4 style={{ marginBottom: '0.3rem' }}>Utenti online:</h4>
          <ul>
            {onlineUsers.map(uid => (
              <li key={uid}>
                {uid === session.user.id ? 'Tu' : uid}
              </li>
            ))}
          </ul>
        </div>

        <div className="sidebar-bottom" style={{ marginTop: '1rem' }}>
          <button
            onClick={onShowProfile}
            className="profile-button"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
          >
            Profilo
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="settings-button"
            style={{ fontSize: '1rem', padding: '0.4rem 0.6rem' }}
          >
            &#9881;
          </button>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
            }}
            className="logout-button"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
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
              {pendingInvites.map(invite => (
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

            {/* Se la call non è attiva => Avvia, altrimenti "Chiamata attiva" */}
            {!callActive ? (
              <button
                onClick={handleStartGroupCall}
                style={{ marginBottom: '0.5rem', background: '#16a085', color: '#fff', borderRadius: '4px', border: 'none', padding: '0.4rem 0.8rem' }}
              >
                Avvia chiamata di gruppo
              </button>
            ) : (
              <div style={{ marginBottom: '0.5rem' }}>
                <strong style={{ color: 'green' }}>Chiamata attiva!</strong>{' '}
                {callHostId !== session.user.id && (
                  <button
                    onClick={handleJoinGroupCall}
                    style={{ marginLeft: '0.5rem', background: '#e67e22', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.3rem 0.6rem' }}
                  >
                    Unisciti
                  </button>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <button
                style={{ background: '#27ae60', color: '#fff', borderRadius: '6px', padding: '0.5rem 1rem', border: 'none' }}
                onClick={() => setInviteModalOpen(true)}
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
              {messages.map(msg => {
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

            {/* Barra invio */}
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
              {mediaRecorder ? (
                <button onClick={stopRecording} className="mic-button" title="Stop Recording">
                  &#128264;
                </button>
              ) : (
                <button onClick={startRecording} className="mic-button" title="Inizia registrazione vocale">
                  &#127908;
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

      {/* Context menu stanza */}
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
            <button onClick={() => {
              handleShowChannelDetail(contextMenu.room);
              setContextMenu(null);
            }}>
              Dettaglio Canale
            </button>
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

      {/* Reaction menu */}
      {reactionMenu && (
        <div
          ref={reactionRef}
          className="reaction-menu"
          style={{ top: reactionMenu.y, left: reactionMenu.x }}
        >
          <button onClick={() => handleReaction(reactionMenu.message, '👍')}>👍</button>
          <button onClick={() => handleReaction(reactionMenu.message, '❤️')}>❤️</button>
          <button onClick={() => handleReaction(reactionMenu.message, '😂')}>😂</button>
        </div>
      )}

      {/* Modale Invita */}
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
                onClick={() => setInviteModalOpen(false)}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dettaglio canale */}
      {showChannelDetail && (
        <div className="channel-detail-modal">
          <div className="channel-detail-content">
            <h4>Dettaglio Canale</h4>
            <ul>
              {channelMembers.map(m => (
                <li key={m.id}>
                  {m.email} {m.role === 'admin' && <strong>(Admin)</strong>}
                </li>
              ))}
            </ul>
            <button onClick={() => setShowChannelDetail(false)}>Chiudi</button>
          </div>
        </div>
      )}

      {/* Modale impostazioni: multi-tema */}
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
