import React, { useState } from 'react';
import { View, StyleSheet, Pressable, TextInput, FlatList, ActivityIndicator, Keyboard, ScrollView, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useGetTravelAssistantRecommendations, PropertySummary, TravelAssistantMessage } from '@workspace/api-client-react';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { PropertyCard } from '@/components/PropertyCard';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  recommendations?: PropertySummary[];
  searchUrl?: string | null;
  isLoading?: boolean;
  isError?: boolean;
};

const STARTER_PROMPTS = [
  "Romantic getaways near Delhi",
  "Budget hotels in Goa",
  "Luxury stay in Mumbai under ₹15k",
  "Family resorts in Kerala with pool"
];

export default function AssistantScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  
  const { mutate: getRecommendations, isPending } = useGetTravelAssistantRecommendations();
  
  const handleSend = (text: string) => {
    if (!text.trim() || isPending) return;
    
    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();
    
    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: text.trim(),
    };
    
    const assistantPlaceholder: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      isLoading: true,
    };
    
    const history: TravelAssistantMessage[] = messages
      .filter(m => !m.isError && !m.isLoading)
      .slice(-6)
      .map(m => ({
        role: m.role,
        content: m.content,
      }));
      
    setMessages(prev => [...prev, userMessage, assistantPlaceholder]);
    setInput('');
    Keyboard.dismiss();
    
    getRecommendations({
      data: {
        message: text.trim(),
        history
      }
    }, {
      onSuccess: (data) => {
        setMessages(prev => prev.map(m => {
          if (m.id === assistantMsgId) {
            return {
              ...m,
              content: data.reply,
              recommendations: data.recommendations,
              searchUrl: data.searchUrl,
              isLoading: false,
            };
          }
          return m;
        }));
      },
      onError: () => {
        setMessages(prev => prev.map(m => {
          if (m.id === assistantMsgId) {
            return {
              ...m,
              content: "I'm having trouble connecting right now. Please try again later.",
              isLoading: false,
              isError: true,
            };
          }
          return m;
        }));
      }
    });
  };

  const handleSearchUrl = (url: string) => {
    try {
      const queryString = url.split('?')[1];
      if (queryString) {
        const routeParams: Record<string, string> = {};
        queryString.split('&').forEach(pair => {
          const [key, val] = pair.split('=');
          if (key) routeParams[decodeURIComponent(key)] = decodeURIComponent(val || '');
        });
        router.push({ pathname: '/list', params: routeParams });
      } else {
        router.push('/list');
      }
    } catch {
      router.push('/list');
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    
    return (
      <View style={[styles.messageContainer, isUser ? styles.messageContainerUser : styles.messageContainerAssistant]}>
        <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAssistant]}>
          {!isUser && (
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Feather name="zap" size={14} color={colors.primaryForeground} />
            </View>
          )}
          
          <View style={[
            styles.messageBubble, 
            isUser 
              ? [styles.bubbleUser, { backgroundColor: colors.primary }] 
              : [styles.bubbleAssistant, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]
          ]}>
            {item.isLoading ? (
              <ActivityIndicator color={colors.primary} size="small" style={{ margin: 8 }} />
            ) : (
              <ThemedText color={isUser ? colors.primaryForeground : colors.foreground}>
                {item.content}
              </ThemedText>
            )}
          </View>
        </View>
        
        {!isUser && item.recommendations && item.recommendations.length > 0 && (
          <ScrollView 
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recommendationsList}
          >
            {item.recommendations.map(prop => (
              <PropertyCard key={prop.id} property={prop} />
            ))}
          </ScrollView>
        )}
        
        {!isUser && item.searchUrl && (
          <Pressable 
            style={[styles.searchLinkBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
            onPress={() => handleSearchUrl(item.searchUrl!)}
            testID={`search-link-${item.id}`}
          >
            <ThemedText weight="medium" color={colors.primary}>View All Related Stays</ThemedText>
            <Feather name="arrow-right" size={16} color={colors.primary} />
          </Pressable>
        )}
      </View>
    );
  };

  const reversedMessages = [...messages].reverse();

  const headerPaddingTop = Platform.OS === 'web' ? insets.top + 67 : insets.top || 20;
  const composerPaddingBottom = Platform.OS === 'web' ? 34 : insets.bottom || 16;

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior="padding" 
        keyboardVerticalOffset={0}
      >
        <View style={[styles.header, { paddingTop: headerPaddingTop, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} testID="back-button">
            <Feather name="arrow-left" size={24} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.headerIcon, { backgroundColor: colors.accent }]}>
              <Feather name="zap" size={16} color={colors.primary} />
            </View>
            <ThemedText type="subtitle" weight="bold">Pocket Concierge</ThemedText>
          </View>
        </View>

        {messages.length === 0 ? (
          <ScrollView 
            contentContainerStyle={styles.starterContainer} 
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ alignItems: 'center', marginBottom: 40, marginTop: 40 }}>
              <View style={[styles.welcomeIcon, { backgroundColor: colors.primary }]}>
                <Feather name="zap" size={32} color={colors.primaryForeground} />
              </View>
              <ThemedText type="title" weight="bold" style={{ marginTop: 24, textAlign: 'center' }}>
                How can I help you?
              </ThemedText>
              <ThemedText color={colors.mutedForeground} style={{ textAlign: 'center', marginTop: 12, paddingHorizontal: 32 }}>
                Tell me what kind of stay you're looking for, or try one of these suggestions.
              </ThemedText>
            </View>
            
            <View style={styles.starterList}>
              {STARTER_PROMPTS.map((prompt, idx) => (
                <Pressable 
                  key={idx}
                  style={[styles.starterPrompt, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => handleSend(prompt)}
                  testID={`starter-prompt-${idx}`}
                >
                  <ThemedText weight="medium" style={styles.starterPromptText}>{prompt}</ThemedText>
                  <Feather name="arrow-up-right" size={20} color={colors.mutedForeground} />
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList 
            inverted
            data={reversedMessages}
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            contentContainerStyle={{ paddingVertical: 20 }}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          />
        )}

        <View style={[styles.inputContainer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: composerPaddingBottom }]}>
          <View style={[styles.inputWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Ask anything..."
              placeholderTextColor={colors.mutedForeground}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
            />
          </View>
          <Pressable 
            style={[
              styles.sendBtn, 
              { backgroundColor: input.trim() && !isPending ? colors.primary : colors.muted }
            ]}
            onPress={() => handleSend(input)}
            disabled={!input.trim() || isPending}
            testID="send-button"
          >
            <Feather 
              name="send" 
              size={20} 
              color={input.trim() && !isPending ? colors.primaryForeground : colors.mutedForeground}
              style={{ marginLeft: 2, marginTop: 2 }} // center alignment adjustment for send icon
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 8, marginRight: 8 },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageContainer: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  messageContainerUser: {
    alignItems: 'flex-end',
  },
  messageContainerAssistant: {
    alignItems: 'flex-start',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    maxWidth: '85%',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    borderBottomLeftRadius: 4,
  },
  recommendationsList: {
    paddingLeft: 42, // Align with bubble (32 avatar + 10 margin)
    paddingRight: 16,
    paddingTop: 12,
  },
  searchLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    marginLeft: 42, // Align with bubble
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    alignSelf: 'flex-start',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrapper: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 12,
    borderWidth: 1,
    justifyContent: 'center',
  },
  input: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    paddingTop: 0,
    paddingBottom: 0,
    textAlignVertical: 'center',
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  starterContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  welcomeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  starterList: {
    gap: 12,
  },
  starterPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  starterPromptText: {
    fontSize: 16,
    flex: 1,
  },
});
