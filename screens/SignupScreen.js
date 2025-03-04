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
  StatusBar,
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
      const response = await fetch(`${SERVER_URL}/auth/register`, {
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
        colors={['#D9D0E7', '#D8B9E1']}
        style={styles.gradient}
      >
        <StatusBar barStyle="dark-content" />
        <View style={styles.logoContainer}>
          <Ionicons name="person-add" size={80} color="#43435F" />
          <Text style={styles.appName}>AI Reconnect</Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.title}>Create Your Account</Text>
          <Text style={styles.subtitle}>Join the AI-driven voice revolution</Text>

          {/* Name Field */}
          <View style={styles.inputContainer}>
            <Ionicons name="person" size={20} color="#43435F" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="Name (optional)"
              placeholderTextColor="#43435F"
              value={name}
              onChangeText={setName}
            />
          </View>

          {/* Email Field */}
          <View style={styles.inputContainer}>
            <Ionicons name="mail" size={20} color="#43435F" style={styles.icon} />
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              placeholder="Email"
              placeholderTextColor="#43435F"
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
              color="#43435F"
              style={styles.icon}
            />
            <TextInput
              style={styles.input}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor="#43435F"
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
            style={styles.altButton}
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
    color: '#43435F',
    fontSize: 28,
    fontWeight: '600',
    marginTop: 12,
  },
  formContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 24,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#43435F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  title: {
    color: '#43435F',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    color: '#095684',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(217, 208, 231, 0.5)',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#D9D0E7',
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 50,
    color: '#43435F',
    fontSize: 16,
  },
  signupButton: {
    backgroundColor: '#095684',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  signupButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  altButton: {
    borderWidth: 1,
    borderColor: '#43435F',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  altButtonText: {
    color: '#43435F',
    fontSize: 16,
    fontWeight: '500',
  },
});