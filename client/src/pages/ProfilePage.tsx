import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ApiError,
  getOwnProfile,
  type OwnProfile
} from "../modules/auth/authApi";

type ProfilePageLocationState = {
  notice?: string;
  profile?: OwnProfile;
};

function getAvatarLabel(profile: OwnProfile | null): string {
  if (!profile?.displayName?.trim()) {
    return "?";
  }

  return profile.displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProfilePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as ProfilePageLocationState | null;
  const [profile, setProfile] = useState<OwnProfile | null>(
    locationState?.profile ?? null
  );
  const [isLoading, setIsLoading] = useState(locationState?.profile === undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice] = useState<string | null>(locationState?.notice ?? null);

  useEffect(() => {
    if (locationState) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, locationState, navigate]);

  useEffect(() => {
    if (profile) {
      setIsLoading(false);
      return;
    }

    let isActive = true;

    async function loadProfile() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await getOwnProfile();

        if (!isActive) {
          return;
        }

        setProfile(response.profile);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setErrorMessage(
          error instanceof ApiError
            ? error.message
            : "Could not load the profile right now. Please try again."
        );
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isActive = false;
    };
  }, [profile]);

  const avatarLabel = getAvatarLabel(profile);
  const previewTileCount =
    profile?.counts.posts && profile.counts.posts > 0
      ? Math.min(profile.counts.posts, 6)
      : 0;

  if (isLoading) {
    return (
      <section className="panel profile-page">
        <p className="eyebrow">Slice 5B</p>
        <h2>Your profile</h2>
        <p>Loading the protected profile view from the real `/users/me` endpoint.</p>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="panel profile-page">
        <p className="eyebrow">Slice 5B</p>
        <h2>Your profile</h2>
        <p className="form-status" data-tone="error" role="status">
          {errorMessage ?? "Could not load the profile right now."}
        </p>
      </section>
    );
  }

  return (
    <section className="panel profile-page">
      <div className="profile-hero">
        <div className="profile-avatar-stack">
          {profile.avatarUrl ? (
            <img
              alt={`Avatar for ${profile.displayName ?? profile.username}`}
              className="profile-avatar"
              src={profile.avatarUrl}
            />
          ) : (
            <div aria-hidden="true" className="profile-avatar profile-avatar-fallback">
              {avatarLabel}
            </div>
          )}
          <p className="eyebrow">Slice 5B</p>
        </div>

        <div className="profile-copy">
          <h2>Your profile</h2>
          <p className="profile-handle">@{profile.username}</p>
          <p className="profile-name">{profile.displayName ?? profile.username}</p>
          <p className="profile-bio">
            {profile.bio ?? "Add a short bio so classmates and reviewers can understand your account story faster."}
          </p>
        </div>

        <div className="profile-actions">
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
          <Link
            className="primary-button button-link-inline"
            state={{ profile }}
            to="/profile/edit"
          >
            Edit profile
          </Link>
        </div>
      </div>

      <div className="profile-stats">
        <article className="mini-card profile-stat-card">
          <strong>{profile.counts.posts}</strong>
          <span>Posts</span>
        </article>
        <article className="mini-card profile-stat-card">
          <strong>{profile.counts.followers}</strong>
          <span>Followers</span>
        </article>
        <article className="mini-card profile-stat-card">
          <strong>{profile.counts.following}</strong>
          <span>Following</span>
        </article>
      </div>

      <section className="profile-section">
        <div className="profile-section-heading">
          <h3>Profile summary</h3>
          <p>Protected account details now come from the backend safe DTO, not hard-coded client mock data.</p>
        </div>
        <div className="card-grid">
          <article className="mini-card">
            <h4>Email</h4>
            <p>{profile.email}</p>
          </article>
          <article className="mini-card">
            <h4>Role and status</h4>
            <p>
              {profile.role} · {profile.status}
            </p>
          </article>
        </div>
      </section>

      <section className="profile-section">
        <div className="profile-section-heading">
          <h3>Posts</h3>
          <p>
            This screen already uses the real post count. Visual media cards can
            be swapped to real post data as the posts/feed slices arrive.
          </p>
        </div>

        {previewTileCount === 0 ? (
          <div className="profile-empty-state">
            <h4>No posts yet. Create your first post in the upcoming post slice.</h4>
            <p>
              The profile shell is ready, so the next content-focused slice can
              plug real media cards into this area without rebuilding the account
              header or edit flow.
            </p>
          </div>
        ) : (
          <div className="profile-post-grid">
            {Array.from({ length: previewTileCount }, (_, index) => (
              <article className="profile-post-tile" key={`profile-post-${index + 1}`}>
                <span>{`Post ${index + 1}`}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
