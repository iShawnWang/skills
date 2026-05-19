export interface FeishuConfig {
  webhook: string;
  keyword?: string;
}

/**
 * Sends a notification to Feishu (Lark) via webhook.
 */
export async function sendFeishuNotification(config: FeishuConfig, title: string, content: string) {
  if (!config.webhook) return;

  // Feishu keyword must be present in the message to pass security check if configured.
  const header = config.keyword ? `[${config.keyword}] ${title}` : title;

  const body = {
    msg_type: "post",
    content: {
      post: {
        zh_cn: {
          title: header,
          content: [
            [
              {
                tag: "text",
                text: content,
              },
            ],
          ],
        },
      },
    },
  };

  try {
    const response = await fetch(config.webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Feishu notification failed: ${response.status} ${errorText}`);
    }
  } catch (error) {
    console.error(`Feishu notification failed: ${error}`);
  }
}
