"use client"

export interface AgentStatusBarProps {
  isLoading: boolean
  isStreaming: boolean
  error: string | null
  currentRunId: string | null
}

export function AgentStatusBar({ isLoading, isStreaming, error, currentRunId }: AgentStatusBarProps) {
  if (error) {
    return (
      <div className="flex items-center space-x-2">
        <div className="w-2 h-2 bg-red-400 rounded-full"></div>
        <span className="text-sm text-red-600 font-medium">Error occurred</span>
      </div>
    )
  }

  if (isStreaming) {
    return (
      <div className="flex items-center space-x-2">
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
        </div>
        <span className="text-sm text-blue-600 font-medium">Responding...</span>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
        <span className="text-sm text-yellow-600 font-medium">Thinking...</span>
      </div>
    )
  }

  return (
    <div className="flex items-center space-x-2">
      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
      <span className="text-sm text-gray-500">Ready to help</span>
    </div>
  )
}
