// screens/NewConversationScreen.js

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getToken } from '../authStorage';

import ENV from './env';
const SERVER_URL = ENV.SERVER_URL;

export default function NewConversationScreen({ navigation }) {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreateConversation() {
    if (!title.trim()) {
      Alert.alert('Validation Error', 'Please enter a title for the conversation.');
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      const resp = await fetch(`${BACKEND_URL}/api/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title }),
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

  return (
    <LinearGradient colors={['#f5f7fa', '#c3cfe2']} style={styles.gradient}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={28} color="#3B3B98" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Conversation</Text>
          {/* Empty view for alignment spacing */}
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Conversation Title</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Project Discussion"
            value={title}
            onChangeText={setTitle}
          />

          <TouchableOpacity
            style={[styles.createButton, loading && styles.buttonDisabled]}
            onPress={handleCreateConversation}
            disabled={loading}
          >
            <Text style={styles.createButtonText}>{loading ? 'Creating...' : 'Start Chat'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  header: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  form: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,

    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  label: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
  },
  input: {
    height: 44,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 20,
    color: '#333',
  },
  createButton: {
    backgroundColor: '#3B3B98',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#999',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
