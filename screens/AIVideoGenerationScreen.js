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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';

import ENV from './env';
const SERVER_URL = ENV.SERVER_URL;

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

      const response = await fetch(`${BACKEND_URL}/generate-image`, {
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

      const response = await fetch(`${BACKEND_URL}/generate-image`, {
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

      const response = await fetch(`${BACKEND_URL}/generate-video`, {
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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.instructions}>
        Here you can generate stunning images and videos of yourself or others using AI.
        Simply select an image, enter a creative prompt, and let the magic happen!
      </Text>

      {/* ---------- IMAGE GENERATION SECTION ---------- */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Image Generation</Text>
        <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
          {sourceImage ? (
            <Image source={{ uri: sourceImage }} style={styles.image} />
          ) : (
            <Ionicons name="image-outline" size={50} color="#aaa" />
          )}
        </TouchableOpacity>
        <TextInput
          style={[styles.input, { minHeight: 60 }]}
          placeholder="Enter prompt for image generation"
          placeholderTextColor="#888"
          value={prompt}
          onChangeText={setPrompt}
          multiline={true}
          textAlignVertical="top"
        />
        <TouchableOpacity style={styles.button} onPress={generateImage}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Generate Image</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ---------- VIDEO GENERATION SECTION ---------- */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Video Generation</Text>
        <TouchableOpacity style={styles.imagePicker} onPress={pickVideoImage}>
          {videoSourceImage ? (
            <Image source={{ uri: videoSourceImage }} style={styles.image} />
          ) : (
            <Ionicons name="videocam-outline" size={50} color="#aaa" />
          )}
        </TouchableOpacity>
        <TextInput
          style={[styles.input, { minHeight: 60 }]}
          placeholder="Enter prompt for video generation"
          placeholderTextColor="#888"
          value={videoPrompt}
          onChangeText={setVideoPrompt}
          multiline={true}
          textAlignVertical="top"
        />
        <TouchableOpacity style={styles.button} onPress={generateVideo}>
          {videoLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Generate Video</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ---------- Modal for Generated Images ---------- */}
      <Modal visible={isImageModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                setIsImageModalVisible(false);
                setGeneratedImages([]);
              }}
            >
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Generated Image</Text>
            {generatedImages.length > 0 && (
              <>
                {/* Navigation arrows and counter placed above the image */}
                <View style={styles.imageModalNavigation}>
                  <TouchableOpacity
                    onPress={() =>
                      setCurrentImageIndex((prev) => Math.max(prev - 1, 0))
                    }
                    disabled={currentImageIndex === 0}
                  >
                    <Ionicons
                      name="arrow-back"
                      size={30}
                      color={currentImageIndex === 0 ? '#ccc' : '#5f5fc4'}
                    />
                  </TouchableOpacity>
                  <Text style={styles.imageCounter}>
                    Image {currentImageIndex + 1} of {generatedImages.length}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      setCurrentImageIndex((prev) =>
                        Math.min(prev + 1, generatedImages.length - 1)
                      )
                    }
                    disabled={currentImageIndex === generatedImages.length - 1}
                  >
                    <Ionicons
                      name="arrow-forward"
                      size={30}
                      color={
                        currentImageIndex === generatedImages.length - 1
                          ? '#ccc'
                          : '#5f5fc4'
                      }
                    />
                  </TouchableOpacity>
                </View>
                <Image
                  source={{ uri: generatedImages[currentImageIndex] }}
                  style={styles.modalImage}
                />
              </>
            )}
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity style={styles.modalButton} onPress={handleDownloadImage}>
                <Text style={styles.modalButtonText}>Download</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => {
                  // Use the current image for video generation.
                  setVideoSourceImage(generatedImages[currentImageIndex]);
                  setIsImageModalVisible(false);
                }}
              >
                <Text style={styles.modalButtonText}>Use for Video</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={regenerateImage}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalButtonText}>Regenerate</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Modal for Generated Video ---------- */}
      <Modal visible={isVideoModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                setIsVideoModalVisible(false);
                setGeneratedVideo(null);
              }}
            >
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Generated Video</Text>
            {generatedVideo && (
              <Video
                source={{ uri: generatedVideo }}
                rate={1.0}
                volume={1.0}
                isMuted={false}
                resizeMode="cover"
                shouldPlay
                isLooping
                style={styles.modalVideo}
              />
            )}
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity style={styles.modalButton} onPress={handleDownloadVideo}>
                <Text style={styles.modalButtonText}>Download</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginVertical: 10,
    color: '#333',
  },
  instructions: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  section: {
    width: '100%',
    marginBottom: 40,
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 15,
    color: '#444',
  },
  imagePicker: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#5f5fc4',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    fontSize: 16,
    color: '#333',
  },
  button: {
    backgroundColor: '#5f5fc4',
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 15,
  },
  imageModalNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  imageCounter: {
    fontSize: 16,
    color: '#333',
    marginHorizontal: 10,
  },
  modalImage: {
    width: 250,
    height: 250,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  modalVideo: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    marginBottom: 20,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  modalButton: {
    backgroundColor: '#5f5fc4',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    margin: 5,
    minWidth: 100,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 5,
    zIndex: 1,
  },
  closeButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#555',
  },
});

