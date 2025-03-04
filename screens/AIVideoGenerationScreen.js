import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  Dimensions,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';

import ENV from './env';
const SERVER_URL = ENV.SERVER_URL;

const { width } = Dimensions.get('window');

export default function AIGenerationScreen() {
  // --- Image Generation State ---
  const [sourceImage, setSourceImage] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  // We keep an array to store images from multiple generations.
  const [generatedImages, setGeneratedImages] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isImageModalVisible, setIsImageModalVisible] = useState(false);

  // --- Video Generation State ---
  const [videoSourceImage, setVideoSourceImage] = useState(null);
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoLoading, setVideoLoading] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState(null);
  const [isVideoModalVisible, setIsVideoModalVisible] = useState(false);

  // --- Functions for Image Generation ---
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Permission to access media library is required!');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled) {
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [],
        { compress: 1, format: ImageManipulator.SaveFormat.PNG }
      );
      setSourceImage(manipulatedImage.uri);
    }
  };

  const generateImage = async () => {
    if (!sourceImage) {
      Alert.alert('No Image', 'Please select an image first.');
      return;
    }
    if (!prompt.trim()) {
      Alert.alert('No Prompt', 'Please enter a prompt.');
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('image', {
        uri: sourceImage,
        name: 'source.png',
        type: 'image/png',
      });
      formData.append('prompt', prompt);

      const response = await fetch(`${SERVER_URL}/generate-image`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate image.');
      }
      
      // Expecting only one image.
      let imageUrl = '';
      if (data.url) {
        imageUrl = data.url;
      } else if (data.urls && Array.isArray(data.urls) && data.urls.length === 1) {
        imageUrl = data.urls[0];
      } else {
        throw new Error('Expected 1 image but received a different result.');
      }
      
      setGeneratedImages([imageUrl]);
      setCurrentImageIndex(0);
      setIsImageModalVisible(true);
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  // Regenerate function that appends the new image to the list.
  const regenerateImage = async () => {
    if (!sourceImage) {
      Alert.alert('No Image', 'Please select an image first.');
      return;
    }
    if (!prompt.trim()) {
      Alert.alert('No Prompt', 'Please enter a prompt.');
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('image', {
        uri: sourceImage,
        name: 'source.png',
        type: 'image/png',
      });
      formData.append('prompt', prompt);

      const response = await fetch(`${SERVER_URL}/generate-image`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate image.');
      }
      
      let imageUrl = '';
      if (data.url) {
        imageUrl = data.url;
      } else if (data.urls && Array.isArray(data.urls) && data.urls.length === 1) {
        imageUrl = data.urls[0];
      } else {
        throw new Error('Expected 1 image but received a different result.');
      }
      
      setGeneratedImages(prevImages => {
        const newImages = [...prevImages, imageUrl];
        setCurrentImageIndex(newImages.length - 1);
        return newImages;
      });
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Function to Download the Generated Image ---
  const handleDownloadImage = async () => {
    if (generatedImages.length === 0) return;
    const currentImage = generatedImages[currentImageIndex];
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission required',
          'Permission to access media library is required to download images.'
        );
        return;
      }
      const fileUri = FileSystem.documentDirectory + 'generatedImage.png';
      const { uri } = await FileSystem.downloadAsync(currentImage, fileUri);
      await MediaLibrary.createAssetAsync(uri);
      Alert.alert('Download Successful', 'Image has been saved to your gallery.');
    } catch (error) {
      Alert.alert('Download Failed', error.message);
    }
  };

  // --- Functions for Video Generation ---
  const pickVideoImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Permission to access media library is required!');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled) {
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [],
        { compress: 1, format: ImageManipulator.SaveFormat.PNG }
      );
      setVideoSourceImage(manipulatedImage.uri);
    }
  };

  const generateVideo = async () => {
    if (!videoSourceImage) {
      Alert.alert('No Image', 'Please select an image for video generation.');
      return;
    }
    if (!videoPrompt.trim()) {
      Alert.alert('No Prompt', 'Please enter a prompt for video generation.');
      return;
    }
    setVideoLoading(true);
    setGeneratedVideo(null);
    try {
      const formData = new FormData();
      formData.append('image', {
        uri: videoSourceImage,
        name: 'video_source.png',
        type: 'image/png',
      });
      formData.append('prompt', videoPrompt);

      const response = await fetch(`${SERVER_URL}/generate-video`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate video.');
      }
      // Expecting the backend to return { url: ... }
      setGeneratedVideo(data.url);
      setIsVideoModalVisible(true);
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setVideoLoading(false);
    }
  };

  // --- Function to Download the Generated Video ---
  const handleDownloadVideo = async () => {
    if (!generatedVideo) return;
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission required',
          'Permission to access media library is required to download videos.'
        );
        return;
      }
      const fileUri = FileSystem.documentDirectory + 'generatedVideo.mp4';
      const { uri } = await FileSystem.downloadAsync(generatedVideo, fileUri);
      await MediaLibrary.createAssetAsync(uri);
      Alert.alert('Download Successful', 'Video has been saved to your gallery.');
    } catch (error) {
      Alert.alert('Download Failed', error.message);
    }
  };

  return (
    <LinearGradient colors={['#D9D0E7', '#D8B9E1']} style={styles.gradient}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={styles.headerTitle}>AI Content Generation</Text>
          <Text style={styles.headerSubtitle}>
            Create stunning images and videos with AI
          </Text>

          {/* ---------- IMAGE GENERATION SECTION ---------- */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconContainer}>
                <Ionicons name="image" size={24} color="#fff" />
              </View>
              <View style={styles.sectionTitleContainer}>
                <Text style={styles.sectionTitle}>Image Generation</Text>
                <Text style={styles.sectionSubtitle}>Transform photos with AI</Text>
              </View>
            </View>

            <View style={styles.cardContainer}>
              <View style={styles.imagePickerContainer}>
                <TouchableOpacity 
                  style={styles.imagePicker} 
                  onPress={pickImage}
                  activeOpacity={0.8}
                >
                  {sourceImage ? (
                    <Image source={{ uri: sourceImage }} style={styles.pickedImage} />
                  ) : (
                    <View style={styles.placeholderContainer}>
                      <Ionicons name="image-outline" size={50} color="#43435F" />
                      <Text style={styles.placeholderText}>Tap to select image</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Transformation Prompt</Text>
                <TextInput
                  style={styles.promptInput}
                  placeholder="Describe how to transform the image"
                  placeholderTextColor="#999"
                  value={prompt}
                  onChangeText={setPrompt}
                  multiline={true}
                  textAlignVertical="top"
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.generateButton,
                  (!sourceImage || !prompt.trim()) && styles.disabledButton
                ]}
                onPress={generateImage}
                disabled={!sourceImage || !prompt.trim() || loading}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={
                    sourceImage && prompt.trim() && !loading 
                      ? ['#43435F', '#095684'] 
                      : ['#cccccc', '#999999']
                  }
                  style={styles.generateButtonGradient}
                  start={{x: 0, y: 0}}
                  end={{x: 1, y: 0}}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="color-wand" size={20} color="#fff" style={styles.buttonIcon} />
                      <Text style={styles.generateButtonText}>Generate Image</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          {/* ---------- VIDEO GENERATION SECTION ---------- */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <View style={[
                styles.sectionIconContainer, 
                {backgroundColor: '#5BDFD6'}
              ]}>
                <Ionicons name="videocam" size={24} color="#fff" />
              </View>
              <View style={styles.sectionTitleContainer}>
                <Text style={styles.sectionTitle}>Video Generation</Text>
                <Text style={styles.sectionSubtitle}>Animate your images with AI</Text>
              </View>
            </View>

            <View style={styles.cardContainer}>
              <View style={styles.imagePickerContainer}>
                <TouchableOpacity 
                  style={styles.imagePicker} 
                  onPress={pickVideoImage}
                  activeOpacity={0.8}
                >
                  {videoSourceImage ? (
                    <Image source={{ uri: videoSourceImage }} style={styles.pickedImage} />
                  ) : (
                    <View style={styles.placeholderContainer}>
                      <Ionicons name="videocam-outline" size={50} color="#43435F" />
                      <Text style={styles.placeholderText}>Tap to select image</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Animation Prompt</Text>
                <TextInput
                  style={styles.promptInput}
                  placeholder="Describe how to animate the image"
                  placeholderTextColor="#999"
                  value={videoPrompt}
                  onChangeText={setVideoPrompt}
                  multiline={true}
                  textAlignVertical="top"
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.generateButton,
                  (!videoSourceImage || !videoPrompt.trim()) && styles.disabledButton
                ]}
                onPress={generateVideo}
                disabled={!videoSourceImage || !videoPrompt.trim() || videoLoading}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={
                    videoSourceImage && videoPrompt.trim() && !videoLoading 
                      ? ['#5BDFD6', '#095684'] 
                      : ['#cccccc', '#999999']
                  }
                  style={styles.generateButtonGradient}
                  start={{x: 0, y: 0}}
                  end={{x: 1, y: 0}}
                >
                  {videoLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="videocam" size={20} color="#fff" style={styles.buttonIcon} />
                      <Text style={styles.generateButtonText}>Generate Video</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          {/* ---------- Modal for Generated Images ---------- */}
          <Modal
            visible={isImageModalVisible}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setIsImageModalVisible(false)}
          >
            <View style={styles.modalBackground}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Generated Image</Text>
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => setIsImageModalVisible(false)}
                  >
                    <Ionicons name="close" size={24} color="#43435F" />
                  </TouchableOpacity>
                </View>

                {generatedImages.length > 0 && (
                  <>
                    {/* Image container */}
                    <View style={styles.generatedImageContainer}>
                      <Image
                        source={{ uri: generatedImages[currentImageIndex] }}
                        style={styles.generatedImage}
                        resizeMode="contain"
                      />

                      {/* Navigation controls */}
                      {generatedImages.length > 1 && (
                        <View style={styles.imageNavigation}>
                          <TouchableOpacity
                            onPress={() => setCurrentImageIndex((prev) => Math.max(prev - 1, 0))}
                            disabled={currentImageIndex === 0}
                            style={[
                              styles.imageNavButton,
                              currentImageIndex === 0 && styles.imageNavButtonDisabled
                            ]}
                          >
                            <Ionicons
                              name="chevron-back"
                              size={24}
                              color={currentImageIndex === 0 ? "#ccc" : "#43435F"}
                            />
                          </TouchableOpacity>
                          
                          <Text style={styles.imageCounter}>
                            {currentImageIndex + 1}/{generatedImages.length}
                          </Text>
                          
                          <TouchableOpacity
                            onPress={() => setCurrentImageIndex((prev) => 
                              Math.min(prev + 1, generatedImages.length - 1)
                            )}
                            disabled={currentImageIndex === generatedImages.length - 1}
                            style={[
                              styles.imageNavButton,
                              currentImageIndex === generatedImages.length - 1 && styles.imageNavButtonDisabled
                            ]}
                          >
                            <Ionicons
                              name="chevron-forward"
                              size={24}
                              color={currentImageIndex === generatedImages.length - 1 ? "#ccc" : "#43435F"}
                            />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    {/* Action buttons */}
                    <View style={styles.modalActionButtons}>
                      <TouchableOpacity 
                        style={styles.modalActionButton}
                        onPress={handleDownloadImage}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={['#43435F', '#095684']}
                          style={styles.modalActionButtonGradient}
                          start={{x: 0, y: 0}}
                          end={{x: 1, y: 0}}
                        >
                          <Ionicons name="download" size={18} color="#fff" style={styles.modalActionButtonIcon} />
                          <Text style={styles.modalActionButtonText}>Download</Text>
                        </LinearGradient>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={styles.modalActionButton}
                        onPress={() => {
                          setVideoSourceImage(generatedImages[currentImageIndex]);
                          setIsImageModalVisible(false);
                        }}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={['#5BDFD6', '#095684']}
                          style={styles.modalActionButtonGradient}
                          start={{x: 0, y: 0}}
                          end={{x: 1, y: 0}}
                        >
                          <Ionicons name="videocam" size={18} color="#fff" style={styles.modalActionButtonIcon} />
                          <Text style={styles.modalActionButtonText}>Use for Video</Text>
                        </LinearGradient>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={styles.modalActionButton}
                        onPress={regenerateImage}
                        disabled={loading}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={loading ? ['#cccccc', '#999999'] : ['#095684', '#43435F']}
                          style={styles.modalActionButtonGradient}
                          start={{x: 0, y: 0}}
                          end={{x: 1, y: 0}}
                        >
                          {loading ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <>
                              <Ionicons name="refresh" size={18} color="#fff" style={styles.modalActionButtonIcon} />
                              <Text style={styles.modalActionButtonText}>Regenerate</Text>
                            </>
                          )}
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </View>
          </Modal>

          {/* ---------- Modal for Generated Video ---------- */}
          <Modal
            visible={isVideoModalVisible}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setIsVideoModalVisible(false)}
          >
            <View style={styles.modalBackground}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Generated Video</Text>
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => setIsVideoModalVisible(false)}
                  >
                    <Ionicons name="close" size={24} color="#43435F" />
                  </TouchableOpacity>
                </View>

                {generatedVideo && (
                  <>
                    <View style={styles.videoContainer}>
                      <Video
                        source={{ uri: generatedVideo }}
                        rate={1.0}
                        volume={1.0}
                        isMuted={false}
                        resizeMode="contain"
                        shouldPlay
                        isLooping
                        style={styles.video}
                        useNativeControls
                      />
                    </View>

                    <View style={styles.modalActionButtons}>
                      <TouchableOpacity 
                        style={[styles.modalActionButton, {width: '100%'}]}
                        onPress={handleDownloadVideo}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={['#43435F', '#095684']}
                          style={styles.modalActionButtonGradient}
                          start={{x: 0, y: 0}}
                          end={{x: 1, y: 0}}
                        >
                          <Ionicons name="download" size={18} color="#fff" style={styles.modalActionButtonIcon} />
                          <Text style={styles.modalActionButtonText}>Download Video</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </View>
          </Modal>
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
  imagePickerContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  imagePicker: {
    width: width - 80,
    height: width - 80,
    borderRadius: 12,
    backgroundColor: '#f8f8f8',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#43435F',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  pickedImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  placeholderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  placeholderText: {
    marginTop: 10,
    color: '#43435F',
    fontSize: 16,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#43435F',
    marginBottom: 8,
  },
  promptInput: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#eaeaea',
    color: '#333',
    fontSize: 16,
    textAlignVertical: 'top',
  },
  generateButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  disabledButton: {
    opacity: 0.7,
  },
  generateButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  buttonIcon: {
    marginRight: 8,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal styles
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#43435F',
  },
  closeButton: {
    padding: 5,
  },
  generatedImageContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  generatedImage: {
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: 10,
    backgroundColor: '#f8f8f8',
  },
  imageNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  imageNavButton: {
    padding: 5,
  },
  imageNavButtonDisabled: {
    opacity: 0.5,
  },
  imageCounter: {
    fontSize: 16,
    fontWeight: '500',
    color: '#43435F',
    marginHorizontal: 10,
  },
  modalActionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  modalActionButton: {
    width: '32%',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
  },
  modalActionButtonGradient: {
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  modalActionButtonIcon: {
    marginRight: 5,
  },
  modalActionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Video modal styles
  videoContainer: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#000',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});