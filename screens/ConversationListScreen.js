// screens/ConversationListScreen.js

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  SafeAreaView,
  Dimensions,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getToken } from '../authStorage';
import { useIsFocused } from '@react-navigation/native';

import ENV from './env';
const SERVER_URL = ENV.SERVER_URL;

const { width } = Dimensions.get('window');

export default function ConversationListScreen({ navigation }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  const isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused) {
      fetchConversations();
    }
  }, [isFocused]);

  async function fetchConversations() {
    setLoading(true);
    try {
      const token = await getToken();
      const resp = await fetch(`${SERVER_URL}/api/conversations`, {
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
      setRefreshing(false);
    }
  }

  function handleRefresh() {
    setRefreshing(true);
    fetchConversations();
  }

  function formatDate(dateString) {
    const options = { month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  }

  function getConversationPreview(messages) {
    if (!messages || messages.length === 0) {
      return 'No messages yet';
    }
    
    const lastMessage = messages[messages.length - 1];
    const prefix = lastMessage.role === 'user' ? 'You: ' : 'AI: ';
    const content = lastMessage.content;
    
    // Truncate message if it's too long
    if (content.length > 60) {
      return `${prefix}${content.substring(0, 60)}...`;
    }
    
    return `${prefix}${content}`;
  }

  function getTimeAgo(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) {
      return 'just now';
    }
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}m ago`;
    }
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}h ago`;
    }
    
    const days = Math.floor(hours / 24);
    if (days < 7) {
      return `${days}d ago`;
    }
    
    return formatDate(dateString);
  }

  function renderConversationItem({ item }) {
    const lastMessage = item.messages[item.messages.length - 1];
    const timeAgo = item.updatedAt ? getTimeAgo(item.updatedAt) : '';
    const preview = getConversationPreview(item.messages);
    
    return (
      <TouchableOpacity
        style={styles.conversationItem}
        onPress={() => navigation.navigate('AIConversation', { conversationId: item._id })}
        activeOpacity={0.7}
      >
        <LinearGradient
          colors={['#ffffff', '#f8f8f8']}
          style={styles.conversationItemGradient}
        >
          <View style={styles.conversationIconContainer}>
            <LinearGradient
              colors={['#43435F', '#095684']}
              style={styles.iconGradient}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 1}}
            >
              <Ionicons name="chatbubbles" size={18} color="#fff" />
            </LinearGradient>
          </View>
          
          <View style={styles.conversationInfo}>
            <View style={styles.conversationHeader}>
              <Text style={styles.conversationTitle} numberOfLines={1}>
                {item.title || 'Untitled Conversation'}
              </Text>
              <Text style={styles.conversationTime}>{timeAgo}</Text>
            </View>
            
            <Text style={styles.lastMessage} numberOfLines={2}>
              {preview}
            </Text>
            
            {item.voiceId && (
              <View style={styles.voiceIndicator}>
                <Ionicons name="mic" size={12} color="#5BDFD6" />
                <Text style={styles.voiceIndicatorText}>Voice enabled</Text>
              </View>
            )}
          </View>
          
          <Ionicons name="chevron-forward" size={20} color="#aaa" />
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  function renderEmptyComponent() {
    if (loading) return null;
    
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="chatbubbles-outline" size={50} color="#43435F" style={{opacity: 0.5}} />
        </View>
        <Text style={styles.emptyTitle}>No conversations yet</Text>
        <Text style={styles.emptySubtitle}>Start a new conversation to begin chatting with AI</Text>
        <TouchableOpacity
          style={styles.emptyButton}
          onPress={() => navigation.navigate('NewConversation')}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#43435F', '#095684']}
            style={styles.emptyButtonGradient}
            start={{x: 0, y: 0}}
            end={{x: 1, y: 0}}
          >
            <Ionicons name="add-circle" size={20} color="#fff" style={{marginRight: 8}} />
            <Text style={styles.emptyButtonText}>Start New Conversation</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <LinearGradient colors={['#D9D0E7', '#D8B9E1']} style={styles.gradient}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Your Conversations</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('NewConversation')}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={['#5BDFD6', '#095684']}
              style={styles.addButtonGradient}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 1}}
            >
              <Ionicons name="add" size={24} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {loading && conversations.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#43435F" />
            <Text style={styles.loadingText}>Loading conversations...</Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            renderItem={renderConversationItem}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={renderEmptyComponent}
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#43435F',
  },
  addButton: {
    borderRadius: 25,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  addButtonGradient: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
    flexGrow: 1,
  },
  conversationItem: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  conversationItemGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
  },
  conversationIconContainer: {
    marginRight: 12,
  },
  iconGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  conversationInfo: {
    flex: 1,
    marginRight: 8,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  conversationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#43435F',
    maxWidth: '80%',
  },
  conversationTime: {
    fontSize: 12,
    color: '#888',
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  voiceIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  voiceIndicatorText: {
    fontSize: 12,
    color: '#5BDFD6',
    marginLeft: 4,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingVertical: 60,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#43435F',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#095684',
    marginBottom: 24,
    textAlign: 'center',
    opacity: 0.8,
  },
  emptyButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  emptyButtonGradient: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#43435F',
    fontSize: 16,
  },
});