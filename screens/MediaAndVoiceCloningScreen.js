/******************************************************
 * MediaAndVoiceCloningScreen.js
 ******************************************************/
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Alert,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  StatusBar,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { getToken } from '../authStorage'; // your custom auth token function
import { Audio } from 'expo-av';
import { useIsFocused } from '@react-navigation/native';
import Constants from 'expo-constants';

// No ffmpeg-kit-react-native import now.
// The server will convert MP4→MP3.
import ENV from './env';
const SERVER_URL = ENV.SERVER_URL;

const getEnvVariables = () => {
  if (Constants.manifest?.extra) {
    return Constants.manifest.extra;
  } else if (Constants.expoConfig?.extra) {
    return Constants.expoConfig.extra;
  }
  throw new Error('Environment variables are not defined');
};

const { OPENAI_API_KEY, ELEVENLABS_API_KEY } = getEnvVariables() || {};
if (!OPENAI_API_KEY || !ELEVENLABS_API_KEY) {
  console.warn('API keys are missing. Check your .env setup.');
}

export default function MediaAndVoiceCloningScreen({ navigation }) {
  const [files, setFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  const [processingFileUri, setProcessingFileUri] = useState(null);

  // This boolean triggers our full-screen loading overlay.
  const [loading, setLoading] = useState(false);

  // Diarization
  const [diarizationModalVisible, setDiarizationModalVisible] = useState(false);
  const [speakerAudio, setSpeakerAudio] = useState([]);
  const [chosenSpeakerKey, setChosenSpeakerKey] = useState(null);

  // Audio playback (single toggle)
  const [sound, setSound] = useState(null);
  // Which speaker is currently playing?
  const [currentSpeakerKey, setCurrentSpeakerKey] = useState(null);
  // Is something playing right now?
  const [isPlaying, setIsPlaying] = useState(false);

  // Unload any playing sound when unmounting
  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync().catch((err) =>
            console.warn('unloadAsync error:', err)
          );
        }
      : undefined;
  }, [sound]);

  // For optional screen focus logic
  const isFocused = useIsFocused();
  useEffect(() => {
    if (isFocused) {
      // Refresh or other logic if needed
    }
  }, [isFocused]);

  // --------------------
  // File picking logic
  // --------------------
  async function pickMediaFiles() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'video/*'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      // If multiple: result.assets array; else single: result
      const pickedAssets = result.assets || [result];

      // We simply store them as-is. The server will handle MP4→MP3 if needed.
      const newFiles = pickedAssets.map((item) => ({
        uri: item.uri,
        name: item.name ?? 'media-file',
        mimeType: item.mimeType ?? 'application/octet-stream',
        processed: false,
        s3Key: null,
      }));
      setFiles((prev) => [...prev, ...newFiles]);
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

        // Again, just add them to our state. No local conversion.
        const newFiles = picked.map((item) => ({
          uri: item.uri,
          name: item.fileName ?? 'camera-roll-video.mp4',
          mimeType: 'video/mp4',
          processed: false,
          s3Key: null,
        }));
        setFiles((prev) => [...prev, ...newFiles]);
      }
    } catch (err) {
      console.error('Error picking from camera roll:', err);
      Alert.alert('Error', 'Could not pick from camera roll');
    }
  }

  // --------------------
  // Upload & process
  // --------------------
  async function handleUploadAndProcessAll() {
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
    } catch (error) {
      console.error('Error in handleUploadAndProcessAll:', error);
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
      if (!resp.ok) {
        const errText = await resp.text();
        console.error('getSignedUrl error:', errText);
        return null;
      }
      return await resp.json();
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
        (progressData.totalBytesSent / progressData.totalBytesExpectedToSend) *
        100;
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
    setLoading(true);
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

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error('Process error: ' + errText);
      }

      const data = await resp.json();
      console.log('processFile success:', data);

      // Mark as processed
      updateFileAsProcessed(file.uri, s3Key);

      // If diarization data is present
      if (data.speakerAudio && data.speakerAudio.length > 0) {
        setSpeakerAudio(data.speakerAudio);

        if (data.speakerAudio.length === 1) {
          // Single speaker => auto-confirm
          const singleKey = data.speakerAudio[0].s3Key;
          setChosenSpeakerKey(singleKey);
          handleConfirmSpeakers(true, singleKey);
        } else {
          setDiarizationModalVisible(true);
        }
      }
    } catch (err) {
      console.error('processFile exception:', err);
      Alert.alert('Process Error', err.message);
    } finally {
      setProcessingFileUri(null);
      setLoading(false);
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

  // --------------------
  // Diarization / Speaker confirm
  // --------------------
  function selectSpeaker(speakerItem) {
    setChosenSpeakerKey(speakerItem.s3Key);
  }

  async function handleConfirmSpeakers(autoMode = false, forcedKey = null) {
    const keyToUse = forcedKey || chosenSpeakerKey;
    if (!keyToUse) {
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
        body: JSON.stringify({ chosenSpeakerKey: keyToUse }),
      });

      if (!resp.ok) {
        const errTxt = await resp.text();
        throw new Error(errTxt);
      }

      if (!autoMode) {
        Alert.alert('Saved!', 'Speaker labels have been updated.');
      }
      setDiarizationModalVisible(false);

      // Now get the download URL for the chosen speaker
      const urlResp = await fetch(`${BACKEND_URL}/get-download-url`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ s3Key: keyToUse }),
      });
      const { downloadUrl } = await urlResp.json();

      // Download to a local path
      const localPath = FileSystem.cacheDirectory + 'chosenSpeaker.mp3';
      const downloadRes = await FileSystem.downloadAsync(downloadUrl, localPath);
      if (downloadRes.status !== 200) {
        throw new Error('Failed to download speaker file from S3');
      }

      // Navigate to PersonaSetupScreen
      navigation.navigate('PersonaSetupScreen', {
        localFile: {
          uri: localPath,
          name: 'chosenSpeaker.mp3',
          mimeType: 'audio/mpeg',
        },
      });
    } catch (error) {
      console.error('handleConfirmSpeakers error:', error);
      Alert.alert('Error saving labels', error.message);
    } finally {
      setLoading(false);
    }
  }

  // --------------------
  // Single button: Play/Stop Speaker Audio
  // --------------------
  async function toggleSpeakerAudio(speakerItem) {
    try {
      if (isPlaying && currentSpeakerKey === speakerItem.s3Key) {
        await stopAudio();
        return;
      }
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: speakerItem.url },
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
      setCurrentSpeakerKey(speakerItem.s3Key);
    } catch (error) {
      console.error('Error in toggleSpeakerAudio:', error);
      Alert.alert('Playback Error', error.message);
    }
  }

  async function stopAudio() {
    if (sound) {
      try {
        await sound.stopAsync();
      } catch (error) {
        console.error('Stop audio error:', error);
      }
      await sound.unloadAsync().catch(() => {});
      setSound(null);
    }
    setIsPlaying(false);
    setCurrentSpeakerKey(null);
  }

  // --------------------
  // Renderers
  // --------------------
  function renderFileItem({ item }) {
    const progress = uploadProgress[item.uri] || 0;
    const isServerProcessing = processingFileUri === 'processing-' + item.s3Key;
    const isUploadingThisFile = processingFileUri === item.uri;

    return (
      <View style={styles.fileItem}>
        <Ionicons
          name="document-text-outline"
          size={20}
          color="#333"
          style={{ marginRight: 10 }}
        />
        <Text style={styles.fileName}>
          {item.name} {item.processed ? '(Processed)' : ''}
        </Text>

        {isUploadingThisFile ? (
          <View style={styles.progressContainer}>
            <ActivityIndicator size="small" color="#0066cc" />
            <Text style={styles.progressText}>{progress}%</Text>
          </View>
        ) : isServerProcessing ? (
          <View style={styles.progressContainer}>
            <ActivityIndicator size="small" color="#0066cc" />
            <Text style={styles.progressText}>Converting...</Text>
          </View>
        ) : (
          <Text style={styles.progressText}>{progress}%</Text>
        )}
      </View>
    );
  }

  function renderSpeakerItem({ item }) {
    const speakerIsPlaying = isPlaying && currentSpeakerKey === item.s3Key;

    return (
      <View
        style={[
          styles.speakerItem,
          chosenSpeakerKey === item.s3Key && { backgroundColor: '#c1f0c1' },
        ]}
      >
        <Text style={{ flex: 1, color: '#333' }}>Speaker {item.speaker}</Text>

        <TouchableOpacity
          style={styles.playPauseButton}
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
  }

  // --------------------
  // Main Render
  // --------------------
  return (
    <LinearGradient colors={['#f5f7fa', '#c3cfe2']} style={styles.gradient}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.container}>
        <FlatList
          ListHeaderComponent={
            <>
              <Text style={styles.title}>Media & Voice Cloning</Text>

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={pickMediaFiles}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={20}
                    color="#fff"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.primaryButtonText}>Pick Files</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryButton, { marginTop: 12 }]}
                  onPress={pickFromCameraRoll}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="videocam-outline"
                    size={20}
                    color="#fff"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.primaryButtonText}>
                    Pick from Gallery
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          }
          data={files}
          renderItem={renderFileItem}
          keyExtractor={(item, idx) => item.uri + idx}
          contentContainerStyle={{ paddingBottom: 20 }}
        />

        {files.length > 0 && (
          <View style={styles.uploadContainer}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleUploadAndProcessAll}
              activeOpacity={0.8}
            >
              <Ionicons
                name="cloud-upload-outline"
                size={20}
                color="#fff"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.secondaryButtonText}>
                Upload & Convert All
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.goHomeContainer}>
          <TouchableOpacity
            style={styles.goHomeButton}
            onPress={() => navigation.navigate('Home')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="home-outline"
              size={20}
              color="#fff"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.goHomeButtonText}>Go Home</Text>
          </TouchableOpacity>
        </View>

        {/* Diarization Modal */}
        <Modal
          visible={diarizationModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setDiarizationModalVisible(false)}
        >
          <View style={styles.modalBackground}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>Confirm Speaker Labels</Text>
              <FlatList
                data={speakerAudio}
                renderItem={renderSpeakerItem}
                keyExtractor={(_, i) => `speaker-${i}`}
                style={{ marginTop: 16 }}
              />
              <View style={styles.modalButtonContainer}>
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={() => handleConfirmSpeakers(false, null)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={20}
                    color="#fff"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.confirmButtonText}>Confirm & Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setDiarizationModalVisible(false)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="close-circle-outline"
                    size={20}
                    color="#fff"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Full-screen loading overlay */}
        {(processingFileUri || loading) && (
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
    paddingTop: 20,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 22,
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '700',
    color: '#333',
  },
  buttonContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: '#5f5fc4',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  secondaryButton: {
    flexDirection: 'row',
    backgroundColor: '#28a745',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  fileName: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressText: {
    marginLeft: 8,
    minWidth: 60,
    textAlign: 'right',
    fontSize: 13,
    color: '#333',
  },
  goHomeContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  goHomeButton: {
    flexDirection: 'row',
    backgroundColor: '#5f5fc4',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  goHomeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
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
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
  },
  modalButtonContainer: {
    flexDirection: 'row',
    marginTop: 20,
  },
  confirmButton: {
    flexDirection: 'row',
    backgroundColor: '#28a745',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 25,
    alignItems: 'center',
    marginRight: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 3,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    flexDirection: 'row',
    backgroundColor: '#dc3545',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 3,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  speakerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f4f4',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    width: '100%',
  },
  playPauseButton: {
    backgroundColor: '#0077cc',
    padding: 8,
    borderRadius: 6,
    marginRight: 8,
  },
  selectButton: {
    backgroundColor: '#5f5fc4',
    padding: 8,
    borderRadius: 6,
  },
  // Full-screen loading overlay styles
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
