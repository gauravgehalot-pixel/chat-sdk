import { OpsRabbitChat } from "./client.js";
import { ChatConfigurationError } from "./errors.js";
import type { NativeOpsRabbitChatOptions } from "./types.js";

export type OpsRabbitNativeChatOptions = NativeOpsRabbitChatOptions;

/**
 * Headless, React Native-supported transport for a native Embedded Chat
 * preset. It does not set a browser Origin header and never stores secrets.
 * The token provider must obtain a short-lived, attestation-gated token from
 * the application backend for every OpsRabbit operation.
 */
export class OpsRabbitNativeChat extends OpsRabbitChat {
  constructor(options: OpsRabbitNativeChatOptions) {
    if (typeof options.fetch !== "function") {
      throw new ChatConfigurationError("OpsRabbitNativeChat requires a streaming Fetch API implementation.");
    }
    super(options);
  }
}
