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
  ScrollView,
  SafeAreaView
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
  const [isLoading, setIsLoading] = useState(false);
  
  const [request, response, promptAsync] = Google.useAuthRequest({
    expoClientId,
    iosClientId,
    androidClientId
  });

  useEffect(() => {
    // Google auth response handler
    if (response?.type === 'success' && response.authentication) {
      handleGoogleAuth(response.authentication.idToken);
    }
  }, [response]);

  async function handleGoogleAuth(idToken) {
    setIsLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/auth/google`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });
      const data = await res.json();
      
      if (data.token) {
        await storeToken(data.token);
        navigation.navigate('Home');
      } else {
        Alert.alert('Google Login Error', data.error || 'Unknown error');
      }
    } catch (err) {
      console.error('Google fetch error', err);
      Alert.alert('Error', 'Could not log in with Google');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogin() {
    if (!email.trim()) {
      Alert.alert('Login Error', 'Please enter your email');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Login Error', 'Please enter your password');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${SERVER_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
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
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <LinearGradient colors={['#D9D0E7', '#D8B9E1']} style={styles.gradient}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView 
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerArea}>
              <View style={styles.logoCircle}>
                <Ionicons name="mic-circle" size={50} color="#43435F" />
              </View>
              <Text style={styles.logoText}>AI Reconnect</Text>
              <Text style={styles.tagLine}>Connect with voices from the past</Text>
            </View>

            <View style={styles.formContainer}>
              <Text style={styles.welcomeTitle}>Welcome Back</Text>
              <Text style={styles.subtitle}>Log in to continue</Text>

              <View style={styles.inputWrapper}>
                <Ionicons name="mail" size={18} color="#43435F" style={styles.icon} />
                <TextInput
                  style={styles.input}
                  autoCapitalize="none"
                  placeholder="Email"
                  placeholderTextColor="#77678d"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed" size={18} color="#43435F" style={styles.icon} />
                <TextInput
                  style={styles.input}
                  secureTextEntry
                  placeholder="Password"
                  placeholderTextColor="#77678d"
                  value={password}
                  onChangeText={setPassword}
                />
              </View>
              
              <TouchableOpacity style={styles.forgotPasswordLink}>
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.loginButton, isLoading && styles.disabledButton]} 
                onPress={handleLogin}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                {isLoading ? (
                  <View style={styles.loaderContainer}>
                    <Ionicons name="refresh" size={20} color="#fff" />
                    <Text style={styles.loginButtonText}>Logging in...</Text>
                  </View>
                ) : (
                  <Text style={styles.loginButtonText}>Login</Text>
                )}
              </TouchableOpacity>

              <View style={styles.orDivider}>
                <View style={styles.dividerLine} />
                <Text style={styles.orText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={[styles.googleButton, !request && styles.disabledButton]}
                onPress={() => promptAsync()}
                disabled={!request || isLoading}
                activeOpacity={0.7}
              >
                <Ionicons name="logo-google" size={18} color="#fff" style={{marginRight: 8}} />
                <Text style={styles.googleButtonText}>Sign in with Google</Text>
              </TouchableOpacity>
              
              <View style={styles.signupContainer}>
                <Text style={styles.noAccountText}>Don't have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
                  <Text style={styles.signupLink}>Sign Up</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ---------------------------------
// STYLES
// ---------------------------------
const styles = StyleSheet.create({
  gradient: {
    flex: 1
  },
  safeArea: {
    flex: 1
  },
  keyboardAvoidingView: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16
  },
  headerArea: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20
  },
  logoCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6
  },
  logoText: {
    color: '#43435F',
    fontSize: 28,
    fontWeight: '700',
    marginTop: 12,
    letterSpacing: 0.5
  },
  tagLine: {
    color: '#095684',
    fontSize: 13,
    marginTop: 4,
    opacity: 0.8
  },
  formContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#43435F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6
  },
  welcomeTitle: {
    color: '#43435F',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4
  },
  subtitle: {
    color: '#095684',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    opacity: 0.8
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(217, 208, 231, 0.4)',
    borderRadius: 12,
    marginBottom: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(217, 208, 231, 0.8)',
    height: 50
  },
  icon: {
    marginRight: 10
  },
  input: {
    flex: 1,
    height: 46,
    color: '#43435F',
    fontSize: 15
  },
  forgotPasswordLink: {
    alignSelf: 'flex-end',
    marginBottom: 16
  },
  forgotPasswordText: {
    color: '#095684',
    fontSize: 13
  },
  loginButton: {
    backgroundColor: '#095684',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5
  },
  disabledButton: {
    opacity: 0.7
  },
  loaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(67, 67, 95, 0.2)'
  },
  orText: {
    marginHorizontal: 10,
    color: '#43435F',
    fontSize: 13,
    fontWeight: '600'
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#43435F',
    borderRadius: 12,
    paddingVertical: 14,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3
  },
  googleButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600'
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16
  },
  noAccountText: {
    color: '#43435F',
    fontSize: 13
  },
  signupLink: {
    color: '#095684',
    fontSize: 13,
    fontWeight: '600'
  }
});