// screens/SignupScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { storeToken } from '../authStorage';

import ENV from './env';
const SERVER_URL = ENV.SERVER_URL;

export default function SignupScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  async function handleSignup() {
    try {
      const response = await fetch(`${BACKEND_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await response.json();
      if (!response.ok) {
        Alert.alert('Signup Error', data.error || 'Unknown error');
        return;
      }
      await storeToken(data.token);
      navigation.navigate('Home');
    } catch (err) {
      console.error('Signup error:', err);
      Alert.alert('Error', 'Could not sign up');
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={['#1a1a2e', '#16213e', '#0f3460']}
        style={styles.gradient}
      >
        <View style={styles.logoContainer}>
          <Ionicons name="person-add" size={80} color="#fff" />
          <Text style={styles.appName}>AI Reconnect</Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.title}>Create Your Account</Text>
          <Text style={styles.subtitle}>Join the AI-driven voice revolution</Text>

          {/* Name Field */}
          <View style={styles.inputContainer}>
            <Ionicons name="person" size={20} color="#ccc" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="Name (optional)"
              placeholderTextColor="#aaa"
              value={name}
              onChangeText={setName}
            />
          </View>

          {/* Email Field */}
          <View style={styles.inputContainer}>
            <Ionicons name="mail" size={20} color="#ccc" style={styles.icon} />
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              placeholder="Email"
              placeholderTextColor="#aaa"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          {/* Password Field */}
          <View style={styles.inputContainer}>
            <Ionicons
              name="lock-closed"
              size={20}
              color="#ccc"
              style={styles.icon}
            />
            <TextInput
              style={styles.input}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor="#aaa"
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {/* Create Account Button */}
          <TouchableOpacity
            onPress={handleSignup}
            style={styles.signupButton}
            activeOpacity={0.8}
          >
            <Text style={styles.signupButtonText}>Create Account</Text>
          </TouchableOpacity>

          {/* Already have an account */}
          <TouchableOpacity
            onPress={() => navigation.navigate('Login')}
            style={[styles.altButton, { marginTop: 16 }]}
            activeOpacity={0.8}
          >
            <Text style={styles.altButtonText}>Already have an account? Login</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

// Styles
const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 30,
  },
  appName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
    marginTop: 12,
  },
  formContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 20,
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    color: '#bbb',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    marginBottom: 12,
    paddingHorizontal: 10,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 45,
    color: '#fff',
  },
  signupButton: {
    backgroundColor: '#e94560', // accent color
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  signupButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  altButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  altButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
