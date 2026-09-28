import React, { useState, useRef, useEffect } from "react";
import { useGetTravelAssistantRecommendations } from "@workspace/api-client-react";
import type { PropertySummary, TravelAssistantMessageRole } from "@workspace/api-client-react";
import { X, Send, Sparkles, MapPin, Star, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { trackEvent } from "@/lib/analytics";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ChatMessage = {
  id: string;
  role: TravelAssistantMessageRole;
  content: string;
  recommendations?: PropertySummary[];
  searchUrl?: string | null;
  needsFollowUp?: boolean;
  followUpQuestion?: string | null;
  remainingRequests?: number;
  isError?: boolean;
};

const STARTER_PROMPTS = [
  "Find a luxury resort in Goa",
  "Budget stays near the beach in Kerala",
  "A quiet hill station retreat",
];

export function TravelAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const getRecommendations = useGetTravelAssistantRecommendations();

  // Scroll to bottom when messages change
  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleSubmit = (text: string) => {
    if (!text.trim() || getRecommendations.isPending) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
    };

    const loadingMessageId = (Date.now() + 1).toString();
    const loadingMessage: ChatMessage = {
      id: loadingMessageId,
      role: "assistant",
      content: "",
    };

    setMessages((prev) => [...prev, userMessage, loadingMessage]);
    setInputValue("");

    // Prepare history (up to 6 messages as per requirements)
    const history = messages.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    getRecommendations.mutate(
      {
        data: {
          message: text.trim(),
          history,
        },
      },
      {
        onSuccess: (data) => {
          trackEvent("assistant_recommendations_returned", {
            recommendation_count: data.recommendations.length,
            has_filtered_results: Boolean(data.searchUrl),
            needs_follow_up: data.needsFollowUp,
          });
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === loadingMessageId
                ? {
                    ...msg,
                    content: data.reply,
                    recommendations: data.recommendations,
                    searchUrl: data.searchUrl,
                    needsFollowUp: data.needsFollowUp,
                    followUpQuestion: data.followUpQuestion,
                    remainingRequests: data.remainingRequests,
                  }
                : msg
            )
          );
        },
        onError: () => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === loadingMessageId
                ? {
                    ...msg,
                    content: "I'm sorry, I'm having trouble connecting to my concierge desk right now. Please try again in a moment.",
                    isError: true,
                  }
                : msg
            )
          );
        },
      }
    );
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => {
          trackEvent("assistant_opened");
          setIsOpen(true);
        }}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-105 active:scale-95 animate-slide-up-fade"
        aria-label="Open Travel Assistant"
      >
        <Sparkles className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 z-50 flex h-[100dvh] w-full flex-col bg-background shadow-2xl sm:bottom-6 sm:right-6 sm:h-[600px] sm:w-[400px] sm:rounded-2xl sm:border sm:border-border animate-slide-up-fade overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-secondary px-4 py-3 text-secondary-foreground sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-semibold leading-none text-white">StayBest Concierge</h3>
            <p className="text-xs text-secondary-foreground/70">Your AI travel assistant</p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="rounded-full p-2 text-secondary-foreground/70 transition-colors hover:bg-secondary-foreground/10 hover:text-white"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 dark:bg-background">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-8 w-8" />
            </div>
            <h4 className="mb-2 font-serif text-xl font-medium text-secondary dark:text-foreground">
              Where to next?
            </h4>
            <p className="mb-6 max-w-[250px] text-sm text-muted-foreground">
              I can help you discover the perfect stay. Ask me anything!
            </p>
            <div className="flex w-full flex-col gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSubmit(prompt)}
                  className="rounded-xl border border-border bg-card px-4 py-2.5 text-left text-sm text-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : msg.isError
                      ? "bg-destructive/10 text-destructive border border-destructive/20 rounded-bl-sm"
                      : "bg-card text-foreground border border-border rounded-bl-sm"
                  }`}
                >
                  {msg.content === "" ? (
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40"></span>
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40 delay-100"></span>
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40 delay-200"></span>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>

                {/* Recommendations */}
                {msg.recommendations && msg.recommendations.length > 0 && (
                  <div className="mt-3 flex w-full flex-col gap-3">
                    <h5 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Recommended for you
                    </h5>
                    <div className="flex w-full snap-x snap-mandatory gap-3 overflow-x-auto pb-4 hide-scrollbar">
                      {msg.recommendations.map((property, index) => (
                        <Link
                          key={property.id}
                          href={`/property/${property.id}`}
                          onClick={() =>
                            trackEvent("assistant_property_clicked", {
                              recommendation_position: index + 1,
                            })
                          }
                          className="group relative flex w-[240px] shrink-0 snap-center flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/50"
                        >
                          <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
                            <img
                              src={property.imageUrl}
                              alt={property.name}
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                            <div className="absolute left-2 top-2 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-secondary shadow-sm backdrop-blur-sm">
                              {property.category}
                            </div>
                          </div>
                          <div className="flex flex-1 flex-col p-3">
                            <div className="flex items-start justify-between gap-2">
                              <h6 className="font-serif text-sm font-semibold line-clamp-1 group-hover:text-primary">
                                {property.name}
                              </h6>
                              <div className="flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-secondary">
                                <Star className="h-3 w-3 fill-primary text-primary" />
                                {property.rating.toFixed(1)}
                              </div>
                            </div>
                            <div className="mt-1 flex items-center text-[11px] text-muted-foreground">
                              <MapPin className="mr-0.5 h-3 w-3" />
                              <span className="line-clamp-1">{property.area}, {property.city}</span>
                            </div>
                            <div className="mt-auto pt-3 flex items-center justify-between">
                              <span className="text-xs font-semibold text-secondary">
                                {formatPrice(property.startingPrice)}
                                <span className="text-[10px] font-normal text-muted-foreground">/night</span>
                              </span>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Search link */}
                {!getRecommendations.isPending && msg.role === "assistant" && (
                  <div className="mt-2 flex flex-col items-start gap-2 pl-1">
                    {msg.searchUrl && (
                      <Link
                        href={msg.searchUrl}
                        onClick={() =>
                          trackEvent("assistant_filtered_results_clicked", {
                            recommendation_count: msg.recommendations?.length ?? 0,
                          })
                        }
                        className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-secondary/90"
                      >
                        View all matching stays
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Form */}
      <div className="border-t border-border bg-card p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(inputValue);
          }}
          className="flex items-center gap-2 rounded-full border border-input bg-background pl-4 pr-1.5 py-1.5 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 shadow-sm"
        >
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask me anything..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            disabled={getRecommendations.isPending}
          />
          <Button
            type="submit"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full"
            disabled={!inputValue.trim() || getRecommendations.isPending}
          >
            <Send className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        </form>
        {/* Helper footer */}
        <div className="mt-2 flex items-center justify-center gap-2 text-center text-[10px] text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          Live StayBest listings only · 15 requests per day
        </div>
      </div>
    </div>
  );
}
