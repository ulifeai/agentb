"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function AgentStatusBar({ isLoading, isStreaming, error, currentRunId }) {
    if (error) {
        return (_jsxs("div", { className: "flex items-center space-x-2", children: [_jsx("div", { className: "w-2 h-2 bg-red-400 rounded-full" }), _jsx("span", { className: "text-sm text-red-600 font-medium", children: "Error occurred" })] }));
    }
    if (isStreaming) {
        return (_jsxs("div", { className: "flex items-center space-x-2", children: [_jsxs("div", { className: "flex space-x-1", children: [_jsx("div", { className: "w-2 h-2 bg-blue-400 rounded-full animate-bounce" }), _jsx("div", { className: "w-2 h-2 bg-blue-400 rounded-full animate-bounce", style: { animationDelay: "0.1s" } }), _jsx("div", { className: "w-2 h-2 bg-blue-400 rounded-full animate-bounce", style: { animationDelay: "0.2s" } })] }), _jsx("span", { className: "text-sm text-blue-600 font-medium", children: "Responding..." })] }));
    }
    if (isLoading) {
        return (_jsxs("div", { className: "flex items-center space-x-2", children: [_jsx("div", { className: "w-2 h-2 bg-yellow-400 rounded-full animate-pulse" }), _jsx("span", { className: "text-sm text-yellow-600 font-medium", children: "Thinking..." })] }));
    }
    return (_jsxs("div", { className: "flex items-center space-x-2", children: [_jsx("div", { className: "w-2 h-2 bg-green-400 rounded-full" }), _jsx("span", { className: "text-sm text-gray-500", children: "Ready to help" })] }));
}
//# sourceMappingURL=AgentStatusBar.js.map