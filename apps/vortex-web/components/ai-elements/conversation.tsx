"use client";

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";

export function Conversation({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ae-conversation ${className}`.trim()} {...props} />;
}

export function ConversationContent({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [children]);
  return <div ref={ref} className={`ae-conversation-content ${className}`.trim()}>{children}</div>;
}
