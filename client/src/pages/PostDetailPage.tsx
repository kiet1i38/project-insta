import { type FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ApiError,
  createComment,
  createReport,
  getPostDetail,
  likePost,
  reportReasonValues,
  unlikePost,
  type PostDetail,
  type PostDetailComment,
  type ReportReason
} from "../modules/auth/authApi";
import { useAuthSession } from "../modules/auth/authSessionContext";

function formatPostDate(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(isoTimestamp));
}

function getAuthorLabel(input: {
  displayName: string | null;
  username: string;
}): string {
  return input.displayName?.trim() || input.username;
}

function getAvatarLabel(input: {
  displayName: string | null;
  username: string;
}): string {
  return getAuthorLabel(input)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof ApiError ? error.message : fallbackMessage;
}

function toLocalComment(
  input: {
    displayName: string | null;
    id: string;
    username: string;
  },
  comment: {
    content: string;
    createdAt: string;
    id: string;
    updatedAt: string;
  }
): PostDetailComment {
  return {
    author: {
      avatarUrl: null,
      displayName: input.displayName,
      id: input.id,
      username: input.username
    },
    content: comment.content,
    createdAt: comment.createdAt,
    id: comment.id,
    updatedAt: comment.updatedAt
  };
}

const defaultReportReason: ReportReason = "SPAM";

export function PostDetailPage() {
  const { postId } = useParams();
  const { user } = useAuthSession();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCommentSubmitting, setIsCommentSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLikeSubmitting, setIsLikeSubmitting] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isReportSubmitting, setIsReportSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportReason, setReportReason] =
    useState<ReportReason>(defaultReportReason);
  const [viewerHasLiked, setViewerHasLiked] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadPostDetail() {
      if (!postId) {
        setErrorMessage("Post not found.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await getPostDetail(postId);

        if (!isActive) {
          return;
        }

        setPost(response.post);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setPost(null);
        setErrorMessage(
          getErrorMessage(
            error,
            "Could not load this post right now. Please try again."
          )
        );
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadPostDetail();

    return () => {
      isActive = false;
    };
  }, [postId]);

  async function handleToggleLike() {
    if (!post) {
      return;
    }

    setErrorMessage(null);
    setNotice(null);
    setIsLikeSubmitting(true);

    try {
      const response = viewerHasLiked
        ? await unlikePost(post.id)
        : await likePost(post.id);

      setViewerHasLiked(response.viewerHasLiked);
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          "Could not update the like right now. Please try again."
        )
      );
    } finally {
      setIsLikeSubmitting(false);
    }
  }

  async function handleSubmitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!post) {
      return;
    }

    const trimmedComment = commentDraft.trim();

    if (trimmedComment.length === 0) {
      setCommentError("Write a comment before posting.");
      return;
    }

    setCommentError(null);
    setErrorMessage(null);
    setNotice(null);
    setIsCommentSubmitting(true);

    try {
      const response = await createComment(post.id, {
        content: trimmedComment
      });

      if (user) {
        setPost((currentPost) =>
          currentPost
            ? {
                ...currentPost,
                comments: [
                  ...currentPost.comments,
                  toLocalComment(user, response.comment)
                ]
              }
            : currentPost
        );
      }

      setCommentDraft("");
    } catch (error) {
      setCommentError(
        getErrorMessage(
          error,
          "Could not post the comment right now. Please try again."
        )
      );
    } finally {
      setIsCommentSubmitting(false);
    }
  }

  function openReportModal() {
    setReportReason(defaultReportReason);
    setReportError(null);
    setNotice(null);
    setIsReportModalOpen(true);
  }

  function closeReportModal() {
    if (isReportSubmitting) {
      return;
    }

    setIsReportModalOpen(false);
    setReportError(null);
  }

  async function handleSubmitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!post) {
      return;
    }

    setReportError(null);
    setErrorMessage(null);
    setIsReportSubmitting(true);

    try {
      await createReport({
        reason: reportReason,
        reportedPostId: post.id
      });

      setIsReportModalOpen(false);
      setNotice("Report submitted.");
    } catch (error) {
      setReportError(
        getErrorMessage(
          error,
          "Could not submit the report right now. Please try again."
        )
      );
    } finally {
      setIsReportSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <section className="panel post-detail-page">
        <p className="eyebrow">Slice 8F</p>
        <h2>Post detail</h2>
        <p>Loading the selected post, comment history, and report controls.</p>
      </section>
    );
  }

  if (!post) {
    return (
      <section className="panel post-detail-page">
        <p className="eyebrow">Slice 8F</p>
        <h2>Post detail</h2>
        <p className="form-status" data-tone="error" role="status">
          {errorMessage ?? "Post not found."}
        </p>
        <Link className="button-link-inline secondary-inline-link" to="/">
          Back to feed
        </Link>
      </section>
    );
  }

  const authorLabel = getAuthorLabel(post.author);

  return (
    <section className="panel post-detail-page">
      <div className="post-detail-shell">
        <div className="post-detail-media-panel">
          <img
            alt={
              post.caption
                ? `Post image for ${post.caption}`
                : `Post image from ${authorLabel}`
            }
            className="post-detail-image"
            src={post.imageUrl}
          />
        </div>

        <div className="post-detail-content-panel">
          <div className="post-detail-header">
            <div className="post-detail-author">
              {post.author.avatarUrl ? (
                <img
                  alt={`Avatar for ${authorLabel}`}
                  className="post-detail-avatar"
                  src={post.author.avatarUrl}
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="post-detail-avatar post-detail-avatar-fallback"
                >
                  {getAvatarLabel(post.author)}
                </div>
              )}
              <div>
                <p className="post-detail-kicker">Slice 8F</p>
                <h2>Post detail</h2>
                <strong>{authorLabel}</strong>
                <p className="profile-handle">@{post.author.username}</p>
              </div>
            </div>

            <button
              className="secondary-button post-detail-report-button"
              onClick={openReportModal}
              type="button"
            >
              Report post
            </button>
          </div>

          <div className="post-detail-copy">
            <p className="post-detail-caption">
              {post.caption ?? "Untitled post"}
            </p>
            <p className="post-detail-meta">
              Posted {formatPostDate(post.createdAt)}
            </p>
          </div>

          <div className="post-detail-actions">
            <button
              className="primary-button"
              disabled={isLikeSubmitting}
              onClick={() => void handleToggleLike()}
              type="button"
            >
              {isLikeSubmitting
                ? "Saving..."
                : viewerHasLiked
                  ? "Unlike"
                  : "Like"}
            </button>
            {viewerHasLiked ? (
              <p className="post-detail-inline-status">You liked this post.</p>
            ) : null}
          </div>

          {notice ? (
            <p className="form-status" data-tone="info" role="status">
              {notice}
            </p>
          ) : null}
          {errorMessage ? (
            <p className="form-status" data-tone="error" role="status">
              {errorMessage}
            </p>
          ) : null}

          <section className="post-detail-comments-section">
            <div className="post-detail-comments-header">
              <h3>Comments</h3>
              <p>Review the full visible conversation and add your own reply.</p>
            </div>

            {post.comments.length === 0 ? (
              <div className="profile-empty-state post-detail-empty-comments">
                <h4>No comments yet.</h4>
                <p>Be the first person to react on this post detail surface.</p>
              </div>
            ) : (
              <ul className="post-detail-comment-list">
                {post.comments.map((comment) => (
                  <li className="post-detail-comment-card" key={comment.id}>
                    <div className="post-detail-comment-head">
                      <strong>{getAuthorLabel(comment.author)}</strong>
                      <span>@{comment.author.username}</span>
                    </div>
                    <p>{comment.content}</p>
                  </li>
                ))}
              </ul>
            )}

            <form
              className="post-detail-comment-form"
              noValidate
              onSubmit={(event) => void handleSubmitComment(event)}
            >
              <label className="form-field" htmlFor="post-detail-comment">
                <span>Add comment</span>
                <input
                  id="post-detail-comment"
                  onChange={(event) => {
                    setCommentDraft(event.currentTarget.value);
                    setCommentError(null);
                  }}
                  placeholder="Write a comment"
                  type="text"
                  value={commentDraft}
                />
              </label>

              {commentError ? (
                <p className="field-error" role="status">
                  {commentError}
                </p>
              ) : null}

              <div className="post-detail-comment-actions">
                <Link className="button-link-inline secondary-inline-link" to="/">
                  Back to feed
                </Link>
                <button
                  className="primary-button"
                  disabled={isCommentSubmitting}
                  type="submit"
                >
                  {isCommentSubmitting ? "Posting..." : "Post comment"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>

      {isReportModalOpen ? (
        <div className="report-modal-backdrop" role="presentation">
          <div
            aria-labelledby="post-report-title"
            aria-modal="true"
            className="report-modal-card"
            role="dialog"
          >
            <form noValidate onSubmit={(event) => void handleSubmitReport(event)}>
              <div className="report-modal-header">
                <p className="post-detail-kicker">Safety</p>
                <h3 id="post-report-title">Report this post</h3>
                <p>
                  Flag this post for moderation using the existing protected
                  report API.
                </p>
              </div>

              <label className="form-field" htmlFor="post-report-reason">
                <span>Reason</span>
                <select
                  id="post-report-reason"
                  onChange={(event) =>
                    setReportReason(event.currentTarget.value as ReportReason)
                  }
                  value={reportReason}
                >
                  {reportReasonValues.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>

              {reportError ? (
                <p className="form-status" data-tone="error" role="status">
                  {reportError}
                </p>
              ) : null}

              <div className="report-modal-actions">
                <button
                  className="button-link-inline secondary-inline-link"
                  onClick={closeReportModal}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={isReportSubmitting}
                  type="submit"
                >
                  {isReportSubmitting ? "Submitting..." : "Submit report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
