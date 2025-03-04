// screens/NewConversationScreen.js

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  StatusBar,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getToken } from '../authStorage';

import ENV from './env';
const SERVER_URL = ENV.SERVER_URL;

const { width, height } = Dimensions.get('window');

export default function NewConversationScreen({ navigation }) {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [topics, setTopics] = useState([
    { id: 1, label: 'Travel Planning', icon: 'airplane' },
    { id: 2, label: 'Creative Writing', icon: 'pencil' },
    { id: 3, label: 'Personal Assistant', icon: 'calendar' },
    { id: 4, label: 'Technical Help', icon: 'code-slash' },
    { id: 5, label: 'Education', icon: 'school' },
    { id: 6, label: 'Health & Fitness', icon: 'fitness' },
  ]);
  const [selectedTopic, setSelectedTopic] = useState(null);

  async function handleCreateConversation() {
    if (!title.trim()) {
      Alert.alert('Enter a Title', 'Please enter a title for your conversation.');
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      const resp = await fetch(`${SERVER_URL}/api/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          title,
          // If we want to include the topic in the backend
          topic: selectedTopic ? topics.find(t => t.id === selectedTopic).label : undefined
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        console.error('Create Conversation Error:', data);
        Alert.alert('Error', data.error || 'Failed to create conversation');
      } else {
        navigation.navigate('AIConversation', { conversationId: data.conversation._id });
      }
    } catch (err) {
      console.error('Create Conversation Exception:', err);
      Alert.alert('Error', 'Failed to create conversation');
    } finally {
      setLoading(false);
    }
  }

  function selectTopic(topicId) {
    // If the same topic is clicked again, deselect it
    if (selectedTopic === topicId) {
      setSelectedTopic(null);
      
      // Clear the title if it was set from this topic
      const topic = topics.find(t => t.id === topicId);
      if (title === `My ${topic.label} Conversation`) {
        setTitle('');
      }
    } else {
      setSelectedTopic(topicId);
      
      // Suggest a title based on the topic
      const topic = topics.find(t => t.id === topicId);
      if (!title.trim()) {
        setTitle(`My ${topic.label} Conversation`);
      }
    }
  }

  function renderTopicItem(topic) {
    const isSelected = selectedTopic === topic.id;
    
    return (
      <TouchableOpacity
        key={topic.id}
        style={[
          styles.topicItem,
          isSelected && styles.topicItemSelected
        ]}
        onPress={() => selectTopic(topic.id)}
        activeOpacity={0.7}
      >
        <LinearGradient
          colors={
            isSelected ? ['#5BDFD6', '#095684'] : ['#ffffff', '#f5f5f5']
          }
          style={styles.topicItemGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={[
            styles.topicIcon,
            isSelected && styles.topicIconSelected
          ]}>
            <Ionicons 
              name={topic.icon} 
              size={20} 
              color={isSelected ? '#fff' : '#43435F'} 
            />
          </View>
          <Text style={[
            styles.topicLabel,
            isSelected && styles.topicLabelSelected
          ]}>
            {topic.label}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <LinearGradient colors={['#D9D0E7', '#D8B9E1']} style={styles.gradient}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <TouchableOpacity 
                onPress={() => navigation.goBack()}
                style={styles.backButton}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              >
                <Ionicons name="arrow-back" size={24} color="#43435F" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>New Conversation</Text>
              <View style={{ width: 24 }} /> {/* Empty view for equal spacing */}
            </View>

            <View style={styles.formContainer}>
              <View style={styles.formSection}>
                <Text style={styles.sectionTitle}>Conversation Title</Text>
                <Text style={styles.sectionSubtitle}>
                  Enter a name for your conversation
                </Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="chatbubbles" size={20} color="#43435F" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Travel Planning, Creative Ideas..."
                    placeholderTextColor="#999"
                    value={title}
                    onChangeText={setTitle}
                    autoCapitalize="words"
                  />
                  {title !== '' && (
                    <TouchableOpacity onPress={() => setTitle('')} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
                      <Ionicons name="close-circle" size={18} color="#999" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.formSection}>
                <Text style={styles.sectionTitle}>Choose a Topic (Optional)</Text>
                <Text style={styles.sectionSubtitle}>
                  Select a topic to help categorize your conversation
                </Text>
                <View style={styles.topicsGrid}>
                  {topics.map(topic => renderTopicItem(topic))}
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.createButton,
                  !title.trim() && styles.disabledButton
                ]}
                onPress={handleCreateConversation}
                disabled={!title.trim() || loading}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={
                    title.trim() && !loading ? ['#43435F', '#095684'] : ['#cccccc', '#999999']
                  }
                  style={styles.createButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="chatbubble" size={20} color="#fff" style={styles.buttonIcon} />
                      <Text style={styles.createButtonText}>Start Conversation</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
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
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 20,
    paddingBottom: 30,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#43435F',
    textAlign: 'center',
  },
  formContainer: {
    flex: 1,
    padding: 20,
  },
  formSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#43435F',
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#095684',
    marginBottom: 16,
    opacity: 0.8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#43435F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  topicsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginHorizontal: -5,
  },
  topicItem: {
    width: (width - 40 - 10 - 20) / 2, // account for container padding, margin, and gap
    height: 90,
    marginBottom: 10,
    marginHorizontal: 5,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  topicItemSelected: {
    shadowColor: '#5BDFD6',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  topicItemGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  topicIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  topicIconSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  topicLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#43435F',
    textAlign: 'center',
  },
  topicLabelSelected: {
    color: '#fff',
  },
  createButton: {
    marginTop: 10,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  disabledButton: {
    opacity: 0.7,
  },
  createButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  buttonIcon: {
    marginRight: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});