/**
 * X.com (Twitter) API v2 — tweet search for sentiment analysis.
 * Uses bearer token authentication.
 */

export interface Tweet {
  id: string;
  text: string;
  authorId?: string;
  authorName?: string;
  authorUsername?: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  createdAt: string;
}

export interface TweetSearchResult {
  tweets: Tweet[];
  tweetCount: number;
  query: string;
  error?: string;
}

/**
 * Search recent tweets matching a query.
 * Returns up to maxResults tweets with engagement metrics.
 */
export async function searchTweets(
  query: string,
  maxResults: number = 20
): Promise<TweetSearchResult> {
  const bearerToken = process.env.X_API_BEARER_TOKEN;

  if (!bearerToken) {
    return {
      tweets: [],
      tweetCount: 0,
      query,
      error: "No X_API_BEARER_TOKEN configured",
    };
  }

  try {
    // Clean query: strip cashtags and special chars, build search terms
    const cleanQuery = query
      .replace(/\$[A-Z]+/g, "") // Remove cashtags
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 5)
      .join(" ");

    if (!cleanQuery) {
      return { tweets: [], tweetCount: 0, query, error: "No valid search terms" };
    }

    const params = new URLSearchParams({
      query: `${cleanQuery} lang:en -is:retweet`,
      max_results: String(Math.min(maxResults, 100)),
      "tweet.fields": "created_at,public_metrics,author_id",
      "expansions": "author_id",
      "user.fields": "name,username",
    });

    const response = await fetch(
      `https://api.twitter.com/2/tweets/search/recent?${params}`,
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[X API] Error:", response.status, errorBody);
      return {
        tweets: [],
        tweetCount: 0,
        query: cleanQuery,
        error: `X API returned ${response.status}`,
      };
    }

    const data = await response.json();

    // Build user lookup map
    const users = new Map<string, { name: string; username: string }>();
    if (data.includes?.users) {
      for (const user of data.includes.users) {
        users.set(user.id, { name: user.name, username: user.username });
      }
    }

    const tweets: Tweet[] = (data.data || []).map((t: any) => {
      const author = users.get(t.author_id);
      return {
        id: t.id,
        text: t.text,
        authorId: t.author_id,
        authorName: author?.name,
        authorUsername: author?.username,
        likeCount: t.public_metrics?.like_count || 0,
        retweetCount: t.public_metrics?.retweet_count || 0,
        replyCount: t.public_metrics?.reply_count || 0,
        quoteCount: t.public_metrics?.quote_count || 0,
        createdAt: t.created_at,
      };
    });

    // Sort by engagement (likes + retweets)
    tweets.sort(
      (a, b) =>
        b.likeCount + b.retweetCount - (a.likeCount + a.retweetCount)
    );

    return {
      tweets: tweets.slice(0, maxResults),
      tweetCount: tweets.length,
      query: cleanQuery,
    };
  } catch (error: any) {
    console.error("[X API] Exception:", error.message);
    return {
      tweets: [],
      tweetCount: 0,
      query,
      error: error.message,
    };
  }
}
