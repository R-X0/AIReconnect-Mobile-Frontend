// screens/ConversationListScreen.js

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getToken } from '../authStorage';

import ENV from './env';
const SERVER_URL = ENV.SERVER_URL;

export default function ConversationListScreen({ navigation }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchConversations();
    const focusListener = navigation.addListener('focus', () => {
      fetchConversations();
    });
    return focusListener;
  }, []);

  async function fetchConversations() {
    setLoading(true);
    try {
      const token = await getToken();
      const resp = await fetch(`${BACKEND_URL}/api/conversations`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!resp.ok) {
        console.error('Fetch Conversations Error:', data);
      } else {
        setConversations(data.conversations);
      }
    } catch (err) {
      console.error('Fetch Conversations Exception:', err);
    } finally {
      setLoading(false);
    }
  }

  function renderConversationItem({ item }) {
    const lastMessage = item.messages[item.messages.length - 1];
    return (
      <TouchableOpacity
        style={styles.conversationItem}
        onPress={() => navigation.navigate('AIConversation', { conversationId: item._id })}
      >
        <View style={styles.conversationInfo}>
          <Text style={styles.conversationTitle}>{item.title}</Text>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {lastMessage
              ? `${lastMessage.role === 'user' ? 'You: ' : 'AI: '}${lastMessage.content}`
              : 'No messages yet.'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#666" />
      </TouchableOpacity>
    );
  }

  return (
    <LinearGradient colors={['#f5f7fa', '#c3cfe2']} style={styles.gradient}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Conversations</Text>
        <TouchableOpacity onPress={() => navigation.navigate('NewConversation')}>
          <Ionicons name="add-circle-outline" size={28} color="#3B3B98" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#333" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderConversationItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No conversations yet. Start a new chat!</Text>}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  header: {
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 8,
    marginBottom: 12,
    justifyContent: 'space-between',

    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  conversationInfo: {
    flex: 1,
    marginRight: 10,
  },
  conversationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 40,
    fontSize: 16,
  },
});
