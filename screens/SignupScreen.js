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
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { storeToken } from '../authStorage';

import ENV from './env';
const SERVER_URL = ENV.SERVER_URL;

const { height } = Dimensions.get('window');

export default function SignupScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignup() {
    if (!email.trim()) {
      Alert.alert('Email Required', 'Please enter your email address.');
      return;
    }
    
    if (!password.trim()) {
      Alert.alert('Password Required', 'Please enter a password.');
      return;
    }
    
    setIsSubmitting(true);
    
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
      Alert.alert('Error', 'Could not sign up. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <LinearGradient colors={['#D9D0E7', '#D8B9E1']} style={styles.gradient}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        {/* Logo Section - Compact */}
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Ionicons name="person-add" size={40} color="#43435F" />
          </View>
          <Text style={styles.appName}>AI Reconnect</Text>
        </View>

        {/* Form Section */}
        <View style={styles.formContainer}>
          <Text style={styles.title}>Create Account</Text>

          {/* Name Field */}
          <View style={styles.inputContainer}>
            <Ionicons name="person" size={20} color="#43435F" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="Name (optional)"
              placeholderTextColor="#666"
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
              placeholderTextColor="#666"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          {/* Password Field */}
          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed" size={20} color="#43435F" style={styles.icon} />
            <TextInput
              style={styles.input}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {/* Create Account Button */}
          <TouchableOpacity
            onPress={handleSignup}
            style={[styles.signupButton, isSubmitting && styles.disabledButton]}
            activeOpacity={0.8}
            disabled={isSubmitting}
          >
            <Text style={styles.signupButtonText}>
              {isSubmitting ? 'Creating Account...' : 'Create Account'}
            </Text>
          </TouchableOpacity>

          {/* Already have account */}
          <View style={styles.loginLinkContainer}>
            <Text style={styles.loginLinkText}>Already have an account?</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={styles.loginLink}>Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

// Styles
const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: height * 0.02,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 5,
  },
  appName: {
    color: '#43435F',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 10,
  },
  formContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#43435F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  title: {
    color: '#43435F',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(217, 208, 231, 0.4)',
    borderRadius: 12,
    marginBottom: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(217, 208, 231, 0.8)',
    height: 45,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#43435F',
    fontSize: 15,
    height: 45,
  },
  signupButton: {
    backgroundColor: '#095684',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  disabledButton: {
    backgroundColor: '#095684',
    opacity: 0.7,
  },
  signupButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loginLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  loginLinkText: {
    color: '#43435F',
    fontSize: 14,
  },
  loginLink: {
    color: '#095684',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
});