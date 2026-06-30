// PunditBot - minimal Telegram Bot API helper.
const API = 'https://api.telegram.org/bot';

export async function tg(token: string, method: string, body: object): Promise<any> {
  const res = await fetch(`${API}${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json().catch(() => ({}));
}

export function sendMessage(token: string, chatId: string | number, text: string, replyMarkup?: object): Promise<any> {
  return tg(token, 'sendMessage', { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
}
export function answerCallback(token: string, id: string, text?: string): Promise<any> {
  return tg(token, 'answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) });
}
export function inlineKeyboard(rows: { text: string; callback_data: string }[][]): object {
  return { inline_keyboard: rows };
}
