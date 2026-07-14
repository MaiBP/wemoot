export interface TelegramMessage { message_id: number; chat: { id: number }; from?: { username?: string }; text?: string }
export interface TelegramUpdate { update_id: number; message?: TelegramMessage }
export async function sendTelegramMessage(chatId: string, text: string) { const token = process.env.TELEGRAM_BOT_TOKEN; if (!token) throw new Error("TELEGRAM_BOT_TOKEN no está configurado"); const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }) }); if (!response.ok) throw new Error("Telegram rechazó el mensaje"); }

