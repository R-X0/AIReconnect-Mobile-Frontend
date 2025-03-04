// AIConversationScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  StatusBar,
  Alert,
  SafeAreaView, // <--- Import SafeAreaView
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import Constants from 'expo-constants';
import { getToken } from '../authStorage';

import ENV from './env';
const SERVER_URL = ENV.SERVER_URL;

const getEnvVariables = () => {
  if (Constants.manifest?.extra) {
    return Constants.manifest.extra;
  } else if (Constants.expoConfig?.extra) {
    return Constants.expoConfig.extra;
  } else {
    return {};
  }
};

const { ELEVENLABS_API_KEY } = getEnvVariables();

export default function AIConversationScreen({ route, navigation }) {
  const { conversationId } = route.params || {};

  const [initialLoading, setInitialLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const sound = useRef(new Audio.Sound());

  const [persona, setPersona] = useState(null);
  const [currentVoiceId, setCurrentVoiceId] = useState('');

  const [availableVoices, setAvailableVoices] = useState([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);

  const flatListRef = useRef(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Cleanup TTS on unmount
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (sound.current) {
        sound.current.unloadAsync();
      }
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Load conversation
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) {
      Alert.alert('Error', 'No conversation ID provided.');
      navigation.goBack();
      return;
    }
    loadConversation(conversationId);
  }, [conversationId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch user voices
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchMyVoices();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Automatically scroll to end when messages change
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      if (flatListRef.current) {
        flatListRef.current.scrollToEnd({ animated: true });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [messages]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────
  async function loadConversation(id) {
    try {
      setInitialLoading(true);
      const token = await getToken();

      const resp = await fetch(`${BACKEND_URL}/api/conversations/${id}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();

      if (!resp.ok) {
        console.error('Load Conversation Error:', data);
        Alert.alert('Error', data.error || 'Failed to load conversation');
        navigation.goBack();
      } else {
        setMessages(data.conversation.messages || []);
        setPersona(data.conversation.persona || null);
        setCurrentVoiceId(data.conversation.voiceId || '');
      }
    } catch (err) {
      console.error('Load Conversation Exception:', err);
      Alert.alert('Error', 'Failed to load conversation');
      navigation.goBack();
    } finally {
      setInitialLoading(false);
    }
  }

  async function fetchMyVoices() {
    setVoicesLoading(true);
    try {
      const token = await getToken();
      const resp = await fetch(`${BACKEND_URL}/voices`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!resp.ok) {
        console.error('fetchMyVoices error:', data);
      } else {
        setAvailableVoices(data.voices || []);
      }
    } catch (err) {
      console.error('fetchMyVoices exception:', err);
    } finally {
      setVoicesLoading(false);
    }
  }

  async function sendMessage(userText) {
    if (!userText.trim()) return;

    // Add user message optimistically
    setMessages((prev) => [...prev, { role: 'user', content: userText.trim() }]);
    setUserInput('');
    setSending(true);

    try {
      const token = await getToken();
      const response = await fetch(
        `${BACKEND_URL}/api/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            role: 'user',
            content: userText.trim(),
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        console.error('Send Message Error:', data);
        Alert.alert('Error', data.error || 'Failed to send message');
      } else {
        setMessages(data.conversation.messages);

        // If last message was from the assistant, play TTS
        const lastMessage =
          data.conversation.messages[data.conversation.messages.length - 1];
        if (lastMessage?.role === 'assistant' && currentVoiceId) {
          await playElevenLabsAudio(lastMessage.content, currentVoiceId);
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Error: Could not reach GPT.' },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function playElevenLabsAudio(text, vId) {
    if (!ELEVENLABS_API_KEY) {
      console.warn('ELEVENLABS_API_KEY missing');
      return;
    }
    try {
      const ttsResponse = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${vId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': ELEVENLABS_API_KEY,
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text,
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.8,
            },
          }),
        }
      );

      if (!ttsResponse.ok) {
        const errText = await ttsResponse.text();
        console.error('ElevenLabs TTS Error:', errText);
        return;
      }

      const audioData = await ttsResponse.arrayBuffer();
      const base64String = arrayBufferToBase64(audioData);
      const fileUri = FileSystem.cacheDirectory + 'ai-tts-response.mp3';

      await FileSystem.writeAsStringAsync(fileUri, base64String, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await sound.current.unloadAsync();
      await sound.current.loadAsync({ uri: fileUri });
      await sound.current.playAsync();
    } catch (err) {
      console.error('playElevenLabsAudio error:', err);
    }
  }

  function arrayBufferToBase64(arrayBuffer) {
    let binary = '';
    const bytes = new Uint8Array(arrayBuffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  async function onSelectVoice(voice) {
    setVoiceModalVisible(false);
    setCurrentVoiceId(voice.voiceId);
    await updateConversationVoice(conversationId, voice.voiceId);
  }

  async function updateConversationVoice(conversationId, voiceId) {
    try {
      const token = await getToken();
      const resp = await fetch(`${BACKEND_URL}/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ voiceId }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        console.error('Update Voice Error:', data);
        Alert.alert('Error', data.error || 'Failed to update voice');
      } else {
        setPersona(data.conversation.persona || null);
      }
    } catch (err) {
      console.error('Update Voice Exception:', err);
      Alert.alert('Error', 'Failed to update voice');
    }
  }

  function renderItem({ item }) {
    const isUser = item.role === 'user';
    return (
      <View
        style={[
          styles.messageContainer,
          isUser ? styles.userMessage : styles.aiMessage,
        ]}
      >
        <Text style={styles.messageText}>{item.content}</Text>
      </View>
    );
  }

  const selectedVoiceName =
    availableVoices.find((v) => v.voiceId === currentVoiceId)?.name || 'None';

  if (initialLoading) {
    return (
      <LinearGradient colors={['#f5f7fa', '#c3cfe2']} style={styles.gradient}>
        <StatusBar barStyle="dark-content" />
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color="#333" />
          <Text style={{ color: '#333', marginTop: 10 }}>Loading conversation...</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      // Increase offset if you want the bottom bar to rise further on iOS
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <LinearGradient colors={['#f5f7fa', '#c3cfe2']} style={styles.gradient}>
        <SafeAreaView style={{ flex: 1 }}>
          <StatusBar barStyle="dark-content" />

          {/* Voice selection modal */}
          <Modal
            visible={voiceModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setVoiceModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContainer}>
                <Text style={styles.modalTitle}>Select a Voice</Text>
                {voicesLoading ? (
                  <ActivityIndicator size="large" color="#333" />
                ) : (
                  <FlatList
                    data={availableVoices}
                    renderItem={({ item }) => {
                      const isSelected = item.voiceId === currentVoiceId;
                      return (
                        <TouchableOpacity
                          style={[
                            styles.voiceOption,
                            isSelected && styles.selectedVoiceItem,
                          ]}
                          onPress={() => onSelectVoice(item)}
                        >
                          <Text style={styles.voiceOptionText}>
                            {item.name} (ID: {item.voiceId})
                          </Text>
                        </TouchableOpacity>
                      );
                    }}
                    keyExtractor={(item) => item._id}
                  />
                )}
                <View style={styles.modalButtonWrapper}>
                  <TouchableOpacity
                    style={styles.closeModalButton}
                    onPress={() => setVoiceModalVisible(false)}
                  >
                    <Text style={styles.closeModalText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          <View style={styles.container}>
            {/* Display selected voice ABOVE the chat */}
            <View style={styles.selectedVoiceContainer}>
              <Text style={styles.selectedVoiceLabel}>
                Currently Selected Voice: {selectedVoiceName}
              </Text>
            </View>

            {/* Chat list */}
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderItem}
              keyExtractor={(item, idx) => `message-${idx}`}
              style={styles.chatList}
              contentContainerStyle={{ padding: 16, paddingTop: 8 }}
            />

            {/* Bottom row: Voice button + text input + send */}
            <View style={styles.bottomContainer}>
              <TouchableOpacity
                style={styles.selectVoiceButton}
                onPress={() => setVoiceModalVisible(true)}
              >
                <Ionicons
                  name="megaphone-outline"
                  size={20}
                  color="#fff"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.selectVoiceText}>Voice</Text>
              </TouchableOpacity>

              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Type your message..."
                  placeholderTextColor="#999"
                  value={userInput}
                  onChangeText={setUserInput}
                  onSubmitEditing={() => sendMessage(userInput)}
                />
                <TouchableOpacity
                  style={[styles.sendButton, sending && { backgroundColor: '#999' }]}
                  onPress={() => sendMessage(userInput)}
                  disabled={sending}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.sendButtonText}>Send</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  chatList: {
    flex: 1,
  },
  messageContainer: {
    marginVertical: 4,
    padding: 10,
    borderRadius: 6,
    maxWidth: '80%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#f4511e',
    borderTopRightRadius: 0,
  },
  aiMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#3B3B98',
    borderTopLeftRadius: 0,
  },
  messageText: {
    color: '#fff',
    fontSize: 15,
  },
  bottomContainer: {
    flexDirection: 'row',
    padding: 8,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    alignItems: 'center',
    // Optional extra padding to lift the bottom container a bit more:
    paddingBottom: Platform.OS === 'ios' ? 16 : 12,
  },
  selectVoiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B3B98',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
  },
  selectVoiceText: {
    fontWeight: '600',
    color: '#fff',
    fontSize: 14,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#f4f4f4',
    borderRadius: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    color: '#333',
  },
  sendButton: {
    backgroundColor: '#3B3B98',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
  },
  modalContainer: {
    marginHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
    textAlign: 'center',
  },
  voiceOption: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#ddd',
  },
  selectedVoiceItem: {
    backgroundColor: '#dceeff',
  },
  voiceOptionText: {
    fontSize: 14,
    color: '#333',
  },
  modalButtonWrapper: {
    marginTop: 16,
    alignItems: 'center',
  },
  closeModalButton: {
    backgroundColor: '#3B3B98',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  closeModalText: {
    color: '#fff',
    fontWeight: '600',
  },
  // Selected Voice label (moved above chat)
  selectedVoiceContainer: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
  },
  selectedVoiceLabel: {
    fontSize: 14,
    color: '#555',
  },
});
