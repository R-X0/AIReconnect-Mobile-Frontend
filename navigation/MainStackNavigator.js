import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import HomeScreen from '../screens/HomeScreen';
import AIConversationScreen from '../screens/AIConversationScreen';
import PersonaSetupScreen from '../screens/PersonaSetupScreen';
import MediaAndVoiceCloningScreen from '../screens/MediaAndVoiceCloningScreen';
import CallScreen from '../screens/CallScreen';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import ConversationListScreen from '../screens/ConversationListScreen';
import NewConversationScreen from '../screens/NewConversationScreen';
import WizardFlowScreen from '../screens/WizardFlowScreen';
import LiveAiConversationScreen from '../screens/LiveAiConversationScreen';

// NEW: Import the AI Video Generation screen
import AIVideoGenerationScreen from '../screens/AIVideoGenerationScreen';

import { removeToken } from '../authStorage';

const Stack = createStackNavigator();

export default function MainStackNavigator() {
  return (
    <Stack.Navigator initialRouteName="Login">
      {/* Auth Screens */}
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Signup"
        component={SignupScreen}
        options={{ title: 'Signup' }}
      />

      {/* Home Screen */}
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={({ navigation }) => ({
          title: 'AI Reconnect',
          headerTitleAlign: 'left', // Changed from default center to left
          headerLeft: () => null,
          headerRight: () => (
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={async () => {
                await removeToken();
                navigation.replace('Login');
              }}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#43435F', '#095684']}
                style={styles.logoutGradient}
                start={{x: 0, y: 0}}
                end={{x: 1, y: 1}}
              >
                <Ionicons name="log-out-outline" size={16} color="#fff" style={{marginRight: 5}} />
                <Text style={styles.logoutText}>Logout</Text>
              </LinearGradient>
            </TouchableOpacity>
          ),
        })}
      />

      {/* Conversation Management Screens */}
      <Stack.Screen
        name="Conversations"
        component={ConversationListScreen}
        options={{ title: 'Conversations' }}
      />
      <Stack.Screen
        name="NewConversation"
        component={NewConversationScreen}
        options={{ title: 'New Conversation' }}
      />

      {/* AI Conversation Screen */}
      <Stack.Screen
        name="AIConversation"
        component={AIConversationScreen}
        options={{ title: 'AI Conversation' }}
      />

      {/* Persona Setup */}
      <Stack.Screen
        name="PersonaSetupScreen"
        component={PersonaSetupScreen}
        options={{ title: 'Persona Setup' }}
      />

      {/* Media & Voice Cloning Screen */}
      <Stack.Screen
        name="MediaAndVoiceCloning"
        component={MediaAndVoiceCloningScreen}
        options={{ title: 'Media & Voice Cloning' }}
      />

      {/* WizardFlow */}
      <Stack.Screen
        name="WizardFlow"
        component={WizardFlowScreen}
        options={{ title: 'Voice Cloning Wizard' }}
      />

      {/* Call Screen */}
      <Stack.Screen
        name="CallScreen"
        component={CallScreen}
        options={{ title: 'Make a Call' }}
      />

      {/* Live AI Screen */}
      <Stack.Screen
        name="LiveAiConversation"
        component={LiveAiConversationScreen}
        options={{ 
          title: 'Live AI Conversation',
          headerTitleAlign: 'left' // Also aligning this title to the left
        }}
      />

      {/* NEW: AI Video Generation Screen */}
      <Stack.Screen
        name="AIVideoGeneration"
        component={AIVideoGenerationScreen}
        options={{ title: 'AI Video Generation' }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  logoutButton: {
    marginRight: 16,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  logoutGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  logoutText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  }
});