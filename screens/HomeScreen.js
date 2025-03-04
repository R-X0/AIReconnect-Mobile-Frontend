// screens/HomeScreen.js

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
  Pressable,
  ScrollView,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getToken } from '../authStorage';
import { useIsFocused } from '@react-navigation/native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import ENV from './env';
const SERVER_URL = ENV.SERVER_URL;

export default function HomeScreen({ navigation }) {
  const [clonedVoices, setClonedVoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [voicesCollapsed, setVoicesCollapsed] = useState(true);
  const [infoVisible, setInfoVisible] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState(null);

  const isFocused = useIsFocused();
  useEffect(() => {
    if (isFocused) {
      fetchMyVoices();
    }
  }, [isFocused]);

  async function fetchMyVoices() {
    setLoading(true);
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
        setClonedVoices(data.voices || []);
      }
    } catch (err) {
      console.error('fetchMyVoices exception:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteVoice() {
    if (!selectedVoiceId) return;
    try {
      const token = await getToken();
      const resp = await fetch(`${BACKEND_URL}/voices/${selectedVoiceId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Failed to delete voice');
      }
      setClonedVoices((prev) => prev.filter((v) => v._id !== selectedVoiceId));
    } catch (error) {
      console.error('Delete error:', error);
      Alert.alert('Error', error.message || 'Failed to delete voice');
    } finally {
      setIsSelecting(false);
      setSelectedVoiceId(null);
    }
  }

  function handleConversation(voice) {
    navigation.navigate('AIConversation', {
      conversationId: voice.conversationId,
    });
  }

  function handleCall(voice) {
    navigation.navigate('CallScreen', { voiceId: voice.voiceId });
  }

  function handleEditPersona(voice) {
    navigation.navigate('PersonaSetupScreen', {
      voiceId: voice.voiceId,
      existingPersona: voice.persona,
    });
  }

  function toggleVoices() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setVoicesCollapsed(!voicesCollapsed);
  }

  function toggleInfoBubble() {
    setInfoVisible(!infoVisible);
  }

  function renderVoiceItem({ item }) {
    const isSelected = item._id === selectedVoiceId;
    return (
      <TouchableOpacity
        style={[
          styles.voiceItem,
          isSelected && { backgroundColor: 'rgba(255, 0, 0, 0.1)' },
        ]}
        onLongPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setIsSelecting(true);
          setSelectedVoiceId(item._id);
        }}
        onPress={() => {
          if (!isSelecting) {
            handleConversation(item);
          }
        }}
      >
        <Ionicons name="musical-notes" size={24} color="#fff" style={styles.voiceIcon} />
        <View style={{ flex: 1 }}>
          <Text style={styles.voiceName}>{item.name || 'Untitled Voice'}</Text>
          <Text style={styles.voiceId}>Voice ID: {item.voiceId}</Text>
        </View>

        {!isSelecting && (
          <View style={styles.actionsContainer}>
            <TouchableOpacity style={styles.actionButton} onPress={() => handleConversation(item)}>
              <Ionicons name="chatbox-ellipses" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => handleCall(item)}>
              <Ionicons name="call" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => handleEditPersona(item)}>
              <Ionicons name="create-outline" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <LinearGradient colors={['#f5f7fa', '#c3cfe2']} style={styles.gradient}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.container}>

        {isSelecting && (
          <View style={styles.deleteButtonContainer}>
            <TouchableOpacity onPress={handleDeleteVoice} style={styles.deleteIconWrapper}>
              <Ionicons name="trash-bin" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.infoIconWrapper} onPress={toggleInfoBubble}>
          <Ionicons name="information-circle" size={28} color="#333" />
        </TouchableOpacity>

        {infoVisible && (
          <View style={styles.infoBubble}>
            <Text style={styles.infoBubbleText}>
              AI Reconnect lets you upload audio/video, clone voices,
              customize personalities, and chat or call with those voices in real time.
            </Text>
          </View>
        )}

        <ScrollView contentContainerStyle={{ paddingBottom: 90 }}>
          <View style={styles.heroSection}>
            <Ionicons name="mic-circle" size={60} color="#5f5fc4" style={{ marginBottom: 10 }} />
            <Text style={styles.heroTitle}>AI Reconnect</Text>
            <Text style={styles.heroSubtitle}>Your AI-driven voice companion</Text>
          </View>

          <TouchableOpacity
            style={styles.mainFeatureCard}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('WizardFlow')}
          >
            <Ionicons name="walk-outline" size={36} color="#4e4e58" style={{ marginBottom: 10 }} />
            <Text style={styles.mainFeatureTitle}>Get Started</Text>
            <Text style={styles.mainFeatureDesc}>
              Step-by-step guide for uploading media, confirming speakers,
              cloning a voice, and starting a conversation.
            </Text>
          </TouchableOpacity>

          <View style={styles.featureRow}>
            <TouchableOpacity
              style={styles.featureButton}
              onPress={() => navigation.navigate('MediaAndVoiceCloning')}
            >
              <Ionicons name="cloud-upload-outline" size={20} color="#4e4e58" />
              <Text style={styles.featureButtonText}>Media Clone</Text>
              <Text style={styles.featureButtonSubtitle}>Clone from media</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.featureButton}
              onPress={() => navigation.navigate('Conversations')}
            >
              <Ionicons name="chatbubbles" size={20} color="#4e4e58" />
              <Text style={styles.featureButtonText}>AI Chat</Text>
              <Text style={styles.featureButtonSubtitle}>Talk in a cloned voice</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.featureButton}
              onPress={() => navigation.navigate('CallScreen')}
            >
              <Ionicons name="call" size={20} color="#4e4e58" />
              <Text style={styles.featureButtonText}>AI Call</Text>
              <Text style={styles.featureButtonSubtitle}>Make an AI phone call</Text>
            </TouchableOpacity>
          </View>

          {/* Second row of feature buttons */}
          <View style={styles.featureRow}>
            <TouchableOpacity style={styles.featureButton} onPress={toggleVoices}>
              <Ionicons
                name={voicesCollapsed ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                size={20}
                color="#4e4e58"
              />
              <Text style={styles.featureButtonText}>My Voices</Text>
              <Text style={styles.featureButtonSubtitle}>Manage clones</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.featureButton}
              onPress={() => navigation.navigate('AIVideoGeneration')}
            >
              <Ionicons name="film" size={20} color="#4e4e58" />
              <Text style={styles.featureButtonText}>Images & Videos</Text>
              <Text style={styles.featureButtonSubtitle}>
                Generate AI images and videos of yourself
              </Text>
            </TouchableOpacity>

            {/* Live AI button */}
            <TouchableOpacity
              style={styles.featureButton}
              onPress={() => navigation.navigate('LiveAiConversation')}
            >
              <Ionicons name="videocam" size={20} color="#4e4e58" />
              <Text style={styles.featureButtonText}>Live AI</Text>
              <Text style={styles.featureButtonSubtitle}>HeyGen + LiveKit</Text>
            </TouchableOpacity>
          </View>

          {/* Conditionally render My Voices list */}
          {!voicesCollapsed && (
            <View style={styles.myVoicesContainer}>
              <Text style={styles.myVoicesTitle}>My Cloned Voices</Text>
              {loading ? (
                <ActivityIndicator color="#333" style={{ marginTop: 10 }} />
              ) : clonedVoices.length === 0 ? (
                <Text style={styles.emptyText}>No voices cloned yet.</Text>
              ) : (
                <FlatList
                  data={clonedVoices}
                  renderItem={renderVoiceItem}
                  keyExtractor={(item) => item._id}
                  scrollEnabled={false}
                />
              )}
            </View>
          )}
        </ScrollView>

        {/* Overlay for selection mode */}
        <Pressable
          style={styles.overlay}
          pointerEvents={isSelecting ? 'auto' : 'none'}
          onPress={() => {
            if (isSelecting) {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setIsSelecting(false);
              setSelectedVoiceId(null);
            }
          }}
        >
          {/* Empty */}
        </Pressable>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  deleteButtonContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 9999,
    backgroundColor: '#e91e63',
    borderRadius: 40,
    padding: 10,
  },
  deleteIconWrapper: {},
  infoIconWrapper: {
    position: 'absolute',
    top: 12,
    right: 16,
    zIndex: 9999,
  },
  infoBubble: {
    position: 'absolute',
    top: 50,
    right: 16,
    width: 230,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 8,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  infoBubbleText: {
    color: '#333',
    fontSize: 14,
    lineHeight: 18,
  },
  heroSection: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  mainFeatureCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 20,
    paddingVertical: 24,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 4.65,
    elevation: 6,
    alignItems: 'center',
  },
  mainFeatureTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  mainFeatureDesc: {
    color: '#777',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  featureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 10,
  },
  featureButton: {
    backgroundColor: '#fff',
    width: '31%',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 4.65,
    elevation: 5,
  },
  featureButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 6,
  },
  featureButtonSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  myVoicesContainer: {
    backgroundColor: '#f4f4f4',
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2.84,
    elevation: 4,
  },
  myVoicesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyText: {
    color: '#555',
    textAlign: 'center',
    marginTop: 8,
    fontSize: 14,
  },
  voiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B3B98',
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  voiceIcon: {
    marginRight: 10,
  },
  voiceName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  voiceId: {
    color: '#ddd',
    fontSize: 12,
    marginTop: 2,
  },
  actionsContainer: {
    flexDirection: 'row',
    marginLeft: 12,
  },
  actionButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 6,
    marginLeft: 8,
    padding: 6,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
  },
});

