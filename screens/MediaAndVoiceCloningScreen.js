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
  Image,
  ScrollView,
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
      const resp = await fetch(`${SERVER_URL}/process`, {
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
      const resp = await fetch(`${SERVER_URL}/confirm-speakers`, {
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
      const urlResp = await fetch(`${SERVER_URL}/get-download-url`, {
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

  // --------------------
  // Main Render
  // --------------------
  return (
    <LinearGradient colors={['#D9D0E7', '#D8B9E1']} style={styles.gradient}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Media & Voice Cloning</Text>
          <Text style={styles.subtitle}>Upload audio or video to create your AI voice clone</Text>

          <View style={styles.cardContainer}>
            <View style={styles.cardHeader}>
              <Ionicons name="cloud-upload" size={24} color="#43435F" />
              <Text style={styles.cardTitle}>Select Media Files</Text>
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
            <View style={[styles.cardContainer, { marginTop: 16 }]}>
              <View style={styles.cardHeader}>
                <Ionicons name="list" size={24} color="#43435F" />
                <Text style={styles.cardTitle}>Your Files</Text>
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

          <TouchableOpacity
            style={styles.homeButton}
            onPress={() => navigation.navigate('Home')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="home"
              size={22}
              color="#43435F"
              style={styles.homeButtonIcon}
            />
            <Text style={styles.homeButtonText}>Return to Home</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Diarization Modal */}
        <Modal
          visible={diarizationModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setDiarizationModalVisible(false)}
        >
          <View style={styles.modalBackground}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Your Voice</Text>
                <Text style={styles.modalSubtitle}>
                  Listen to each speaker and select the one you want to clone
                </Text>
              </View>
              
              <FlatList
                data={speakerAudio}
                renderItem={renderSpeakerItem}
                keyExtractor={(item, i) => `speaker-${i}`}
                style={styles.speakerList}
                contentContainerStyle={{paddingBottom: 10}}
              />
              
              <View style={styles.modalButtonContainer}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={() => handleConfirmSpeakers(false, null)}
                  activeOpacity={0.8}
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
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color="#fff"
                    style={styles.modalButtonIcon}
                  />
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Full-screen loading overlay */}
        {(processingFileUri || loading) && (
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
    padding: 16,
    paddingTop: 40,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#43435F',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    color: '#095684',
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.8,
  },
  cardContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
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
  cardTitle: {
    fontSize: 18,
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
  homeButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 12,
  },
  homeButtonIcon: {
    marginRight: 8,
  },
  homeButtonText: {
    fontSize: 16,
    color: '#43435F',
    fontWeight: '500',
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
  speakerList: {
    maxHeight: 300,
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
  modalButtonIcon: {
    marginRight: 6,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 15,
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