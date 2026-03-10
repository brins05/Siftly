/**
 * Fetches X/Twitter article content for bookmarks that link to x.com/i/article/ URLs.
 * Uses Twitter's public syndication API — no auth required.
 */
import prisma from '@/lib/db'

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const ARTICLE_URL_RE = /x\.com\/i\/article\/|twitter\.com\/i\/article\//

interface SyndicationResponse {
  article?: {
    rest_id?: string
    title?: string
    preview_text?: string
    cover_media?: { media_info?: { original_img_url?: string } }
  }
  user?: { name?: string; screen_name?: string }
}

async function fetchArticleContent(tweetId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=x`,
      { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return null

    const data = (await res.json()) as SyndicationResponse
    if (!data.article?.title) return null

    const parts: string[] = []
    if (data.user?.name) parts.push(`By ${data.user.name}`)
    parts.push(data.article.title)
    if (data.article.preview_text) parts.push(data.article.preview_text)

    return parts.join('\n\n')
  } catch {
    return null
  }
}

function isArticleBookmark(rawJson: string): boolean {
  try {
    const parsed = JSON.parse(rawJson) as {
      urls?: { expanded_url?: string }[]
      entities?: { urls?: { expanded_url?: string }[] }
    }
    const urls = parsed.entities?.urls ?? parsed.urls ?? []
    return urls.some((u) => ARTICLE_URL_RE.test(u.expanded_url ?? ''))
  } catch {
    return false
  }
}

/**
 * Finds bookmarks that link to X articles (x.com/i/article/),
 * fetches the full article title + preview via syndication API, and stores it.
 */
export async function backfillArticleContent(
  onProgress?: (count: number) => void,
  shouldAbort?: () => boolean,
): Promise<number> {
  // Find bookmarks without articleContent that have minimal text (likely article links)
  const candidates = await prisma.bookmark.findMany({
    where: {
      articleContent: null,
      // Text starting with https://t.co/ is a strong signal
    },
    select: { id: true, tweetId: true, text: true, rawJson: true },
    orderBy: { id: 'asc' },
  })

  let fetched = 0

  for (const bm of candidates) {
    if (shouldAbort?.()) break

    if (!isArticleBookmark(bm.rawJson)) continue

    const content = await fetchArticleContent(bm.tweetId)
    if (content) {
      await prisma.bookmark.update({
        where: { id: bm.id },
        data: { articleContent: content },
      })
      fetched++
      onProgress?.(fetched)
    }

    // Small delay to avoid hammering the syndication API
    if (fetched % 10 === 0) {
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  return fetched
}
