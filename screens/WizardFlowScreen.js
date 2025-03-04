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
  FlatList,
  Dimensions,
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

const { width } = Dimensions.get('window');

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
  const [selectedPersonaIndex, setSelectedPersonaIndex] = useState(-1);

  // Audio playback (single toggle)
  const [sound, setSound] = useState(null);
  const [currentSpeakerKey, setCurrentSpeakerKey] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Common personas array for Step 3
  const COMMON_PERSONAS = [
    { label: 'Friendly & Cheerful', traits: 'friendly, cheerful, approachable' },
    { label: 'Sarcastic & Witty', traits: 'sarcastic, witty, playful' },
    { label: 'Stoic & Wise', traits: 'calm, composed, wise' },
    { label: 'Bubbly & Energetic', traits: 'bubbly, energetic, enthusiastic' },
    { label: 'Sassy & Bold', traits: 'sassy, bold, outspoken' },
    { label: 'Professional & Polite', traits: 'professional, polite, informative' },
  ];

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
      const resp = await fetch(`${SERVER_URL}/upload-url`, {
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
      const resp = await fetch(`${SERVER_URL}/process`, {
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
      const resp = await fetch(`${SERVER_URL}/confirm-speakers`, {
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
      const urlResp = await fetch(`${SERVER_URL}/get-download-url`, {
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
  function selectPersona(index) {
    setSelectedPersonaIndex(index);
    setSpeakerTraits(COMMON_PERSONAS[index].traits);
  }

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
      const urlResp = await fetch(`${SERVER_URL}/get-download-url`, {
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
      const saveResp = await fetch(`${SERVER_URL}/voices`, {
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
    navigation.navigate('LiveAiConversation', { voiceId: newVoiceId });
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
  // RENDER FILE ITEMS
  // ---------------------------
  function renderFileItem({ item }) {
    const progress = uploadProgress[item.uri] || 0;
    const isServerProcessing = processingFileUri === 'processing-' + item.s3Key;
    const isUploadingThisFile = processingFileUri === item.uri;
    
    // Calculate progress color based on progress percentage
    const progressColor = progress < 30 ? '#43435F' : 
                          progress < 70 ? '#095684' : 
                          '#5BDFD6';

    return (
      <View style={styles.fileItem}>
        <View style={styles.fileIconContainer}>
          <Ionicons
            name={item.mimeType?.includes('audio') ? "musical-note" : "videocam"}
            size={22}
            color="#fff"
          />
        </View>
        
        <View style={styles.fileInfoContainer}>
          <Text style={styles.fileName} numberOfLines={1}>
            {item.name}
          </Text>
          
          <View style={styles.fileStatusContainer}>
            {item.processed ? (
              <View style={styles.fileProcessedBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#5BDFD6" />
                <Text style={styles.fileProcessedText}>Processed</Text>
              </View>
            ) : isUploadingThisFile || isServerProcessing ? (
              <View style={styles.progressContainer}>
                <View style={styles.progressBarBackground}>
                  <View 
                    style={[
                      styles.progressBarFill, 
                      { 
                        width: `${progress}%`,
                        backgroundColor: progressColor
                      }
                    ]} 
                  />
                </View>
                <View style={styles.progressTextContainer}>
                  <ActivityIndicator size="small" color={progressColor} />
                  <Text style={styles.progressText}>
                    {isServerProcessing ? 'Converting...' : `${progress}%`}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.fileReadyText}>Ready to upload</Text>
            )}
          </View>
        </View>
      </View>
    );
  }

  // ---------------------------
  // RENDER SPEAKER ITEMS
  // ---------------------------
  function renderSpeakerItem({ item }) {
    const speakerIsPlaying = isPlaying && currentSpeakerKey === item.s3Key;
    const isSelected = chosenSpeakerKey === item.s3Key;

    return (
      <View
        style={[
          styles.speakerItem,
          isSelected && styles.speakerItemSelected,
        ]}
      >
        <LinearGradient
          colors={isSelected ? ['#5BDFD6', '#43435F'] : ['#D9D0E7', '#D8B9E1']}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 0}}
          style={styles.speakerItemGradient}
        >
          <View style={styles.speakerInfoContainer}>
            <View style={[
              styles.speakerIconContainer,
              isSelected && {backgroundColor: '#5BDFD6'}
            ]}>
              <Ionicons name="person" size={18} color="#fff" />
            </View>
            <Text style={[styles.speakerText, isSelected && {color: '#fff'}]}>
              Speaker {item.speaker}
            </Text>
          </View>

          <View style={styles.speakerButtonsContainer}>
            <TouchableOpacity
              style={[
                styles.speakerActionButton, 
                styles.playButton,
                speakerIsPlaying && styles.pauseButton
              ]}
              onPress={() => toggleSpeakerAudio(item)}
            >
              <Ionicons
                name={speakerIsPlaying ? 'pause' : 'play'}
                size={16}
                color="#fff"
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.speakerActionButton, 
                styles.selectButton,
                isSelected && styles.selectedButton
              ]}
              onPress={() => selectSpeaker(item)}
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    );
  }

  // ---------------------------
  // RENDER STEPS
  // ---------------------------
  function renderStepOne() {
    return (
      <View style={styles.stepContainer}>
        <View style={styles.stepHeader}>
          <View style={styles.stepIconContainer}>
            <Ionicons name="cloud-upload" size={24} color="#fff" />
          </View>
          <View style={styles.stepTitleContainer}>
            <Text style={styles.stepTitle}>Upload Media</Text>
            <Text style={styles.stepSubtitle}>Select audio or video files to extract voice</Text>
          </View>
        </View>

        <View style={styles.cardContainer}>
          <View style={styles.cardHeader}>
            <Ionicons name="add-circle" size={22} color="#43435F" />
            <Text style={styles.cardHeaderTitle}>Add Files</Text>
          </View>

          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={pickMediaFiles}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#43435F', '#095684']}
                style={styles.buttonGradient}
                start={{x: 0, y: 0}}
                end={{x: 1, y: 1}}
              >
                <Ionicons
                  name="document-text"
                  size={22}
                  color="#fff"
                  style={styles.buttonIcon}
                />
                <Text style={styles.buttonText}>Browse Files</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={pickFromCameraRoll}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#43435F', '#095684']}
                style={styles.buttonGradient}
                start={{x: 0, y: 0}}
                end={{x: 1, y: 1}}
              >
                <Ionicons
                  name="images"
                  size={22}
                  color="#fff"
                  style={styles.buttonIcon}
                />
                <Text style={styles.buttonText}>From Gallery</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {files.length > 0 && (
          <View style={[styles.cardContainer, {marginTop: 16}]}>
            <View style={styles.cardHeader}>
              <Ionicons name="list" size={22} color="#43435F" />
              <Text style={styles.cardHeaderTitle}>Your Files</Text>
              <Text style={styles.fileCount}>{files.length} item{files.length !== 1 ? 's' : ''}</Text>
            </View>

            <FlatList
              data={files}
              renderItem={renderFileItem}
              keyExtractor={(item, idx) => item.uri + idx}
              contentContainerStyle={styles.fileList}
              scrollEnabled={false}
            />

            {files.length > 0 && (
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={handleUploadAndProcessAll}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#5BDFD6', '#095684']}
                  style={styles.uploadButtonGradient}
                  start={{x: 0, y: 0}}
                  end={{x: 1, y: 0}}
                >
                  <Ionicons
                    name="cloud-upload"
                    size={22}
                    color="#fff"
                    style={styles.buttonIcon}
                  />
                  <Text style={styles.uploadButtonText}>Upload & Process All</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  }

  function renderStepTwo() {
    return (
      <View style={styles.stepContainer}>
        <View style={styles.stepHeader}>
          <View style={[styles.stepIconContainer, {backgroundColor: '#095684'}]}>
            <Ionicons name="people" size={24} color="#fff" />
          </View>
          <View style={styles.stepTitleContainer}>
            <Text style={styles.stepTitle}>Select Speaker</Text>
            <Text style={styles.stepSubtitle}>Choose the voice you want to clone</Text>
          </View>
        </View>

        <View style={styles.cardContainer}>
          {speakerAudio.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Ionicons name="mic-off" size={40} color="#43435F" style={{opacity: 0.5}} />
              <Text style={styles.emptyStateText}>
                No speaker segments found. Make sure you processed the files in Step 1.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.cardHeader}>
                <Ionicons name="people-circle" size={22} color="#43435F" />
                <Text style={styles.cardHeaderTitle}>Available Speakers</Text>
                <Text style={styles.fileCount}>{speakerAudio.length} found</Text>
              </View>

              <FlatList
                data={speakerAudio}
                renderItem={renderSpeakerItem}
                keyExtractor={(item, idx) => `speaker-${idx}`}
                contentContainerStyle={styles.speakerList}
                scrollEnabled={false}
              />

              <TouchableOpacity
                style={styles.uploadButton}
                onPress={handleConfirmSpeakers}
                activeOpacity={0.8}
                disabled={!chosenSpeakerKey}
              >
                <LinearGradient
                  colors={chosenSpeakerKey ? ['#5BDFD6', '#095684'] : ['#cccccc', '#999999']}
                  style={styles.uploadButtonGradient}
                  start={{x: 0, y: 0}}
                  end={{x: 1, y: 0}}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color="#fff"
                    style={styles.buttonIcon}
                  />
                  <Text style={styles.uploadButtonText}>Confirm Selection</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity
          style={styles.modalLaunchButton}
          onPress={openDiarizationModal}
        >
          <Text style={styles.modalLaunchButtonText}>Open Speaker Selection Dialog</Text>
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
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Speaker</Text>
                <Text style={styles.modalSubtitle}>
                  Listen to each speaker and select the one you want to clone
                </Text>
              </View>
              
              <FlatList
                data={speakerAudio}
                renderItem={renderSpeakerItem}
                keyExtractor={(item, i) => `speaker-modal-${i}`}
                style={styles.speakerModalList}
              />
              
              <View style={styles.modalButtonContainer}>
                <TouchableOpacity
                  style={[
                    styles.modalButton, 
                    styles.confirmButton,
                    !chosenSpeakerKey && styles.disabledButton
                  ]}
                  onPress={() => {
                    handleConfirmSpeakers();
                    setDiarizationModalVisible(false);
                  }}
                  disabled={!chosenSpeakerKey}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color="#fff"
                    style={styles.modalButtonIcon}
                  />
                  <Text style={styles.modalButtonText}>Confirm Selection</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setDiarizationModalVisible(false)}
                >
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color="#fff"
                    style={styles.modalButtonIcon}
                  />
                  <Text style={styles.modalButtonText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  function renderStepThree() {
    return (
      <View style={styles.stepContainer}>
        <View style={styles.stepHeader}>
          <View style={[styles.stepIconContainer, {backgroundColor: '#5BDFD6'}]}>
            <Ionicons name="person-add" size={24} color="#fff" />
          </View>
          <View style={styles.stepTitleContainer}>
            <Text style={styles.stepTitle}>Create Persona</Text>
            <Text style={styles.stepSubtitle}>Define voice personality & clone it</Text>
          </View>
        </View>

        <View style={styles.cardContainer}>
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
                value={speakerTraits}
                onChangeText={setSpeakerTraits}
                textAlignVertical="top"
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.cloneButton}
            onPress={handleCloneNewVoice}
            activeOpacity={0.8}
            disabled={!speakerName.trim()}
          >
            <LinearGradient
              colors={speakerName.trim() ? ['#43435F', '#095684'] : ['#cccccc', '#999999']}
              style={styles.cloneButtonGradient}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 0}}
            >
              <Ionicons name="mic" size={22} color="#fff" style={styles.buttonIcon} />
              <Text style={styles.cloneButtonText}>Clone Voice</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderStepFour() {
    return (
      <View style={styles.stepContainer}>
        <View style={styles.stepHeader}>
          <View style={[styles.stepIconContainer, {backgroundColor: '#43435F'}]}>
            <Ionicons name="chatbubbles" size={24} color="#fff" />
          </View>
          <View style={styles.stepTitleContainer}>
            <Text style={styles.stepTitle}>Voice Ready!</Text>
            <Text style={styles.stepSubtitle}>Choose how to use your new AI voice</Text>
          </View>
        </View>

        <View style={styles.successContainer}>
          <View style={styles.successIconContainer}>
            <Ionicons name="checkmark-circle" size={80} color="#5BDFD6" />
          </View>
          <Text style={styles.successTitle}>Voice Cloned Successfully!</Text>
          <Text style={styles.successSubtitle}>{speakerName}'s voice is ready to use</Text>
          
          <View style={styles.voiceIdCard}>
            <Text style={styles.voiceIdLabel}>Voice ID:</Text>
            <Text style={styles.voiceIdText}>{newVoiceId || 'Not created yet'}</Text>
          </View>
        </View>

        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleStartChat}
            activeOpacity={0.8}
            disabled={!newVoiceId}
          >
            <LinearGradient
              colors={newVoiceId ? ['#43435F', '#095684'] : ['#cccccc', '#999999']}
              style={styles.actionButtonGradient}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 0}}
            >
              <Ionicons name="chatbubbles" size={24} color="#fff" style={{marginBottom: 8}} />
              <Text style={styles.actionButtonText}>Start AI Chat</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleStartCall}
            activeOpacity={0.8}
            disabled={!newVoiceId}
          >
            <LinearGradient
              colors={newVoiceId ? ['#5BDFD6', '#095684'] : ['#cccccc', '#999999']}
              style={styles.actionButtonGradient}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 0}}
            >
              <Ionicons name="call" size={24} color="#fff" style={{marginBottom: 8}} />
              <Text style={styles.actionButtonText}>Start AI Call</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.liveButton}
          onPress={handleStartLiveConversation}
          activeOpacity={0.8}
          disabled={!newVoiceId}
        >
          <LinearGradient
            colors={newVoiceId ? ['#D8B9E1', '#43435F'] : ['#cccccc', '#999999']}
            style={styles.liveButtonGradient}
            start={{x: 0, y: 0}}
            end={{x: 1, y: 0}}
          >
            <Ionicons name="videocam" size={24} color="#fff" style={{marginRight: 8}} />
            <Text style={styles.liveButtonText}>Start Live AI Conversation</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  // ---------------------------
  // RENDER PROGRESS INDICATORS
  // ---------------------------
  function renderProgressIndicators() {
    return (
      <View style={styles.progressIndicatorContainer}>
        {[1, 2, 3, 4].map((stepNumber) => (
          <TouchableOpacity 
            key={stepNumber}
            onPress={() => {
              // Only allow navigating to completed steps or current step
              if (stepNumber <= step || (stepNumber === 2 && step1Complete) || 
                 (stepNumber === 3 && step2Complete) || (stepNumber === 4 && step3Complete)) {
                setStep(stepNumber);
              }
            }}
            activeOpacity={0.8}
            style={styles.progressStepWrapper}
          >
            <View style={[
              styles.progressStep,
              step === stepNumber && styles.progressStepActive,
              stepNumber < step && styles.progressStepCompleted
            ]}>
              {stepNumber < step ? (
                <Ionicons name="checkmark" size={18} color="#fff" />
              ) : (
                <Text style={styles.progressStepText}>{stepNumber}</Text>
              )}
            </View>
            <Text style={[
              styles.progressStepLabel,
              step === stepNumber && styles.progressStepLabelActive
            ]}>
              {stepNumber === 1 ? 'Upload' : 
               stepNumber === 2 ? 'Select' : 
               stepNumber === 3 ? 'Create' : 'Use'}
            </Text>
          </TouchableOpacity>
        ))}

        <View style={styles.progressLine} />
      </View>
    );
  }

  // ---------------------------
  // MAIN RENDER
  // ---------------------------
  return (
    <LinearGradient colors={['#D9D0E7', '#D8B9E1']} style={styles.gradient}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.container}>
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.mainTitle}>Voice Cloning Wizard</Text>
          <Text style={styles.mainSubtitle}>Create your AI voice in 4 easy steps</Text>

          {renderProgressIndicators()}

          {step === 1 && renderStepOne()}
          {step === 2 && renderStepTwo()}
          {step === 3 && renderStepThree()}
          {step === 4 && renderStepFour()}
        </ScrollView>

        {/* Navigation Buttons */}
        <View style={styles.navButtonsContainer}>
          {step > 1 && (
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => setStep(step - 1)}
              disabled={loading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#43435F', '#095684']}
                style={styles.navButtonGradient}
                start={{x: 0, y: 0}}
                end={{x: 1, y: 0}}
              >
                <Ionicons name="arrow-back" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.navButtonText}>Back</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
          
          {step < 4 && (
            <TouchableOpacity
              style={[styles.navButton, !canProceed && styles.navButtonDisabled]}
              onPress={() => {
                if (canProceed) setStep(step + 1);
              }}
              disabled={loading || !canProceed}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={canProceed ? ['#5BDFD6', '#095684'] : ['#cccccc', '#999999']}
                style={styles.navButtonGradient}
                start={{x: 0, y: 0}}
                end={{x: 1, y: 0}}
              >
                <Text style={styles.navButtonText}>Next</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: 8 }} />
              </LinearGradient>
            </TouchableOpacity>
          )}
          
          {step === 4 && (
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => navigation.navigate('Home')}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#5BDFD6', '#43435F']}
                style={styles.navButtonGradient}
                start={{x: 0, y: 0}}
                end={{x: 1, y: 0}}
              >
                <Ionicons name="home" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.navButtonText}>Finish</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>

        {/* Loading Overlay */}
        {(loading || processingFileUri) && (
          <View style={styles.overlayContainer}>
            <View style={styles.overlay}>
              <ActivityIndicator size="large" color="#5BDFD6" />
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
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 30,
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#43435F',
    textAlign: 'center',
    marginBottom: 6,
  },
  mainSubtitle: {
    fontSize: 16,
    color: '#095684',
    textAlign: 'center',
    marginBottom: 24,
  },
  progressIndicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
    position: 'relative',
    paddingHorizontal: 10,
  },
  progressLine: {
    position: 'absolute',
    top: 14,
    left: 40,
    right: 40,
    height: 3,
    backgroundColor: 'rgba(67, 67, 95, 0.2)',
    zIndex: -1,
  },
  progressStepWrapper: {
    alignItems: 'center',
  },
  progressStep: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(67, 67, 95, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressStepActive: {
    backgroundColor: '#5BDFD6',
  },
  progressStepCompleted: {
    backgroundColor: '#43435F',
  },
  progressStepText: {
    color: '#43435F',
    fontWeight: '600',
  },
  progressStepLabel: {
    fontSize: 12,
    color: '#095684',
    fontWeight: '500',
  },
  progressStepLabelActive: {
    color: '#43435F',
    fontWeight: '700',
  },
  stepContainer: {
    marginBottom: 20,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#43435F',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  stepTitleContainer: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#43435F',
    marginBottom: 4,
  },
  stepSubtitle: {
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#43435F',
    marginLeft: 10,
    flex: 1,
  },
  fileCount: {
    fontSize: 14,
    color: '#095684',
    fontWeight: '500',
  },
  buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 5,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonGradient: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  fileList: {
    marginTop: 8,
  },
  fileItem: {
    flexDirection: 'row',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  fileIconContainer: {
    backgroundColor: '#43435F',
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: 46,
  },
  fileInfoContainer: {
    flex: 1,
    padding: 12,
    paddingLeft: 16,
    justifyContent: 'center',
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  fileStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileProcessedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(91, 223, 214, 0.1)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  fileProcessedText: {
    fontSize: 12,
    color: '#5BDFD6',
    marginLeft: 4,
    fontWeight: '500',
  },
  fileReadyText: {
    fontSize: 12,
    color: '#095684',
  },
  progressContainer: {
    flex: 1,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 12,
    color: '#095684',
    marginLeft: 6,
  },
  uploadButton: {
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  uploadButtonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalLaunchButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  modalLaunchButtonText: {
    color: '#43435F',
    fontSize: 16,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  emptyStateContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    textAlign: 'center',
    marginTop: 16,
    color: '#666',
    lineHeight: 20,
  },
  speakerList: {
    marginBottom: 10,
  },
  speakerItem: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  speakerItemSelected: {
    shadowColor: '#5BDFD6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  speakerItemGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  speakerInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  speakerIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#43435F',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  speakerText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  speakerButtonsContainer: {
    flexDirection: 'row',
  },
  speakerActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  playButton: {
    backgroundColor: '#095684',
  },
  pauseButton: {
    backgroundColor: '#43435F',
  },
  selectButton: {
    backgroundColor: '#43435F',
  },
  selectedButton: {
    backgroundColor: '#5BDFD6',
  },
  // Modal styles
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#43435F',
    marginBottom: 6,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#095684',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  speakerModalList: {
    maxHeight: 300,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  confirmButton: {
    backgroundColor: '#5BDFD6',
  },
  cancelButton: {
    backgroundColor: '#43435F',
  },
  disabledButton: {
    backgroundColor: '#cccccc',
  },
  modalButtonIcon: {
    marginRight: 6,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  // Step 3 styles
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#43435F',
    marginBottom: 6,
  },
  inputSubLabel: {
    fontSize: 14,
    color: '#095684',
    marginBottom: 10,
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
    height: 100,
  },
  cloneButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  cloneButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  cloneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Step 4 styles
  successContainer: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#43435F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: 20,
  },
  successIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(217, 208, 231, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#43435F',
    marginBottom: 8,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 16,
    color: '#095684',
    marginBottom: 16,
    textAlign: 'center',
  },
  voiceIdCard: {
    backgroundColor: 'rgba(217, 208, 231, 0.3)',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    alignItems: 'center',
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
    marginBottom: 16,
  },
  actionButtonGradient: {
    height: 100,
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
  liveButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  liveButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  liveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Navigation button styles
  navButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 10,
  },
  navButton: {
    flex: 1,
    marginHorizontal: 6,
    maxWidth: 160,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  navButtonDisabled: {
    opacity: 0.7,
  },
  navButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  navButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Loading overlay styles
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  overlay: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  overlayText: {
    marginTop: 16,
    color: '#43435F',
    fontSize: 16,
    fontWeight: '600',
  },
});