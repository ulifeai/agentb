"use client"

import { useEffect, useRef } from "react"
import { MessageItem } from "./MessageItem"
import type { ChatMessage } from "./types"

export interface MessageListProps {
  messages: ChatMessage[]
  isLoading?: boolean
  isStreaming?: boolean
  className?: string
}

export function MessageList({ messages, isLoading = false, isStreaming = false, className = "" }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading])

  return (
    <div className={`flex-1 space-y-6 overflow-y-auto ${className}`}>
      {messages.map((message, index) => (
        <MessageItem
          key={message.id}
          message={message}
          isLast={index === messages.length - 1}
          isStreaming={isStreaming && index === messages.length - 1}
        />
      ))}

      {isLoading && !isStreaming && messages.length > 0 && (
        <div className="flex justify-start">
          <div className="flex space-x-1">
            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
            <div
              className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
              style={{ animationDelay: "0.2s" }}
            ></div>
            <div
              className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
              style={{ animationDelay: "0.4s" }}
            ></div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  )
}
