import { NextResponse } from 'next/server';

// 출시 대기자 모집 폼의 same-origin 수신 엔드포인트.
// 브라우저는 same-origin 으로 여기에 POST → 서버사이드에서 haru_BE 의
// 공개 라우트(/api/waitlist)로 forward 한다. 이렇게 두는 이유:
//   (1) BE 도메인에 CORS 화이트리스트를 추가할 필요가 없다 (브라우저는 same-origin).
//   (2) BE URL 을 NEXT_PUBLIC 으로 노출하지 않는다 (서버 env HARU_API_URL).
// BE URL 미설정 시 503 — 폼이 조용히 깨지지 않게 명시 노출.

export const runtime = 'nodejs';

const API_URL = process.env.HARU_API_URL;

export async function POST(request: Request) {
  if (!API_URL) {
    console.error('[waitlist] HARU_API_URL 미설정 — BE 로 forward 불가');
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${API_URL.replace(/\/$/, '')}/api/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    console.error('[waitlist] BE forward 실패:', err);
    return NextResponse.json({ error: 'upstream_unreachable' }, { status: 502 });
  }
}
