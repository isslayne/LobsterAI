/**
 * DingTalk Gateway
 * Manages WebSocket connection to DingTalk using Stream mode
 * Adapted from im-gateway for Electron main process
 */

import { EventEmitter } from 'events';
import axios from 'axios';
import {
  DingTalkConfig,
  DingTalkGatewayStatus,
  DingTalkInboundMessage,
  DingTalkMediaMessage,
  MediaMarker,
  IMMessage,
  IMMediaAttachment,
  IMStreamCallbacks,
  DEFAULT_DINGTALK_STATUS,
} from './types';
import {
  generateOutTrackId,
  createCardInstance,
  deliverCardInstance,
  startCardInputing,
  updateCardStreaming,
  finalizeCard,
} from './dingtalkAICard';
import { uploadMediaToDingTalk, detectMediaType, getOapiAccessToken, downloadDingTalkMedia, getDingTalkMediaDir } from './dingtalkMedia';
import { parseMediaMarkers } from './dingtalkMediaParser';
import { createUtf8JsonBody, JSON_UTF8_CONTENT_TYPE, stringifyAsciiJson } from './jsonEncoding';

const DINGTALK_API = 'https://api.dingtalk.com';

// Access Token cache
let accessToken: string | null = null;
let accessTokenExpiry = 0;

// Message content extraction result
interface MessageContent {
  text: string;
  messageType: string;
  mediaPath?: string;
  mediaType?: string;
  mediaPaths?: string[]; // richText 多图 downloadCode 数组
}

export class DingTalkGateway extends EventEmitter {
  private client: any = null;
  private config: DingTalkConfig | null = null;
  private savedConfig: DingTalkConfig | null = null; // Saved config for reconnection
  private status: DingTalkGatewayStatus = { ...DEFAULT_DINGTALK_STATUS };
  private onMessageCallback?: (message: IMMessage, replyFn: (text: string) => Promise<void>, streamCallbacks?: IMStreamCallbacks) => Promise<void>;
  private lastConversation: { conversationType: '1' | '2'; userId?: string; openConversationId?: string; sessionWebhook: string } | null = null;
  private log: (...args: any[]) => void = () => {};

  // Health check and auto-reconnection
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private tokenRefreshInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectDelayMs = 3000; // Reduced to 3 seconds
  private isReconnecting = false;
  private isStopping = false;
  private lastMessageTime = 0;

  // Media directory (optional custom path)
  private mediaDir?: string;

  // Message deduplication (prevent duplicate processing on Stream SDK retransmit)
  private processedMsgIds = new Map<string, number>();
  private readonly MSG_DEDUP_TTL = 5 * 60 * 1000; // 5 minutes

  // Health check configuration
  private readonly HEALTH_CHECK_INTERVAL = 10000; // 10 seconds
  private readonly MESSAGE_TIMEOUT = 60000; // 60 seconds - force reconnect if no message
  private readonly TOKEN_REFRESH_INTERVAL = 3600000; // 1 hour

  constructor() {
    super();
  }

  /**
   * Get current gateway status
   */
  getStatus(): DingTalkGatewayStatus {
    return { ...this.status };
  }

  /**
   * Set media save directory
   */
  setMediaDir(dir?: string): void {
    this.mediaDir = dir || undefined;
  }

  /**
   * Start health check monitoring
   */
  private startHealthCheck(): void {
    this.stopHealthCheck();

    this.log('[DingTalk Gateway] Starting health check monitor...');

    // Health check interval
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.HEALTH_CHECK_INTERVAL);

    // Token refresh interval
    this.tokenRefreshInterval = setInterval(() => {
      this.refreshAccessToken();
    }, this.TOKEN_REFRESH_INTERVAL);

    this.lastMessageTime = Date.now();
  }

  /**
   * Stop health check monitoring
   */
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
      this.tokenRefreshInterval = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<void> {
    if (this.isStopping) {
      return;
    }

    // If client is null, try to reconnect (previous reconnection might have failed)
    if (!this.client) {
      this.log('[DingTalk Gateway] Client is null, attempting reconnection...');
      await this.reconnect();
      return;
    }

    const now = Date.now();
    const timeSinceLastMessage = now - this.lastMessageTime;

    // If no messages for MESSAGE_TIMEOUT, force reconnection
    // Don't test token because it might be cached and give false positive
    if (timeSinceLastMessage > this.MESSAGE_TIMEOUT) {
      console.log(`[DingTalk Gateway] No messages for ${Math.floor(timeSinceLastMessage / 1000)}s, forcing reconnection...`);
      this.log('[DingTalk Gateway] Long silence detected, SDK connection may be dead, forcing reconnection...');
      await this.reconnect();
    }
  }

  /**
   * Proactively refresh access token
   */
  private async refreshAccessToken(): Promise<void> {
    if (this.isStopping || (!this.config && !this.savedConfig)) {
      return;
    }

    try {
      this.log('[DingTalk Gateway] Proactively refreshing access token...');
      // Force token refresh by clearing cache
      accessToken = null;
      accessTokenExpiry = 0;
      await this.getAccessToken();
      this.log('[DingTalk Gateway] Access token refreshed successfully');
    } catch (error: any) {
      console.error(`[DingTalk Gateway] Failed to refresh token: ${error.message}`);
    }
  }

  /**
   * Reconnect to DingTalk
   */
  private async reconnect(): Promise<void> {
    if (this.isReconnecting || this.isStopping) {
      return;
    }

    // Use savedConfig if config is null (after failed reconnection)
    const configToUse = this.config || this.savedConfig;
    if (!configToUse) {
      console.error('[DingTalk Gateway] No config available for reconnection');
      return;
    }

    this.isReconnecting = true;

    // Simple debounce delay (3 seconds), no exponential backoff
    this.log(`[DingTalk Gateway] Reconnecting in ${this.reconnectDelayMs}ms...`);

    // Use cancellable timeout
    await new Promise<void>(resolve => {
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectTimeout = null;
        resolve();
      }, this.reconnectDelayMs);
    });

    // If stopping was triggered during delay, abort reconnection
    if (this.isStopping) {
      this.isReconnecting = false;
      return;
    }

    try {
      // Stop and restart (use savedConfig which persists across reconnections)
      await this.stop();
      await this.start(configToUse);

      console.log('[DingTalk Gateway] Reconnected successfully');
    } catch (error: any) {
      console.error(`[DingTalk Gateway] Reconnection failed: ${error.message}`);
      // No retry limit, next health check or network event will retry
    } finally {
      this.isReconnecting = false;
    }
  }

  /**
   * Check if gateway is connected
   */
  isConnected(): boolean {
    return this.status.connected;
  }

  /**
   * Set message callback
   */
  setMessageCallback(
    callback: (message: IMMessage, replyFn: (text: string) => Promise<void>) => Promise<void>
  ): void {
    this.onMessageCallback = callback;
  }

  /**
   * Public method for external reconnection triggers (e.g., network events)
   */
  reconnectIfNeeded(): void {
    if (!this.client && this.savedConfig) {
      this.log('[DingTalk Gateway] External reconnection trigger');
      this.reconnect();
    }
  }

  /**
   * Start DingTalk gateway
   */
  async start(config: DingTalkConfig): Promise<void> {
    if (this.client) {
      this.log('[DingTalk Gateway] Already running, stopping first...');
      await this.stop();
    }

    if (!config.enabled) {
      console.log('[DingTalk Gateway] DingTalk is disabled in config');
      return;
    }

    if (!config.clientId || !config.clientSecret) {
      throw new Error('DingTalk clientId and clientSecret are required');
    }

    this.config = config;
    this.savedConfig = { ...config }; // Save config for reconnection
    this.isStopping = false;
    this.log = config.debug ? console.log.bind(console) : () => {};
    this.log('[DingTalk Gateway] Starting...');

    try {
      // Dynamically import dingtalk-stream
      const { DWClient, TOPIC_ROBOT } = await import('dingtalk-stream');

      this.client = new DWClient({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        debug: config.debug || false,
        keepAlive: true,
      });

      // Register message callback
      this.client.registerCallbackListener(TOPIC_ROBOT, async (res: any) => {
        // Check if client is still connected (may be null if stopped)
        if (!this.client) {
          this.log('[DingTalk Gateway] Ignoring message, gateway stopped');
          return;
        }

        // Update last message time for health check
        this.lastMessageTime = Date.now();

        const messageId = res.headers?.messageId;
        try {
          // Acknowledge message receipt
          if (messageId && this.client) {
            this.client.socketCallBackResponse(messageId, { success: true });
          }

          const data = JSON.parse(res.data) as DingTalkInboundMessage;
          await this.handleInboundMessage(data);
        } catch (error: any) {
          console.error(`[DingTalk Gateway] Error processing message: ${error.message}`);
          this.status.lastError = error.message;
          this.emit('error', error);
        }
      });

      // Connect to DingTalk
      await this.client.connect();

      this.status = {
        connected: true,
        startedAt: Date.now(),
        lastError: null,
        lastInboundAt: null,
        lastOutboundAt: null,
      };

      // Start health check and token refresh
      this.startHealthCheck();

      console.log('[DingTalk Gateway] Connected successfully with health monitoring enabled');
      this.emit('connected');
    } catch (error: any) {
      console.error(`[DingTalk Gateway] Failed to start: ${error.message}`);
      this.status = {
        connected: false,
        startedAt: null,
        lastError: error.message,
        lastInboundAt: null,
        lastOutboundAt: null,
      };
      this.client = null;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop DingTalk gateway
   */
  async stop(): Promise<void> {
    if (!this.client) {
      this.log('[DingTalk Gateway] Not running');
      return;
    }

    this.log('[DingTalk Gateway] Stopping...');
    this.isStopping = true;

    try {
      // Stop health check first
      this.stopHealthCheck();

      // Disconnect first before clearing client reference
      const client = this.client;
      this.client = null;
      this.config = null;
      // Keep savedConfig for reconnection

      // Try to disconnect the client
      if (client && typeof client.disconnect === 'function') {
        try {
          await client.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
      }

      this.status = {
        connected: false,
        startedAt: null,
        lastError: null,
        lastInboundAt: null,
        lastOutboundAt: null,
      };
      this.log('[DingTalk Gateway] Stopped');
      this.emit('disconnected');
    } catch (error: any) {
      console.error(`[DingTalk Gateway] Error stopping: ${error.message}`);
      this.status.lastError = error.message;
    } finally {
      this.isStopping = false;
    }
  }

  /**
   * Get DingTalk access token (with caching)
   */
  private async getAccessToken(): Promise<string> {
    const config = this.config || this.savedConfig;
    if (!config) {
      throw new Error('DingTalk config not set');
    }

    const now = Date.now();
    if (accessToken && accessTokenExpiry > now + 60000) {
      this.log('[DingTalk Gateway] 使用缓存的 AccessToken');
      return accessToken;
    }

    this.log('[DingTalk Gateway] 获取新的 AccessToken...');
    const response = await axios.post<{ accessToken: string; expireIn: number }>(
      `${DINGTALK_API}/v1.0/oauth2/accessToken`,
      {
        appKey: config.clientId,
        appSecret: config.clientSecret,
      }
    );

    accessToken = response.data.accessToken;
    accessTokenExpiry = now + response.data.expireIn * 1000;
    this.log(`[DingTalk Gateway] AccessToken 获取成功, 过期时间: ${new Date(accessTokenExpiry).toLocaleString()}`);
    return accessToken;
  }

  /**
   * Deduplicate incoming messages (Stream SDK may retransmit on network retry)
   */
  private isMessageProcessed(msgId: string): boolean {
    const now = Date.now();
    for (const [id, ts] of this.processedMsgIds) {
      if (now - ts > this.MSG_DEDUP_TTL) this.processedMsgIds.delete(id);
    }
    if (this.processedMsgIds.has(msgId)) return true;
    this.processedMsgIds.set(msgId, now);
    return false;
  }

  /**
   * Extract message content from DingTalk inbound message
   */
  private extractMessageContent(data: DingTalkInboundMessage): MessageContent {
    const msgtype = data.msgtype || 'text';

    if (msgtype === 'text') {
      return { text: data.text?.content?.trim() || '', messageType: 'text' };
    }

    if (msgtype === 'richText') {
      const richTextParts = data.content?.richText || [];
      this.log('[DingTalk] richText parts:', JSON.stringify(richTextParts));
      let text = '';
      const imageCodes: string[] = [];
      for (const part of richTextParts) {
        const imageCode = part.downloadCode || part.pictureDownloadCode;
        if (part.type === 'picture' && imageCode) {
          imageCodes.push(imageCode);
        } else if (part.text) {
          text += part.text;
        }
      }
      return {
        text: text.trim() || '[图文消息]',
        messageType: 'richText',
        mediaPaths: imageCodes.length > 0 ? imageCodes : undefined,
      };
    }

    if (msgtype === 'audio') {
      return {
        text: data.content?.recognition || '[语音消息]',
        mediaPath: data.content?.downloadCode,
        mediaType: 'audio',
        messageType: 'audio',
      };
    }

    if (msgtype === 'picture') {
      return {
        text: data.content?.pictureName || '[图片]',
        mediaPath: data.content?.downloadCode,
        mediaType: 'image',
        messageType: 'picture',
      };
    }

    return { text: data.text?.content?.trim() || `[${msgtype}消息]`, messageType: msgtype };
  }

  /**
   * Send message via session webhook
   */
  private async sendBySession(
    sessionWebhook: string,
    text: string,
    options: { atUserId?: string | null } = {}
  ): Promise<void> {
    const token = await this.getAccessToken();

    // Detect markdown
    const hasMarkdown = /^[#*>-]|[*_`#[\]]/.test(text) || text.includes('\n');
    const useMarkdown = hasMarkdown;

    let body: any;
    if (useMarkdown) {
      const title = text.split('\n')[0].replace(/^[#*\s\->]+/, '').slice(0, 20) || 'LobsterAI';
      let finalText = text;
      if (options.atUserId) finalText = `${finalText} @${options.atUserId}`;
      body = { msgtype: 'markdown', markdown: { title, text: finalText } };
    } else {
      body = { msgtype: 'text', text: { content: text } };
    }

    if (options.atUserId) {
      body.at = { atUserIds: [options.atUserId], isAtAll: false };
    }

    this.log(`[DingTalk] 发送文本消息:`, JSON.stringify({
      sessionWebhook: sessionWebhook.slice(0, 50) + '...',
      msgType: useMarkdown ? 'markdown' : 'text',
      textLength: text.length,
      text,
    }, null, 2));

    await axios({
      url: sessionWebhook,
      method: 'POST',
      data: createUtf8JsonBody(body),
      headers: { 'x-acs-dingtalk-access-token': token, 'Content-Type': JSON_UTF8_CONTENT_TYPE },
    });
  }

  /**
   * Send media message via new API (not session webhook)
   * 单聊: /v1.0/robot/oToMessages/batchSend
   * 群聊: /v1.0/robot/groupMessages/send
   */
  private async sendMediaViaNewApi(
    mediaMessage: DingTalkMediaMessage,
    options: {
      conversationType: '1' | '2'; // 1: 单聊, 2: 群聊
      userId?: string;
      openConversationId?: string;
    }
  ): Promise<void> {
    const token = await this.getAccessToken();
    const robotCode = this.config?.robotCode || this.config?.clientId;

    // msgParam 需要是 JSON 字符串
    const msgKey = mediaMessage.msgKey;
    let msgParam: string;

    if ('sampleAudio' in mediaMessage) {
      msgParam = stringifyAsciiJson(mediaMessage.sampleAudio);
    } else if ('sampleImageMsg' in mediaMessage) {
      msgParam = stringifyAsciiJson(mediaMessage.sampleImageMsg);
    } else if ('sampleVideo' in mediaMessage) {
      msgParam = stringifyAsciiJson(mediaMessage.sampleVideo);
    } else if ('sampleFile' in mediaMessage) {
      msgParam = stringifyAsciiJson(mediaMessage.sampleFile);
    } else {
      throw new Error('Unknown media message type');
    }

    let url: string;
    let body: any;

    if (options.conversationType === '1') {
      // 单聊
      url = `${DINGTALK_API}/v1.0/robot/oToMessages/batchSend`;
      body = {
        robotCode,
        userIds: [options.userId],
        msgKey,
        msgParam,
      };
    } else {
      // 群聊
      url = `${DINGTALK_API}/v1.0/robot/groupMessages/send`;
      body = {
        robotCode,
        openConversationId: options.openConversationId,
        msgKey,
        msgParam,
      };
    }

    this.log(`[DingTalk] 发送媒体消息:`, JSON.stringify({
      msgKey,
      msgParam,
      conversationType: options.conversationType,
    }, null, 2));

    const response = await axios({
      url,
      method: 'POST',
      data: createUtf8JsonBody(body),
      headers: { 'x-acs-dingtalk-access-token': token, 'Content-Type': JSON_UTF8_CONTENT_TYPE },
      timeout: 30000,
    });

    // 检查响应 (新版 API 错误格式可能不同)
    if (response.data?.code && response.data.code !== '0') {
      throw new Error(`钉钉API返回错误: ${response.data.message || response.data.code}`);
    }
  }

  /**
   * Send message with media support - detects and uploads media from text
   */
  private async sendWithMedia(
    sessionWebhook: string,
    text: string,
    options: {
      atUserId?: string | null;
      conversationType?: '1' | '2';
      userId?: string;
      openConversationId?: string;
    } = {}
  ): Promise<void> {
    // 解析媒体标记
    const markers = parseMediaMarkers(text);

    this.log(`[DingTalk Gateway] 解析媒体标记:`, JSON.stringify({
      textLength: text.length,
      markersCount: markers.length,
      markers: markers.map(m => ({ type: m.type, path: m.path, name: m.name })),
    }));

    if (markers.length === 0) {
      // 无媒体，直接发送文本
      await this.sendBySession(sessionWebhook, text, options);
      return;
    }

    // 获取 oapi token（用于媒体上传，与新版 API token 不同）
    if (!this.config) {
      throw new Error('DingTalk config not set');
    }
    const oapiToken = await getOapiAccessToken(this.config.clientId, this.config.clientSecret);

    const uploadedMarkers: MediaMarker[] = [];
    // 剥离媒体标记后的文本，用于最终发送（避免本地路径链接出现在钉钉消息中）
    let cleanText = text;

    // 逐个上传媒体文件
    for (const marker of markers) {
      const mediaType = marker.type === 'audio' ? 'voice' : detectMediaType(marker.path);
      this.log(`[DingTalk Gateway] 上传媒体文件:`, JSON.stringify({
        path: marker.path,
        name: marker.name,
        type: marker.type,
        mediaType,
      }));
      // 传递从 markdown 解析出的文件名
      const result = await uploadMediaToDingTalk(oapiToken, marker.path, mediaType, marker.name);

      if (!result.success || !result.mediaId) {
        console.warn(`[DingTalk Gateway] Media upload failed: ${result.error}`);
        // 上传失败：将标记替换为失败提示，保留文件名
        const failLabel = marker.name ? `[文件 ${marker.name} 发送失败]` : '[文件发送失败]';
        cleanText = cleanText.split(marker.originalMarker).join(failLabel);
        continue;
      }

      this.log(`[DingTalk Gateway] 媒体上传成功:`, JSON.stringify({
        mediaId: result.mediaId,
        path: marker.path,
      }));

      // 发送媒体消息
      try {
        const mediaMsg = this.buildMediaMessage(mediaType, result.mediaId, marker.name);

        // 使用新版 API 发送媒体消息
        if (options.conversationType && (options.userId || options.openConversationId)) {
          await this.sendMediaViaNewApi(mediaMsg, {
            conversationType: options.conversationType,
            userId: options.userId,
            openConversationId: options.openConversationId,
          });
        } else {
          console.warn(`[DingTalk Gateway] Missing conversation info, cannot send media`);
          // 无法发送文件气泡，保留原始标记在文本中
          continue;
        }

        // 上传并发送成功：从文本中移除标记（文件已通过钉钉文件消息发送）
        const sentLabel = marker.name ? `📎 ${marker.name}` : '';
        cleanText = cleanText.split(marker.originalMarker).join(sentLabel);
        uploadedMarkers.push(marker);
      } catch (error: any) {
        console.error(`[DingTalk Gateway] Failed to send media: ${error.message}`);
        const failLabel = marker.name ? `[文件 ${marker.name} 发送失败]` : '[文件发送失败]';
        cleanText = cleanText.split(marker.originalMarker).join(failLabel);
      }
    }

    // 发送剥离媒体标记后的文本（避免本地路径链接出现在钉钉消息中）
    // 若文本全部是媒体标记则跳过，避免发送空消息
    if (cleanText.trim()) {
      await this.sendBySession(sessionWebhook, cleanText, options);
    }
  }

  /**
   * Card 模式专用：解析文本中的文件附件并上传发送为钉钉文件消息
   * （Card 模式不走 sendWithMedia，文件需在 finalizeCard 后单独处理）
   */
  private async sendFileAttachments(
    text: string,
    options: {
      conversationType: '1' | '2';
      userId?: string;
      openConversationId?: string;
    }
  ): Promise<void> {
    if (!this.config) return;
    const markers = parseMediaMarkers(text);
    if (markers.length === 0) return;

    try {
      const oapiToken = await getOapiAccessToken(this.config.clientId, this.config.clientSecret);
      for (const marker of markers) {
        const mediaType = detectMediaType(marker.path);
        const result = await uploadMediaToDingTalk(oapiToken, marker.path, mediaType, marker.name);
        if (!result.success || !result.mediaId) {
          this.log(`[DingTalk] 文件附件上传失败: ${result.error}`);
          continue;
        }
        const mediaMsg = this.buildMediaMessage(mediaType, result.mediaId, marker.name);
        await this.sendMediaViaNewApi(mediaMsg, options);
        this.log(`[DingTalk] 文件附件已发送: ${marker.name || marker.path}`);
      }
    } catch (err: any) {
      this.log(`[DingTalk] 发送文件附件出错: ${err.message}`);
    }
  }

  /**
   * Build media message payload for Session Webhook
   * Session Webhook uses msgKey + msgParam format
   */
  private buildMediaMessage(mediaType: string, mediaId: string, fileName?: string): DingTalkMediaMessage {
    switch (mediaType) {
      case 'image':
        return { msgKey: 'sampleImageMsg', sampleImageMsg: { photoURL: mediaId } };
      case 'voice':
        return { msgKey: 'sampleAudio', sampleAudio: { mediaId, duration: '60000' } };
      case 'video':
        return { msgKey: 'sampleVideo', sampleVideo: { mediaId, videoType: 'mp4', duration: '60000' } };
      default:
        // 文件类型支持自定义文件名
        return { msgKey: 'sampleFile', sampleFile: { mediaId, fileName } };
    }
  }

  /**
   * Handle incoming DingTalk message
   */
  private async handleInboundMessage(data: DingTalkInboundMessage): Promise<void> {
    // Ignore self messages
    if (data.senderId === data.chatbotUserId || data.senderStaffId === data.chatbotUserId) {
      return;
    }

    // Deduplicate (Stream SDK may retransmit the same msgId)
    if (this.isMessageProcessed(data.msgId)) {
      this.log(`[DingTalk] 忽略重复消息: ${data.msgId}`);
      return;
    }

    const content = this.extractMessageContent(data);
    if (!content.text) {
      await this.sendBySession(data.sessionWebhook, '抱歉，暂不支持该消息类型，请发送文字或图片。');
      return;
    }

    const isDirect = data.conversationType === '1';
    const senderId = data.senderStaffId || data.senderId;
    const senderName = data.senderNick || 'User';

    // 打印完整的输入消息日志
    this.log(`[DingTalk] 收到消息:`, JSON.stringify({
      sender: senderName,
      senderId,
      conversationId: data.conversationId,
      chatType: isDirect ? 'direct' : 'group',
      msgType: content.messageType,
      content: content.text,
      mediaPath: content.mediaPath,
      mediaType: content.mediaType,
    }, null, 2));

    // Download image attachment if present
    let attachments: IMMediaAttachment[] | undefined;
    if (content.mediaPath && content.mediaType === 'image') {
      try {
        const saveDir = getDingTalkMediaDir(this.mediaDir);
        const fileName = (content.text && content.text !== '[图片]')
          ? content.text
          : `${Date.now()}.jpg`;
        const result = await downloadDingTalkMedia(
          await this.getAccessToken(),
          this.config.clientId,
          content.mediaPath,
          fileName,
          saveDir
        );
        if (result) {
          attachments = [{
            type: 'image',
            localPath: result.localPath,
            mimeType: 'image/jpeg',
            fileName,
          }];
        }
      } catch (e: any) {
        this.log(`[DingTalk] 下载图片失败: ${e.message}`);
      }
    }

    // Download richText inline images
    if (content.mediaPaths && content.mediaPaths.length > 0) {
      try {
        const saveDir = getDingTalkMediaDir(this.mediaDir);
        const results = await Promise.all(
          content.mediaPaths.map(async (code, idx) => {
            const fileName = `${Date.now()}_${idx}.jpg`;
            return downloadDingTalkMedia(
              await this.getAccessToken(),
              this.config!.clientId,
              code,
              fileName,
              saveDir
            );
          })
        );
        const valid = results.filter(r => r !== null);
        if (valid.length > 0) {
          attachments = [
            ...(attachments || []),
            ...valid.map(r => ({ type: 'image' as const, localPath: r!.localPath, mimeType: 'image/jpeg' })),
          ];
        }
      } catch (e: any) {
        this.log(`[DingTalk] 下载 richText 图片失败: ${e.message}`);
      }
    }

    // Create IMMessage
    const message: IMMessage = {
      platform: 'dingtalk',
      messageId: data.msgId,
      conversationId: data.conversationId,
      senderId: senderId,
      senderName: senderName,
      content: content.text,
      chatType: isDirect ? 'direct' : 'group',
      timestamp: data.createAt || Date.now(),
      attachments,
    };
    this.status.lastInboundAt = Date.now();

    // Create reply function with logging
    const replyFn = async (text: string) => {
      // 打印完整的输出消息日志
      this.log(`[DingTalk] 发送回复:`, JSON.stringify({
        conversationId: data.conversationId,
        replyLength: text.length,
        reply: text,
      }, null, 2));

      await this.sendWithMedia(data.sessionWebhook, text, {
        atUserId: !isDirect ? senderId : null,
        conversationType: data.conversationType,
        userId: senderId,
        openConversationId: data.conversationId,
      });
      this.status.lastOutboundAt = Date.now();
    };

    // Store last conversation for notifications
    this.lastConversation = {
      conversationType: data.conversationType as '1' | '2',
      userId: senderId,
      openConversationId: data.conversationId,
      sessionWebhook: data.sessionWebhook,
    };

    // Emit message event
    this.emit('message', message);

    // Call message callback if set
    if (this.onMessageCallback) {
      // AI 卡片模式：创建并投递卡片，流式更新，最终化
      let activeReplyFn = replyFn;
      let streamCallbacks: IMStreamCallbacks | undefined;

      if (this.config?.messageType === 'card') {
        try {
          const token = await this.getAccessToken();
          const outTrackId = generateOutTrackId();
          const cardTemplateId = this.config.cardTemplateId || undefined;
          const cardTemplateKey = this.config.cardTemplateKey || 'msgContent';
          const robotCode = this.config.robotCode || this.config.clientId || '';

          await createCardInstance(token, outTrackId, cardTemplateId);
          await deliverCardInstance(
            token, outTrackId, robotCode,
            data.conversationType as '1' | '2',
            senderId, data.conversationId
          );

          // Promise gate：确保 startCardInputing 只调用一次，且在首次 streaming 前立刻调用
          // （不在此处提前调用，避免 INPUTING 状态超时）
          let inputingPromise: Promise<void> | null = null;
          // 串行链：确保 updateCardStreaming 调用不并发、不乱序
          let lastStreamingCall: Promise<void> = Promise.resolve();
          // finalize 标志：防止 isFinalize:true 发送后仍有晚到的 streaming update
          let finalizing = false;

          // 替换 replyFn：排干所有 pending streaming 后再最终化
          activeReplyFn = async (text: string) => {
            finalizing = true;
            await lastStreamingCall.catch(() => {});
            await finalizeCard(token, outTrackId, text, cardTemplateKey);
            this.status.lastOutboundAt = Date.now();
            // Card 模式不走 sendWithMedia，需额外发送文件附件
            await this.sendFileAttachments(text, {
              conversationType: data.conversationType as '1' | '2',
              userId: senderId,
              openConversationId: data.conversationId,
            });
          };

          // 流式更新回调
          streamCallbacks = {
            onStreamingUpdate: async (content: string) => {
              // finalize 已开始则丢弃（800ms 节流可能有晚到帧）
              if (finalizing) return;

              // 首次调用时才发 INPUTING（Promise gate，防重复且防过早）
              if (inputingPromise === null) {
                inputingPromise = startCardInputing(token, outTrackId, cardTemplateKey).catch(() => {});
              }
              await inputingPromise;

              // 串行化：等上一次 streaming 完成再发新的（防乱序）
              const prev = lastStreamingCall;
              lastStreamingCall = prev
                .then(() => updateCardStreaming(token, outTrackId, content, cardTemplateKey))
                .catch(() => {});
              await lastStreamingCall;
            },
          };

          this.log(`[DingTalk] AI 卡片已创建并投递: ${outTrackId}`);
        } catch (err: any) {
          this.log(`[DingTalk] AI 卡片创建失败，降级为 Markdown: ${err.message}`);
          // 降级：沿用原有 replyFn，streamCallbacks 保持 undefined
        }
      }

      try {
        await this.onMessageCallback(message, activeReplyFn, streamCallbacks);
      } catch (error: any) {
        console.error(`[DingTalk Gateway] Error in message callback: ${error.message}`);
        await replyFn(`❌ 处理消息时出错: ${error.message}`);
      }
    }
  }

  /**
   * Send a notification message to the last known conversation.
   */
  async sendNotification(text: string): Promise<void> {
    if (!this.lastConversation) {
      throw new Error('No conversation available for notification');
    }
    await this.sendBySession(this.lastConversation.sessionWebhook, text);
    this.status.lastOutboundAt = Date.now();
  }
}
