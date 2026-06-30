import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
const feedQuickActions = [
  {
    copy: "Jump into discovery to find more people and fill the feed faster.",
    label: "Explore people",
    to: "/search"
  },
  {
    copy: "Refresh your own presentation, avatar, and bio from the same shared UI system.",
    label: "Edit profile",
    to: "/profile/edit"
  }
] as const;

const feedSuggestedAccounts = [
  {
    description: "Great baseline account for user-flow smoke tests and profile checks.",
    label: "Alice Demo",
    username: "alice_demo"
  },
  {
    description: "Useful second account when you want to compare search and follow states.",
    label: "Bob Demo",
    username: "bob_demo"
  },
  {
    description: "Keeps the admin moderation and audit routes easy to reach during QA.",
    label: "Admin Demo",
    username: "admin_demo"
  }
] as const;

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

function getFeedMetaLine(post: FeedCard): string {
  if (post.comments.length > 0) {
    return `${post.comments.length} new comment${post.comments.length === 1 ? "" : "s"} added in this session`;
  }

  return post.viewerHasLiked
    ? "Liked in this session. Add a note to keep the conversation moving."
    : "Like or comment to keep this post active in your local demo flow.";
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
      <div className="feed-page-layout">
        <div className="feed-main-column">
          <div className="feed-page-heading">
            <div>
              <p className="eyebrow">Slice 7D</p>
              <h2>Your feed</h2>
              <p className="feed-page-copy">
                Keep up with the latest posts from people you follow and react in
                the moment with quick likes and comments.
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
                      alt={
                        post.caption ? `Feed post for ${post.caption}` : "Feed post image"
                      }
                      className="feed-post-media"
                      src={post.imageUrl}
                    />

                    <div className="feed-card-content">
                      <div className="feed-post-copy">
                        <p className="feed-post-caption">
                          {post.caption ?? "Untitled post"}
                        </p>
                        <p className="feed-post-meta-line">{getFeedMetaLine(post)}</p>
                      </div>

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
        </div>

        <aside className="feed-side-column" aria-label="Feed side rail">
          <section className="feed-rail-card">
            <div className="feed-rail-heading">
              <h3>Quick actions</h3>
              <p>Move between the key user surfaces without leaving the refreshed UI flow.</p>
            </div>
            <div className="feed-rail-actions">
              {feedQuickActions.map((action) => (
                <Link className="feed-rail-action" key={action.to} to={action.to}>
                  <strong>{action.label}</strong>
                  <span>{action.copy}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="feed-rail-card">
            <div className="feed-rail-heading">
              <h3>Suggested demo accounts</h3>
              <p>Useful seed accounts to keep nearby while you smoke-test the user-facing flow.</p>
            </div>
            <div className="feed-demo-list">
              {feedSuggestedAccounts.map((account) => (
                <article className="feed-demo-card" key={account.username}>
                  <div className="feed-demo-avatar" aria-hidden="true">
                    {account.label
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0]?.toUpperCase() ?? "")
                      .join("")}
                  </div>
                  <div className="feed-demo-copy">
                    <strong>{account.label}</strong>
                    <p>@{account.username}</p>
                    <span>{account.description}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
