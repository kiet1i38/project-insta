import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  getAuditLogs,
  type AuditLogEntry,
  type ModerationSortOrder
} from "../modules/auth/authApi";

const auditPageSize = 2;

type AuditFilterState = {
  action: string;
  actorId: string;
  entityType: string;
  from: string;
  sort: ModerationSortOrder;
  to: string;
};

const initialAuditFilters: AuditFilterState = {
  action: "",
  actorId: "",
  entityType: "",
  from: "",
  sort: "newest",
  to: ""
};

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function getMetadataPreview(value: unknown): string {
  if (value === null || value === undefined) {
    return "No metadata recorded.";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    const preview = value
      .map((entry) => getMetadataPreview(entry))
      .filter((entry) => entry.length > 0)
      .join(" • ");

    return preview.length > 0 ? preview : "No metadata recorded.";
  }

  if (typeof value === "object") {
    const note = Reflect.get(value, "note");

    if (typeof note === "string" && note.trim().length > 0) {
      return note.trim();
    }

    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, entryValue]) => `${key}: ${getMetadataPreview(entryValue)}`
    );

    return entries.join(" • ");
  }

  return "No metadata recorded.";
}

export function AuditLogPage() {
  const [filters, setFilters] = useState<AuditFilterState>(initialAuditFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<AuditFilterState>(initialAuditFilters);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const loadLogs = useCallback(
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
        const response = await getAuditLogs({
          action: appliedFilters.action,
          actorId: appliedFilters.actorId,
          cursor: options?.cursor ?? undefined,
          entityType: appliedFilters.entityType,
          from: appliedFilters.from,
          limit: auditPageSize,
          sort: appliedFilters.sort,
          to: appliedFilters.to
        });

        setNextCursor(response.pageInfo.nextCursor);
        setHasNextPage(response.pageInfo.hasNextPage);
        setAuditLogs((currentAuditLogs) => {
          if (append) {
            return [...currentAuditLogs, ...response.auditLogs];
          }

          return response.auditLogs;
        });
      } catch (error) {
        setErrorMessage(
          error instanceof ApiError
            ? error.message
            : "Could not load the audit log right now."
        );

        if (!append) {
          setAuditLogs([]);
          setNextCursor(null);
          setHasNextPage(false);
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [appliedFilters]
  );

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  function updateFilter<Key extends keyof AuditFilterState>(
    key: Key,
    value: AuditFilterState[Key]
  ) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [key]: value
    }));
  }

  return (
    <section className="panel admin-page">
      <div className="admin-page-header">
        <div>
          <p className="eyebrow">Admin tools</p>
          <h2>Audit log</h2>
          <p className="admin-page-copy">
            Review sensitive actions and moderation history without exposing
            hidden secrets from the backend metadata payload.
          </p>
        </div>
      </div>

      <form
        className="admin-filter-form"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedFilters(filters);
        }}
      >
        <div className="admin-filter-grid">
          <label className="form-field admin-filter-field">
            <span>Action</span>
            <input
              onChange={(event) => updateFilter("action", event.currentTarget.value)}
              value={filters.action}
            />
          </label>

          <label className="form-field admin-filter-field">
            <span>Actor ID</span>
            <input
              onChange={(event) => updateFilter("actorId", event.currentTarget.value)}
              value={filters.actorId}
            />
          </label>

          <label className="form-field admin-filter-field">
            <span>Entity type</span>
            <input
              onChange={(event) =>
                updateFilter("entityType", event.currentTarget.value)
              }
              value={filters.entityType}
            />
          </label>

          <label className="form-field admin-filter-field">
            <span>From</span>
            <input
              onChange={(event) => updateFilter("from", event.currentTarget.value)}
              placeholder="2026-06-15T10:30:00.000Z"
              value={filters.from}
            />
          </label>

          <label className="form-field admin-filter-field">
            <span>To</span>
            <input
              onChange={(event) => updateFilter("to", event.currentTarget.value)}
              placeholder="2026-06-15T11:30:00.000Z"
              value={filters.to}
            />
          </label>

          <label className="form-field admin-filter-field">
            <span>Sort order</span>
            <select
              onChange={(event) =>
                updateFilter(
                  "sort",
                  event.currentTarget.value as ModerationSortOrder
                )
              }
              value={filters.sort}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>

        <div className="admin-filter-actions">
          <button className="primary-button" type="submit">
            Apply filters
          </button>
          <button
            className="button-link-inline secondary-inline-link"
            onClick={() => {
              setFilters(initialAuditFilters);
              setAppliedFilters(initialAuditFilters);
            }}
            type="button"
          >
            Clear filters
          </button>
        </div>
      </form>

      {errorMessage ? (
        <p className="form-status" data-tone="error" role="status">
          {errorMessage}
        </p>
      ) : null}

      {isLoading ? (
        <div className="admin-empty-state">
          <h3>Loading audit log</h3>
          <p>Collecting the latest audit entries from the admin backend.</p>
        </div>
      ) : auditLogs.length === 0 ? (
        <div className="admin-empty-state">
          <h3>No audit rows match the current filters.</h3>
          <p>Clear the filters or widen the time window to inspect more activity.</p>
        </div>
      ) : (
        <div className="audit-log-panel">
          <table className="audit-table">
            <thead>
              <tr>
                <th scope="col">Timestamp</th>
                <th scope="col">Actor</th>
                <th scope="col">Action</th>
                <th scope="col">Target</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatTimestamp(entry.createdAt)}</td>
                  <td>
                    {entry.actor ? `@${entry.actor.username}` : "No actor recorded"}
                  </td>
                  <td>
                    <span className="audit-action-pill">{entry.action}</span>
                  </td>
                  <td>
                    {entry.entityType && entry.entityId
                      ? `${entry.entityType} ${entry.entityId}`
                      : "No linked entity"}
                  </td>
                  <td>{getMetadataPreview(entry.actorMetadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {hasNextPage ? (
            <button
              className="button-link-inline secondary-inline-link moderation-load-more"
              disabled={isLoadingMore}
              onClick={() =>
                void loadLogs({
                  append: true,
                  cursor: nextCursor
                })
              }
              type="button"
            >
              {isLoadingMore ? "Loading more logs..." : "Load more logs"}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
