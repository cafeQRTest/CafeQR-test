const TARGET = "https://tqdaqjvvssqaplregzvv.supabase.co";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    Vary: "Origin",
  };
}

function copyRequest(request, upstreamUrl) {
  const headers = new Headers(request.headers);
  return new Request(upstreamUrl, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    const incomingUrl = new URL(request.url);
    const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, TARGET);

    const isWebSocket = request.headers.get("Upgrade")?.toLowerCase() === "websocket";
    const upstreamRequest = copyRequest(request, upstreamUrl.toString());
    const upstreamResponse = await fetch(upstreamRequest, {
      cf: { cacheTtl: 0, cacheEverything: false },
    });

    if (isWebSocket) {
      return upstreamResponse;
    }

    const headers = new Headers(upstreamResponse.headers);
    const cors = corsHeaders(origin);
    Object.keys(cors).forEach((k) => headers.set(k, cors[k]));

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers,
    });
  },
};
