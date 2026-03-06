import { NextRequest, NextResponse } from 'next/server'

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=86400', // cache 24h
}

function extractMeta(html: string, ...patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return decodeHtmlEntities(match[1].trim())
  }
  return ''
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'url required' }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Siftly/1.0; +https://github.com/viperrcrypto/Siftly)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `HTTP ${res.status}` }, { status: 502 })
    }

    // Only read first 50KB — enough for head tags
    const reader = res.body?.getReader()
    if (!reader) return NextResponse.json({ error: 'no body' }, { status: 502 })

    let html = ''
    let bytes = 0
    while (bytes < 50_000) {
      const { done, value } = await reader.read()
      if (done) break
      html += new TextDecoder().decode(value)
      bytes += value.length
      // Stop once we've passed </head>
      if (html.includes('</head>')) break
    }
    reader.cancel().catch(() => {})

    const finalUrl = res.url
    const domain = (() => {
      try { return new URL(finalUrl).hostname.replace(/^www\./, '') } catch { return '' }
    })()

    const title = extractMeta(
      html,
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
      /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
      /<title[^>]*>([^<]+)<\/title>/i,
    )

    const description = extractMeta(
      html,
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
    )

    const image = extractMeta(
      html,
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    )

    const siteName = extractMeta(
      html,
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i,
    )

    return NextResponse.json(
      { title, description, image, siteName, domain, url: finalUrl },
      { headers: CACHE_HEADERS },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'preview failed'
    return NextResponse.json({ error: msg }, { status: 502, headers: CACHE_HEADERS })
  }
}
