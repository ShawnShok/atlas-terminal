"use client";

import {
  ArrowRight,
  Bot,
  ChevronRight,
  CircleAlert,
  Eraser,
  LoaderCircle,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  AssistantReply,
  AssistantTerminalView,
} from "@/lib/assistant/research";
import type { PanelView } from "@/lib/workspace/model";

interface AtlasAssistantProps {
  readonly open: boolean;
  readonly ticker: string;
  readonly activeView: PanelView;
  readonly onClose: () => void;
  readonly onNavigate: (view: AssistantTerminalView) => void;
}

type ChatMessage =
  | { readonly id: string; readonly role: "user"; readonly text: string }
  | { readonly id: string; readonly role: "assistant"; readonly text?: string; readonly reply?: AssistantReply };

const STORAGE_KEY = "atlas:copilot:history:v1";

function messageId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `message-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isStoredMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return typeof message.id === "string"
    && (message.role === "user" || message.role === "assistant")
    && (typeof message.text === "string" || typeof message.reply === "object");
}

function assistantText(message: ChatMessage): string {
  if (message.role === "user") return message.text;
  if (message.text) return message.text;
  if (!message.reply) return "";
  return [message.reply.headline, message.reply.summary, ...message.reply.sections.map((section) => `${section.title}: ${section.body}`)].join("\n");
}

function initialMessage(): ChatMessage {
  return {
    id: "atlas-copilot-welcome",
    role: "assistant",
    text: "Ask about the active ticker's setup, catalysts, technicals, financials, risks, or options. I will use ATLAS data and show exactly which evidence supports the answer.",
  };
}

export function AtlasAssistant({ open, ticker, activeView, onClose, onNavigate }: AtlasAssistantProps) {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([initialMessage()]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const normalizedTicker = ticker.trim().toUpperCase();
  const suggestions = useMemo(() => [
    `Give me the bull, base, and bear case for ${normalizedTicker}`,
    `What are the key risks for ${normalizedTicker}?`,
    `Analyze ${normalizedTicker}'s options positioning`,
    `What catalysts are coming for ${normalizedTicker}?`,
  ], [normalizedTicker]);

  useEffect(() => {
    let restored: readonly ChatMessage[] | undefined;
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
      if (Array.isArray(stored)) {
        const valid = stored.filter(isStoredMessage).slice(-20);
        if (valid.length) restored = valid;
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    const restoreTimer = window.setTimeout(() => {
      if (restored) setMessages(restored);
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20)));
  }, [hydrated, messages]);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 80);
    const scrollTimer = window.setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 0);
    return () => {
      window.clearTimeout(focusTimer);
      window.clearTimeout(scrollTimer);
    };
  }, [messages, open, sending]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  const send = async (suggested?: string) => {
    const text = (suggested ?? draft).trim();
    if (!text || sending || !/^[A-Z][A-Z0-9.-]{0,14}$/.test(normalizedTicker)) return;
    const userMessage: ChatMessage = { id: messageId(), role: "user", text };
    const nextMessages = [...messages, userMessage].slice(-20);
    setMessages(nextMessages);
    setDraft("");
    setSending(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          ticker: normalizedTicker,
          activeView,
          history: nextMessages.slice(-8).map((message) => ({ role: message.role, content: assistantText(message).slice(0, 1_200) })),
        }),
      });
      const payload = await response.json() as {
        ok: boolean;
        data?: AssistantReply;
        error?: { message?: string };
      };
      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "ATLAS Copilot could not complete the research request.");
      }
      const assistantMessage: ChatMessage = { id: messageId(), role: "assistant", reply: payload.data };
      setMessages((current) => [...current, assistantMessage].slice(-20));
    } catch (error) {
      const assistantMessage: ChatMessage = {
        id: messageId(),
        role: "assistant",
        text: error instanceof Error ? error.message : "ATLAS Copilot is temporarily unavailable.",
      };
      setMessages((current) => [...current, assistantMessage].slice(-20));
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;
  return (
    <aside className="atlas-assistant" aria-label="ATLAS Copilot" aria-live="polite">
      <header className="assistant-header">
        <span className="assistant-mark"><Sparkles size={14} /></span>
        <div>
          <span>CONTEXTUAL MARKET RESEARCH</span>
          <strong>ATLAS COPILOT</strong>
        </div>
        <button
          type="button"
          title="Clear conversation"
          aria-label="Clear Copilot conversation"
          onClick={() => setMessages([initialMessage()])}
        >
          <Eraser size={14} />
        </button>
        <button type="button" title="Close" aria-label="Close ATLAS Copilot" onClick={onClose}><X size={15} /></button>
      </header>

      <div className="assistant-context-bar">
        <span><i /> LIVE CONTEXT</span>
        <strong>{normalizedTicker}</strong>
        <small>{activeView.replaceAll("-", " ").toUpperCase()}</small>
      </div>

      <div className="assistant-messages" ref={scrollRef}>
        {messages.map((message) => message.role === "user" ? (
          <article className="assistant-message is-user" key={message.id}>
            <span>YOU</span>
            <p>{message.text}</p>
          </article>
        ) : (
          <article className="assistant-message is-assistant" key={message.id}>
            <span><Bot size={11} /> ATLAS</span>
            {message.text && <p>{message.text}</p>}
            {message.reply && (
              <div className="assistant-reply">
                <header>
                  <div>
                    <small>{message.reply.confidence.toUpperCase()} EVIDENCE COVERAGE</small>
                    <h2>{message.reply.headline}</h2>
                  </div>
                  <Sparkles size={15} />
                </header>
                <p className="assistant-summary">{message.reply.summary}</p>
                <div className="assistant-sections">
                  {message.reply.sections.map((section) => (
                    <section key={section.title}>
                      <strong>{section.title}</strong>
                      <p>{section.body}</p>
                    </section>
                  ))}
                </div>
                {message.reply.evidence.length > 0 && (
                  <div className="assistant-evidence">
                    <span>EVIDENCE · OPEN IN TERMINAL</span>
                    {message.reply.evidence.map((item) => (
                      <button type="button" key={`${item.label}-${item.value}`} onClick={() => onNavigate(item.view)}>
                        <small>{item.label}</small>
                        <strong>{item.value}</strong>
                        <em>{item.detail}</em>
                        <ChevronRight size={12} />
                      </button>
                    ))}
                  </div>
                )}
                <footer>
                  <span>{message.reply.source}</span>
                  <time dateTime={message.reply.asOf}>{new Date(message.reply.asOf).toLocaleString()}</time>
                  <p><CircleAlert size={11} /> {message.reply.disclaimer}</p>
                </footer>
                <div className="assistant-followups">
                  {message.reply.followUps.map((followUp) => (
                    <button type="button" key={followUp} onClick={() => void send(followUp)}>{followUp}<ArrowRight size={11} /></button>
                  ))}
                </div>
              </div>
            )}
          </article>
        ))}
        {sending && (
          <article className="assistant-message is-assistant is-thinking">
            <span><Bot size={11} /> ATLAS</span>
            <p><LoaderCircle className="assistant-spinner" size={13} /> Reading {normalizedTicker} price, chart, catalysts, financials, and options…</p>
          </article>
        )}
        {messages.length === 1 && !sending && (
          <div className="assistant-starters">
            <span>START A RESEARCH THREAD</span>
            {suggestions.map((suggestion) => (
              <button type="button" key={suggestion} onClick={() => void send(suggestion)}>{suggestion}<ArrowRight size={12} /></button>
            ))}
          </div>
        )}
      </div>

      <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <textarea
          ref={inputRef}
          value={draft}
          rows={2}
          maxLength={600}
          aria-label={`Ask ATLAS about ${normalizedTicker}`}
          placeholder={`Ask anything about ${normalizedTicker}…`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button type="submit" disabled={sending || draft.trim().length < 2} aria-label="Send question"><Send size={14} /></button>
        <small>ENTER TO SEND · SHIFT + ENTER FOR A NEW LINE</small>
      </form>
    </aside>
  );
}
