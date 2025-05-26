"use client"
import type { ChatMessage } from "./types"
import ReactMarkdown from 'react-markdown'

export interface MessageItemProps {
  message: ChatMessage
  isLast?: boolean
  isStreaming?: boolean
  className?: string
}

export function MessageItem({ message, isLast = false, isStreaming = false, className = "" }: MessageItemProps) {
  const isUser = message.sender === "user"
  const isSystem = message.sender === "system"
  const isTool = message.sender.startsWith("tool_")

  if (isUser) {
    return (
      <div className={`flex justify-end ${className}`}>
        <div className="bg-gray-100 rounded-full py-3 px-5 max-w-[80%]">
          <p className="text-gray-900">{message.text}</p>
        </div>
      </div>
    )
  }

  if (isSystem) {
    return (
      <div className={`flex justify-center ${className}`}>
        <div className="bg-gray-50 border border-gray-200 rounded-full py-2 px-4 text-sm text-gray-600">
          {message.text}
        </div>
      </div>
    )
  }

  if (isTool) {
    return (
      <div className={`flex justify-start ${className}`}>
        <div className="max-w-[80%] space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
            <span>Tool: {message.metadata?.toolName || "Unknown"}</span>
            <span
              className={`px-2 py-1 rounded-full text-xs ${
                message.status === "completed"
                  ? "bg-green-100 text-green-700"
                  : message.status === "error"
                    ? "bg-red-100 text-red-700"
                    : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {message.status}
            </span>
          </div>
          <div className="text-gray-900">
            <FormattedContent content={message.text} />
          </div>
        </div>
      </div>
    )
  }

  // Assistant message
  return (
    <div className={`flex justify-start ${className}`}>
      <div className="max-w-[80%]">
        <div className="text-gray-900">
          <FormattedContent content={message.text} />
          {isLast && isStreaming && <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-1"></span>}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  )
}

function FormattedContent({ content }: { content: string }) {
  // Handle structured product data
  if (content.includes("Category:") && content.includes("Price:")) {
    const items = content.split(/\d+\.\s+/).filter((item) => item.trim())

    return (
      <div className="space-y-3">
        {items.slice(0, 5).map((item, index) => {
          const parts = item.split(" - ")
          const title = parts[0]?.trim()
          const details = parts.slice(1)

          if (!title) return null

          return (
            <div key={index} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
              <div className="font-medium text-gray-900 mb-1"> <ReactMarkdown>{title}</ReactMarkdown></div>
              <div className="text-sm text-gray-600 space-y-1">
                {details.map((detail, i) => (
                  <div key={i}><ReactMarkdown components={{
                    img: ({ node, ...props }) => (
                      // Tailwind: w-32 (8rem), h-auto to keep aspect
                      <img className="w-32 h-auto rounded" {...props} />
                    ),
                  }}>{detail.trim()}</ReactMarkdown></div>
                ))}
              </div>
            </div>
          )
        })}
        {items.length > 5 && <div className="text-sm text-gray-500 italic">... and {items.length - 5} more items</div>}
      </div>
    )
  }

  // Regular text with basic formatting
  return (
    <div className="prose prose-sm max-w-none">
      {content.split("\n").map((line, index) => (
        <p key={index} className="mb-2 last:mb-0">
          {line
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .split("<strong>")
            .map((part, i) => {
              if (part.includes("</strong>")) {
                const [bold, rest] = part.split("</strong>")
                return (
                  <span key={i}>
                    <strong>{bold}</strong>
                    {rest}
                  </span>
                )
              }
              return part
            })}
        </p>
      ))}
    </div>
  )
}
