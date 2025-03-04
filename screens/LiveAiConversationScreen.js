// Redesigned LiveAiConversationScreen.js
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
  Dimensions,
  StatusBar,
  Image,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { RTCView, RTCPeerConnection, mediaDevices } from 'react-native-webrtc';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'react-native-image-picker';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getToken } from '../authStorage';
import ENV from './env';

const { width, height } = Dimensions.get('window');

const configuration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

// Use environment variables for server URL
const SERVER_URL = ENV.SERVER_URL;

const LiveAiConversationScreen = ({ navigation }) => {
  const [pc, setPc] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [dailyUrl, setDailyUrl] = useState(null);
  const [selectedFaceId, setSelectedFaceId] = useState(null);
  const [isAvatarLoading, setIsAvatarLoading] = useState(false);
  const [pollStatus, setPollStatus] = useState('');
  const [avatars, setAvatars] = useState([]);
  const [sessionLoading, setSessionLoading] = useState(false);

  // Voice selection state
  const [voices, setVoices] = useState([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState(null);

  // Avatar name modal state
  const [avatarNameModalVisible, setAvatarNameModalVisible] = useState(false);
  const [avatarName, setAvatarName] = useState('');

  const wsConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);

  const logToConsole = (message) => {
    console.log('[LiveAiConversationScreen]', message);
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

  // Render avatar item
  const renderAvatarItem = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.avatarItem,
        selectedFaceId === item.faceId && styles.selectedAvatarItem
      ]}
      onPress={() => setSelectedFaceId(item.faceId)}
      activeOpacity={0.7}
    >
      <LinearGradient
        colors={
          selectedFaceId === item.faceId 
            ? ['#5BDFD6', '#095684'] 
            : ['#ffffff', '#f5f5f5']
        }
        style={styles.avatarItemGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.avatarIconWrapper}>
          <View style={[
            styles.avatarIcon,
            selectedFaceId === item.faceId && { backgroundColor: '#5BDFD6' }
          ]}>
            <Ionicons 
              name="person" 
              size={20} 
              color={selectedFaceId === item.faceId ? '#ffffff' : '#43435F'} 
            />
          </View>
        </View>
        <Text style={[
          styles.avatarName,
          selectedFaceId === item.faceId && { color: '#ffffff' }
        ]}>
          {item.faceName || 'Unnamed Avatar'}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );

  // Render voice item
  const renderVoiceItem = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.voiceItem,
        selectedVoiceId === item.voiceId && styles.selectedVoiceItem
      ]}
      onPress={() => setSelectedVoiceId(item.voiceId)}
      activeOpacity={0.7}
    >
      <LinearGradient
        colors={
          selectedVoiceId === item.voiceId 
            ? ['#43435F', '#095684'] 
            : ['#ffffff', '#f5f5f5']
        }
        style={styles.voiceItemGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.voiceIconWrapper}>
          <View style={[
            styles.voiceIcon,
            selectedVoiceId === item.voiceId && { backgroundColor: '#43435F' }
          ]}>
            <Ionicons 
              name="mic" 
              size={20} 
              color={selectedVoiceId === item.voiceId ? '#ffffff' : '#43435F'} 
            />
          </View>
        </View>
        <Text style={[
          styles.voiceName,
          selectedVoiceId === item.voiceId && { color: '#ffffff' }
        ]}>
          {item.name || 'Unnamed Voice'}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );

  // Main layout when a session is active
  if (dailyUrl) {
    return (
      <SafeAreaView style={styles.webviewContainer}>
        <StatusBar barStyle="dark-content" />
        <WebView 
          source={{ uri: dailyUrl }} 
          style={styles.webview}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
        />
      </SafeAreaView>
    );
  }

  return (
    <LinearGradient colors={['#D9D0E7', '#D8B9E1']} style={styles.gradient}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeContainer}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
        >
          <ScrollView 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={styles.headerTitle}>Live AI Conversation</Text>
            <Text style={styles.headerSubtitle}>
              Talk face-to-face with your AI companion
            </Text>

            {sessionLoading ? (
              <View style={styles.loadingSessionContainer}>
                <View style={styles.loadingIndicatorWrapper}>
                  <ActivityIndicator size="large" color="#43435F" />
                </View>
                <Text style={styles.loadingText}>Starting interactive session...</Text>
                <Text style={styles.loadingSubtext}>Please wait while we connect your avatar</Text>
              </View>
            ) : (
              <>
                {/* Avatar Selection Section */}
                <View style={styles.sectionContainer}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionIconContainer}>
                      <Ionicons name="person" size={24} color="#fff" />
                    </View>
                    <View style={styles.sectionTitleContainer}>
                      <Text style={styles.sectionTitle}>Select Avatar</Text>
                      <Text style={styles.sectionSubtitle}>Choose who you want to talk to</Text>
                    </View>
                  </View>

                  <View style={styles.cardContainer}>
                    {isAvatarLoading ? (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#43435F" />
                        <Text style={styles.loadingText}>Creating Avatar...</Text>
                        {pollStatus && <Text style={styles.pollStatus}>{pollStatus}</Text>}
                      </View>
                    ) : avatars.length === 0 ? (
                      <View style={styles.emptyStateContainer}>
                        <Ionicons name="person-outline" size={50} color="#43435F" opacity={0.5} />
                        <Text style={styles.emptyStateText}>
                          You don't have any avatars yet. Create your first one!
                        </Text>
                      </View>
                    ) : (
                      <FlatList
                        data={avatars}
                        renderItem={renderAvatarItem}
                        keyExtractor={item => item._id || item.faceId}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.avatarsList}
                      />
                    )}

                    <TouchableOpacity
                      style={styles.createButton}
                      onPress={openAvatarNameModal}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={['#43435F', '#095684']}
                        style={styles.createButtonGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      >
                        <Ionicons name="add-circle" size={20} color="#fff" style={styles.buttonIcon} />
                        <Text style={styles.createButtonText}>Create New Avatar</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Voice Selection Section */}
                <View style={styles.sectionContainer}>
                  <View style={styles.sectionHeader}>
                    <View style={[styles.sectionIconContainer, {backgroundColor: '#5BDFD6'}]}>
                      <Ionicons name="mic" size={24} color="#fff" />
                    </View>
                    <View style={styles.sectionTitleContainer}>
                      <Text style={styles.sectionTitle}>Select Voice</Text>
                      <Text style={styles.sectionSubtitle}>Choose how your AI will sound</Text>
                    </View>
                  </View>

                  <View style={styles.cardContainer}>
                    {voices.length === 0 ? (
                      <View style={styles.emptyStateContainer}>
                        <Ionicons name="mic-off-outline" size={50} color="#43435F" opacity={0.5} />
                        <Text style={styles.emptyStateText}>
                          No voices found. Create a voice in Voice Cloning first.
                        </Text>
                      </View>
                    ) : (
                      <FlatList
                        data={voices}
                        renderItem={renderVoiceItem}
                        keyExtractor={item => item._id || item.voiceId}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.voicesList}
                      />
                    )}
                  </View>
                </View>

                {/* Start Conversation Button */}
                <TouchableOpacity
                  style={[
                    styles.startSessionButton,
                    (!selectedFaceId || !selectedVoiceId) && styles.disabledButton
                  ]}
                  onPress={start}
                  disabled={!selectedFaceId || !selectedVoiceId || isAvatarLoading}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={
                      selectedFaceId && selectedVoiceId && !isAvatarLoading
                        ? ['#095684', '#43435F']
                        : ['#cccccc', '#999999']
                    }
                    style={styles.startSessionButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Ionicons name="videocam" size={24} color="#fff" style={styles.buttonIcon} />
                    <Text style={styles.startSessionButtonText}>Start Live Conversation</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Name Input Modal */}
        <Modal
          transparent={true}
          animationType="fade"
          visible={avatarNameModalVisible}
          onRequestClose={() => setAvatarNameModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Name Your Avatar</Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setAvatarNameModalVisible(false)}
                >
                  <Ionicons name="close" size={24} color="#43435F" />
                </TouchableOpacity>
              </View>
              
              <Text style={styles.modalInstructions}>
                Give your avatar a name so you can identify it easily
              </Text>
              
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Avatar Name"
                  placeholderTextColor="#999"
                  value={avatarName}
                  onChangeText={setAvatarName}
                />
              </View>
              
              <TouchableOpacity 
                style={styles.modalButton} 
                onPress={confirmAvatarName}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#43435F', '#095684']}
                  style={styles.modalButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.modalButtonText}>Continue</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 40,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#43435F',
    textAlign: 'center',
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#095684',
    textAlign: 'center',
    marginBottom: 24,
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#43435F',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  sectionTitleContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#43435F',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#095684',
  },
  cardContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#43435F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  emptyStateText: {
    marginTop: 10,
    color: '#666',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#43435F',
    textAlign: 'center',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#095684',
    textAlign: 'center',
  },
  pollStatus: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  loadingSessionContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingIndicatorWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  // Avatar list styles
  avatarsList: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  avatarItem: {
    width: 110,
    height: 110,
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  selectedAvatarItem: {
    shadowColor: '#5BDFD6',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  avatarItemGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  avatarIconWrapper: {
    marginBottom: 12,
  },
  avatarIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#43435F',
    textAlign: 'center',
  },
  // Voice list styles
  voicesList: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  voiceItem: {
    width: 110,
    height: 110,
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  selectedVoiceItem: {
    shadowColor: '#43435F',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  voiceItemGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  voiceIconWrapper: {
    marginBottom: 12,
  },
  voiceIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#43435F',
    textAlign: 'center',
  },
  // Button styles
  createButton: {
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  createButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  buttonIcon: {
    marginRight: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  startSessionButton: {
    marginVertical: 20,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  disabledButton: {
    opacity: 0.7,
  },
  startSessionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  startSessionButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#43435F',
  },
  closeButton: {
    padding: 4,
  },
  modalInstructions: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  textInput: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#eaeaea',
  },
  modalButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  modalButtonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // WebView styles
  webviewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
  },
});

export default LiveAiConversationScreen;