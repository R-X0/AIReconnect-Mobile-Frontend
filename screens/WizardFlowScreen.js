import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';

import { getToken } from '../authStorage';

import ENV from './env';
const SERVER_URL = ENV.SERVER_URL;

// Example environment variable loading
const getEnvVariables = () => {
  if (Constants.manifest?.extra) {
    return Constants.manifest.extra;
  } else if (Constants.expoConfig?.extra) {
    return Constants.expoConfig.extra;
  }
  throw new Error('Environment variables are not defined');
};
const { OPENAI_API_KEY, ELEVENLABS_API_KEY } = getEnvVariables() || {};

export default function WizardFlowScreen({ navigation }) {
  // ---------------------------
  // Global Wizard State
  // ---------------------------
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Media Upload State
  const [files, setFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  const [processingFileUri, setProcessingFileUri] = useState(null);
  const [step1Complete, setStep1Complete] = useState(false);

  // Step 2: Diarization/Confirm Speaker
  const [diarizationModalVisible, setDiarizationModalVisible] = useState(false);
  const [speakerAudio, setSpeakerAudio] = useState([]);
  const [chosenSpeakerKey, setChosenSpeakerKey] = useState(null);
  const [step2Complete, setStep2Complete] = useState(false);

  // Step 3: Persona Setup / Voice Name
  const [speakerName, setSpeakerName] = useState('');
  const [speakerTraits, setSpeakerTraits] = useState('');
  const [newVoiceId, setNewVoiceId] = useState(null);
  const [step3Complete, setStep3Complete] = useState(false);

  // Audio playback (single toggle)
  const [sound, setSound] = useState(null);
  const [currentSpeakerKey, setCurrentSpeakerKey] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync().catch(() => {});
        }
      : undefined;
  }, [sound]);

  // ---------------------------
  // STEP 1: Upload Media
  // ---------------------------
  async function pickMediaFiles() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'video/*'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const pickedAssets = result.assets || [result];
      const newFiles = pickedAssets.map((item) => ({
        uri: item.uri,
        name: item.name ?? 'media-file',
        mimeType: item.mimeType ?? 'application/octet-stream',
        processed: false,
        s3Key: null,
      }));
      setFiles((prev) => [...prev, ...newFiles]);
      setStep1Complete(false);
    } catch (err) {
      console.error('Error picking files:', err);
      Alert.alert('Error', 'Could not pick files');
    }
  }

  async function pickFromCameraRoll() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'We need permission to access your camera roll to pick media.'
        );
        return;
      }

      const imagePickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsMultipleSelection: true,
      });

      if (!imagePickerResult.canceled) {
        const picked = imagePickerResult.assets || [imagePickerResult];
        const newFiles = picked.map((item) => ({
          uri: item.uri,
          name: item.fileName ?? 'camera-roll-video.mp4',
          mimeType: 'video/mp4',
          processed: false,
          s3Key: null,
        }));
        setFiles((prev) => [...prev, ...newFiles]);
        setStep1Complete(false);
      }
    } catch (err) {
      console.error('Error picking from camera roll:', err);
      Alert.alert('Error', 'Could not pick from camera roll');
    }
  }

  useEffect(() => {
    // Mark step1Complete if all files have been processed
    if (files.length > 0 && files.every((f) => f.processed)) {
      setStep1Complete(true);
    } else {
      setStep1Complete(false);
    }
  }, [files]);

  async function handleUploadAndProcessAll() {
    if (files.length === 0) {
      Alert.alert('No Files', 'Please pick at least one file.');
      return;
    }

    setLoading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.processed) {
          const uploadData = await getSignedUrl(file);
          if (!uploadData) {
            Alert.alert('Error', 'Failed to get signed URL for ' + file.name);
            return;
          }
          const { signedUrl, key } = uploadData;
          await uploadFileToS3(file, signedUrl);
          await processFile(key, file);
        }
      }
      Alert.alert('All Done', 'All files uploaded and processed.');
      // optional auto-advance
      // setStep(2);
    } catch (error) {
      console.error('Error in handleUploadAndProcessAll:', error);
    } finally {
      setLoading(false);
    }
  }

  async function getSignedUrl(file) {
    try {
      const token = await getToken();
      const resp = await fetch(`${BACKEND_URL}/upload-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.mimeType,
        }),
      });
      const rawText = await resp.text();
      if (!resp.ok) {
        console.error('getSignedUrl error:', rawText);
        return null;
      }
      return JSON.parse(rawText);
    } catch (err) {
      console.error('getSignedUrl exception:', err);
      return null;
    }
  }

  async function uploadFileToS3(file, signedUrl) {
    console.log(`Uploading ${file.name} to S3...`);
    setUploadProgress((prev) => ({ ...prev, [file.uri]: 0 }));
    setProcessingFileUri(file.uri);

    const callback = (progressData) => {
      const progress =
        (progressData.totalBytesSent / progressData.totalBytesExpectedToSend) * 100;
      setUploadProgress((prev) => ({
        ...prev,
        [file.uri]: progress.toFixed(0),
      }));
    };

    try {
      const uploadRes = await FileSystem.uploadAsync(signedUrl, file.uri, {
        httpMethod: 'PUT',
        headers: { 'Content-Type': file.mimeType },
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        onUploadProgress: callback,
      });

      if (uploadRes.status !== 200) {
        throw new Error(`S3 upload failed with status ${uploadRes.status}`);
      }
      setUploadProgress((prev) => ({ ...prev, [file.uri]: '100' }));
      console.log(`${file.name} uploaded successfully!`);
    } catch (err) {
      console.error('uploadFileToS3 error:', err);
      Alert.alert('Upload Error', err.message);
      throw err;
    } finally {
      setProcessingFileUri(null);
    }
  }

  async function processFile(s3Key, file) {
    console.log('Processing file on server with key:', s3Key);
    setProcessingFileUri('processing-' + s3Key);

    try {
      const token = await getToken();
      const resp = await fetch(`${BACKEND_URL}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ s3Key }),
      });

      const rawText = await resp.text();
      if (!resp.ok) {
        throw new Error('Process error: ' + rawText);
      }
      const data = JSON.parse(rawText);

      console.log('processFile success:', data);
      // Mark as processed
      updateFileAsProcessed(file.uri, s3Key);

      // If diarization data is present, store it (for Step 2)
      if (data.speakerAudio && data.speakerAudio.length > 0) {
        setSpeakerAudio(data.speakerAudio);
      }
    } catch (err) {
      console.error('processFile exception:', err);
      Alert.alert('Process Error', err.message);
    } finally {
      setProcessingFileUri(null);
    }
  }

  function updateFileAsProcessed(uri, s3Key) {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.uri === uri) {
          return { ...f, processed: true, s3Key };
        }
        return f;
      })
    );
  }

  // ---------------------------
  // STEP 2: Confirm Speaker
  // ---------------------------
  function openDiarizationModal() {
    if (!speakerAudio.length) {
      Alert.alert('No Speakers Detected', 'No diarization data available.');
      return;
    }
    setDiarizationModalVisible(true);
  }

  function selectSpeaker(speakerItem) {
    setChosenSpeakerKey(speakerItem.s3Key);
  }

  async function handleConfirmSpeakers() {
    if (!chosenSpeakerKey) {
      Alert.alert('No Speaker Selected', 'Please select a speaker to confirm.');
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      const resp = await fetch(`${BACKEND_URL}/confirm-speakers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chosenSpeakerKey }),
      });

      const rawText = await resp.text();
      if (!resp.ok) {
        throw new Error(rawText);
      }

      Alert.alert('Saved!', 'Speaker labels have been updated.');
      setDiarizationModalVisible(false);
      setStep2Complete(true);

      // Download the chosen speaker's local file for Step 3
      const urlResp = await fetch(`${BACKEND_URL}/get-download-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ s3Key: chosenSpeakerKey }),
      });

      const urlText = await urlResp.text();
      if (!urlResp.ok) {
        throw new Error('get-download-url error: ' + urlText);
      }
      const urlData = JSON.parse(urlText);

      const { downloadUrl } = urlData;
      const localPath = FileSystem.cacheDirectory + 'chosenSpeaker.mp3';
      const downloadRes = await FileSystem.downloadAsync(downloadUrl, localPath);
      if (downloadRes.status !== 200) {
        throw new Error('Failed to download speaker file from S3');
      }
      // We can store the local path if needed or just proceed
    } catch (error) {
      console.error('handleConfirmSpeakers error:', error);
      Alert.alert('Error saving labels', error.message);
    } finally {
      setLoading(false);
    }
  }

  // Single toggle for playback
  async function toggleSpeakerAudio(item) {
    try {
      // If currently playing this same speaker, stop.
      if (isPlaying && currentSpeakerKey === item.s3Key) {
        await stopAudio();
        return;
      }

      // Otherwise, unload existing sound
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
      }

      // Load & play new speaker
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: item.url },
        { shouldPlay: true },
        (status) => {
          if (status.didJustFinish || status.isCancelled) {
            setIsPlaying(false);
            setCurrentSpeakerKey(null);
            newSound.unloadAsync().catch(() => {});
          }
        }
      );
      setSound(newSound);
      setIsPlaying(true);
      setCurrentSpeakerKey(item.s3Key);
    } catch (error) {
      console.error('toggleSpeakerAudio error:', error);
      Alert.alert('Playback Error', error.message);
    }
  }

  async function stopAudio() {
    if (sound) {
      try {
        await sound.stopAsync();
      } catch {}
      await sound.unloadAsync().catch(() => {});
      setSound(null);
    }
    setIsPlaying(false);
    setCurrentSpeakerKey(null);
  }

  // ---------------------------
  // STEP 3: Persona Setup & Clone
  // ---------------------------
  async function handleCloneNewVoice() {
    if (!speakerName.trim()) {
      Alert.alert('Error', 'Please provide a speaker name.');
      return;
    }
    if (!chosenSpeakerKey) {
      Alert.alert('Error', 'No speaker audio selected in Step 2.');
      return;
    }

    setLoading(true);
    try {
      // 1) Get the S3 download URL
      const token = await getToken();
      const urlResp = await fetch(`${BACKEND_URL}/get-download-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ s3Key: chosenSpeakerKey }),
      });
      if (!urlResp.ok) {
        const txt = await urlResp.text();
        throw new Error(`get-download-url failed: ${txt}`);
      }
      const { downloadUrl } = await urlResp.json();

      // 2) Download MP3 locally
      const localPath = FileSystem.cacheDirectory + 'speakerToClone.mp3';
      const downloadRes = await FileSystem.downloadAsync(downloadUrl, localPath);
      if (downloadRes.status !== 200) {
        throw new Error('Failed to download speaker file from S3');
      }

      // 3) Convert to base64
      const base64Data = await FileSystem.readAsStringAsync(localPath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // 4) Create voice on ElevenLabs
      const formData = new FormData();
      formData.append('name', speakerName);
      formData.append('files', {
        uri: `data:audio/mpeg;base64,${base64Data}`,
        name: 'audio_file.mp3',
        type: 'audio/mpeg',
      });

      const elevenResp = await fetch('https://api.elevenlabs.io/v1/voices/add', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'multipart/form-data',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: formData,
      });
      const eData = await elevenResp.json();
      if (!elevenResp.ok) {
        console.error('ElevenLabs error response:', eData);
        throw new Error(eData.error || 'Failed to create voice on ElevenLabs');
      }

      const createdVoiceId = eData.voice_id;
      console.log('Created voice ID:', createdVoiceId);

      // 5) Save to your backend DB
      const saveResp = await fetch(`${BACKEND_URL}/voices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          voiceId: createdVoiceId,
          name: speakerName,
          persona: { speakerName, traits: speakerTraits },
        }),
      });
      const saveData = await saveResp.json();
      if (!saveResp.ok) {
        throw new Error(
          saveData.error || 'Failed to save new voice in the backend DB'
        );
      }

      setNewVoiceId(createdVoiceId);
      setStep3Complete(true);
      Alert.alert('Success', `Voice cloned! Voice ID: ${createdVoiceId}`);
      // optional auto-advance
      // setStep(4);
    } catch (err) {
      console.error('handleCloneNewVoice error:', err);
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------
  // STEP 4: Start Conversation
  // ---------------------------
  function handleStartChat() {
    if (!newVoiceId) {
      Alert.alert('No Voice ID', 'Please clone the voice first.');
      return;
    }
    // Replace with your chat screen
    navigation.navigate('NewConversation', { voiceId: newVoiceId });
  }

  function handleStartCall() {
    if (!newVoiceId) {
      Alert.alert('No Voice ID', 'Please clone the voice first.');
      return;
    }
    navigation.navigate('CallScreen', { voiceId: newVoiceId });
  }

  function handleStartLiveConversation() {
    if (!newVoiceId) {
      Alert.alert('No Voice ID', 'Please clone the voice first.');
      return;
    }
    navigation.navigate('LiveConversation', { voiceId: newVoiceId });
  }

  // ---------------------------
  // "Next" Button Enable/Disable Logic
  // ---------------------------
  const canProceed = useMemo(() => {
    switch (step) {
      case 1:
        return step1Complete;
      case 2:
        return step2Complete;
      case 3:
        return step3Complete;
      default:
        return false;
    }
  }, [step, step1Complete, step2Complete, step3Complete]);

  // ---------------------------
  // RENDER STEPS
  // ---------------------------
  function renderStepOne() {
    return (
      <View style={{ marginTop: 16 }}>
        <Text style={styles.stepTitle}>Step 1: Upload Media</Text>
        <Text style={styles.stepSubTitle}>
          Select audio or video files to be diarized and cloned.
        </Text>

        <View style={{ marginVertical: 12 }}>
          <TouchableOpacity style={styles.button} onPress={pickMediaFiles}>
            <Ionicons
              name="document-text-outline"
              size={20}
              color="#fff"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.buttonText}>Pick Files</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={pickFromCameraRoll}>
            <Ionicons
              name="image-outline"
              size={20}
              color="#fff"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.buttonText}>Pick from Gallery</Text>
          </TouchableOpacity>
        </View>

        {files.length > 0 && (
          <View style={styles.fileList}>
            <Text style={{ fontWeight: '600', marginBottom: 8 }}>
              Selected Files:
            </Text>
            {files.map((item, idx) => (
              <View key={item.uri + idx} style={styles.fileItem}>
                <Ionicons
                  name="document-text-outline"
                  size={20}
                  color="#333"
                  style={{ marginRight: 10 }}
                />
                <Text style={{ flex: 1 }}>{item.name}</Text>
                <Text>{uploadProgress[item.uri] || 0}%</Text>
              </View>
            ))}
          </View>
        )}

        {files.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <TouchableOpacity
              style={styles.buttonAlt}
              onPress={handleUploadAndProcessAll}
            >
              <Ionicons
                name="cloud-upload-outline"
                size={20}
                color="#fff"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.buttonText}>Upload &amp; Process</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  function renderStepTwo() {
    // Single toggle inside speaker items
    const renderSpeakerItem = (item, i) => {
      const speakerIsPlaying = isPlaying && currentSpeakerKey === item.s3Key;
      return (
        <View
          key={`speaker-${i}`}
          style={[
            styles.speakerItem,
            item.s3Key === chosenSpeakerKey && { backgroundColor: '#c1f0c1' },
          ]}
        >
          <Text style={{ flex: 1, color: '#333' }}>Speaker {item.speaker}</Text>
          <TouchableOpacity
            style={styles.playButton}
            onPress={() => toggleSpeakerAudio(item)}
          >
            <Ionicons
              name={speakerIsPlaying ? 'pause' : 'play'}
              size={16}
              color="#fff"
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.selectButton}
            onPress={() => selectSpeaker(item)}
          >
            <Ionicons name="checkmark" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      );
    };

    return (
      <View style={{ marginTop: 16 }}>
        <Text style={styles.stepTitle}>Step 2: Confirm Speaker Labels</Text>
        <Text style={styles.stepSubTitle}>
          Listen to each speaker snippet and confirm which one to clone.
        </Text>

        {speakerAudio.length === 0 ? (
          <Text style={{ marginTop: 20 }}>
            No speaker segments found. Make sure you processed the file in Step 1.
          </Text>
        ) : (
          <>
            <TouchableOpacity style={styles.button} onPress={openDiarizationModal}>
              <Ionicons
                name="people-circle-outline"
                size={20}
                color="#fff"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.buttonText}>Select Speaker</Text>
            </TouchableOpacity>

            {/* Speaker Modal */}
            <Modal
              visible={diarizationModalVisible}
              animationType="slide"
              transparent
              onRequestClose={() => setDiarizationModalVisible(false)}
            >
              <View style={styles.modalBackground}>
                <View style={styles.modalContainer}>
                  <Text style={styles.modalTitle}>Select Speaker</Text>
                  <View style={{ marginTop: 16 }}>
                    {speakerAudio.map((speakerItem, idx) =>
                      renderSpeakerItem(speakerItem, idx)
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => setDiarizationModalVisible(false)}
                    style={[styles.buttonAlt, { marginTop: 20 }]}
                  >
                    <Text style={styles.buttonText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          </>
        )}

        <TouchableOpacity
          style={[styles.buttonAlt, { marginTop: 20 }]}
          onPress={handleConfirmSpeakers}
        >
          <Ionicons
            name="checkmark-circle-outline"
            size={20}
            color="#fff"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.buttonText}>Confirm Speakers</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderStepThree() {
    return (
      <View style={{ marginTop: 16 }}>
        <Text style={styles.stepTitle}>Step 3: Name &amp; Clone Voice</Text>
        <Text style={styles.stepSubTitle}>
          Give your AI voice a name and optional personality traits.
        </Text>

        <View style={styles.inputContainer}>
          <Ionicons
            name="person-outline"
            size={20}
            color="#333"
            style={{ marginRight: 8 }}
          />
          <TextInput
            style={styles.input}
            placeholder="Speaker Name (e.g., Sarah)"
            placeholderTextColor="#999"
            value={speakerName}
            onChangeText={setSpeakerName}
          />
        </View>

        <View
          style={[styles.inputContainer, { height: 100, alignItems: 'flex-start' }]}
        >
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={20}
            color="#333"
            style={{ marginRight: 8 }}
          />
          <TextInput
            style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
            placeholder="Traits (e.g., friendly, witty, calm...)"
            placeholderTextColor="#999"
            multiline
            value={speakerTraits}
            onChangeText={setSpeakerTraits}
          />
        </View>

        <TouchableOpacity style={styles.buttonAlt} onPress={handleCloneNewVoice}>
          <Ionicons name="mic-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.buttonText}>Clone Voice</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderStepFour() {
    return (
      <View style={{ marginTop: 16 }}>
        <Text style={styles.stepTitle}>Step 4: Start Conversation</Text>
        <Text style={styles.stepSubTitle}>
          Your voice is ready! Choose how you want to interact with it.
        </Text>

        <TouchableOpacity style={styles.button} onPress={handleStartChat}>
          <Ionicons
            name="chatbubble-ellipses"
            size={20}
            color="#fff"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.buttonText}>Start AI Chat</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={handleStartCall}>
          <Ionicons name="call" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.buttonText}>Start AI Call</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={handleStartLiveConversation}>
          <Ionicons
            name="people-circle-outline"
            size={20}
            color="#fff"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.buttonText}>Live Conversation</Text>
        </TouchableOpacity>

        <Text style={{ marginTop: 20, color: '#666' }}>
          Voice ID: {newVoiceId || '(not cloned yet)'}
        </Text>
      </View>
    );
  }

  // ---------------------------
  // MAIN RENDER
  // ---------------------------
  return (
    <LinearGradient colors={['#f5f7fa', '#c3cfe2']} style={styles.gradient}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.mainTitle}>Voice Cloning Wizard</Text>

        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          {step === 1 && renderStepOne()}
          {step === 2 && renderStepTwo()}
          {step === 3 && renderStepThree()}
          {step === 4 && renderStepFour()}
        </ScrollView>

        {/* Navigation Buttons */}
        <View style={styles.navButtonsContainer}>
          {step > 1 && step < 5 && (
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => setStep(step - 1)}
              disabled={loading}
            >
              <Ionicons name="arrow-back" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.navButtonText}>Back</Text>
            </TouchableOpacity>
          )}
          {step < 4 && (
            <TouchableOpacity
              style={[
                styles.navButton,
                { backgroundColor: canProceed ? '#28a745' : '#9e9e9e' },
              ]}
              onPress={() => {
                if (canProceed) setStep(step + 1);
              }}
              disabled={loading || !canProceed}
            >
              <Ionicons
                name="arrow-forward"
                size={20}
                color="#fff"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.navButtonText}>Next</Text>
            </TouchableOpacity>
          )}
          {step === 4 && (
            <TouchableOpacity
              style={[styles.navButton, { backgroundColor: '#28a745' }]}
              onPress={() => navigation.navigate('Home')}
            >
              <Ionicons name="home" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.navButtonText}>Finish</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Loading Overlay */}
        {(loading || processingFileUri) && (
          <View style={styles.overlayContainer}>
            <View style={styles.overlay}>
              <ActivityIndicator size="large" color="#ffffff" />
              <Text style={styles.overlayText}>Processing...</Text>
            </View>
          </View>
        )}
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
    paddingHorizontal: 16,
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginVertical: 20,
    color: '#333',
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  stepSubTitle: {
    fontSize: 14,
    color: '#555',
    marginBottom: 16,
  },
  button: {
    flexDirection: 'row',
    backgroundColor: '#3B3B98',
    padding: 14,
    borderRadius: 8,
    marginVertical: 6,
    alignItems: 'center',
  },
  buttonAlt: {
    flexDirection: 'row',
    backgroundColor: '#5f5fc4',
    padding: 14,
    borderRadius: 8,
    marginVertical: 6,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  fileList: {
    marginTop: 12,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginBottom: 8,
    padding: 8,
    borderRadius: 8,
  },
  // Speaker items
  speakerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f4f4',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  playButton: {
    backgroundColor: '#0077cc',
    padding: 6,
    borderRadius: 6,
    marginRight: 8,
  },
  selectButton: {
    backgroundColor: '#5f5fc4',
    padding: 6,
    borderRadius: 6,
  },
  // Step 3 inputs
  inputContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#999',
    marginBottom: 12,
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 50,
  },
  input: {
    flex: 1,
    color: '#333',
  },
  navButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 20,
  },
  navButton: {
    flexDirection: 'row',
    backgroundColor: '#3B3B98',
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 6,
    alignItems: 'center',
  },
  navButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  // Modal
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  // Overlay
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  overlay: {
    backgroundColor: '#333',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  overlayText: {
    marginTop: 10,
    color: '#fff',
    fontSize: 16,
  },
});
