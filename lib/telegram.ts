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
  contact?: { phone_number: string; first_name?: string; last_name?: string };
  location?: { latitude: number; longitude: number };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramAttachment {
  dataUrl: string;
  filename: string;
  mimeType: string;
  kind: "image";
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  keyboard?: TelegramKeyboardButton[][],
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
                  row.map((value) =>
                    typeof value === "string" ? { text: value } : value,
                  ),
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

export type TelegramKeyboardButton =
  | string
  | { text: string; request_contact?: boolean; request_location?: boolean };

export async function getTelegramAttachment(
  message: TelegramMessage,
): Promise<TelegramAttachment | undefined> {
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
  const mimeType = document?.mime_type || "image/jpeg";
  const bytes = Buffer.from(await fileResponse.arrayBuffer()).toString(
    "base64",
  );
  return {
    dataUrl: `data:${mimeType};base64,${bytes}`,
    filename: document?.file_name ?? "cartel.jpg",
    mimeType,
    kind: "image",
  };
}

export async function getTelegramImageDataUrl(message: TelegramMessage) {
  const attachment = await getTelegramAttachment(message);
  return attachment?.dataUrl;
}
