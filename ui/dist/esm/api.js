// packages/agentb-chat-ui/src/api.ts
export async function streamAgentResponse(payload) {
    const { backendUrl, threadId, userMessage } = payload;
    // The backend's AgentB.getExpressStreamingHttpHandler expects `prompt` at top level of body
    // and threadId either in body or query.
    const requestBody = {
        prompt: userMessage.content, // The actual user text
        threadId: threadId, // Current thread ID
    };
    const response = await fetch(`${backendUrl}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify(requestBody),
    });
    if (!response.ok || !response.body) {
        const errorBody = await response.text().catch(() => 'Unknown error details from server.');
        console.error("Stream Agent Response Error:", response.status, errorBody);
        throw new Error(`Failed to stream agent response (${response.status}): ${errorBody}`);
    }
    return {
        streamReader: response.body.getReader(),
    };
}
export async function* parseSSEStream(streamReader) {
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await streamReader.read();
        if (done) {
            if (buffer.trim()) {
                // Process any remaining data in the buffer (less common for SSE which uses \n\n)
                // but good for robustness if the stream ends mid-event.
                const lines = buffer.split('\n'); // Split by single newline for line-by-line processing
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const jsonData = line.substring(5);
                            if (jsonData.trim()) { // Ensure non-empty JSON
                                yield JSON.parse(jsonData);
                            }
                        }
                        catch (e) {
                            console.error('Failed to parse trailing SSE event data:', e, "Line:", line);
                        }
                    }
                }
            }
            break;
        }
        buffer += decoder.decode(value, { stream: true });
        let eolIndex;
        // SSE messages are separated by double newlines
        while ((eolIndex = buffer.indexOf('\n\n')) >= 0) {
            const messageBlock = buffer.substring(0, eolIndex);
            buffer = buffer.substring(eolIndex + 2); // Consume the message and the \n\n
            const lines = messageBlock.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const jsonData = line.substring(5);
                        if (jsonData.trim()) { // Ensure non-empty JSON
                            yield JSON.parse(jsonData);
                        }
                    }
                    catch (e) {
                        console.error('Failed to parse SSE event data:', e, "Line:", line);
                    }
                }
                // Other SSE fields like 'event:', 'id:', 'retry:' could be handled here if needed
            }
        }
    }
    // If stream ends and there's still data in buffer not terminated by \n\n
    // (e.g., if the last event wasn't followed by \n\n specifically)
    // This part is a bit more tricky and depends on how strictly the server formats the end of the stream.
    // Often, the server ensures a final \n\n or the `done` signal is sufficient.
    if (buffer.trim()) {
        const lines = buffer.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const jsonData = line.substring(5);
                    if (jsonData.trim()) {
                        yield JSON.parse(jsonData);
                    }
                }
                catch (e) {
                    console.error('Failed to parse final SSE event data in buffer:', e, "Line:", line);
                }
            }
        }
    }
}
//# sourceMappingURL=api.js.map