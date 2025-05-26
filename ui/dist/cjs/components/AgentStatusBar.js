"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentStatusBar = AgentStatusBar;
const jsx_runtime_1 = require("react/jsx-runtime");
function AgentStatusBar({ isLoading, isStreaming, error, currentRunId }) {
    if (error) {
        return ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center space-x-2", children: [(0, jsx_runtime_1.jsx)("div", { className: "w-2 h-2 bg-red-400 rounded-full" }), (0, jsx_runtime_1.jsx)("span", { className: "text-sm text-red-600 font-medium", children: "Error occurred" })] }));
    }
    if (isStreaming) {
        return ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center space-x-2", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex space-x-1", children: [(0, jsx_runtime_1.jsx)("div", { className: "w-2 h-2 bg-blue-400 rounded-full animate-bounce" }), (0, jsx_runtime_1.jsx)("div", { className: "w-2 h-2 bg-blue-400 rounded-full animate-bounce", style: { animationDelay: "0.1s" } }), (0, jsx_runtime_1.jsx)("div", { className: "w-2 h-2 bg-blue-400 rounded-full animate-bounce", style: { animationDelay: "0.2s" } })] }), (0, jsx_runtime_1.jsx)("span", { className: "text-sm text-blue-600 font-medium", children: "Responding..." })] }));
    }
    if (isLoading) {
        return ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center space-x-2", children: [(0, jsx_runtime_1.jsx)("div", { className: "w-2 h-2 bg-yellow-400 rounded-full animate-pulse" }), (0, jsx_runtime_1.jsx)("span", { className: "text-sm text-yellow-600 font-medium", children: "Thinking..." })] }));
    }
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center space-x-2", children: [(0, jsx_runtime_1.jsx)("div", { className: "w-2 h-2 bg-green-400 rounded-full" }), (0, jsx_runtime_1.jsx)("span", { className: "text-sm text-gray-500", children: "Ready to help" })] }));
}
//# sourceMappingURL=AgentStatusBar.js.map