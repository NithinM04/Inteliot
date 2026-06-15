import { useState } from 'react';

export function useCommandHistory() {
  const [messages, setMessages] = useState([]);

  const addMessage = (text, sender, source = 'text', commands = null) => {
    const newMessage = {
      id: Date.now(),
      text,
      sender,
      timestamp: new Date(),
      source,
      commands,
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage;
  };

  const clearHistory = () => setMessages([]);

  return { messages, addMessage, clearHistory, setMessages };
}
