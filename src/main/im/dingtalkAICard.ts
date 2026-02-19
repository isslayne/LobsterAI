/**
 * DingTalk AI Card API utilities
 * 钉钉 AI 卡片（流式打字机效果）API 封装
 *
 * Required permissions: Card.Streaming.Write, Card.Instance.Write
 */

import axios from 'axios';

const DINGTALK_API = 'https://api.dingtalk.com';
const DEFAULT_CARD_TEMPLATE_ID = '382e4302-551d-4880-bf29-a30acfab2e71.schema';

/**
 * 生成唯一的卡片跟踪 ID（客户端生成，服务端不返回）
 */
export function generateOutTrackId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `card_${ts}_${rand}`;
}

function cardApiHeaders(token: string): Record<string, string> {
  return {
    'x-acs-dingtalk-access-token': token,
    'Content-Type': 'application/json',
  };
}

/**
 * 步骤 1：创建卡片实例
 * POST /v1.0/card/instances
 */
export async function createCardInstance(
  token: string,
  outTrackId: string,
  cardTemplateId: string = DEFAULT_CARD_TEMPLATE_ID
): Promise<void> {
  const url = `${DINGTALK_API}/v1.0/card/instances`;
  const body = {
    cardTemplateId,
    outTrackId,
    cardData: { cardParamMap: {} },
    callbackType: 'STREAM',
    imGroupOpenSpaceModel: { supportForward: true },
    imRobotOpenSpaceModel: { supportForward: true },
  };

  try {
    const response = await axios.post(url, body, { headers: cardApiHeaders(token) });
    if (response.data?.success === false) {
      throw new Error(`createCardInstance failed: ${JSON.stringify(response.data)}`);
    }
  } catch (err: any) {
    if (err.response?.data) {
      throw new Error(`createCardInstance failed: ${JSON.stringify(err.response.data)}`);
    }
    throw err;
  }
}

/**
 * 步骤 2：投递卡片到对话
 * POST /v1.0/card/instances/deliver
 */
export async function deliverCardInstance(
  token: string,
  outTrackId: string,
  robotCode: string,
  conversationType: '1' | '2',
  userId: string,
  openConversationId: string
): Promise<void> {
  const url = `${DINGTALK_API}/v1.0/card/instances/deliver`;

  const isDirect = conversationType === '1';
  const openSpaceId = isDirect
    ? `dtv1.card//IM_ROBOT.${userId}`
    : `dtv1.card//IM_GROUP.${openConversationId}`;

  const body = isDirect
    ? {
        outTrackId,
        userIdType: 1,
        openSpaceId,
        imRobotOpenDeliverModel: { spaceType: 'IM_ROBOT' },
      }
    : {
        outTrackId,
        userIdType: 1,
        openSpaceId,
        imGroupOpenDeliverModel: { robotCode },
      };

  try {
    const response = await axios.post(url, body, { headers: cardApiHeaders(token) });
    if (response.data?.success === false) {
      throw new Error(`deliverCardInstance failed: ${JSON.stringify(response.data)}`);
    }
  } catch (err: any) {
    if (err.response?.data) {
      throw new Error(`deliverCardInstance failed: ${JSON.stringify(err.response.data)}`);
    }
    throw err;
  }
}

/**
 * 步骤 3：切换卡片为 INPUTING 状态（首次流式更新前调用一次）
 * PUT /v1.0/card/instances with flowStatus='2'
 */
export async function startCardInputing(
  token: string,
  outTrackId: string
): Promise<void> {
  const headers = cardApiHeaders(token);
  try {
    await axios.put(`${DINGTALK_API}/v1.0/card/instances`, {
      outTrackId,
      cardData: {
        cardParamMap: {
          flowStatus: '2',
          msgContent: '',
          staticMsgContent: '',
          sys_full_json_obj: JSON.stringify({ order: ['msgContent'] }),
        },
      },
    }, { headers });
  } catch (err: any) {
    if (err.response?.data) {
      throw new Error(`startCardInputing failed: ${JSON.stringify(err.response.data)}`);
    }
    throw err;
  }
}

/**
 * 步骤 4：流式更新卡片内容（AI 生成过程中调用，需节流）
 * PUT /v1.0/card/streaming
 */
export async function updateCardStreaming(
  token: string,
  outTrackId: string,
  content: string
): Promise<void> {
  const url = `${DINGTALK_API}/v1.0/card/streaming`;
  const body = {
    outTrackId,
    guid: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    key: 'msgContent',
    content,
    isFull: true,
    isFinalize: false,
    isError: false,
  };

  try {
    await axios.put(url, body, { headers: cardApiHeaders(token) });
  } catch (err: any) {
    if (err.response?.data) {
      throw new Error(`updateCardStreaming failed: ${JSON.stringify(err.response.data)}`);
    }
    throw err;
  }
}

/**
 * 步骤 4：最终化卡片（AI 回复完成后调用）
 * PUT /v1.0/card/streaming with isFinalize:true
 * isFinalize:true 后 DingTalk 保留最后流式内容作为最终显示，无需再更新 card instances。
 */
export async function finalizeCard(
  token: string,
  outTrackId: string,
  content: string
): Promise<void> {
  const headers = cardApiHeaders(token);

  try {
    await axios.put(`${DINGTALK_API}/v1.0/card/streaming`, {
      outTrackId,
      guid: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      key: 'msgContent',
      content,
      isFull: true,
      isFinalize: true,
      isError: false,
    }, { headers });
  } catch (err: any) {
    if (err.response?.data) {
      throw new Error(`finalizeCard failed: ${JSON.stringify(err.response.data)}`);
    }
    throw err;
  }
}
