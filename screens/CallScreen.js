// screens/CallScreen.js

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
} from 'react-native';

import ENV from './env';
const SERVER_URL = ENV.SERVER_URL;

export default function CallScreen() {
  const [phoneNumber, setPhoneNumber] = useState('');

  async function handleInitiateCall() {
    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return;
    }

    try {
      const response = await fetch(`${SERVER_URL}/initiate-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toNumber: phoneNumber }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        Alert.alert('Success', `Call initiated! SID: ${data.callSid}`);
      } else {
        Alert.alert('Error', data.error || 'Unknown error');
      }
    } catch (error) {
      console.error('handleInitiateCall error:', error);
      Alert.alert('Error', error.message || 'Failed to initiate call');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Make a phone call to your AI persona</Text>
      <Text style={styles.label}>Enter phone number</Text>
      <TextInput
        style={styles.input}
        placeholder="+15555555555"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
        keyboardType="phone-pad"
      />
      <Button title="Call" onPress={handleInitiateCall} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingTop: 80,
  },
  title: {
    fontSize: 22,
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#888',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 16,
  },
});
