// AiAvatarConversationScreen.js
import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Image,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const AiAvatarConversationScreen = ({ navigation, route }) => {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  
  // Avatar properties (could come from route params in a real implementation)
  const [avatar, setAvatar] = useState({
    name: route.params?.avatarName || 'AI Assistant',
    avatarImage: route.params?.avatarImage || null,
  });
  
  const scrollViewRef = useRef();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  // Sample starting messages to make the screen look more complete
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        { 
          sender: 'avatar', 
          text: `Hello! I'm ${avatar.name}. How can I help you today?`,
          timestamp: new Date().toISOString()
        },
      ]);
    }
  }, []);

  // Simulate sending text and receiving a response
  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    // Get current time for message timestamps
    const now = new Date().toISOString();

    // Add user's message to the conversation
    const newMessages = [
      ...messages,
      { sender: 'user', text: trimmed, timestamp: now },
    ];
    setMessages(newMessages);
    setInputText('');
    setIsTyping(true);

    // Simulate a response from the "avatar" after a short delay
    setTimeout(() => {
      // Generate a more realistic response based on the input
      let response;
      const lowercaseInput = trimmed.toLowerCase();
      
      if (lowercaseInput.includes('hello') || lowercaseInput.includes('hi')) {
        response = `Hi there! It's nice to chat with you.`;
      } else if (lowercaseInput.includes('help')) {
        response = `I'm here to help! What would you like assistance with?`;
      } else if (lowercaseInput.includes('weather')) {
        response = `I don't have access to real-time weather data, but I'd be happy to discuss what kind of weather you enjoy!`;
      } else if (lowercaseInput.includes('name')) {
        response = `My name is ${avatar.name}. What's yours?`;
      } else if (lowercaseInput.length < 10) {
        response = `I see. Can you tell me more about that?`;
      } else {
        response = `That's interesting. I'm still learning, but I'm here to chat about whatever you'd like.`;
      }
      
      setMessages((prevMessages) => [
        ...prevMessages,
        { sender: 'avatar', text: response, timestamp: new Date().toISOString() },
      ]);
      setIsTyping(false);
    }, 1500);
  };

  // Format timestamp for display
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <LinearGradient colors={['#D9D0E7', '#D8B9E1']} style={styles.gradient}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {/* Header */}
          <LinearGradient
            colors={['#ffffff', '#f8f8f8']}
            style={styles.header}
          >
            <TouchableOpacity 
              onPress={() => navigation.goBack()}
              style={styles.backButton}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            >
              <Ionicons name="arrow-back" size={24} color="#43435F" />
            </TouchableOpacity>
            
            <View style={styles.avatarInfoContainer}>
              <View style={styles.avatarImageContainer}>
                {avatar.avatarImage ? (
                  <Image 
                    source={{ uri: avatar.avatarImage }} 
                    style={styles.avatarImage} 
                  />
                ) : (
                  <LinearGradient
                    colors={['#43435F', '#095684']}
                    style={styles.avatarImagePlaceholder}
                  >
                    <Ionicons name="person" size={24} color="#fff" />
                  </LinearGradient>
                )}
                <View style={styles.onlineIndicator} />
              </View>
              
              <View>
                <Text style={styles.avatarName}>{avatar.name}</Text>
                <Text style={styles.avatarStatus}>Online</Text>
              </View>
            </View>
            
            <TouchableOpacity style={styles.optionsButton}>
              <Ionicons name="ellipsis-vertical" size={20} color="#43435F" />
            </TouchableOpacity>
          </LinearGradient>

          {/* Messages Area */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((msg, index) => (
              <View
                key={index}
                style={[
                  styles.messageWrapper,
                  msg.sender === 'user' ? styles.userMessageWrapper : styles.avatarMessageWrapper,
                ]}
              >
                {msg.sender === 'avatar' && (
                  <View style={styles.messageBubbleAvatar}>
                    {avatar.avatarImage ? (
                      <Image 
                        source={{ uri: avatar.avatarImage }} 
                        style={styles.messageAvatar} 
                      />
                    ) : (
                      <LinearGradient
                        colors={['#43435F', '#095684']}
                        style={styles.messageAvatarPlaceholder}
                      >
                        <Ionicons name="person" size={16} color="#fff" />
                      </LinearGradient>
                    )}
                  </View>
                )}
                
                <View
                  style={[
                    styles.messageBubble,
                    msg.sender === 'user' ? styles.userBubble : styles.avatarBubble,
                  ]}
                >
                  <Text style={[
                    styles.messageText,
                    msg.sender === 'user' ? styles.userMessageText : styles.avatarMessageText,
                  ]}>
                    {msg.text}
                  </Text>
                </View>
                
                {msg.sender === 'user' && (
                  <View style={styles.messageBubbleUser}>
                    <LinearGradient
                      colors={['#5BDFD6', '#43435F']}
                      style={styles.messageUserIcon}
                    >
                      <Ionicons name="person" size={16} color="#fff" />
                    </LinearGradient>
                  </View>
                )}
              </View>
            ))}
            
            {/* Typing indicator */}
            {isTyping && (
              <View style={styles.typingIndicatorWrapper}>
                <View style={styles.typingIndicator}>
                  <View style={styles.typingDot} />
                  <View style={[styles.typingDot, { animationDelay: '0.2s' }]} />
                  <View style={[styles.typingDot, { animationDelay: '0.4s' }]} />
                </View>
                <Text style={styles.typingText}>{avatar.name} is typing...</Text>
              </View>
            )}
          </ScrollView>

          {/* Input Area */}
          <LinearGradient
            colors={['#f8f8f8', '#ffffff']}
            style={styles.inputArea}
          >
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Type your message..."
                placeholderTextColor="#999"
                value={inputText}
                onChangeText={setInputText}
                multiline
              />
              <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={!inputText.trim()}>
                <LinearGradient
                  colors={inputText.trim() ? ['#5BDFD6', '#095684'] : ['#cccccc', '#999999']}
                  style={styles.sendButtonGradient}
                >
                  <Ionicons name="send" size={20} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
            
            <View style={styles.inputOptions}>
              <TouchableOpacity style={styles.inputOptionButton}>
                <Ionicons name="image-outline" size={20} color="#43435F" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.inputOptionButton}>
                <Ionicons name="mic-outline" size={20} color="#43435F" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.inputOptionButton}>
                <Ionicons name="happy-outline" size={20} color="#43435F" />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  // Header styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  backButton: {
    padding: 4,
  },
  avatarInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarImageContainer: {
    position: 'relative',
    marginRight: 10,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarImagePlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineIndicator: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    bottom: 0,
    right: 0,
    borderWidth: 1,
    borderColor: '#fff',
  },
  avatarName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#43435F',
  },
  avatarStatus: {
    fontSize: 12,
    color: '#4CAF50',
  },
  optionsButton: {
    padding: 4,
  },
  // Messages area
  messagesContainer: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  messagesContent: {
    padding: 16,
    paddingTop: 24,
  },
  messageWrapper: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  userMessageWrapper: {
    justifyContent: 'flex-end',
  },
  avatarMessageWrapper: {
    justifyContent: 'flex-start',
  },
  messageBubbleAvatar: {
    marginRight: 8,
  },
  messageBubbleUser: {
    marginLeft: 8,
  },
  messageAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  messageAvatarPlaceholder: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageUserIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageBubble: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: '75%',
    minWidth: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  userBubble: {
    backgroundColor: '#5BDFD6',
    borderBottomRightRadius: 4,
  },
  avatarBubble: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#fff',
  },
  avatarMessageText: {
    color: '#43435F',
  },
  // Typing indicator
  typingIndicatorWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  typingIndicator: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 8,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#43435F',
    marginHorizontal: 2,
    opacity: 0.5,
  },
  typingText: {
    fontSize: 12,
    color: '#666',
  },
  // Input area
  inputArea: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingRight: 40,
    fontSize: 16,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#eaeaea',
  },
  sendButton: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    borderRadius: 20,
    overflow: 'hidden',
  },
  sendButtonGradient: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  inputOptionButton: {
    padding: 8,
  },
});

export default AiAvatarConversationScreen;