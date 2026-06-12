import { type FormEvent, useState } from "react";
import {
  ApiError,
  searchUsers,
  type SearchUser
} from "../modules/auth/authApi";

const searchPageSize = 2;

type SearchPageInfo = {
  hasNextPage: boolean;
  limit: number;
  nextCursor: string | null;
  query: string;
};

function getAvatarLabel(user: SearchUser): string {
  const source = user.displayName?.trim() || user.username;

  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function SearchPage() {
  const [queryInput, setQueryInput] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [pageInfo, setPageInfo] = useState<SearchPageInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  async function runSearch(options: {
    append: boolean;
    cursor?: string | null;
    query: string;
  }) {
    const response = await searchUsers({
      cursor: options.cursor,
      limit: searchPageSize,
      query: options.query
    });

    setPageInfo(response.pageInfo);
    setResults((current) =>
      options.append ? [...current, ...response.users] : response.users
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuery = queryInput.trim();

    if (!trimmedQuery) {
      setValidationMessage("Enter a search query first.");
      setErrorMessage(null);
      setResults([]);
      setPageInfo(null);
      return;
    }

    setValidationMessage(null);
    setErrorMessage(null);
    setIsSearching(true);

    try {
      await runSearch({
        append: false,
        query: trimmedQuery
      });
    } catch (error) {
      setResults([]);
      setPageInfo(null);
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : "Could not run the search right now. Please try again."
      );
    } finally {
      setIsSearching(false);
    }
  }

  async function handleLoadMore() {
    if (!pageInfo?.hasNextPage || !pageInfo.nextCursor) {
      return;
    }

    setErrorMessage(null);
    setIsLoadingMore(true);

    try {
      await runSearch({
        append: true,
        cursor: pageInfo.nextCursor,
        query: pageInfo.query
      });
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : "Could not load more search results right now. Please try again."
      );
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <section className="panel search-page">
      <div className="auth-copy">
        <p className="eyebrow">Slice 5C</p>
        <h2>Search people</h2>
        <p>
          Search active users by username or display name through the protected
          backend contract instead of relying on hard-coded frontend mock cards.
        </p>
      </div>

      <form className="auth-form search-form" noValidate onSubmit={handleSubmit}>
        <label className="form-field" htmlFor="search-query">
          <span>Search by username or display name</span>
          <input
            id="search-query"
            name="query"
            type="search"
            value={queryInput}
            onChange={(event) => {
              setQueryInput(event.target.value);
              setValidationMessage(null);
              setErrorMessage(null);
            }}
            aria-invalid={validationMessage ? "true" : "false"}
            aria-describedby={validationMessage ? "search-query-error" : undefined}
            placeholder="Try alice, ali, or a classmate display name"
          />
          {validationMessage ? (
            <small className="field-error" id="search-query-error">
              {validationMessage}
            </small>
          ) : null}
        </label>

        <div className="auth-actions">
          {errorMessage ? (
            <p className="form-status" data-tone="error" role="status">
              {errorMessage}
            </p>
          ) : null}
          <button className="primary-button" disabled={isSearching} type="submit">
            {isSearching ? "Searching..." : "Search"}
          </button>
        </div>
      </form>

      {pageInfo ? (
        <section className="search-results-section">
          <div className="profile-section-heading">
            <h3>Results for "{pageInfo.query}"</h3>
            <p>
              Showing safe public search cards only. Private email and password
              data stay on the server.
            </p>
          </div>

          {results.length === 0 ? (
            <div className="profile-empty-state">
              <h4>No active users matched that query.</h4>
              <p>Try a shorter username fragment or a different display name.</p>
            </div>
          ) : (
            <div className="search-results-grid">
              {results.map((user) => (
                <article className="mini-card search-result-card" key={user.id}>
                  <div className="search-result-header">
                    {user.avatarUrl ? (
                      <img
                        alt={`Avatar for ${user.displayName ?? user.username}`}
                        className="search-result-avatar"
                        src={user.avatarUrl}
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="search-result-avatar search-result-avatar-fallback"
                      >
                        {getAvatarLabel(user)}
                      </div>
                    )}
                    <div>
                      <h4>{user.displayName ?? user.username}</h4>
                      <p className="profile-handle">@{user.username}</p>
                    </div>
                  </div>
                  <p className="search-result-bio">
                    {user.bio ?? "No bio yet for this account."}
                  </p>
                </article>
              ))}
            </div>
          )}

          {pageInfo.hasNextPage ? (
            <button
              className="primary-button search-load-more"
              disabled={isLoadingMore}
              onClick={() => void handleLoadMore()}
              type="button"
            >
              {isLoadingMore ? "Loading more..." : "Load more results"}
            </button>
          ) : null}
        </section>
      ) : (
        <section className="profile-empty-state">
          <h4>Start with a small search query.</h4>
          <p>
            This slice uses the real backend search endpoint, so submit a query
            to see paginated user cards instead of placeholder UI.
          </p>
        </section>
      )}
    </section>
  );
}
