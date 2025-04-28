// Frontend JavaScript for HopChat messaging app

const socket = io();

let currentUser = null;
let currentChat = null;
let localStream = null;
let peerConnections = {};
let callId = null;

const loginSection = document.getElementById('login-section');
const registerSection = document.getElementById('register-section');
const appMain = document.getElementById('app');
const contactsSection = document.getElementById('contacts-section');
const chatSection = document.getElementById('chat-section');

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showRegisterBtn = document.getElementById('show-register');
const showLoginBtn = document.getElementById('show-login');

const contactsList = document.getElementById('contacts-list');
const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');

const userProfileName = document.getElementById('user-profile-name');
const userProfilePic = document.getElementById('user-profile-pic');
const logoutBtn = document.getElementById('logout-btn');

const chatName = document.getElementById('chat-name');
const chatProfilePic = document.getElementById('chat-profile-pic');
const chatLastSeen = document.getElementById('chat-last-seen');

const callModal = document.getElementById('call-modal');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const endCallBtn = document.getElementById('end-call-btn');
const callBtn = document.getElementById('call-btn');
const videoCallBtn = document.getElementById('video-call-btn');

showRegisterBtn.addEventListener('click', () => {
  loginSection.style.display = 'none';
  registerSection.style.display = 'block';
});

showLoginBtn.addEventListener('click', () => {
  registerSection.style.display = 'none';
  loginSection.style.display = 'block';
});

logoutBtn.addEventListener('click', () => {
  location.reload();
});

const loginButton = document.getElementById('login-button');

loginButton.addEventListener('click', () => {
  loginButton.style.display = 'none';
  document.getElementById('login-form').classList.remove('hidden');
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.success) {
      currentUser = username;
      userProfileName.textContent = data.profileName;
      userProfilePic.src = data.profilePic || 'https://via.placeholder.com/40';
      loginSection.style.display = 'none';
      appMain.style.display = 'block';
      contactsSection.style.display = 'flex';
      socket.emit('login', username);
    } else {
      alert(data.error || 'Login failed');
    }
  } catch (err) {
    alert('Login error');
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value.trim();
  const profileName = document.getElementById('register-profile-name').value.trim();
  const profilePic = document.getElementById('register-profile-pic').value.trim();
  try {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, profileName, profilePic }),
    });
    const data = await res.json();
    if (data.success) {
      alert('Registration successful. Please login.');
      registerSection.style.display = 'none';
      loginSection.style.display = 'block';
    } else {
      alert(data.error || 'Registration failed');
    }
  } catch (err) {
    alert('Registration error');
  }
});

socket.on('login_success', (data) => {
  console.log('Logged in:', data);
});

socket.on('login_error', (msg) => {
  alert('Login error: ' + msg);
});

socket.on('contact_online', (username) => {
  console.log(username + ' is online');
  // Update UI accordingly
});

socket.on('contact_offline', (username) => {
  console.log(username + ' is offline');
  // Update UI accordingly
});

// Messaging and chat UI functions to be implemented

// WebRTC call handling

callBtn.addEventListener('click', () => {
  if (!currentChat) return alert('Select a contact to call');
  startCall(currentChat, false);
});

videoCallBtn.addEventListener('click', () => {
  if (!currentChat) return alert('Select a contact to video call');
  startCall(currentChat, true);
});

endCallBtn.addEventListener('click', () => {
  endCall();
});

function startCall(targetUser, isVideo) {
  callId = generateCallId();
  peerConnections = {};
  navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true })
    .then(stream => {
      localStream = stream;
      localVideo.srcObject = stream;
      callModal.style.display = 'flex';

      const pc = createPeerConnection(targetUser);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        socket.emit('call_user', { to: targetUser, offer, callId, isGroupCall: false });
      });
    })
    .catch(err => {
      alert('Could not get media: ' + err.message);
    });
}

function createPeerConnection(targetUser) {
  const pc = new RTCPeerConnection();
  pc.onicecandidate = event => {
    if (event.candidate) {
      socket.emit('ice_candidate', { to: targetUser, candidate: event.candidate, callId });
    }
  };
  pc.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
  };
  peerConnections[targetUser] = pc;
  return pc;
}

socket.on('incoming_call', async (data) => {
  const { from, offer, callId: incomingCallId, isGroupCall } = data;
  const accept = confirm(`Incoming ${isGroupCall ? 'group' : 'call'} from ${from}. Accept?`);
  if (!accept) {
    // Reject call logic here
    return;
  }
  callId = incomingCallId;
  peerConnections = {};
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStream = stream;
    localVideo.srcObject = stream;
    callModal.style.display = 'flex';

    const pc = createPeerConnection(from);
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('answer_call', { to: from, answer, callId });
  } catch (err) {
    alert('Error handling call: ' + err.message);
  }
});

socket.on('call_answered', async (data) => {
  const { from, answer } = data;
  const pc = peerConnections[from];
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }
});

socket.on('ice_candidate', async (data) => {
  const { from, candidate } = data;
  const pc = peerConnections[from];
  if (pc) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('Error adding ICE candidate:', err);
    }
  }
});

function endCall() {
  callModal.style.display = 'none';
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  Object.values(peerConnections).forEach(pc => pc.close());
  peerConnections = {};
  callId = null;
}

function generateCallId() {
  return Math.random().toString(36).substr(2, 9);
}

// Additional UI and messaging logic to be implemented
