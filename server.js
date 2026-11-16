import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const port = Number(process.env.PORT || 10000);
const apiKey = process.env.GROQ_API_KEY;
const clientToken = process.env.SOLE_CLIENT_TOKEN;
const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const hits = new Map();

function reply(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}
function sameToken(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
async function bodyJson(req) {
  let raw = '';
  for await (const part of req) {
    raw += part;
    if (raw.length > 24000) throw new Error('La conversación es demasiado larga.');
  }
  return JSON.parse(raw || '{}');
}
function allowRequest(ip) {
  const now = Date.now(), entry = hits.get(ip) || { start: now, count: 0 };
  if (now - entry.start > 60000) { entry.start = now; entry.count = 0; }
  entry.count += 1; hits.set(ip, entry);
  return entry.count <= 12;
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health')
    return reply(res, 200, { ok: true, aiConfigured: Boolean(apiKey && clientToken) });
  if (req.method !== 'POST' || req.url !== '/api/chat') return reply(res, 404, { error: 'Ruta no encontrada.' });
  if (!apiKey || !clientToken) return reply(res, 503, { error: 'El servidor aún no está configurado.' });
  if (!sameToken(req.headers['x-sole-key'], clientToken)) return reply(res, 401, { error: 'La conexión de Sole no está autorizada.' });
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  if (!allowRequest(ip)) return reply(res, 429, { error: 'Sole hizo muchas consultas seguidas. Espera un minuto.' });
  try {
    const body = await bodyJson(req);
    if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 12)
      return reply(res, 400, { error: 'Envía una conversación de hasta 12 mensajes.' });
    const messages = body.messages
      .filter(m => ['user', 'assistant'].includes(m?.role) && typeof m?.content === 'string')
      .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
    if (!messages.length || messages.at(-1).role !== 'user') return reply(res, 400, { error: 'No encontré la pregunta.' });
    const result = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.6,
        max_completion_tokens: 500,
        messages: [
          { role: 'system', content: 'Eres Sole, la asistente personal del usuario. Responde en español claro, cálido y breve. Ayuda con preguntas generales, ideas y organización. No afirmes que ejecutaste acciones en el teléfono, correo o WhatsApp si no recibiste confirmación de la aplicación. Si una acción necesita acceso a una cuenta o enviar un mensaje, prepara el borrador y pide confirmación explícita.' },
          ...messages
        ]
      }),
      signal: AbortSignal.timeout(30000)
    });
    const data = await result.json().catch(() => ({}));
    if (!result.ok) {
      const message = data?.error?.message || 'Groq no pudo responder ahora.';
      return reply(res, result.status === 429 ? 429 : 502, { error: message.slice(0, 240) });
    }
    const answer = data?.choices?.[0]?.message?.content?.trim();
    if (!answer) return reply(res, 502, { error: 'Groq devolvió una respuesta vacía.' });
    return reply(res, 200, { reply: answer });
  } catch (error) {
    return reply(res, 400, { error: error.name === 'TimeoutError' ? 'Groq tardó demasiado en responder.' : (error.message || 'No pude procesar la pregunta.') });
  }
});

server.listen(port, '0.0.0.0', () => console.log(`Sole server listening on ${port}`));

