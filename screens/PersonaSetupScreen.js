// screens/PersonaSetupScreen.js

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { getToken } from '../authStorage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';

import ENV from './env';
const SERVER_URL = ENV.SERVER_URL;

// Helper function to get environment variables
const getEnvVariables = () => {
  if (Constants.manifest?.extra) {
    // Development environment
    return Constants.manifest.extra;
  } else if (Constants.expoConfig?.extra) {
    // Production environment
    return Constants.expoConfig.extra;
  } else {
    throw new Error('Environment variables are not defined');
  }
};

const { ELEVENLABS_API_KEY } = getEnvVariables();

// Optional: Throw an error if API key is missing
if (!ELEVENLABS_API_KEY) {
  throw new Error('ELEVENLABS_API_KEY is not loaded. Please check your .env file.');
}

// An array of preset persona types for easy selection
const COMMON_PERSONAS = [
  { label: 'Friendly & Cheerful', traits: 'friendly, cheerful, approachable' },
  { label: 'Sarcastic & Witty', traits: 'sarcastic, witty, playful' },
  { label: 'Stoic & Wise', traits: 'calm, composed, wise' },
  { label: 'Bubbly & Energetic', traits: 'bubbly, energetic, enthusiastic' },
  { label: 'Sassy & Bold', traits: 'sassy, bold, outspoken' },
  { label: 'Professional & Polite', traits: 'professional, polite, informative' },
];

export default function PersonaSetupScreen({ route, navigation }) {
  const {
    localFile = null,
    voiceId = null,
    existingPersona = null,
  } = route.params || {};

  const [speakerName, setSpeakerName] = useState(
    existingPersona?.speakerName || ''
  );
  const [traits, setTraits] = useState(existingPersona?.traits || '');

  const [isCloning, setIsCloning] = useState(false);
  const [cloneProgress, setCloneProgress] = useState(0);
  const [newVoiceId, setNewVoiceId] = useState(voiceId || '');

  // Fake progress so user sees a bit of "action"
  useEffect(() => {
    let interval;
    if (isCloning) {
      setCloneProgress(0);
      interval = setInterval(() => {
        setCloneProgress((prev) => {
          if (prev < 80) return prev + 5;
          clearInterval(interval);
          return prev;
        });
      }, 300);
    }
    return () => clearInterval(interval);
  }, [isCloning]);

  // If editing an existing voice, just PATCH persona
  async function handleSavePersonaForExistingVoice() {
    try {
      const token = await getToken();
      const resp = await fetch(`${BACKEND_URL}/voices/${voiceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: speakerName,
          persona: { speakerName, traits },
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        console.error('PATCH error:', data);
        throw new Error(data.error || 'Failed to update persona');
      }

      Alert.alert('Updated', 'Persona updated successfully!');
      navigation.goBack();
    } catch (err) {
      console.error('handleSavePersonaForExistingVoice error:', err);
      Alert.alert('Error', err.message);
    }
  }

  // If new localFile => create new voice on ElevenLabs
  async function handleSaveAndCloneNewVoice() {
    if (!localFile || !localFile.uri) {
      Alert.alert('Error', 'No local file found.');
      return;
    }
    if (!speakerName.trim()) {
      Alert.alert('Error', 'Please provide a speaker name.');
      return;
    }

    setIsCloning(true);

    try {
      // 1) Convert local file to base64
      const base64Data = await FileSystem.readAsStringAsync(localFile.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // 2) Build form-data for ElevenLabs
      const formData = new FormData();
      formData.append('name', speakerName || 'MyClonedVoice');
      formData.append('files', {
        uri: `data:audio/mpeg;base64,${base64Data}`,
        name: localFile.name || 'audio_file.mp3',
        type: 'audio/mpeg',
      });

      // 3) Call ElevenLabs
      const resp = await fetch('https://api.elevenlabs.io/v1/voices/add', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'multipart/form-data',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok) {
        console.error('ElevenLabs error response:', data);
        throw new Error(data.error || 'Failed to create voice.');
      }

      const createdVoiceId = data.voice_id;
      setCloneProgress(100);
      setNewVoiceId(createdVoiceId);

      // 4) Save voice + persona to DB
      const token = await getToken();
      const saveResp = await fetch(`${BACKEND_URL}/voices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          voiceId: createdVoiceId,
          name: speakerName,
          persona: { speakerName, traits },
        }),
      });
      const saveData = await saveResp.json();
      if (!saveResp.ok) {
        console.error('Error saving voice to DB:', saveData);
        throw new Error(saveData.error || 'Failed to save voice to DB.');
      }

      Alert.alert('Voice Created', `New Voice ID: ${createdVoiceId}`);
    } catch (err) {
      console.error('handleSaveAndCloneNewVoice error:', err);
      Alert.alert('Error', err.message);
    } finally {
      setIsCloning(false);
    }
  }

  function handleTestConversation() {
    navigation.navigate('AIConversation', {
      voiceId: newVoiceId,
      persona: { speakerName, traits },
    });
  }

  function handleGoHome() {
    navigation.navigate('Home');
  }

  // Distinguish between editing existing or new creation
  const isEditingExisting = !!(voiceId && !localFile);
  const isCreatingNew = !!localFile;

  // If just created a new voice, show "Test in AI" or "Go Home"
  if (newVoiceId && isCloning === false && isCreatingNew) {
    return (
      <LinearGradient
        colors={['#f5f7fa', '#c3cfe2']} // Same gradient as HomeScreen
        style={styles.gradient}
      >
        <StatusBar barStyle="dark-content" />
        <SafeAreaView style={styles.successContainer}>
          <Ionicons name="checkmark-circle-outline" size={100} color="#28a745" />
          <Text style={styles.successTitle}>Voice Cloned Successfully!</Text>
          <Text style={styles.successSubtitle}>Voice ID: {newVoiceId}</Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleTestConversation}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubbles-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>Test in AI Conversation</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleGoHome}
            activeOpacity={0.8}
          >
            <Ionicons name="home-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.secondaryButtonText}>Go Back Home</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={['#f5f7fa', '#c3cfe2']} // Same gradient as HomeScreen
      style={styles.gradient}
    >
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.container}>
        {/* Header can be added here if needed */}

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>
            {isEditingExisting ? 'Edit Persona' : 'Persona Setup'}
          </Text>
          <Text style={styles.subtitle}>
            {isEditingExisting
              ? 'Update the persona for this existing voice.'
              : 'Define personality before cloning.'}
          </Text>

          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={20} color="#333" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Speaker Name (e.g., Sarah)"
              placeholderTextColor="#999"
              value={speakerName}
              onChangeText={setSpeakerName}
            />
          </View>

          {/* Quick persona selection */}
          <Text style={styles.sectionTitle}>Select a Persona Type:</Text>
          <ScrollView horizontal style={styles.personaScroll} showsHorizontalScrollIndicator={false}>
            {COMMON_PERSONAS.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={styles.personaButtonWrapper}
                onPress={() => setTraits(item.traits)}
                activeOpacity={0.8}
              >
                <View style={styles.personaButton}>
                  <Text style={styles.personaButtonText}>{item.label}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={styles.hintText}>Or type your own traits:</Text>

          <View style={styles.textAreaContainer}>
            <Ionicons name="chatbubble-outline" size={20} color="#333" style={styles.textAreaIcon} />
            <TextInput
              style={styles.textArea}
              placeholder="Describe personality traits (e.g., witty, sarcastic)"
              placeholderTextColor="#999"
              multiline
              value={traits}
              onChangeText={setTraits}
            />
          </View>

          {/* Action Buttons */}
          {isCreatingNew && !newVoiceId && !isCloning && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleSaveAndCloneNewVoice}
              activeOpacity={0.8}
            >
              <Ionicons name="save-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.primaryButtonText}>Save & Clone Voice</Text>
            </TouchableOpacity>
          )}

          {isEditingExisting && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleSavePersonaForExistingVoice}
              activeOpacity={0.8}
            >
              <Ionicons name="save-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.secondaryButtonText}>Save Persona</Text>
            </TouchableOpacity>
          )}

          {isCloning && (
            <View style={styles.cloneProgressContainer}>
              <ActivityIndicator size="large" color="#5f5fc4" />
              <Text style={styles.cloneProgressText}>Cloning Voice... {cloneProgress}%</Text>
            </View>
          )}

          {isEditingExisting && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-back-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.cancelButtonText}>Cancel / Go Back</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

/**************************************************
 * STYLES
 **************************************************/
const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 16,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  title: {
    fontSize: 24,
    marginBottom: 8,
    textAlign: 'center',
    fontWeight: '700',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
    color: '#666',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  sectionTitle: {
    fontSize: 16,
    marginBottom: 8,
    color: '#333',
  },
  personaScroll: {
    marginBottom: 16,
  },
  personaButtonWrapper: {
    marginRight: 12,
  },
  personaButton: {
    backgroundColor: '#5f5fc4',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  personaButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  hintText: {
    marginBottom: 8,
    color: '#555',
    fontSize: 14,
  },
  textAreaContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  textAreaIcon: {
    marginTop: 4,
    marginRight: 8,
  },
  textArea: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    height: 100,
    textAlignVertical: 'top',
  },
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: '#5f5fc4',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,

    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,

    // Elevation for Android
    elevation: 5,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    backgroundColor: '#28a745',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,

    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,

    // Elevation for Android
    elevation: 5,
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cloneProgressContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  cloneProgressText: {
    marginTop: 8,
    color: '#333',
    fontSize: 14,
  },
  cancelButton: {
    flexDirection: 'row',
    backgroundColor: '#dc3545',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',

    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,

    // Elevation for Android
    elevation: 5,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginTop: 16,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
});
