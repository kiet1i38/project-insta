import { type FormEvent, useState } from "react";
import {
  ApiError,
  searchUsers,
  type SearchUser
} from "../modules/auth/authApi";

const searchPageSize = 2;
const suggestedQueries = ["alice", "bob", "admin", "demo"];
const featuredSearches = [
  {
    description: "Open the seeded creator profile used in most user-flow smoke tests.",
    label: "Alice Demo",
    query: "alice",
    username: "alice_demo"
  },
  {
    description: "Jump to the second demo account and compare another result card.",
    label: "Bob Demo",
    query: "bob",
    username: "bob_demo"
  },
  {
    description: "Reach the admin account quickly when you need moderation UI checks.",
    label: "Admin Demo",
    query: "admin",
    username: "admin_demo"
  }
] as const;

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

  async function submitSearch(rawQuery: string) {
    const trimmedQuery = rawQuery.trim();

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitSearch(queryInput);
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

  function handleQuickSearch(nextQuery: string) {
    setQueryInput(nextQuery);
    void submitSearch(nextQuery);
  }

  return (
    <section className="panel search-page">
      <div className="auth-copy search-hero">
        <p className="search-kicker">Discover</p>
        <h2>Search people</h2>
        <p>
          Find classmates, creators, and friends by username or display name.
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
            placeholder="Try alice, bob, or a classmate display name"
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

      <section className="search-suggestion-section">
        <div className="profile-section-heading">
          <h3>Suggested searches</h3>
          <p>Quick-fill the search box with live demo accounts that exist right now.</p>
        </div>
        <div className="search-chip-row">
          {suggestedQueries.map((query) => (
            <button
              key={query}
              className="search-chip"
              onClick={() => handleQuickSearch(query)}
              type="button"
            >
              {query}
            </button>
          ))}
        </div>
      </section>

      {pageInfo ? (
        <section className="search-results-section">
          <div className="profile-section-heading">
            <h3>Results for "{pageInfo.query}"</h3>
            <p>Showing public profile details only.</p>
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
        <section className="search-results-section">
          <div className="profile-section-heading">
            <h3>Quick discovery</h3>
            <p>Start from a few seeded accounts before exploring wider search terms.</p>
          </div>
          <div className="search-results-grid search-discovery-grid">
            {featuredSearches.map((entry) => (
              <article className="search-result-card search-discovery-card" key={entry.username}>
                <div className="search-result-header">
                  <div
                    aria-hidden="true"
                    className="search-result-avatar search-result-avatar-fallback"
                  >
                    {getAvatarLabel({
                      avatarUrl: null,
                      bio: null,
                      displayName: entry.label,
                      id: entry.username,
                      username: entry.username
                    })}
                  </div>
                  <div className="search-card-copy">
                    <p className="search-card-kicker">@{entry.username}</p>
                    <h4>{entry.label}</h4>
                    <p className="search-result-bio">{entry.description}</p>
                  </div>
                </div>

                <button
                  className="secondary-button search-card-action"
                  onClick={() => handleQuickSearch(entry.query)}
                  type="button"
                >
                  Search {entry.query}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
