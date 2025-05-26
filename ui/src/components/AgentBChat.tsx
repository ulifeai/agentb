"use client"
import { MessageList } from "./MessageList"
import { MessageInput } from "./MessageInput"
import { useChat } from "../hooks/useChat"
import type { ChatMessage } from "./types"
import { useState } from "react"

export interface AgentBChatProps {
  backendUrl: string
  initialThreadId?: string
  initialMessages?: ChatMessage[]
  className?: string
}

export function AgentBChat({ backendUrl, initialThreadId, initialMessages = [], className = "" }: AgentBChatProps) {
  const { messages, sendMessage, isLoading, isStreaming, error } = useChat({
    backendUrl,
    initialThreadId,
    initialMessages,
  })

  const [inputValue, setInputValue] = useState("")
  const hasInteracted = messages.length > 0

  const handleSendMessage = () => {
    if (inputValue.trim()) {
      sendMessage(inputValue.trim())
      setInputValue("")
    }
  }

  const quickActions = [
    { icon: "📰", label: "Latest News", color: "text-blue-600" },
    { icon: "🤖", label: "Research", color: "text-purple-600" },
    { icon: "🔍", label: "Analysis", color: "text-green-600" },
    { icon: "💡", label: "Creative Help", color: "text-yellow-600" },
    { icon: "📊", label: "Data Processing", color: "text-red-600" },
    { icon: "🛠️", label: "Tool Assistant", color: "text-indigo-600" },
  ]

  return (
    <div className={`flex flex-col items-center justify-between min-h-screen bg-white ${className}`}>
      {!hasInteracted ? (
        // Initial welcome screen - Grok style
        <div className="w-full max-w-3xl px-4 py-8 space-y-8 flex-1 flex flex-col justify-center">
          {/* Logo and Title */}
          <div className="text-center space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-black rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
            <h1 className="text-3xl font-semibold text-gray-900">Agent Assistant</h1>
            <p className="text-xl text-gray-600">How can I help you today?</p>
          </div>

          {/* Main Input */}
          <div className="relative mt-8">
            <div className="relative rounded-full border border-gray-300 bg-white shadow-sm">
              <input
                type="text"
                placeholder="What do you want to know?"
                className="w-full pl-6 pr-24 py-4 rounded-full border-none focus:ring-0 focus:outline-none text-base"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button className="h-8 w-8 text-gray-500 hover:text-gray-700">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </button>
                <button
                  className="h-8 w-8 rounded-md bg-green-600 hover:bg-green-700 text-white flex items-center justify-center"
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim()}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

         
        </div>
      ) : (
        <>
          {/* Chat Messages */}
          <div className="w-full max-w-5xl px-4 py-8 flex-1 flex flex-col">
            <MessageList messages={messages} isLoading={isLoading} isStreaming={isStreaming} />
          </div>

          {/* Input field always at the bottom */}
          <div className="w-full max-w-5xl px-4 py-4 border-t border-gray-100">
            <MessageInput
              value={inputValue}
              onChange={setInputValue}
              onSend={handleSendMessage}
              disabled={isLoading}
              placeholder="How can I help?"
            />
          </div>
        </>
      )}

      {/* Error Display */}
      {error && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
