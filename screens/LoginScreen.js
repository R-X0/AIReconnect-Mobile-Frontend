// LoginScreen.js
import React, { useState, useEffect } from 'react';
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
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { storeToken } from '../authStorage';
import ENV from './env'; // Import the ENV object

WebBrowser.maybeCompleteAuthSession();

const SERVER_URL = ENV.SERVER_URL; // Use the imported ENV
const expoClientId = 'YOUR_EXPO_CLIENT_ID.apps.googleusercontent.com';
const iosClientId = 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com';
const androidClientId = 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [request, response, promptAsync] = Google.useAuthRequest({
    expoClientId,
    iosClientId,
    androidClientId,
  });

  useEffect(() => {
    if (response?.type === 'success' && response.authentication) {
      const { idToken } = response.authentication;
      fetch(`${SERVER_URL}/auth/google`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })
        .then((res) => res.json())
        .then(async (data) => {
          if (data.token) {
            await storeToken(data.token);
            navigation.navigate('Home');
          } else {
            console.log('Google login error', data);
            Alert.alert('Google Login Error', data.error || 'Unknown error');
          }
        })
        .catch((err) => {
          console.error('Google fetch error', err);
          Alert.alert('Error', 'Could not log in with Google');
        });
    }
  }, [response]);

  async function handleLogin() {
    try {
      const response = await fetch(`${SERVER_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        Alert.alert('Login Error', data.error || 'Unknown error');
        return;
      }
      await storeToken(data.token);
      navigation.navigate('Home');
    } catch (err) {
      console.error('Login error:', err);
      Alert.alert('Error', 'Could not log in');
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <LinearGradient colors={['#D9D0E7', '#D8B9E1']} style={styles.gradient}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.headerArea}>
          <Ionicons name="mic-circle" size={80} color="#43435F" />
          <Text style={styles.logoText}>AI Reconnect</Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.welcomeTitle}>Welcome Back</Text>
          <Text style={styles.subtitle}>Log in to continue</Text>

          <View style={styles.inputWrapper}>
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

          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed" size={20} color="#43435F" style={styles.icon} />
            <TextInput
              style={styles.input}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor="#43435F"
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
            <Text style={styles.loginButtonText}>Login</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.altButton} onPress={() => navigation.navigate('Signup')}>
            <Text style={styles.altButtonText}>Go to Signup</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.googleButton, !request && { opacity: 0.7 }]}
            onPress={() => promptAsync()}
            disabled={!request}
          >
            <Ionicons name="logo-google" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.googleButtonText}>Sign in with Google</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------
// STYLES
// ---------------------------------
const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    justifyContent: 'center',
  },
  headerArea: {
    alignItems: 'center',
    marginTop: 80,
    marginBottom: 30,
  },
  logoText: {
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
  welcomeTitle: {
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
  inputWrapper: {
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
  loginButton: {
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
  loginButtonText: {
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
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#43435F',
    borderRadius: 12,
    paddingVertical: 14,
    justifyContent: 'center',
    marginTop: 16,
  },
  googleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});