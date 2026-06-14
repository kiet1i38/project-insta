import { useEffect, useState } from "react";
import {
  ApiError,
  createComment,
  getFeedPosts,
  likePost,
  unlikePost,
  type FeedComment,
  type FeedPost,
  type FeedPostAuthor
} from "../modules/auth/authApi";

const feedPageSize = 2;

type FeedCard = FeedPost & {
  comments: FeedComment[];
  commentDraft: string;
  commentError: string | null;
  isCommentSubmitting: boolean;
  isLikeSubmitting: boolean;
  viewerHasLiked: boolean;
};

type FeedPageInfo = {
  hasNextPage: boolean;
  limit: number;
  nextCursor: string | null;
};

function createFeedCard(post: FeedPost): FeedCard {
  return {
    ...post,
    comments: [],
    commentDraft: "",
    commentError: null,
    isCommentSubmitting: false,
    isLikeSubmitting: false,
    viewerHasLiked: false
  };
}

function getAuthorLabel(author: FeedPostAuthor): string {
  return author.displayName?.trim() || author.username;
}

function getAvatarLabel(author: FeedPostAuthor): string {
  return getAuthorLabel(author)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getPostLabel(post: FeedPost): string {
  return post.caption?.trim() || `post by ${getAuthorLabel(post.author)}`;
}

function formatPostDate(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(isoTimestamp));
}

function mergeFeedCards(current: FeedCard[], incoming: FeedPost[]): FeedCard[] {
  const currentPostIds = new Set(current.map((post) => post.id));
  const appendedPosts = incoming
    .filter((post) => !currentPostIds.has(post.id))
    .map(createFeedCard);

  return [...current, ...appendedPosts];
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof ApiError ? error.message : fallbackMessage;
}

export function FeedPage() {
  const [posts, setPosts] = useState<FeedCard[]>([]);
  const [pageInfo, setPageInfo] = useState<FeedPageInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadFeed() {
      setIsLoadingFeed(true);
      setErrorMessage(null);

      try {
        const response = await getFeedPosts({
          limit: feedPageSize
        });

        if (!isActive) {
          return;
        }

        setPageInfo(response.pageInfo);
        setPosts(response.posts.map(createFeedCard));
      } catch (error) {
        if (!isActive) {
          return;
        }

        setPosts([]);
        setPageInfo(null);
        setErrorMessage(
          getErrorMessage(
            error,
            "Could not load the feed right now. Please try again."
          )
        );
      } finally {
        if (isActive) {
          setIsLoadingFeed(false);
        }
      }
    }

    void loadFeed();

    return () => {
      isActive = false;
    };
  }, []);

  async function handleLoadMore(): Promise<void> {
    if (!pageInfo?.hasNextPage || !pageInfo.nextCursor) {
      return;
    }

    setErrorMessage(null);
    setIsLoadingMore(true);

    try {
      const response = await getFeedPosts({
        cursor: pageInfo.nextCursor,
        limit: feedPageSize
      });

      setPageInfo(response.pageInfo);
      setPosts((currentPosts) => mergeFeedCards(currentPosts, response.posts));
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          "Could not load more posts right now. Please try again."
        )
      );
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function handleToggleLike(postId: string): Promise<void> {
    const targetPost = posts.find((post) => post.id === postId);

    if (!targetPost) {
      return;
    }

    setErrorMessage(null);
    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId ? { ...post, isLikeSubmitting: true } : post
      )
    );

    try {
      const response = targetPost.viewerHasLiked
        ? await unlikePost(postId)
        : await likePost(postId);

      setPosts((currentPosts) =>
        currentPosts.map((post) =>
          post.id === postId
            ? {
                ...post,
                isLikeSubmitting: false,
                viewerHasLiked: response.viewerHasLiked
              }
            : post
        )
      );
    } catch (error) {
      setPosts((currentPosts) =>
        currentPosts.map((post) =>
          post.id === postId ? { ...post, isLikeSubmitting: false } : post
        )
      );
      setErrorMessage(
        getErrorMessage(
          error,
          "Could not update the like right now. Please try again."
        )
      );
    }
  }

  async function handleSubmitComment(postId: string): Promise<void> {
    const targetPost = posts.find((post) => post.id === postId);

    if (!targetPost) {
      return;
    }

    const trimmedComment = targetPost.commentDraft.trim();

    if (!trimmedComment) {
      setPosts((currentPosts) =>
        currentPosts.map((post) =>
          post.id === postId
            ? {
                ...post,
                commentError: "Write a comment before posting."
              }
            : post
        )
      );
      return;
    }

    setErrorMessage(null);
    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              commentError: null,
              isCommentSubmitting: true
            }
          : post
      )
    );

    try {
      const response = await createComment(postId, {
        content: trimmedComment
      });

      setPosts((currentPosts) =>
        currentPosts.map((post) =>
          post.id === postId
            ? {
                ...post,
                comments: [response.comment, ...post.comments],
                commentDraft: "",
                commentError: null,
                isCommentSubmitting: false
              }
            : post
        )
      );
    } catch (error) {
      setPosts((currentPosts) =>
        currentPosts.map((post) =>
          post.id === postId
            ? {
                ...post,
                commentError: getErrorMessage(
                  error,
                  "Could not post the comment right now. Please try again."
                ),
                isCommentSubmitting: false
              }
            : post
        )
      );
    }
  }

  function handleCommentDraftChange(postId: string, nextValue: string): void {
    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              commentDraft: nextValue,
              commentError: null
            }
          : post
      )
    );
  }

  if (isLoadingFeed) {
    return (
      <section className="panel feed-page">
        <p className="eyebrow">Slice 7D</p>
        <h2>Loading feed</h2>
        <p>
          Loading the protected feed stream, post cards, and interaction
          controls from the backend.
        </p>
      </section>
    );
  }

  if (errorMessage && posts.length === 0) {
    return (
      <section className="panel feed-page">
        <p className="eyebrow">Slice 7D</p>
        <h2>Your feed</h2>
        <p className="form-status" data-tone="error" role="status">
          {errorMessage}
        </p>
      </section>
    );
  }

  return (
    <section className="panel feed-page">
      <div className="feed-page-heading">
        <div>
          <p className="eyebrow">Slice 7D</p>
          <h2>Your feed</h2>
          <p className="feed-page-copy">
            Real feed cards now come from the protected backend endpoint, and
            each card can trigger the matching like and comment routes without
            dropping back to placeholder UI.
          </p>
        </div>
        {errorMessage ? (
          <p className="form-status" data-tone="error" role="status">
            {errorMessage}
          </p>
        ) : null}
      </div>

      {posts.length === 0 ? (
        <section className="profile-empty-state">
          <h3>Your feed is empty right now.</h3>
          <p>
            Follow more classmates or create new posts so the feed can fill
            with visible content from the backend.
          </p>
        </section>
      ) : (
        <div className="feed-list">
          {posts.map((post) => {
            const postLabel = getPostLabel(post);
            const authorLabel = getAuthorLabel(post.author);

            return (
              <article className="feed-card" key={post.id}>
                <div className="feed-card-header">
                  <div className="feed-author">
                    {post.author.avatarUrl ? (
                      <img
                        alt={`Avatar for ${authorLabel}`}
                        className="feed-author-avatar"
                        src={post.author.avatarUrl}
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="feed-author-avatar feed-author-avatar-fallback"
                      >
                        {getAvatarLabel(post.author)}
                      </div>
                    )}
                    <div>
                      <h3>{authorLabel}</h3>
                      <p className="profile-handle">@{post.author.username}</p>
                    </div>
                  </div>
                  <p className="feed-post-date">
                    Posted {formatPostDate(post.createdAt)}
                  </p>
                </div>

                <img
                  alt={post.caption ? `Feed post for ${post.caption}` : "Feed post image"}
                  className="feed-post-media"
                  src={post.imageUrl}
                />

                <div className="feed-card-content">
                  <p className="feed-post-caption">
                    {post.caption ?? "Untitled post"}
                  </p>

                  <div className="feed-interactions">
                    <button
                      aria-label={`${post.viewerHasLiked ? "Unlike" : "Like"} ${postLabel}`}
                      className="primary-button feed-action-button"
                      disabled={post.isLikeSubmitting}
                      onClick={() => void handleToggleLike(post.id)}
                      type="button"
                    >
                      {post.isLikeSubmitting
                        ? "Saving..."
                        : post.viewerHasLiked
                          ? "Unlike"
                          : "Like"}
                    </button>
                    {post.viewerHasLiked ? (
                      <p className="feed-inline-status">You liked this post.</p>
                    ) : null}
                  </div>

                  <form
                    className="feed-comment-form"
                    noValidate
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSubmitComment(post.id);
                    }}
                  >
                    <input
                      aria-invalid={post.commentError ? "true" : "false"}
                      aria-label={`Comment on ${postLabel}`}
                      className="feed-comment-input"
                      onChange={(event) =>
                        handleCommentDraftChange(post.id, event.target.value)
                      }
                      placeholder="Write a comment"
                      type="text"
                      value={post.commentDraft}
                    />
                    <button
                      aria-label={`Post comment on ${postLabel}`}
                      className="primary-button feed-comment-button"
                      disabled={post.isCommentSubmitting}
                      type="submit"
                    >
                      {post.isCommentSubmitting ? "Posting..." : "Post comment"}
                    </button>
                  </form>

                  {post.commentError ? (
                    <p className="field-error" role="status">
                      {post.commentError}
                    </p>
                  ) : null}

                  {post.comments.length > 0 ? (
                    <ul className="feed-comment-list">
                      {post.comments.map((comment) => (
                        <li className="feed-comment-item" key={comment.id}>
                          <span className="feed-comment-author">You</span>
                          <span>{comment.content}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {pageInfo?.hasNextPage ? (
        <button
          className="primary-button feed-load-more"
          disabled={isLoadingMore}
          onClick={() => void handleLoadMore()}
          type="button"
        >
          {isLoadingMore ? "Loading more..." : "Load more posts"}
        </button>
      ) : null}
    </section>
  );
}
