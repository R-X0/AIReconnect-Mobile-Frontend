// screens/HomeScreen.js

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
  Pressable,
  ScrollView,
  Alert,
  Dimensions,
  Image,
  Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getToken, removeToken } from '../authStorage';
import { useIsFocused } from '@react-navigation/native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import ENV from './env';
const SERVER_URL = ENV.SERVER_URL;

// Get device measurements for responsive design
const { width, height } = Dimensions.get('window');

export default function HomeScreen({ navigation }) {
  const [clonedVoices, setClonedVoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState(null);
  const [activeTab, setActiveTab] = useState('home');

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 50, 100],
    outputRange: [1, 0.8, 0],
    extrapolate: 'clamp'
  });

  const headerTranslate = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, -100],
    extrapolate: 'clamp'
  });

  const isFocused = useIsFocused();
  useEffect(() => {
    if (isFocused) {
      fetchMyVoices();
    }
  }, [isFocused]);

  async function fetchMyVoices() {
    setLoading(true);
    try {
      const token = await getToken();
      const resp = await fetch(`${BACKEND_URL}/voices`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!resp.ok) {
        console.error('fetchMyVoices error:', data);
      } else {
        setClonedVoices(data.voices || []);
      }
    } catch (err) {
      console.error('fetchMyVoices exception:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteVoice() {
    if (!selectedVoiceId) return;
    try {
      const token = await getToken();
      const resp = await fetch(`${BACKEND_URL}/voices/${selectedVoiceId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Failed to delete voice');
      }
      setClonedVoices((prev) => prev.filter((v) => v._id !== selectedVoiceId));
      Alert.alert('Success', 'Voice deleted successfully');
    } catch (error) {
      console.error('Delete error:', error);
      Alert.alert('Error', error.message || 'Failed to delete voice');
    } finally {
      setIsSelecting(false);
      setSelectedVoiceId(null);
    }
  }

  function handleConversation(voice) {
    navigation.navigate('AIConversation', {
      conversationId: voice.conversationId,
    });
  }

  function handleCall(voice) {
    navigation.navigate('CallScreen', { voiceId: voice.voiceId });
  }

  function handleEditPersona(voice) {
    navigation.navigate('PersonaSetupScreen', {
      voiceId: voice.voiceId,
      existingPersona: voice.persona,
    });
  }

  function renderVoiceItem({ item }) {
    const isSelected = item._id === selectedVoiceId;
    return (
      <TouchableOpacity
        style={[
          styles.voiceCard,
          isSelected && styles.voiceCardSelected,
        ]}
        onLongPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setIsSelecting(true);
          setSelectedVoiceId(item._id);
        }}
        onPress={() => {
          if (isSelecting) {
            setSelectedVoiceId(item._id);
          } else {
            handleConversation(item);
          }
        }}
        activeOpacity={0.8}
      >
        <View style={styles.voiceCardContent}>
          <View style={styles.voiceIcon}>
            <Ionicons name="mic" size={24} color="#fff" />
          </View>
          <View style={styles.voiceInfo}>
            <Text style={styles.voiceName}>{item.name || 'Untitled Voice'}</Text>
            <Text style={styles.voiceId}>{item.voiceId?.substring(0, 10)}...</Text>
          </View>
        </View>
        
        {!isSelecting && (
          <View style={styles.voiceActions}>
            <TouchableOpacity 
              style={styles.voiceActionButton}
              onPress={() => handleConversation(item)}
            >
              <Ionicons name="chatbubble-outline" size={18} color="#43435F" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.voiceActionButton}
              onPress={() => handleCall(item)}
            >
              <Ionicons name="call-outline" size={18} color="#43435F" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.voiceActionButton}
              onPress={() => handleEditPersona(item)}
            >
              <Ionicons name="settings-outline" size={18} color="#43435F" />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  function renderHomeTab() {
    return (
      <View style={styles.tabContent}>
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Welcome to AI Reconnect</Text>
          <Text style={styles.welcomeSubtitle}>Create, chat, and call with AI voice clones</Text>
        </View>

        <View style={styles.featureCardsContainer}>
          <TouchableOpacity 
            style={styles.mainFeatureCard}
            onPress={() => navigation.navigate('WizardFlow')}
            activeOpacity={0.9}
          >
            <View style={styles.quickStartContainer}>
              <View style={styles.featureCardIcon}>
                <Ionicons name="rocket-outline" size={28} color="#fff" />
              </View>
              <View style={styles.quickStartTextContainer}>
                <Text style={styles.featureCardTitle}>Voice Cloning Wizard</Text>
                <Text style={styles.featureCardSubtitle}>
                  Create a new voice in minutes
                </Text>
              </View>
              <View style={styles.quickStartArrow}>
                <Ionicons name="arrow-forward-circle" size={32} color="#5BDFD6" />
              </View>
            </View>
          </TouchableOpacity>

          <View style={styles.smallCardsRow}>
            <TouchableOpacity 
              style={styles.smallFeatureCard}
              onPress={() => navigation.navigate('MediaAndVoiceCloning')}
              activeOpacity={0.9}
            >
              <View style={[styles.smallCardIcon, { backgroundColor: '#5BDFD6' }]}>
                <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
              </View>
              <Text style={styles.smallCardTitle}>Voice Clone</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.smallFeatureCard}
              onPress={() => navigation.navigate('Conversations')}
              activeOpacity={0.9}
            >
              <View style={[styles.smallCardIcon, { backgroundColor: '#43435F' }]}>
                <Ionicons name="chatbubbles-outline" size={20} color="#fff" />
              </View>
              <Text style={styles.smallCardTitle}>AI Chat</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.smallCardsRow}>
            <TouchableOpacity 
              style={styles.smallFeatureCard}
              onPress={() => navigation.navigate('CallScreen')}
              activeOpacity={0.9}
            >
              <View style={[styles.smallCardIcon, { backgroundColor: '#095684' }]}>
                <Ionicons name="call-outline" size={20} color="#fff" />
              </View>
              <Text style={styles.smallCardTitle}>AI Call</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.smallFeatureCard}
              onPress={() => navigation.navigate('AIVideoGeneration')}
              activeOpacity={0.9}
            >
              <View style={[styles.smallCardIcon, { backgroundColor: '#8B6CAD' }]}>
                <Ionicons name="videocam-outline" size={20} color="#fff" />
              </View>
              <Text style={styles.smallCardTitle}>AI Video</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.recentVoicesSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Voices</Text>
            <TouchableOpacity onPress={() => setActiveTab('voices')}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color="#43435F" size="large" style={{ marginTop: 20 }} />
          ) : clonedVoices.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Ionicons name="mic-off-outline" size={40} color="#999" />
              <Text style={styles.emptyStateText}>No voices created yet</Text>
              <TouchableOpacity 
                style={styles.emptyStateButton}
                onPress={() => navigation.navigate('WizardFlow')}
              >
                <Text style={styles.emptyStateButtonText}>Create Your First Voice</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={clonedVoices.slice(0, 3)} // Show only the first 3 voices
              renderItem={renderVoiceItem}
              keyExtractor={(item) => item._id}
              scrollEnabled={false}
            />
          )}
        </View>
      </View>
    );
  }

  function renderVoicesTab() {
    return (
      <View style={styles.tabContent}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>All Your Voices</Text>
          {isSelecting && (
            <TouchableOpacity 
              style={styles.deleteButton}
              onPress={handleDeleteVoice}
            >
              <Ionicons name="trash-outline" size={20} color="#fff" />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color="#43435F" size="large" style={{ marginTop: 20 }} />
        ) : clonedVoices.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyStateIconContainer}>
              <Ionicons name="mic-off" size={30} color="#fff" />
            </View>
            <Text style={styles.emptyStateText}>You haven't created any voice clones yet</Text>
            <TouchableOpacity 
              style={styles.emptyStateButton}
              onPress={() => navigation.navigate('WizardFlow')}
            >
              <Text style={styles.emptyStateButtonText}>Create Your First Voice</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={clonedVoices}
            renderItem={renderVoiceItem}
            keyExtractor={(item) => item._id}
            scrollEnabled={false}
            contentContainerStyle={styles.voicesList}
          />
        )}

        {isSelecting && (
          <TouchableOpacity 
            style={styles.cancelSelectButton}
            onPress={() => {
              setIsSelecting(false);
              setSelectedVoiceId(null);
            }}
          >
            <Text style={styles.cancelSelectButtonText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  function renderSettingsTab() {
    return (
      <View style={styles.tabContent}>
        <View style={styles.profileSection}>
          <View style={styles.profileAvatar}>
            <Ionicons name="person" size={40} color="#fff" />
          </View>
          <Text style={styles.profileName}>User</Text>
        </View>

        <View style={styles.settingsSection}>
          <TouchableOpacity style={styles.settingItem} onPress={() => navigation.navigate('PersonaSetupScreen')}>
            <Ionicons name="person-circle-outline" size={24} color="#43435F" />
            <Text style={styles.settingText}>Manage Personas</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.settingItem} onPress={() => navigation.navigate('LiveAiConversation')}>
            <Ionicons name="videocam-outline" size={24} color="#43435F" />
            <Text style={styles.settingText}>Live AI Mode</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.settingItem}
            onPress={async () => {
              await removeToken();
              navigation.replace('Login');
            }}
          >
            <Ionicons name="log-out-outline" size={24} color="#e74c3c" />
            <Text style={[styles.settingText, { color: '#e74c3c' }]}>Logout</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>

        <View style={styles.appInfoSection}>
          <Text style={styles.appVersionText}>AI Reconnect v1.0.0</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <LinearGradient colors={['#D9D0E7', '#D8B9E1']} style={styles.gradient}>
        {/* Header space - removed logo per feedback */}
        <Animated.View 
          style={[
            styles.header,
            {
              opacity: headerOpacity,
              transform: [{ translateY: headerTranslate }]
            }
          ]}
        />
        

        {/* Main Content */}
        <Animated.ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
        >
          {activeTab === 'home' && renderHomeTab()}
          {activeTab === 'voices' && renderVoicesTab()}
          {activeTab === 'settings' && renderSettingsTab()}
        </Animated.ScrollView>

        {/* Bottom Navigation */}
        <View style={styles.bottomNavigation}>
          <TouchableOpacity 
            style={[styles.navItem, activeTab === 'home' && styles.navItemActive]}
            onPress={() => setActiveTab('home')}
          >
            <Ionicons 
              name={activeTab === 'home' ? 'home' : 'home-outline'} 
              size={24} 
              color={activeTab === 'home' ? '#43435F' : '#777'} 
            />
            <Text style={[styles.navText, activeTab === 'home' && styles.navTextActive]}>Home</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.navItem, activeTab === 'voices' && styles.navItemActive]}
            onPress={() => setActiveTab('voices')}
          >
            <Ionicons 
              name={activeTab === 'voices' ? 'mic' : 'mic-outline'} 
              size={24} 
              color={activeTab === 'voices' ? '#43435F' : '#777'} 
            />
            <Text style={[styles.navText, activeTab === 'voices' && styles.navTextActive]}>Voices</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.navItem, activeTab === 'settings' && styles.navItemActive]}
            onPress={() => setActiveTab('settings')}
          >
            <Ionicons 
              name={activeTab === 'settings' ? 'settings' : 'settings-outline'} 
              size={24} 
              color={activeTab === 'settings' ? '#43435F' : '#777'} 
            />
            <Text style={[styles.navText, activeTab === 'settings' && styles.navTextActive]}>Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Overlay for selection mode */}
        {isSelecting && (
          <Pressable
            style={styles.overlay}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setIsSelecting(false);
              setSelectedVoiceId(null);
            }}
          />
        )}
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  gradient: { 
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 15,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  scrollContent: {
    paddingBottom: 80,
  },
  tabContent: {
    padding: 20,
  },
  welcomeSection: {
    marginBottom: 25,
    marginTop: 20,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#43435F',
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: '#095684',
    textAlign: 'center',
    marginTop: 5,
  },
  featureCardsContainer: {
    marginBottom: 30,
  },
  mainFeatureCard: {
    backgroundColor: '#fff',
    borderRadius: 15,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    height: 100,
  },
  quickStartContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    height: '100%',
  },
  quickStartTextContainer: {
    flex: 1,
    paddingLeft: 15,
  },
  quickStartArrow: {
    padding: 5,
  },
  featureCardIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#43435F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#43435F',
  },
  featureCardSubtitle: {
    fontSize: 14,
    color: '#095684',
    marginTop: 3,
  },
  smallCardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  smallFeatureCard: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 15,
    width: '48%',
    height: 110,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  smallCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#43435F',
  },
  recentVoicesSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#43435F',
  },
  seeAllText: {
    fontSize: 14,
    color: '#095684',
    fontWeight: '600',
  },
  voiceCard: {
    backgroundColor: '#fff',
    borderRadius: 15,
    marginBottom: 12,
    padding: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  voiceCardSelected: {
    backgroundColor: 'rgba(91, 223, 214, 0.1)',
    borderWidth: 1,
    borderColor: '#5BDFD6',
  },
  voiceCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  voiceIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#43435F',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  voiceInfo: {
    flex: 1,
  },
  voiceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#43435F',
    marginBottom: 4,
  },
  voiceId: {
    fontSize: 13,
    color: '#777',
  },
  voiceActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(217, 208, 231, 0.2)',
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  voiceActionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  bottomNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingTop: 12,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 10,
    paddingBottom: Platform.OS === 'ios' ? 25 : 12,
  },
  navItem: {
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 20,
  },
  navItemActive: {
    backgroundColor: 'rgba(217, 208, 231, 0.5)',
    borderRadius: 20,
    paddingHorizontal: 25,
  },
  navText: {
    marginTop: 4,
    fontSize: 12,
    color: '#777',
  },
  navTextActive: {
    color: '#43435F',
    fontWeight: '600',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 15,
    marginVertical: 10,
  },
  emptyStateIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#43435F',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#777',
    marginTop: 10,
    marginBottom: 16,
    textAlign: 'center',
  },
  emptyStateButton: {
    backgroundColor: '#43435F',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  emptyStateButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  voicesList: {
    paddingBottom: 20,
  },
  deleteButton: {
    flexDirection: 'row',
    backgroundColor: '#e74c3c',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    marginLeft: 5,
    fontWeight: '600',
  },
  cancelSelectButton: {
    backgroundColor: '#777',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    alignSelf: 'center',
    marginTop: 20,
  },
  cancelSelectButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  profileSection: {
    alignItems: 'center',
    padding: 20,
    marginBottom: 30,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#43435F',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#43435F',
  },
  settingsSection: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 0,
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(217, 208, 231, 0.4)',
  },
  settingText: {
    flex: 1,
    marginLeft: 15,
    fontSize: 16,
    color: '#43435F',
  },
  appInfoSection: {
    alignItems: 'center',
  },
  appVersionText: {
    color: '#777',
    fontSize: 14,
  }
});