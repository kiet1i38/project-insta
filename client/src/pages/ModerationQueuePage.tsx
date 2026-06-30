import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  banModerationReportTargetUser,
  dismissModerationReport,
  getModerationReports,
  hideModerationReportTarget,
  type ModerationReport,
  type ModerationReportStatus,
  type ModerationSortOrder
} from "../modules/auth/authApi";

const moderationPageSize = 3;

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function getReportSummary(report: ModerationReport) {
  if (report.target.post) {
    return `Reported post from @${report.target.post.author.username}`;
  }

  if (report.target.comment) {
    return `Reported comment from @${report.target.comment.author.username}`;
  }

  if (report.target.user) {
    return `Reported account @${report.target.user.username}`;
  }

  return "Reported target";
}

function getReportTargetDescription(report: ModerationReport) {
  if (report.target.post) {
    return report.target.post.caption ?? "This post has no caption.";
  }

  if (report.target.comment) {
    return report.target.comment.content;
  }

  if (report.target.user) {
    return report.target.user.displayName
      ? `${report.target.user.displayName} (@${report.target.user.username})`
      : `@${report.target.user.username}`;
  }

  return "No target preview available.";
}

export function ModerationQueuePage() {
  const [queueStatus, setQueueStatus] =
    useState<ModerationReportStatus>("PENDING");
  const [sortOrder, setSortOrder] = useState<ModerationSortOrder>("newest");
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedReport =
    reports.find((report) => report.id === selectedReportId) ?? reports[0] ?? null;

  const loadQueue = useCallback(
    async (options?: {
      append?: boolean;
      cursor?: string | null;
    }) => {
      const append = options?.append ?? false;

      setErrorMessage(null);

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      try {
        const response = await getModerationReports({
          cursor: options?.cursor ?? undefined,
          limit: moderationPageSize,
          sort: sortOrder,
          status: queueStatus
        });

        setPendingCount(response.summary.pendingCount);
        setResolvedCount(response.summary.resolvedCount);
        setNextCursor(response.pageInfo.nextCursor);
        setHasNextPage(response.pageInfo.hasNextPage);
        setReports((currentReports) => {
          if (append) {
            return [...currentReports, ...response.reports];
          }

          return response.reports;
        });
        setSelectedReportId((currentSelectedReportId) => {
          if (append) {
            return currentSelectedReportId ?? response.reports[0]?.id ?? null;
          }

          const stillExists = response.reports.some(
            (report) => report.id === currentSelectedReportId
          );

          return stillExists
            ? currentSelectedReportId
            : response.reports[0]?.id ?? null;
        });
      } catch (error) {
        setErrorMessage(
          error instanceof ApiError
            ? error.message
            : "Could not load the moderation queue right now."
        );

        if (!append) {
          setReports([]);
          setSelectedReportId(null);
          setNextCursor(null);
          setHasNextPage(false);
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [queueStatus, sortOrder]
  );

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  async function handleAction(action: "ban" | "dismiss" | "hide") {
    if (!selectedReport) {
      return;
    }

    const trimmedNote = note.trim();

    if ((action === "ban" || action === "hide") && trimmedNote.length === 0) {
      setErrorMessage("Add a moderation note before taking this action.");
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setIsSubmitting(true);

    try {
      const result =
        action === "dismiss"
          ? await dismissModerationReport(selectedReport.id, {
              note: trimmedNote
            })
          : action === "hide"
            ? await hideModerationReportTarget(selectedReport.id, {
                note: trimmedNote
              })
            : await banModerationReportTargetUser(selectedReport.id, {
                note: trimmedNote
              });

      setStatusMessage(
        `Moderation action recorded: ${result.moderationAction.action}.`
      );
      setNote("");
      await loadQueue();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : "Could not submit this moderation action right now."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel admin-page">
      <div className="admin-page-header">
        <div>
          <p className="eyebrow">Admin tools</p>
          <h2>Moderation queue</h2>
          <p className="admin-page-copy">
            Review reports, inspect the context, and record the next moderation
            step.
          </p>
        </div>

        <div className="admin-summary-row" aria-label="Moderation summary">
          <div className="admin-summary-pill">
            <span>Pending</span>
            <strong>{`${pendingCount} pending`}</strong>
          </div>
          <div className="admin-summary-pill admin-summary-pill-muted">
            <span>Resolved</span>
            <strong>{`${resolvedCount} resolved`}</strong>
          </div>
        </div>
      </div>

      <div className="admin-toolbar">
        <label className="form-field admin-filter-field">
          <span>Queue status</span>
          <select
            value={queueStatus}
            onChange={(event) =>
              setQueueStatus(event.currentTarget.value as ModerationReportStatus)
            }
          >
            <option value="PENDING">Pending</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
        </label>

        <label className="form-field admin-filter-field">
          <span>Sort order</span>
          <select
            value={sortOrder}
            onChange={(event) =>
              setSortOrder(event.currentTarget.value as ModerationSortOrder)
            }
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
      </div>

      {statusMessage ? (
        <p className="form-status" data-tone="info" role="status">
          {statusMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="form-status" data-tone="error" role="status">
          {errorMessage}
        </p>
      ) : null}

      {isLoading ? (
        <div className="admin-empty-state">
          <h3>Loading moderation queue</h3>
          <p>Pulling the latest reports and summary counts from the backend.</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="admin-empty-state">
          <h3>No reports match this queue right now.</h3>
          <p>
            Try a different status filter or come back after new reports are
            filed.
          </p>
        </div>
      ) : (
        <div className="moderation-layout">
          <div className="moderation-report-list" role="list">
            {reports.map((report) => {
              const isActive = report.id === selectedReport?.id;

              return (
                <button
                  key={report.id}
                  className={
                    isActive
                      ? "moderation-report-card moderation-report-card-active"
                      : "moderation-report-card"
                  }
                  onClick={() => setSelectedReportId(report.id)}
                  type="button"
                >
                  <div className="moderation-report-meta">
                    <p className="moderation-report-eyebrow">
                      {`Reported by @${report.reporter.username}`}
                    </p>
                    <p className="moderation-report-date">
                      {formatTimestamp(report.createdAt)}
                    </p>
                  </div>
                  <h3>{getReportSummary(report)}</h3>
                  <p className="moderation-report-reason">{report.reason}</p>
                  <p className="moderation-report-preview">
                    {getReportTargetDescription(report)}
                  </p>
                </button>
              );
            })}

            {hasNextPage ? (
              <button
                className="button-link-inline secondary-inline-link moderation-load-more"
                disabled={isLoadingMore}
                onClick={() =>
                  void loadQueue({
                    append: true,
                    cursor: nextCursor
                  })
                }
                type="button"
              >
                {isLoadingMore ? "Loading more reports..." : "Load more reports"}
              </button>
            ) : null}
          </div>

          {selectedReport ? (
            <div className="moderation-review-panel">
              <div className="moderation-review-card">
                <p className="eyebrow">Review context</p>
                <h3>Review context</h3>
                <p className="moderation-target-copy">
                  {getReportSummary(selectedReport)}
                </p>

                {selectedReport.target.post ? (
                  <img
                    alt="Reported post preview"
                    className="moderation-target-image"
                    src={selectedReport.target.post.imageUrl}
                  />
                ) : (
                  <div className="moderation-target-placeholder">
                    <strong>{selectedReport.target.type}</strong>
                    <span>Review this target through the admin text summary.</span>
                  </div>
                )}

                <div className="moderation-target-details">
                  <p>
                    <strong>Reason:</strong> {selectedReport.reason}
                  </p>
                  <p>
                    <strong>Reporter:</strong> @{selectedReport.reporter.username}
                  </p>
                  <p>{getReportTargetDescription(selectedReport)}</p>
                </div>

                <label className="form-field">
                  <span>Moderation note</span>
                  <textarea
                    onChange={(event) => setNote(event.currentTarget.value)}
                    placeholder="Record the policy reasoning behind this action."
                    rows={4}
                    value={note}
                  />
                </label>

                <div className="moderation-action-row">
                  <button
                    className="button-link-inline secondary-inline-link moderation-action-button"
                    disabled={isSubmitting}
                    onClick={() => void handleAction("dismiss")}
                    type="button"
                  >
                    {isSubmitting ? "Saving..." : "Keep content"}
                  </button>
                  {selectedReport.target.type !== "USER" ? (
                    <button
                      className="primary-button moderation-action-button"
                      disabled={isSubmitting}
                      onClick={() => void handleAction("hide")}
                      type="button"
                    >
                      {isSubmitting ? "Saving..." : "Hide content"}
                    </button>
                  ) : null}
                  <button
                    className="danger-button moderation-action-button"
                    disabled={isSubmitting}
                    onClick={() => void handleAction("ban")}
                    type="button"
                  >
                    {isSubmitting ? "Saving..." : "Ban account"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
