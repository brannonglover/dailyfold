const ALLOWED_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:19006',
  'http://127.0.0.1:8081',
];

export function corsHeaders(origin: string | null): HeadersInit {
  const allowed =
    origin &&
    (ALLOWED_ORIGINS.includes(origin) ||
      origin.startsWith('exp://') ||
      origin.startsWith('http://192.168.'));

  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export function jsonResponse(data: unknown, origin: string | null, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}
