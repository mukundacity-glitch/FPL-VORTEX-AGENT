"use client";

// AI Elements-compatible message primitives, adapted from vercel/ai-elements
// (Apache-2.0). Kept intentionally small for Vortex AI Phase 6.
import { memo, type ComponentProps, type HTMLAttributes } from "react";
import { Streamdown } from "streamdown";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: "user" | "assistant";
};

export function Message({ from, className = "", ...props }: MessageProps) {
  return <div className={`ae-message ae-${from} ${className}`.trim()} {...props} />;
}

export function MessageContent({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ae-message-content ${className}`.trim()} {...props} />;
}

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

export const MessageResponse = memo(function MessageResponse({ className = "", ...props }: MessageResponseProps) {
  return <Streamdown className={`ai-message-response ${className}`.trim()} {...props} />;
});
