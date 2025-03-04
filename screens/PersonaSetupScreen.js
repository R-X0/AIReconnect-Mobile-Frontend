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
  const [selectedPersonaIndex, setSelectedPersonaIndex] = useState(-1);

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

  function selectPersona(index) {
    setSelectedPersonaIndex(index);
    setTraits(COMMON_PERSONAS[index].traits);
  }

  // Distinguish between editing existing or new creation
  const isEditingExisting = !!(voiceId && !localFile);
  const isCreatingNew = !!localFile;

  // If just created a new voice, show "Test in AI" or "Go Home"
  if (newVoiceId && isCloning === false && isCreatingNew) {
    return (
      <LinearGradient
        colors={['#D9D0E7', '#D8B9E1']}
        style={styles.gradient}
      >
        <StatusBar barStyle="dark-content" />
        <SafeAreaView style={styles.container}>
          <View style={styles.successContainer}>
            <View style={styles.successIconContainer}>
              <Ionicons name="checkmark-circle" size={80} color="#5BDFD6" />
            </View>
            <Text style={styles.successTitle}>Voice Cloned Successfully!</Text>
            <Text style={styles.successSubtitle}>{speakerName}'s voice is ready to use</Text>
            
            <View style={styles.voiceIdCard}>
              <Text style={styles.voiceIdLabel}>Voice ID:</Text>
              <Text style={styles.voiceIdText}>{newVoiceId}</Text>
            </View>

            <View style={styles.actionButtonsContainer}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleTestConversation}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#43435F', '#095684']}
                  style={styles.actionButtonGradient}
                  start={{x: 0, y: 0}}
                  end={{x: 1, y: 0}}
                >
                  <Ionicons name="chatbubbles" size={24} color="#fff" style={{marginBottom: 8}} />
                  <Text style={styles.actionButtonText}>Test in Conversation</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleGoHome}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#5BDFD6', '#095684']}
                  style={styles.actionButtonGradient}
                  start={{x: 0, y: 0}}
                  end={{x: 1, y: 0}}
                >
                  <Ionicons name="home" size={24} color="#fff" style={{marginBottom: 8}} />
                  <Text style={styles.actionButtonText}>Go to Home</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={['#D9D0E7', '#D8B9E1']}
      style={styles.gradient}
    >
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {isEditingExisting ? 'Edit Persona' : 'Create Voice Persona'}
            </Text>
            <Text style={styles.headerSubtitle}>
              {isEditingExisting
                ? 'Update the personality traits for this voice'
                : 'Define how your AI voice will sound and behave'}
            </Text>
          </View>

          <View style={styles.formCard}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Voice Name</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person" size={20} color="#43435F" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Sarah, John, Mom..."
                  placeholderTextColor="#999"
                  value={speakerName}
                  onChangeText={setSpeakerName}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Choose a Personality</Text>
              <Text style={styles.inputSubLabel}>Select one or customize below</Text>
              
              <View style={styles.personaButtonsContainer}>
                {COMMON_PERSONAS.map((persona, index) => (
                  <TouchableOpacity
                    key={persona.label}
                    style={[
                      styles.personaButton,
                      selectedPersonaIndex === index && styles.personaButtonSelected
                    ]}
                    onPress={() => selectPersona(index)}
                    activeOpacity={0.7}
                  >
                    <LinearGradient
                      colors={
                        selectedPersonaIndex === index 
                        ? ['#5BDFD6', '#43435F'] 
                        : ['#fff', '#fff']
                      }
                      style={styles.personaButtonGradient}
                    >
                      <Text 
                        style={[
                          styles.personaButtonText,
                          selectedPersonaIndex === index && styles.personaButtonTextSelected
                        ]}
                      >
                        {persona.label}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Personality Traits</Text>
              <Text style={styles.inputSubLabel}>Describe the personality in detail</Text>
              
              <View style={styles.textAreaContainer}>
                <TextInput
                  style={styles.textArea}
                  placeholder="e.g., friendly, witty, calm, energetic, professional..."
                  placeholderTextColor="#999"
                  multiline
                  value={traits}
                  onChangeText={setTraits}
                  textAlignVertical="top"
                />
              </View>
            </View>

            {isCreatingNew && !isCloning && (
              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSaveAndCloneNewVoice}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#43435F', '#095684']}
                  style={styles.submitButtonGradient}
                  start={{x: 0, y: 0}}
                  end={{x: 1, y: 0}}
                >
                  <Ionicons name="save" size={22} color="#fff" style={styles.submitButtonIcon} />
                  <Text style={styles.submitButtonText}>Clone Voice</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {isEditingExisting && (
              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSavePersonaForExistingVoice}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#5BDFD6', '#095684']}
                  style={styles.submitButtonGradient}
                  start={{x: 0, y: 0}}
                  end={{x: 1, y: 0}}
                >
                  <Ionicons name="save" size={22} color="#fff" style={styles.submitButtonIcon} />
                  <Text style={styles.submitButtonText}>Save Changes</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {isCloning && (
              <View style={styles.cloningProgressContainer}>
                <View style={styles.progressBarContainer}>
                  <View 
                    style={[
                      styles.progressBar, 
                      { width: `${cloneProgress}%` }
                    ]} 
                  />
                </View>
                <View style={styles.progressTextContainer}>
                  <ActivityIndicator size="small" color="#5BDFD6" />
                  <Text style={styles.progressText}>
                    Cloning Voice... {cloneProgress}%
                  </Text>
                </View>
              </View>
            )}

            {isEditingExisting && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => navigation.goBack()}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#43435F',
    marginBottom: 8,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#095684',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#43435F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#43435F',
    marginBottom: 8,
  },
  inputSubLabel: {
    fontSize: 14,
    color: '#095684',
    marginBottom: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#eaeaea',
    height: 54,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  personaButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  personaButton: {
    width: '48%',
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  personaButtonSelected: {
    shadowColor: '#5BDFD6',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
  },
  personaButtonGradient: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personaButtonText: {
    color: '#43435F',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  personaButtonTextSelected: {
    color: '#fff',
  },
  textAreaContainer: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#eaeaea',
  },
  textArea: {
    fontSize: 16,
    color: '#333',
    height: 120,
  },
  submitButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  submitButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  submitButtonIcon: {
    marginRight: 10,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cloningProgressContainer: {
    marginVertical: 10,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#5BDFD6',
    borderRadius: 4,
  },
  progressTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressText: {
    marginLeft: 8,
    color: '#095684',
    fontSize: 14,
    fontWeight: '500',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 12,
  },
  cancelButtonText: {
    color: '#43435F',
    fontSize: 16,
    fontWeight: '500',
  },
  // Success screen styles
  successContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    marginTop: 40,
  },
  successIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(217, 208, 231, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#43435F',
    marginBottom: 8,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 16,
    color: '#095684',
    marginBottom: 24,
    textAlign: 'center',
  },
  voiceIdCard: {
    backgroundColor: 'rgba(217, 208, 231, 0.3)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 30,
    alignItems: 'center',
    width: '100%',
  },
  voiceIdLabel: {
    fontSize: 14,
    color: '#43435F',
    marginBottom: 4,
  },
  voiceIdText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#095684',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  actionButton: {
    width: '48%',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  actionButtonGradient: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});