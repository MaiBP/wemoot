export interface TelegramPhoto {
  file_id: string;
  file_size?: number;
  width: number;
  height: number;
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  from?: { username?: string };
  text?: string;
  caption?: string;
  photo?: TelegramPhoto[];
  document?: {
    file_id: string;
    file_size?: number;
    mime_type?: string;
    file_name?: string;
  };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  keyboard?: string[][],
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN no está configurado");
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4096),
        disable_web_page_preview: true,
        ...(keyboard
          ? {
              reply_markup: {
                keyboard: keyboard.map((row) =>
                  row.map((value) => ({ text: value })),
                ),
                resize_keyboard: true,
                one_time_keyboard: true,
              },
            }
          : {}),
      }),
    },
  );
  if (!response.ok) throw new Error("Telegram rechazó el mensaje");
}

export async function getTelegramImageDataUrl(message: TelegramMessage) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN no está configurado");
  const photo = message.photo?.at(-1);
  const document = message.document?.mime_type?.startsWith("image/")
    ? message.document
    : undefined;
  const file = photo ?? document;
  if (!file) return undefined;
  if ((file.file_size ?? 0) > 10 * 1024 * 1024) {
    throw new Error("La imagen supera el límite de 10 MB");
  }

  const metadataResponse = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(file.file_id)}`,
  );
  const metadata = (await metadataResponse.json()) as {
    ok: boolean;
    result?: { file_path?: string };
  };
  if (!metadata.ok || !metadata.result?.file_path) {
    throw new Error("No se pudo descargar el archivo de Telegram");
  }

  const fileResponse = await fetch(
    `https://api.telegram.org/file/bot${token}/${metadata.result.file_path}`,
  );
  if (!fileResponse.ok) {
    throw new Error("No se pudo descargar la imagen de Telegram");
  }
  const mime = document?.mime_type || "image/jpeg";
  const bytes = Buffer.from(await fileResponse.arrayBuffer()).toString(
    "base64",
  );
  return `data:${mime};base64,${bytes}`;
}
