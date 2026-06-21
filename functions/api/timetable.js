// Cloudflare Pages Functions: /api/timetable
// 週間時間割（時間割アプリ.html）用の状態保存エンドポイント。
// 暗号文（E2Eで暗号化済みの時間割 JSON）を KV に読み書きする。
// 認証は state.js / plot.js と同じ「共有トークン」方式（Authorization: Bearer <token>）。
//
// line-editor / plot-graph とは環境を分離する:
//   - KV バインドは専用の TIMETABLE_VAULT（VAULT・PLOT_VAULT とは別の名前空間）
//   - シークレットは専用の TIMETABLE_API_TOKEN（API_TOKEN・PLOT_API_TOKEN とは別の値）
// これにより、データ・認証情報のいずれも他アプリと完全に独立する。

export async function onRequest(context) {
  const { request, env } = context;

  // --- 一時診断: /api/timetable?diag=1 で、この関数に見えている env の「名前だけ」を返す ---
  // （シークレットの値は出さない。原因切り分け後に削除すること）
  if (new URL(request.url).searchParams.get('diag') === '1') {
    return new Response(JSON.stringify({
      envKeys: Object.keys(env),
      hasTimetableApiToken: 'TIMETABLE_API_TOKEN' in env && !!env.TIMETABLE_API_TOKEN,
      hasTimetableVault: 'TIMETABLE_VAULT' in env && typeof env.TIMETABLE_VAULT === 'object',
      deployedAt: new Date().toISOString()
    }, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' } });
  }

  // 共有トークン認証（時間割アプリ専用のシークレット）
  const expected = env.TIMETABLE_API_TOKEN;
  if (!expected) {
    return new Response('Server not configured: TIMETABLE_API_TOKEN is unset', { status: 503 });
  }
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 専用 KV 名前空間内の固定キー（単一ユーザー想定・端末横断で共有）
  const key = 'timetable:default';

  if (request.method === 'GET') {
    const data = await env.TIMETABLE_VAULT.get(key);
    return new Response(data || '', {
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  if (request.method === 'PUT') {
    const body = await request.text();
    if (body.length > 2_000_000) {
      return new Response('Payload too large', { status: 413 });
    }
    await env.TIMETABLE_VAULT.put(key, body);
    return new Response('ok');
  }

  return new Response('Method Not Allowed', { status: 405 });
}
