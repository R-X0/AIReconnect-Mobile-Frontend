// MobileWebRTC.js
import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
} from 'react-native';
import { RTCView, RTCPeerConnection, mediaDevices } from 'react-native-webrtc';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'react-native-image-picker';
import { Picker } from '@react-native-picker/picker';
import { getToken } from '../authStorage';
// Import custom environment variables
import ENV from './env';

const configuration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

// Use environment variables for server URL
const SERVER_URL = ENV.SERVER_URL;

const MobileWebRTC = () => {
  const [pc, setPc] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [dailyUrl, setDailyUrl] = useState(null);
  const [selectedFaceId, setSelectedFaceId] = useState(null);
  const [isAvatarLoading, setIsAvatarLoading] = useState(false);
  const [pollStatus, setPollStatus] = useState('');
  const [avatars, setAvatars] = useState([]);
  const [sessionLoading, setSessionLoading] = useState(false);

  // NEW STATE: voices & selectedVoiceId for ElevenLabs voices
  const [voices, setVoices] = useState([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState(null);

  // NEW STATE: Modal for entering avatar name
  const [avatarNameModalVisible, setAvatarNameModalVisible] = useState(false);
  const [avatarName, setAvatarName] = useState('');

  const wsConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);

  const logToConsole = (message) => {
    console.log('[MobileWebRTC]', message);
  };

  // Fetch avatars saved for the user.
  const fetchAvatars = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${SERVER_URL}/avatars`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.avatars) {
        setAvatars(data.avatars);
        if (!selectedFaceId && data.avatars.length > 0) {
          setSelectedFaceId(data.avatars[0].faceId);
        }
      }
    } catch (err) {
      logToConsole('Error fetching avatars: ' + err);
    }
  };

  // Fetch voices saved for the user.
  const fetchVoices = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${SERVER_URL}/voices`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.voices) {
        setVoices(data.voices);
        if (!selectedVoiceId && data.voices.length > 0) {
          setSelectedVoiceId(data.voices[0].voiceId);
        }
      }
    } catch (err) {
      logToConsole('Error fetching voices: ' + err);
    }
  };

  useEffect(() => {
    fetchAvatars();
    fetchVoices();
  }, []);

  // Initiates the avatar creation process by first asking for a name.
  const openAvatarNameModal = () => {
    setAvatarName('');
    setAvatarNameModalVisible(true);
  };

  // Called when user confirms the avatar name.
  const confirmAvatarName = () => {
    if (!avatarName.trim()) {
      Alert.alert('Please enter an avatar name.');
      return;
    }
    setAvatarNameModalVisible(false);
    createAvatar();
  };

  // Create avatar using image picker.
  const createAvatar = async () => {
    ImagePicker.launchImageLibrary(
      {
        mediaType: 'photo',
        quality: 0.8,
      },
      async (response) => {
        if (response.didCancel) {
          logToConsole('User cancelled image picker');
          return;
        } else if (response.errorCode) {
          logToConsole('ImagePicker Error: ' + response.errorMessage);
          Alert.alert('Error', response.errorMessage);
          return;
        } else if (response.assets && response.assets.length > 0) {
          const asset = response.assets[0];
          logToConsole('Selected image: ' + asset.uri);
          const formData = new FormData();
          formData.append('image', {
            uri: asset.uri,
            name: asset.fileName || 'avatar.jpg',
            type: asset.type || 'image/jpeg',
          });
          // Use the avatarName provided by the user
          formData.append('face_name', avatarName);

          try {
            setIsAvatarLoading(true);
            setPollStatus('Initiating avatar creation...');
            const token = await getToken();
            const res = await fetch(`${SERVER_URL}/generate-face-id`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'multipart/form-data',
              },
              body: formData,
            });
            const data = await res.json();
            logToConsole('Avatar creation initiated: ' + JSON.stringify(data));
            const faceId = data.character_uid;
            if (faceId) {
              setSelectedFaceId(faceId);
              pollForAvatar(faceId);
              fetchAvatars();
            } else {
              setIsAvatarLoading(false);
              setPollStatus('');
              Alert.alert('Error', 'Did not receive a valid face ID from the server.');
            }
          } catch (err) {
            logToConsole('Error creating avatar: ' + err);
            setIsAvatarLoading(false);
            setPollStatus('');
            Alert.alert('Error', err.message);
          }
        }
      }
    );
  };

  // Poll for avatar status until complete or timeout.
  const pollForAvatar = async (faceId) => {
    logToConsole('Starting to poll for avatar status with faceId: ' + faceId);
    const pollInterval = 10000;
    let retries = 30;

    while (retries > 0) {
      setPollStatus(`Polling for avatar status... Attempts remaining: ${retries}`);
      try {
        const options = {
          method: 'POST',
          headers: {
            'api-key': ENV.SIMLI_API_KEY, // Use environment variable for API key
          },
        };
        const statusRes = await fetch(`https://api.simli.ai/getRequestStatus?face_id=${faceId}`, options);
        const statusData = await statusRes.json();
        logToConsole('Polling response: ' + JSON.stringify(statusData));
        if (statusData.status) {
          setPollStatus(`Avatar status: ${statusData.status}`);
          if (statusData.status === 'completed' || statusData.status === 'success') {
            setIsAvatarLoading(false);
            Alert.alert('Success', 'Avatar creation completed.');
            return;
          }
        }
      } catch (err) {
        logToConsole('Error polling avatar status: ' + err);
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      retries--;
    }
    setIsAvatarLoading(false);
    setPollStatus('Avatar creation timed out.');
    Alert.alert('Error', 'Avatar creation timed out. Please try again.');
  };

  // WebRTC and WebSocket setup.
  const start = async () => {
    setSessionLoading(true);
    logToConsole('Starting session...');
    const newPc = new RTCPeerConnection(configuration);
    setPc(newPc);

    newPc.onicecandidate = (event) => {
      if (!event.candidate) {
        logToConsole('ICE gathering complete.');
        connectToRemotePeer(newPc);
      }
    };

    newPc.ontrack = (event) => {
      // Handle remote stream if needed.
    };

    try {
      const stream = await mediaDevices.getUserMedia({ audio: true, video: true });
      logToConsole('Acquired local media.');
      setLocalStream(stream);
      stream.getTracks().forEach((track) => {
        newPc.addTrack(track, stream);
      });
    } catch (err) {
      logToConsole('Error getting user media: ' + err);
      setSessionLoading(false);
      return;
    }

    const dc = newPc.createDataChannel('datachannel', { ordered: true });
    dataChannelRef.current = dc;
    dc.onopen = () => {
      logToConsole('Data channel open.');
      waitForWsConnectionAndInitiate();
    };
    dc.onmessage = (event) => {
      logToConsole('Data channel message: ' + event.data);
    };

    try {
      const offer = await newPc.createOffer();
      await newPc.setLocalDescription(offer);
      logToConsole('Created and set local offer.');
    } catch (err) {
      logToConsole('Error creating offer: ' + err);
      setSessionLoading(false);
    }
  };

  const connectToRemotePeer = (peerConnection) => {
    const ws = new WebSocket('wss://api.simli.ai/startWebRTCSession');
    ws.onopen = () => {
      logToConsole('Connected to Simli signaling server.');
      const offer = peerConnection.localDescription;
      ws.send(JSON.stringify({ sdp: offer.sdp, type: offer.type }));
    };

    ws.onmessage = async (event) => {
      if (event.data === 'ACK') {
        logToConsole('Received ACK, ignoring.');
        return;
      }
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'answer') {
          logToConsole('Received remote SDP answer.');
          await peerConnection.setRemoteDescription(data);
        } else {
          logToConsole('Received non-SDP JSON message: ' + event.data);
        }
      } catch (err) {
        logToConsole('Received non-JSON message: ' + event.data);
      }
    };

    ws.onerror = (err) => {
      logToConsole('WebSocket error: ' + err.message);
    };

    wsConnectionRef.current = ws;
  };

  const waitForWsConnectionAndInitiate = () => {
    const intervalId = setInterval(() => {
      if (wsConnectionRef.current && wsConnectionRef.current.readyState === WebSocket.OPEN) {
        clearInterval(intervalId);
        initiateE2ESession();
      } else {
        logToConsole('Waiting for WebSocket to be ready...');
      }
    }, 500);
  };

  // Updated initiateE2ESession function with environment variables
  const initiateE2ESession = async () => {
    logToConsole('Initiating E2E session...');
    try {
      const payload = {
        apiKey: ENV.SIMLI_API_KEY, // Use environment variable
        faceId: selectedFaceId,
        ttsProvider: "ElevenLabs",
        ttsAPIKey: ENV.ELEVENLABS_API_KEY, // Use environment variable
        ttsModel: 'eleven_multilingual_v2',
        voiceId: selectedVoiceId,
        systemPrompt:
          "You are Chatbot, a friendly, helpful robot. Your goal is to demonstrate your capabilities in a succinct way. Your output will be converted to audio so don't include special characters in your answers. Respond to what the user said in a creative and helpful way, but keep your responses brief.",
        firstMessage: "Hello!",
        maxSessionLength: 3600,
        maxIdleTime: 300,
        language: "en",
        customLLMConfig: {
          model: "gpt-4o-mini",
          baseURL: 'https://api.openai.com/v1',
          llmAPIKey: ENV.OPENAI_API_KEY, // Use environment variable
        },
      };

      const response = await fetch(`${SERVER_URL}/start-e2e-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const resJSON = await response.json();
      logToConsole('Received API response: ' + JSON.stringify(resJSON));

      const sessionToken = resJSON.session_token || resJSON.roomUrl;

      if (wsConnectionRef.current && wsConnectionRef.current.readyState === WebSocket.OPEN) {
        wsConnectionRef.current.send(JSON.stringify({ session_token: String(sessionToken) }));
        logToConsole('Sent session token via WebSocket.');
      } else {
        logToConsole('WebSocket not ready to send session token.');
      }

      setDailyUrl(String(sessionToken));
      setSessionLoading(false);
    } catch (err) {
      logToConsole('Error initiating E2E session: ' + err);
      setSessionLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <View style={styles.container}>
        {dailyUrl ? (
          <WebView source={{ uri: dailyUrl }} style={styles.webview} />
        ) : sessionLoading ? (
          <View style={styles.loadingSessionContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Starting session...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContainer}>
            <Text style={styles.header}>Mobile WebRTC</Text>
            <CustomButton title="Create Avatar" onPress={openAvatarNameModal} />
            {isAvatarLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.loadingTextInline}>Creating Avatar...</Text>
              </View>
            )}
            <Text style={styles.infoText}>
              {selectedFaceId ? `Using avatar: ${selectedFaceId}` : 'No avatar selected.'}
            </Text>
            {pollStatus !== '' && <Text style={styles.pollStatus}>{pollStatus}</Text>}
            {avatars.length > 0 && (
              <View style={styles.dropdownContainer}>
                <Text style={styles.dropdownLabel}>Select Avatar:</Text>
                <Picker
                  selectedValue={selectedFaceId}
                  mode="dropdown"
                  style={styles.picker}
                  onValueChange={(itemValue) => setSelectedFaceId(itemValue)}
                >
                  {avatars.map((avatar) => (
                    <Picker.Item
                      key={avatar._id}
                      label={avatar.faceName}
                      value={avatar.faceId}
                      color="#333"
                    />
                  ))}
                </Picker>
              </View>
            )}
            {voices.length > 0 && (
              <View style={styles.dropdownContainer}>
                <Text style={styles.dropdownLabel}>Select Voice:</Text>
                <Picker
                  selectedValue={selectedVoiceId}
                  mode="dropdown"
                  style={styles.picker}
                  onValueChange={(itemValue) => setSelectedVoiceId(itemValue)}
                >
                  {voices.map((voice) => (
                    <Picker.Item
                      key={voice._id}
                      label={voice.name}
                      value={voice.voiceId}
                      color="#333"
                    />
                  ))}
                </Picker>
              </View>
            )}
            <CustomButton title="Start Session" onPress={start} />
          </ScrollView>
        )}

        {/* Avatar Name Modal */}
        <Modal
          transparent={true}
          animationType="fade"
          visible={avatarNameModalVisible}
          onRequestClose={() => setAvatarNameModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>Enter Avatar Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Avatar Name"
                value={avatarName}
                onChangeText={setAvatarName}
              />
              <TouchableOpacity style={styles.modalButton} onPress={confirmAvatarName}>
                <Text style={styles.modalButtonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
};

const CustomButton = ({ title, onPress }) => (
  <TouchableOpacity onPress={onPress} style={styles.button}>
    <Text style={styles.buttonText}>{title}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#f2f4f7',
  },
  container: {
    flex: 1,
    padding: 20,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 20,
  },
  header: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 25,
    color: '#333',
  },
  webview: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 15,
    borderRadius: 10,
    marginVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    elevation: 3,
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 16,
  },
  infoText: {
    marginVertical: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    color: '#555',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    justifyContent: 'center',
  },
  loadingTextInline: {
    marginLeft: 10,
    fontSize: 16,
    color: '#333',
  },
  pollStatus: {
    marginVertical: 10,
    fontStyle: 'italic',
    color: '#777',
    textAlign: 'center',
  },
  dropdownContainer: {
    marginVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dropdownLabel: {
    fontSize: 16,
    marginBottom: 6,
    color: '#555',
    fontWeight: '600',
  },
  picker: {
    height: 50,
    width: '100%',
    color: '#333',
  },
  loadingSessionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#333',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '80%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 15,
    textAlign: 'center',
    color: '#333',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    fontSize: 16,
    color: '#333',
  },
  modalButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
  },
  modalButtonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default MobileWebRTC;