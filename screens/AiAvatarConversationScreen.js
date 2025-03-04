// AiAvatarConversation.js
import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Text,
  Button,
  ScrollView,
} from 'react-native';

const AiAvatarConversation = () => {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState([]);

  // Simulate sending text and receiving a response
  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    // Add user's message to the conversation
    const newMessages = [
      ...messages,
      { sender: 'user', text: trimmed },
    ];
    setMessages(newMessages);
    setInputText('');

    // Simulate a response from the "avatar" after a short delay
    setTimeout(() => {
      setMessages((prevMessages) => [
        ...prevMessages,
        { sender: 'avatar', text: `Echo: ${trimmed}` },
      ]);
    }, 1000);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI Avatar Conversation</Text>
      <ScrollView style={styles.messagesContainer}>
        {messages.map((msg, index) => (
          <View
            key={index}
            style={[
              styles.messageBubble,
              msg.sender === 'user'
                ? styles.userBubble
                : styles.avatarBubble,
            ]}
          >
            <Text style={styles.messageText}>{msg.text}</Text>
          </View>
        ))}
      </ScrollView>
      <TextInput
        style={styles.input}
        placeholder="Enter text for avatar to speak"
        value={inputText}
        onChangeText={setInputText}
      />
      <Button title="Send" onPress={handleSend} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  messagesContainer: {
    flex: 1,
    marginBottom: 20,
  },
  messageBubble: {
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    maxWidth: '80%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#DCF8C6',
  },
  avatarBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F0F0',
  },
  messageText: {
    fontSize: 16,
  },
  input: {
    height: 50,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 25,
    paddingHorizontal: 15,
    fontSize: 16,
    marginBottom: 10,
  },
});

export default AiAvatarConversation;
