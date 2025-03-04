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
  SafeAreaView,
  Image,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import Constants from 'expo-constants';
import { getToken } from '../authStorage';

import ENV from './env';
const SERVER_URL = ENV.SERVER_URL;

const { width, height } = Dimensions.get('window');

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
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const flatListRef = useRef(null);
  const inputRef = useRef(null);

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

      const resp = await fetch(`${SERVER_URL}/api/conversations/${id}`, {
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
      const resp = await fetch(`${SERVER_URL}/voices`, {
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
        `${SERVER_URL}/api/conversations/${conversationId}/messages`,
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
        { role: 'assistant', content: 'Error: Could not reach the AI server.' },
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
      setIsPlayingAudio(true);
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
      
      // Add event handler for playback status
      sound.current.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setIsPlayingAudio(false);
        }
      });
    } catch (err) {
      console.error('playElevenLabsAudio error:', err);
      setIsPlayingAudio(false);
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
      const resp = await fetch(`${SERVER_URL}/api/conversations/${conversationId}`, {
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

  function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function renderItem({ item, index }) {
    const isUser = item.role === 'user';
    const showTimestamp = index === 0 || 
      (index > 0 && messages[index-1].role !== item.role);
      
    return (
      <View
        style={[
          styles.messageContainer,
          isUser ? styles.userMessageContainer : styles.aiMessageContainer,
        ]}
      >
        {!isUser && showTimestamp && (
          <View style={styles.avatarContainer}>
            <LinearGradient
              colors={['#43435F', '#095684']}
              style={styles.avatarGradient}
            >
              <Text style={styles.avatarText}>AI</Text>
            </LinearGradient>
          </View>
        )}
        
        <View style={[
          styles.messageBubble,
          isUser ? styles.userMessage : styles.aiMessage,
        ]}>
          <Text style={[
            styles.messageText,
            isUser ? styles.userMessageText : styles.aiMessageText
          ]}>
            {item.content}
          </Text>
          
          {item.timestamp && (
            <Text style={styles.messageTimestamp}>
              {formatTimestamp(item.timestamp)}
            </Text>
          )}
        </View>
        
        {isUser && showTimestamp && (
          <View style={styles.avatarContainer}>
            <LinearGradient
              colors={['#5BDFD6', '#095684']}
              style={styles.avatarGradient}
            >
              <Text style={styles.avatarText}>You</Text>
            </LinearGradient>
          </View>
        )}
      </View>
    );
  }

  function renderVoiceItem({ item }) {
    const isSelected = item.voiceId === currentVoiceId;
    
    return (
      <TouchableOpacity
        style={[
          styles.voiceItem,
          isSelected && styles.voiceItemSelected
        ]}
        onPress={() => onSelectVoice(item)}
        activeOpacity={0.7}
      >
        <LinearGradient
          colors={
            isSelected ? ['#5BDFD6', '#095684'] : ['#ffffff', '#f5f5f5']
          }
          style={styles.voiceItemGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.voiceIconWrapper}>
            <View style={[
              styles.voiceIcon,
              isSelected && styles.voiceIconSelected
            ]}>
              <Ionicons 
                name="mic" 
                size={20} 
                color={isSelected ? '#ffffff' : '#43435F'} 
              />
            </View>
          </View>
          <Text style={[
            styles.voiceName,
            isSelected && styles.voiceNameSelected
          ]}>
            {item.name || 'Unnamed Voice'}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  const selectedVoiceName =
    availableVoices.find((v) => v.voiceId === currentVoiceId)?.name || 'None';

  if (initialLoading) {
    return (
      <LinearGradient colors={['#D9D0E7', '#D8B9E1']} style={styles.gradient}>
        <StatusBar barStyle="dark-content" />
        <SafeAreaView style={styles.container}>
          <View style={styles.loadingContainer}>
            <View style={styles.loadingIndicatorWrapper}>
              <ActivityIndicator size="large" color="#43435F" />
            </View>
            <Text style={styles.loadingText}>Loading conversation...</Text>
            <Text style={styles.loadingSubtext}>Just a moment while we retrieve your messages</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#D9D0E7', '#D8B9E1']} style={styles.gradient}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity 
              onPress={() => navigation.goBack()}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color="#43435F" />
            </TouchableOpacity>
            
            <View style={styles.titleContainer}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {persona?.speakerName || 'AI Conversation'}
              </Text>
            </View>
            
            <TouchableOpacity
              style={styles.selectVoiceButton}
              onPress={() => setVoiceModalVisible(true)}
            >
              <Ionicons name="options" size={24} color="#43435F" />
            </TouchableOpacity>
          </View>

          {/* Voice selection indicator */}
          <View style={styles.voiceSelectionBar}>
            <View style={styles.voiceSelectionContent}>
              <Ionicons name="mic" size={16} color="#095684" />
              <Text style={styles.voiceSelectionText}>
                {currentVoiceId 
                  ? `Voice: ${selectedVoiceName}` 
                  : 'No voice selected - Tap to choose a voice'
                }
              </Text>
              {isPlayingAudio && (
                <View style={styles.playingIndicator}>
                  <ActivityIndicator size="small" color="#5BDFD6" />
                </View>
              )}
            </View>
          </View>

          {/* Message List */}
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={(item, idx) => `message-${idx}`}
            style={styles.messagesList}
            contentContainerStyle={styles.messagesContent}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={10}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyConversationContainer}>
                <View style={styles.emptyIconContainer}>
                  <Ionicons name="chatbubbles-outline" size={50} color="#43435F" style={{opacity: 0.5}} />
                </View>
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptySubtitle}>Start the conversation by typing a message below</Text>
              </View>
            }
          />

          {/* Input Section */}
          <View style={styles.inputSection}>
            <View style={styles.inputContainer}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Type your message..."
                placeholderTextColor="#999"
                value={userInput}
                onChangeText={setUserInput}
                multiline
                maxHeight={100}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (!userInput.trim() || sending) && styles.sendButtonDisabled
                ]}
                onPress={() => sendMessage(userInput)}
                disabled={!userInput.trim() || sending}
              >
                <LinearGradient
                  colors={
                    userInput.trim() && !sending
                      ? ['#43435F', '#095684']
                      : ['#cccccc', '#999999']
                  }
                  style={styles.sendButtonGradient}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="send" size={20} color="#fff" />
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
            
            <View style={styles.inputOptionsContainer}>
              <TouchableOpacity 
                style={styles.inputOptionButton}
                onPress={() => setVoiceModalVisible(true)}
              >
                <Ionicons name="mic-outline" size={20} color="#43435F" />
                <Text style={styles.inputOptionText}>Voice</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.inputOptionButton}>
                <Ionicons name="image-outline" size={20} color="#43435F" />
                <Text style={styles.inputOptionText}>Image</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.inputOptionButton}>
                <Ionicons name="ellipsis-horizontal" size={20} color="#43435F" />
                <Text style={styles.inputOptionText}>More</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Voice selection modal */}
          <Modal
            visible={voiceModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setVoiceModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContainer}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select a Voice</Text>
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => setVoiceModalVisible(false)}
                  >
                    <Ionicons name="close" size={24} color="#43435F" />
                  </TouchableOpacity>
                </View>
                
                {voicesLoading ? (
                  <View style={styles.modalLoadingContainer}>
                    <ActivityIndicator size="large" color="#43435F" />
                    <Text style={styles.modalLoadingText}>Loading voices...</Text>
                  </View>
                ) : availableVoices.length === 0 ? (
                  <View style={styles.modalEmptyContainer}>
                    <Ionicons name="mic-off-outline" size={40} color="#43435F" style={{opacity: 0.5}} />
                    <Text style={styles.modalEmptyText}>
                      No voices available. Create a voice in Voice Cloning first.
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={availableVoices}
                    renderItem={renderVoiceItem}
                    keyExtractor={(item) => item._id || item.voiceId}
                    numColumns={2}
                    contentContainerStyle={styles.voicesGrid}
                  />
                )}
                
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setVoiceModalVisible(false)}
                >
                  <LinearGradient
                    colors={['#43435F', '#095684']}
                    style={styles.modalCloseButtonGradient}
                  >
                    <Text style={styles.modalCloseButtonText}>Close</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  // Header styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 4,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#43435F',
  },
  selectVoiceButton: {
    padding: 4,
  },
  // Voice selection bar
  voiceSelectionBar: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  voiceSelectionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  voiceSelectionText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#43435F',
    flex: 1,
  },
  playingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Messages list
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingTop: 8,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    maxWidth: '85%',
  },
  userMessageContainer: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  aiMessageContainer: {
    alignSelf: 'flex-start',
  },
  avatarContainer: {
    marginHorizontal: 8,
  },
  avatarGradient: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  messageBubble: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingBottom: 22, // Extra space for timestamp
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
    position: 'relative',
  },
  userMessage: {
    backgroundColor: '#5BDFD6',
    borderBottomRightRadius: 4,
  },
  aiMessage: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#fff',
  },
  aiMessageText: {
    color: '#43435F',
  },
  messageTimestamp: {
    position: 'absolute',
    right: 10,
    bottom: 4,
    fontSize: 10,
    color: 'rgba(0, 0, 0, 0.4)',
  },
  // Empty conversation state
  emptyConversationContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    marginTop: 40,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#43435F',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#095684',
    textAlign: 'center',
    opacity: 0.8,
  },
  // Input section
  inputSection: {
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingRight: 40,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#eaeaea',
    maxHeight: 100,
  },
  sendButton: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    borderRadius: 20,
    overflow: 'hidden',
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
  sendButtonGradient: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputOptionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  inputOptionButton: {
    alignItems: 'center',
  },
  inputOptionText: {
    fontSize: 12,
    color: '#43435F',
    marginTop: 4,
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
    maxHeight: '80%',
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
  voicesGrid: {
    paddingVertical: 8,
  },
  voiceItem: {
    width: '48%',
    aspectRatio: 1,
    marginBottom: 12,
    marginHorizontal: '1%',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  voiceItemSelected: {
    shadowColor: '#5BDFD6',
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
    padding: 10,
  },
  voiceIconWrapper: {
    marginBottom: 12,
  },
  voiceIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceIconSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  voiceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#43435F',
    textAlign: 'center',
  },
  voiceNameSelected: {
    color: '#fff',
  },
  modalLoadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  modalLoadingText: {
    marginTop: 10,
    color: '#43435F',
    fontSize: 16,
  },
  modalEmptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  modalEmptyText: {
    marginTop: 10,
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalCloseButton: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  modalCloseButtonGradient: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Loading screen
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#43435F',
    marginBottom: 8,
    textAlign: 'center',
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#095684',
    textAlign: 'center',
    opacity: 0.8,
  },
});